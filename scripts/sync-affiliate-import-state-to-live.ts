/**
 * Promotes affiliate source configuration and reviewed import state from the
 * local database to the live database. The command is dry-run by default.
 *
 * Existing live-published candidates and their target IDs always win. Missing
 * event, rental, and team targets are rebuilt through the affiliate service so
 * divisions, tags, coordinates, and visibility use the current application
 * rules instead of copying related rows directly.
 */
import dotenv from "dotenv";
import { Client, type QueryResultRow } from "pg";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

const apply = process.argv.includes("--apply");
const OWNER_PREFIX = "affiliate_org_";

type CandidateRow = QueryResultRow & {
  id: string;
  sourceId: string;
  runId: string;
  mappingId: string | null;
  listingKind: string;
  status: string;
  dedupeKey: string;
  publishedEventId: string | null;
  publishedTeamId: string | null;
  publishedFacilityId: string | null;
  publishedOrganizationId: string | null;
};

type SourceRow = QueryResultRow & {
  id: string;
  organizationId: string | null;
};

type MaterializeTarget = {
  candidateId: string;
  listingKind: string;
  title: string;
};

const requireUrl = (name: "DATABASE_URL" | "DATABASE_URL_LIVE"): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
};

const withoutSslMode = (value: string): string => {
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
};

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const localClient = new Client({
  connectionString: withoutSslMode(requireUrl("DATABASE_URL")),
  ssl: false,
});

const liveClient = new Client({
  connectionString: withoutSslMode(requireUrl("DATABASE_URL_LIVE")),
  ssl: { rejectUnauthorized: false },
});

const upsertById = async (
  client: Client,
  tableName: string,
  row: QueryResultRow,
) => {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const updates = columns
    .filter((column) => column !== "id" && column !== "createdAt")
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(", ");
  await client.query(
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values,
  );
};

const candidateTargetId = (candidate: CandidateRow): string | null => {
  if (candidate.listingKind === "EVENT") return candidate.publishedEventId;
  if (candidate.listingKind === "TEAM") return candidate.publishedTeamId;
  if (candidate.listingKind === "RENTAL") return candidate.publishedFacilityId;
  if (candidate.listingKind === "CLUB") return candidate.publishedOrganizationId;
  return null;
};

const main = async () => {
  await Promise.all([localClient.connect(), liveClient.connect()]);

  const organizationRows = await localClient.query<{ id: string }>(
    `SELECT id FROM "Organizations" WHERE id LIKE $1 ORDER BY id`,
    [`${OWNER_PREFIX}%`],
  );
  const organizationIds = organizationRows.rows.map((row) => row.id);
  const sourceRows = await localClient.query<SourceRow>(
    `SELECT * FROM "AffiliateScrapeSources"
     WHERE "organizationId" = ANY($1::text[])
     ORDER BY id`,
    [organizationIds],
  );
  const sourceIds = sourceRows.rows.map((row) => row.id);
  const [mappingRows, runRows, candidateRows, liveCandidates] = await Promise.all([
    localClient.query(
      `SELECT * FROM "AffiliateScrapeMappings" WHERE "sourceId" = ANY($1::text[]) ORDER BY id`,
      [sourceIds],
    ),
    localClient.query(
      `SELECT * FROM "AffiliateScrapeRuns" WHERE "sourceId" = ANY($1::text[]) ORDER BY id`,
      [sourceIds],
    ),
    localClient.query<CandidateRow>(
      `SELECT * FROM "AffiliateImportCandidates" WHERE "sourceId" = ANY($1::text[]) ORDER BY id`,
      [sourceIds],
    ),
    liveClient.query<CandidateRow>(
      `SELECT * FROM "AffiliateImportCandidates"`,
    ),
  ]);

  const liveCandidateByDedupe = new Map(
    liveCandidates.rows.map((candidate) => [
      `${candidate.sourceId}\u0000${candidate.dedupeKey}`,
      candidate,
    ]),
  );
  const newCandidates = candidateRows.rows.filter((candidate) => (
    !liveCandidateByDedupe.has(`${candidate.sourceId}\u0000${candidate.dedupeKey}`)
  ));
  const materializeTargets: MaterializeTarget[] = [];

  const summary = {
    mode: apply ? "apply" : "dry-run",
    organizations: organizationIds.length,
    sources: sourceRows.rowCount ?? sourceRows.rows.length,
    mappings: mappingRows.rowCount ?? mappingRows.rows.length,
    runs: runRows.rowCount ?? runRows.rows.length,
    candidates: candidateRows.rowCount ?? candidateRows.rows.length,
    candidatesToCreate: newCandidates.length,
    candidatesAlreadyLive: candidateRows.rows.length - newCandidates.length,
    publishedClubCandidates: candidateRows.rows.filter((candidate) => (
      candidate.listingKind === "CLUB" && candidate.status === "PUBLISHED"
    )).length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write live affiliate import state.");
    return;
  }

  await liveClient.query("BEGIN");
  try {
    for (const source of sourceRows.rows) {
      await upsertById(liveClient, "AffiliateScrapeSources", source);
    }
    for (const mapping of mappingRows.rows) {
      await upsertById(liveClient, "AffiliateScrapeMappings", mapping);
    }
    for (const run of runRows.rows) {
      await upsertById(liveClient, "AffiliateScrapeRuns", run);
    }

    for (const localCandidate of candidateRows.rows) {
      const dedupeKey = `${localCandidate.sourceId}\u0000${localCandidate.dedupeKey}`;
      const liveCandidate = liveCandidateByDedupe.get(dedupeKey) ?? null;
      const candidate: CandidateRow = {
        ...localCandidate,
        id: liveCandidate?.id ?? localCandidate.id,
        createdAt: liveCandidate?.createdAt ?? localCandidate.createdAt,
        status: liveCandidate?.status === "PUBLISHED" || liveCandidate?.status === "DUPLICATE"
          ? liveCandidate.status
          : localCandidate.status,
        publishedEventId: liveCandidate?.publishedEventId ?? null,
        publishedTeamId: liveCandidate?.publishedTeamId ?? null,
        publishedFacilityId: liveCandidate?.publishedFacilityId ?? null,
        publishedOrganizationId:
          liveCandidate?.publishedOrganizationId
          ?? (localCandidate.listingKind === "CLUB" ? localCandidate.publishedOrganizationId : null),
      };
      await upsertById(liveClient, "AffiliateImportCandidates", candidate);

      const liveTargetId = liveCandidate ? candidateTargetId(liveCandidate) : null;
      if (
        candidate.listingKind !== "CLUB"
        && candidate.status !== "DUPLICATE"
        && candidateTargetId(localCandidate)
        && !liveTargetId
      ) {
        materializeTargets.push({
          candidateId: candidate.id,
          listingKind: candidate.listingKind,
          title: String(candidate.title ?? candidate.id),
        });
      }
    }
    await liveClient.query("COMMIT");
  } catch (error) {
    await liveClient.query("ROLLBACK");
    throw error;
  } finally {
    await Promise.all([localClient.end(), liveClient.end()]);
  }

  process.env.DATABASE_URL = requireUrl("DATABASE_URL_LIVE");
  process.env.PG_SSL_REJECT_UNAUTHORIZED = "false";
  process.env.PG_POOL_MAX = "1";
  process.env.PG_CONNECTION_TIMEOUT_MS = "15000";
  const [{ prisma }, { reclassifyAffiliateCandidate }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/server/affiliateImports/service"),
  ]);

  let materialized = 0;
  const skipped: Array<{ candidateId: string; title: string; reason: string }> = [];
  try {
    for (const target of materializeTargets) {
      try {
        await reclassifyAffiliateCandidate(target.candidateId, target.listingKind);
        materialized += 1;
        if (materialized % 25 === 0 || materialized === materializeTargets.length) {
          console.log(`Materialized ${materialized}/${materializeTargets.length} missing targets.`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown materialization error";
        skipped.push({ candidateId: target.candidateId, title: target.title, reason });
        if (/must start in the future|registration deadline has passed/i.test(reason)) {
          await (prisma as any).affiliateImportCandidates.update({
            where: { id: target.candidateId },
            data: { status: "DUPLICATE" },
          });
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({
    applied: true,
    materializedTargets: materialized,
    skippedTargets: skipped.length,
    skipped,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error("[sync-affiliate-import-state-to-live] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([localClient.end(), liveClient.end()]);
  });
