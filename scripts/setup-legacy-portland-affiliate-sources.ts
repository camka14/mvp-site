/**
 * Restores the four legacy Portland source mappings that already exist in the
 * affiliate database but did not previously have a checked-in setup backup.
 *
 * This script is local-only by design. It preserves the reviewed mapping
 * shape, requires the source organization and official logo to exist, and
 * leaves automatic scheduling disabled unless explicitly enabled. It does not
 * manufacture intake evidence or manual candidates from a missing intake.
 *
 * Examples:
 *   npm run affiliate:setup:legacy-portland
 *   npm run affiliate:setup:legacy-portland -- --source-key portland-ultimate-events
 *   npm run affiliate:setup:legacy-portland -- --source-prefix rose-city-futsal- --scrape
 */

import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { parseAffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

type LegacySource = {
  id: string;
  sourceKey: string;
  name: string;
  organizationId: string | null;
  baseUrl: string | null;
  listUrl: string;
  targetKind: string;
  status: string;
  activeMappingId: string | null;
  autoScrapeEnabled: boolean;
  scrapeIntervalMinutes: number;
  notes: string | null;
  metadata?: unknown;
};

type LegacyMapping = {
  id: string;
  sourceId: string;
  version: number;
  mapping: unknown;
  notes: string | null;
};

type LegacyConfig = {
  source: LegacySource;
  mapping: LegacyMapping;
};

type LegacyConfigFile = LegacyConfig[];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const OWNER_EMAIL = 'samuel.r@razumly.com';
const CONFIG_PATH = resolve(process.cwd(), 'scripts/data/legacy-portland-affiliate-source-configs.json');
const BACKUP_DATE = '2026-07-29';

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const loadConfigs = (): LegacyConfigFile => {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error(`Expected an array in ${CONFIG_PATH}.`);

  return raw.map((entry, index) => {
    const config = entry as Partial<LegacyConfig>;
    if (!config.source?.sourceKey || !config.mapping?.mapping) {
      throw new Error(`Legacy config ${index} is missing source or mapping data.`);
    }
    return {
      source: config.source as LegacySource,
      mapping: config.mapping as LegacyMapping,
    };
  });
};

const parseSourceSelection = (configs: LegacyConfigFile) => {
  const sourceKeyIndex = process.argv.indexOf('--source-key');
  const sourcePrefixIndex = process.argv.indexOf('--source-prefix');
  const sourceKey = sourceKeyIndex >= 0 ? process.argv[sourceKeyIndex + 1] : undefined;
  const sourcePrefix = sourcePrefixIndex >= 0 ? process.argv[sourcePrefixIndex + 1] : undefined;

  if (sourceKey && sourcePrefix) {
    throw new Error('Use either --source-key or --source-prefix, not both.');
  }
  if (sourceKey && !configs.some((config) => config.source.sourceKey === sourceKey)) {
    throw new Error(`Unknown legacy source key: ${sourceKey}`);
  }
  if (sourcePrefix && !configs.some((config) => config.source.sourceKey.startsWith(sourcePrefix))) {
    throw new Error(`No legacy source keys match prefix: ${sourcePrefix}`);
  }

  return configs.filter((config) =>
    (!sourceKey || config.source.sourceKey === sourceKey) &&
    (!sourcePrefix || config.source.sourceKey.startsWith(sourcePrefix)),
  );
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const requireSourceOrganization = async (organizationId: string | null) => {
  if (!organizationId) throw new Error('Legacy source is missing an organizationId.');

  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);

  const organization = await (prisma as any).organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, logoId: true },
  });
  if (!organization?.id) {
    throw new Error(`Source organization ${organizationId} was not found. Create the organization before setup.`);
  }
  if (!organization.logoId) {
    throw new Error(`Source organization ${organizationId} has no official logo.`);
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) throw new Error(`Source organization ${organizationId} references missing logo ${organization.logoId}.`);

  if (organization.ownerId !== owner.id) {
    await (prisma as any).organizations.update({
      where: { id: organizationId },
      data: { ownerId: owner.id, updatedAt: new Date() },
    });
  }
};

const upsertSourceAndMapping = async (config: LegacyConfig, enableAutomaticScraping: boolean) => {
  const sourceConfig = config.source;
  const mapping = parseAffiliateScrapeMapping(config.mapping.mapping) as AffiliateScrapeMapping;
  if (mapping.kind !== sourceConfig.targetKind) {
    throw new Error(`${sourceConfig.sourceKey} target kind ${sourceConfig.targetKind} does not match mapping kind ${mapping.kind}.`);
  }
  await requireSourceOrganization(sourceConfig.organizationId);

  const existingSource = await (prisma as any).affiliateScrapeSources.findUnique({
    where: { sourceKey: sourceConfig.sourceKey },
    select: { id: true, metadata: true },
  });
  const sourceId = existingSource?.id ?? sourceConfig.id;
  const existingMapping = await (prisma as any).affiliateScrapeMappings.findUnique({
    where: { sourceId_version: { sourceId, version: config.mapping.version } },
    select: { id: true, validatedAt: true },
  });
  const mappingById = await (prisma as any).affiliateScrapeMappings.findUnique({
    where: { id: config.mapping.id },
    select: { sourceId: true },
  });
  if (mappingById && mappingById.sourceId !== sourceId && !existingMapping) {
    throw new Error(`Mapping ${config.mapping.id} is already assigned to another source.`);
  }
  const mappingId = existingMapping?.id ?? config.mapping.id;
  const previousMetadata = asObject(existingSource?.metadata);
  const checkedInMetadata = asObject(sourceConfig.metadata);
  const metadata = {
    ...previousMetadata,
    ...checkedInMetadata,
    setupBackup: {
      checkedInAt: BACKUP_DATE,
      sourceBuilder: 'affiliate-scrape-source-builder',
      method: 'existing-live-mapping-export',
      intakeEvidenceStatus: 'not-available-for-this-legacy-source',
      mappingChangesRequireFreshIntake: true,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { sourceKey: sourceConfig.sourceKey },
    create: {
      id: sourceId,
      name: sourceConfig.name,
      sourceKey: sourceConfig.sourceKey,
      organizationId: sourceConfig.organizationId,
      baseUrl: sourceConfig.baseUrl,
      listUrl: sourceConfig.listUrl,
      targetKind: sourceConfig.targetKind,
      status: sourceConfig.status,
      activeMappingId: mappingId,
      autoScrapeEnabled: enableAutomaticScraping && sourceConfig.autoScrapeEnabled,
      scrapeIntervalMinutes: sourceConfig.scrapeIntervalMinutes,
      notes: sourceConfig.notes,
      metadata,
    },
    update: {
      name: sourceConfig.name,
      organizationId: sourceConfig.organizationId,
      baseUrl: sourceConfig.baseUrl,
      listUrl: sourceConfig.listUrl,
      targetKind: sourceConfig.targetKind,
      status: sourceConfig.status,
      activeMappingId: mappingId,
      autoScrapeEnabled: enableAutomaticScraping && sourceConfig.autoScrapeEnabled,
      scrapeIntervalMinutes: sourceConfig.scrapeIntervalMinutes,
      notes: sourceConfig.notes,
      metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId, version: config.mapping.version } },
    create: {
      id: mappingId,
      sourceId,
      version: config.mapping.version,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: `${config.mapping.notes ?? 'Existing reviewed mapping'} Durable local backup checked in ${BACKUP_DATE}; refresh intake before changing the mapping.`,
      validatedAt: null,
    },
    update: {
      isActive: true,
      mapping,
      notes: `${config.mapping.notes ?? 'Existing reviewed mapping'} Durable local backup checked in ${BACKUP_DATE}; refresh intake before changing the mapping.`,
      validatedAt: existingMapping?.validatedAt ?? null,
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: sourceId },
    data: { activeMappingId: mappingId },
  });

  return { sourceId, mappingId, mapping };
};

const main = async () => {
  if (process.argv.includes('--live')) {
    throw new Error('This backup script is local-only; do not pass --live.');
  }

  const configs = loadConfigs();
  const selectedConfigs = parseSourceSelection(configs);
  const enableAutomaticScraping = process.argv.includes('--enable-auto-scrape');
  const shouldScrape = process.argv.includes('--scrape');
  await loadAppModules();

  for (const config of selectedConfigs) {
    const result = await upsertSourceAndMapping(config, enableAutomaticScraping);
    console.log(`Configured ${config.source.sourceKey} (${result.mapping.kind}) with mapping ${result.mappingId}. Automatic scraping: ${enableAutomaticScraping ? 'enabled' : 'disabled'}.`);
    if (shouldScrape) {
      const scrapeResult = await runAffiliateSourceScrape(result.sourceId);
      const logs = scrapeResult.run.logs as Record<string, unknown> | null;
      console.log(`Scrape ${scrapeResult.run.id}: ${scrapeResult.candidates.length} candidate(s) saved; created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}.`);
    }
  }
};

main()
  .catch((error) => {
    console.error('[setup-legacy-portland-affiliate-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
