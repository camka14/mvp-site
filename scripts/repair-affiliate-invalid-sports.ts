/**
 * Repairs deterministic sport labels on unpublished affiliate candidates.
 *
 * The command is dry-run by default. Use --live --apply with an exact
 * --expected-count to update live candidates. It maps explicit canonical sport
 * names and leaves unsupported or blacklisted-only labels in review.
 */

import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  mergeAffiliateOrganizationSports,
  repairAffiliateSportLabel,
} from '../src/server/affiliateImports/affiliateSportRepair';

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

const reviewWarning = 'Sport mapping is not a canonical Sports.name; human review is required.';

const recordValue = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const main = async () => {
  await client.connect();
  try {
    const catalogNames = (await client.query('SELECT name FROM "Sports" ORDER BY name ASC')).rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
    const candidates = (await client.query(
      'SELECT c.*, o.status AS "organizationStatus", o."publicPageEnabled", o."ownershipStatus" '
      + 'FROM "AffiliateImportCandidates" c '
      + 'LEFT JOIN "Organizations" o ON o.id = c."publishedOrganizationId" '
      + 'WHERE c."sportName" IS NULL OR NOT (c."sportName" = ANY($1::text[])) '
      + 'ORDER BY c."listingKind", c.status, c."sportName", c.title',
      [catalogNames],
    )).rows;

    const eligible: Array<{ candidate: any; repair: ReturnType<typeof repairAffiliateSportLabel> }> = [];
    const excluded: Array<{ id: string; listingKind: string; status: string; title: string; sportName: string | null; reason: string }> = [];
    const alreadyCanonical: Array<{ id: string; title: string }> = [];

    for (const candidate of candidates) {
      const repair = repairAffiliateSportLabel(candidate.sportName, catalogNames);
      if (!repair.canRepair) {
        excluded.push({
          id: candidate.id,
          listingKind: candidate.listingKind,
          status: candidate.status,
          title: candidate.title,
          sportName: candidate.sportName,
          reason: repair.rationale,
        });
        continue;
      }
      if (candidate.status === 'PUBLISHED') {
        excluded.push({
          id: candidate.id,
          listingKind: candidate.listingKind,
          status: candidate.status,
          title: candidate.title,
          sportName: candidate.sportName,
          reason: 'published-candidate-requires-separate-review',
        });
        continue;
      }
      if (!['DISCOVERED', 'NEEDS_REVIEW', 'DUPLICATE'].includes(candidate.status)) {
        excluded.push({
          id: candidate.id,
          listingKind: candidate.listingKind,
          status: candidate.status,
          title: candidate.title,
          sportName: candidate.sportName,
          reason: `candidate-status-not-safe-to-repair:${candidate.status}`,
        });
        continue;
      }
      if (candidate.publishedOrganizationId && (
        candidate.ownershipStatus !== 'UNCLAIMED'
        || candidate.publicPageEnabled === true
      )) {
        excluded.push({
          id: candidate.id,
          listingKind: candidate.listingKind,
          status: candidate.status,
          title: candidate.title,
          sportName: candidate.sportName,
          reason: 'linked-organization-is-owned-or-public',
        });
        continue;
      }
      if (candidate.sportName === repair.canonicalSportNames[0]
        && repair.canonicalSportNames.length === 1) {
        alreadyCanonical.push({ id: candidate.id, title: candidate.title });
        continue;
      }
      eligible.push({ candidate, repair });
    }

    if (apply && expectedCount !== eligible.length) {
      throw new Error(`Expected ${expectedCount} eligible repairs, found ${eligible.length}. Re-run the dry run and pass the exact count.`);
    }

    const grouped = new Map<string, number>();
    eligible.forEach(({ candidate, repair }) => {
      const key = `${candidate.sportName ?? 'null'} -> ${repair.canonicalSportNames.join(', ')}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });
    console.log(JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN',
      canonicalSportCount: catalogNames.length,
      candidateCountChecked: candidates.length,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      alreadyCanonicalCount: alreadyCanonical.length,
      eligibleByMapping: [...grouped.entries()].map(([mapping, count]) => ({ mapping, count })),
      eligible: eligible.map(({ candidate, repair }) => ({
        id: candidate.id,
        listingKind: candidate.listingKind,
        status: candidate.status,
        title: candidate.title,
        from: candidate.sportName,
        sportNames: repair.canonicalSportNames,
        rationale: repair.rationale,
      })),
      excluded,
    }, null, 2));

    if (!apply || eligible.length === 0) return;

    await client.query('BEGIN');
    try {
      await client.query(
        'SELECT id FROM "AffiliateImportCandidates" WHERE id = ANY($1::text[]) FOR UPDATE',
        [eligible.map(({ candidate }) => candidate.id)],
      );
      const organizationIds = Array.from(new Set(
        eligible
          .map(({ candidate }) => candidate.publishedOrganizationId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ));
      const organizationSportsById = new Map<string, string[]>();
      if (organizationIds.length > 0) {
        const organizationRows = await client.query(
          'SELECT id, sports FROM "Organizations" WHERE id = ANY($1::text[]) FOR UPDATE',
          [organizationIds],
        );
        for (const organization of organizationRows.rows) {
          organizationSportsById.set(
            organization.id,
            mergeAffiliateOrganizationSports(organization.sports, [], catalogNames),
          );
        }
      }
      for (const { candidate, repair } of eligible) {
        const rawPayload = recordValue(candidate.rawPayload);
        const normalizedImport = recordValue(rawPayload.normalizedImport);
        const repairedRawPayload = {
          ...rawPayload,
          sportNames: [...repair.canonicalSportNames],
          normalizedImport: {
            ...normalizedImport,
            sportName: repair.canonicalSportNames[0],
            sportNames: [...repair.canonicalSportNames],
            sportRepair: {
              schemaVersion: 2,
              sourceSportName: candidate.sportName,
              canonicalSportNames: [...repair.canonicalSportNames],
              excludedBlacklistedSportNames: repair.excludedBlacklistedSportNames,
              rationale: repair.rationale,
              repairedBy: 'operator',
              repairedAt: new Date().toISOString(),
            },
          },
        };
        const warnings = Array.isArray(candidate.warnings)
          ? candidate.warnings.filter((warning: unknown) => warning !== reviewWarning)
          : [];
        if (repair.excludedBlacklistedSportNames.length > 0) {
          warnings.push(`Excluded blacklisted source sports: ${repair.excludedBlacklistedSportNames.join(', ')}.`);
        }
        const nextStatus = candidate.status === 'NEEDS_REVIEW' ? 'DISCOVERED' : candidate.status;
        const result = await client.query(
          'UPDATE "AffiliateImportCandidates" '
          + 'SET "sportName" = $1, "rawPayload" = $2::jsonb, warnings = $3::text[], status = $4, "updatedAt" = NOW() '
          + 'WHERE id = $5 AND status = $6 AND "sportName" IS NOT DISTINCT FROM $7',
          [
            repair.canonicalSportNames[0],
            JSON.stringify(repairedRawPayload),
            Array.from(new Set(warnings)),
            nextStatus,
            candidate.id,
            candidate.status,
            candidate.sportName,
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(`Candidate ${candidate.id} changed while the repair was running.`);
        }
        if (candidate.publishedOrganizationId && organizationSportsById.has(candidate.publishedOrganizationId)) {
          const currentSports = organizationSportsById.get(candidate.publishedOrganizationId) ?? [];
          organizationSportsById.set(
            candidate.publishedOrganizationId,
            mergeAffiliateOrganizationSports(currentSports, repair.canonicalSportNames, catalogNames),
          );
        }
      }
      for (const [organizationId, sports] of organizationSportsById) {
        await client.query(
          'UPDATE "Organizations" SET sports = $1::text[], "updatedAt" = NOW() '
          + 'WHERE id = $2 AND "ownershipStatus" = \'UNCLAIMED\' AND "publicPageEnabled" = FALSE',
          [sports, organizationId],
        );
      }
      await client.query('COMMIT');
      console.log(JSON.stringify({ appliedCount: eligible.length, organizationCount: organizationSportsById.size }));
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
