/**
 * Repairs source-backed canonical sports for historical CLUB candidates.
 *
 * The command is dry-run by default. Use --live --apply with an exact
 * --expected-count to update live candidates and their unpublished targets.
 * Candidates without deterministic source-backed sports are intentionally not
 * included and remain in NEEDS_REVIEW.
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  AFFILIATE_CLUB_SPORT_REPAIRS,
  affiliateClubSportRepairEntries,
} from '../src/server/affiliateImports/affiliateClubSportRepairs';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const expectedText = process.argv.find((argument) => argument.startsWith('--expected-count='))?.split('=')[1] ?? null;
const expectedCount = expectedText === null ? null : Number.parseInt(expectedText, 10);

if (!useLive) throw new Error('This historical candidate repair requires --live.');
if (apply && expectedCount === null) throw new Error('--apply requires --expected-count.');
if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  throw new Error('--expected-count must be a non-negative integer.');
}

const databaseUrl = process.env.DATABASE_URL_LIVE?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL_LIVE is missing.');

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

const nullableString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const recordValue = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const reviewWarning = 'Sport mapping is not a canonical Sports.name; human review is required.';

const main = async () => {
  await client.connect();
  try {
    const repairEntries = affiliateClubSportRepairEntries();
    const candidateIds = repairEntries.map(([id]) => id);
    const candidates = (await client.query(
      'SELECT c.*, o.status AS "organizationStatus", o."publicPageEnabled", o."ownershipStatus", o.sports AS "organizationSports" '
      + 'FROM "AffiliateImportCandidates" c '
      + 'LEFT JOIN "Organizations" o ON o.id = c."publishedOrganizationId" '
      + 'WHERE c.id = ANY($1::text[])',
      [candidateIds],
    )).rows;
    const candidateById = new Map(candidates.map((row) => [row.id, row]));
    const canonicalSports = new Set<string>(
      (await client.query('SELECT name FROM "Sports"')).rows.map((row) => row.name),
    );
    const eligible: Array<{ candidate: any; repair: (typeof repairEntries)[number][1] }> = [];
    const alreadyRepaired: Array<{ id: string; title: string }> = [];
    const excluded: Array<{ id: string; title: string | null; reason: string }> = [];

    for (const [id, repair] of repairEntries) {
      const candidate = candidateById.get(id);
      if (!candidate) {
        excluded.push({ id, title: null, reason: 'candidate-not-found' });
        continue;
      }
      if (String(candidate.listingKind).toUpperCase() !== 'CLUB') {
        excluded.push({ id, title: candidate.title, reason: 'candidate-is-not-a-club' });
        continue;
      }
      if (candidate.status === 'PUBLISHED') {
        excluded.push({ id, title: candidate.title, reason: 'published-candidate-requires-separate-review' });
        continue;
      }
      if (repair.from !== null && candidate.sportName !== repair.from) {
        if (repair.sports.includes(candidate.sportName)) {
          alreadyRepaired.push({ id, title: candidate.title });
        } else {
          excluded.push({ id, title: candidate.title, reason: `unexpected-current-sport:${candidate.sportName ?? 'null'}` });
        }
        continue;
      }
      if (repair.from === null && candidate.sportName && repair.sports.includes(candidate.sportName)) {
        alreadyRepaired.push({ id, title: candidate.title });
        continue;
      }
      const invalidCatalogSport = repair.sports.find((sport) => !canonicalSports.has(sport));
      if (invalidCatalogSport) {
        excluded.push({ id, title: candidate.title, reason: `repair-sport-not-in-catalog:${invalidCatalogSport}` });
        continue;
      }
      const organizationId = nullableString(candidate.publishedOrganizationId);
      if (organizationId && (
        candidate.ownershipStatus !== 'UNCLAIMED'
        || candidate.publicPageEnabled === true
      )) {
        excluded.push({ id, title: candidate.title, reason: 'linked-organization-is-owned-or-public' });
        continue;
      }
      eligible.push({ candidate, repair });
    }

    if (apply && expectedCount !== eligible.length) {
      throw new Error(`Expected ${expectedCount} eligible repairs, found ${eligible.length}. Re-run the dry run and pass the exact count.`);
    }

    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN',
      canonicalSportCount: canonicalSports.size,
      eligibleCount: eligible.length,
      alreadyRepairedCount: alreadyRepaired.length,
      excludedCount: excluded.length,
      eligible: eligible.map(({ candidate, repair }) => ({
        id: candidate.id,
        title: candidate.title,
        from: candidate.sportName,
        sports: repair.sports,
        rationale: repair.rationale,
      })),
      alreadyRepaired,
      excluded,
    }, null, 2));

    if (!apply || eligible.length === 0) return;

    await client.query('BEGIN');
    try {
      for (const { candidate, repair } of eligible) {
        const rawPayload = recordValue(candidate.rawPayload);
        const normalizedImport = recordValue(rawPayload.normalizedImport);
        const sourceSportName = candidate.sportName ?? null;
        const repairedRawPayload = {
          ...rawPayload,
          sportNames: [...repair.sports],
          normalizedImport: {
            ...normalizedImport,
            sportName: repair.sports[0],
            sportNames: [...repair.sports],
            sportRepair: {
              schemaVersion: 1,
              sourceSportName,
              canonicalSportNames: [...repair.sports],
              rationale: repair.rationale,
              repairedBy: 'operator',
              repairedAt: new Date().toISOString(),
            },
          },
        };
        const warnings = Array.isArray(candidate.warnings)
          ? candidate.warnings.filter((warning: unknown) => warning !== reviewWarning)
          : [];
        await client.query(
          'UPDATE "AffiliateImportCandidates" '
          + 'SET "sportName" = $1, "rawPayload" = $2::jsonb, warnings = $3::text[], status = \'DISCOVERED\', "updatedAt" = NOW() '
          + 'WHERE id = $4',
          [repair.sports[0], JSON.stringify(repairedRawPayload), warnings, candidate.id],
        );
        const organizationId = nullableString(candidate.publishedOrganizationId);
        if (organizationId) {
          await client.query(
            'UPDATE "Organizations" SET sports = $1::text[], "updatedAt" = NOW() '
            + 'WHERE id = $2 AND "ownershipStatus" = \'UNCLAIMED\' AND "publicPageEnabled" = FALSE',
            [repair.sports, organizationId],
          );
        }
      }
      await client.query('COMMIT');
      console.log(JSON.stringify({ appliedCount: eligible.length }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

void AFFILIATE_CLUB_SPORT_REPAIRS;
