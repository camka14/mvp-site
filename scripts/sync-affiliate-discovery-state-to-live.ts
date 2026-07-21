/**
 * Copies local affiliate discovery campaigns and newly created source intakes
 * to the live database. Raw discovery remains review-only; this script does
 * not create organizations, mappings, or public candidates.
 *
 * Dry-run by default:
 *   npm run affiliate:discovery:sync-live
 *   npm run affiliate:discovery:sync-live -- --apply
 */
import dotenv from 'dotenv';
import { Client, type QueryResultRow } from 'pg';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const apply = process.argv.includes('--apply');

const requireUrl = (name: 'DATABASE_URL' | 'DATABASE_URL_LIVE'): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
};

const withoutSslMode = (value: string): string => {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
};

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const localClient = new Client({
  connectionString: withoutSslMode(requireUrl('DATABASE_URL')),
  ssl: false,
});

const liveClient = new Client({
  connectionString: withoutSslMode(requireUrl('DATABASE_URL_LIVE')),
  ssl: process.env.DATABASE_URL_LIVE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const queryRows = async <T extends QueryResultRow>(
  client: Client,
  tableName: string,
  where = '',
  values: unknown[] = [],
): Promise<T[]> => {
  const result = await client.query<T>(
    `SELECT * FROM ${quoteIdentifier(tableName)}${where ? ` WHERE ${where}` : ''}`,
    values,
  );
  return result.rows;
};

const upsertById = async (client: Client, tableName: string, row: QueryResultRow) => {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const updates = columns
    .filter((column) => column !== 'id' && column !== 'createdAt')
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ');
  await client.query(
    `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values,
  );
};

const main = async () => {
  await Promise.all([localClient.connect(), liveClient.connect()]);

  const [campaigns, runs, results, policies, mappingJobs] = await Promise.all([
    queryRows(localClient, 'AffiliateSourceDiscoveryCampaigns'),
    queryRows(localClient, 'AffiliateSourceDiscoveryRuns'),
    queryRows(localClient, 'AffiliateSourceDiscoveryResults'),
    queryRows(localClient, 'AffiliateSourceDomainPolicies'),
    queryRows(localClient, 'AffiliateSourceMappingJobs'),
  ]);
  const intakes = await queryRows(
    localClient,
    'AffiliateSourceIntakes',
    '"affiliateSourceId" IS NULL',
  );
  const intakeIds = intakes.map((row) => String(row.id));
  const [pages, intakeRuns, artifacts] = intakeIds.length
    ? await Promise.all([
      queryRows(localClient, 'AffiliateSourceIntakePages', '"intakeId" = ANY($1::text[])', [intakeIds]),
      queryRows(localClient, 'AffiliateSourceIntakeRuns', '"intakeId" = ANY($1::text[])', [intakeIds]),
      queryRows(localClient, 'AffiliateSourceIntakeArtifacts', '"intakeId" = ANY($1::text[])', [intakeIds]),
    ])
    : [[], [], []];

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    campaigns: campaigns.length,
    runs: runs.length,
    results: results.length,
    policies: policies.length,
    mappingJobs: mappingJobs.length,
    newIntakes: intakes.length,
    pages: pages.length,
    intakeRuns: intakeRuns.length,
    artifacts: artifacts.length,
    note: 'Artifact file metadata is not copied; raw artifact objects remain local until storage replication is configured.',
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write discovery state to live.');
    return;
  }

  await liveClient.query('BEGIN');
  try {
    for (const row of campaigns) await upsertById(liveClient, 'AffiliateSourceDiscoveryCampaigns', row);
    for (const row of runs) await upsertById(liveClient, 'AffiliateSourceDiscoveryRuns', row);
    for (const row of policies) await upsertById(liveClient, 'AffiliateSourceDomainPolicies', row);
    for (const row of mappingJobs) await upsertById(liveClient, 'AffiliateSourceMappingJobs', row);

    const liveIntakeRows = intakeIds.length
      ? await liveClient.query<{ id: string; sourceKey: string }>(
        'SELECT id, "sourceKey" FROM "AffiliateSourceIntakes" WHERE id = ANY($1::text[]) OR "sourceKey" = ANY($2::text[])',
        [intakeIds, intakes.map((row) => String(row.sourceKey))],
      )
      : { rows: [] };
    const liveIntakeById = new Map(liveIntakeRows.rows.map((row) => [row.id, row.id]));
    const liveIntakeBySourceKey = new Map(liveIntakeRows.rows.map((row) => [row.sourceKey, row.id]));
    const intakeIdMap = new Map<string, string>();

    for (const row of intakes) {
      const localId = String(row.id);
      const mappedId = liveIntakeById.get(localId)
        ?? liveIntakeBySourceKey.get(String(row.sourceKey))
        ?? localId;
      intakeIdMap.set(localId, mappedId);
      await upsertById(liveClient, 'AffiliateSourceIntakes', { ...row, id: mappedId });
    }

    const pageIds = pages.map((row) => String(row.id));
    const livePages = pageIds.length
      ? await liveClient.query<{ id: string; urlKey: string }>(
        'SELECT id, "urlKey" FROM "AffiliateSourceIntakePages" WHERE id = ANY($1::text[]) OR "urlKey" = ANY($2::text[])',
        [pageIds, pages.map((row) => String(row.urlKey))],
      )
      : { rows: [] };
    const livePageById = new Map(livePages.rows.map((row) => [row.id, row.id]));
    const livePageByUrlKey = new Map(livePages.rows.map((row) => [row.urlKey, row.id]));
    const pageIdMap = new Map<string, string>();

    for (const row of pages) {
      const localId = String(row.id);
      const mappedId = livePageById.get(localId)
        ?? livePageByUrlKey.get(String(row.urlKey))
        ?? localId;
      pageIdMap.set(localId, mappedId);
      if (!livePageByUrlKey.has(String(row.urlKey)) || livePageById.has(localId)) {
        await upsertById(liveClient, 'AffiliateSourceIntakePages', {
          ...row,
          id: mappedId,
          intakeId: intakeIdMap.get(String(row.intakeId)) ?? row.intakeId,
        });
      }
    }

    for (const row of intakeRuns) {
      await upsertById(liveClient, 'AffiliateSourceIntakeRuns', {
        ...row,
        intakeId: intakeIdMap.get(String(row.intakeId)) ?? row.intakeId,
        requestedPageIds: Array.isArray(row.requestedPageIds)
          ? row.requestedPageIds.map((id: string) => pageIdMap.get(id) ?? id)
          : row.requestedPageIds,
      });
    }

    for (const row of artifacts) {
      await upsertById(liveClient, 'AffiliateSourceIntakeArtifacts', {
        ...row,
        intakeId: intakeIdMap.get(String(row.intakeId)) ?? row.intakeId,
        pageId: row.pageId ? pageIdMap.get(String(row.pageId)) ?? row.pageId : null,
      });
    }

    for (const row of results) {
      await upsertById(liveClient, 'AffiliateSourceDiscoveryResults', {
        ...row,
        matchingIntakeId: row.matchingIntakeId
          ? intakeIdMap.get(String(row.matchingIntakeId)) ?? row.matchingIntakeId
          : null,
      });
    }

    await liveClient.query('COMMIT');
    console.log(JSON.stringify({ applied: true, copied: summary }, null, 2));
  } catch (error) {
    await liveClient.query('ROLLBACK');
    throw error;
  }
};

main()
  .catch((error) => {
    console.error('[sync-affiliate-discovery-state-to-live] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([localClient.end(), liveClient.end()]);
  });
