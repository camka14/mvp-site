/**
 * Portland Basketball pick-to-play affiliate source repair.
 *
 * Official URL: https://www.portlandbasketball.com/picktoplay.php
 * Owns source key: portland-basketball-pick-to-play
 * Owns mapping: 48db14c5-94a8-4fc9-8901-51398b3aad09
 * Source org: affiliate_org_portland_basketball, owned by samuel.r@razumly.com
 * Without --scrape this only repairs the source/mapping rows. With --scrape it also
 * creates or updates discovered candidate rows and backing unpublished affiliate events.
 * Safe to run against local or live DBs when DATABASE_URL points at the intended DB.
 */

import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const SOURCE_ID = 'affiliate_source_portland_basketball_pick_to_play';
const SOURCE_KEY = 'portland-basketball-pick-to-play';
const MAPPING_ID = '48db14c5-94a8-4fc9-8901-51398b3aad09';
const ORG_ID = 'affiliate_org_portland_basketball';
const LIST_URL = 'https://www.portlandbasketball.com/picktoplay.php';
const BASE_URL = 'https://www.portlandbasketball.com/';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: '.game-card:has(form.signup-form)',
  itemTextExcludes: ['Volleyball'],
  fields: {
    title: {
      selector: '.game-title',
      mode: 'text',
      required: true,
    },
    officialActionUrl: {
      selector: ':scope',
      mode: 'literal',
      value: LIST_URL,
      required: true,
      transform: 'absoluteUrl',
    },
    sourceUrl: {
      selector: ':scope',
      mode: 'literal',
      value: LIST_URL,
      transform: 'absoluteUrl',
    },
    organizerName: {
      selector: ':scope',
      mode: 'literal',
      value: 'Portland Basketball',
    },
    sportName: {
      selector: ':scope',
      mode: 'literal',
      value: 'Basketball',
    },
    formatLabel: {
      selector: ':scope',
      mode: 'literal',
      value: 'League',
    },
    startsAt: {
      selector: 'input[name^="date"]',
      mode: 'attribute',
      attribute: 'value',
      required: true,
      transform: 'dateTime',
    },
    venueName: {
      selector: 'input[name^="location"]',
      mode: 'attribute',
      attribute: 'value',
      required: true,
      transform: 'venueFromLocationText',
    },
    address: {
      selector: 'input[name^="location"]',
      mode: 'attribute',
      attribute: 'value',
      required: true,
      transform: 'addressFromLocationText',
    },
    city: {
      selector: 'input[name^="location"]',
      mode: 'attribute',
      attribute: 'value',
      transform: 'cityFromLocationText',
    },
    scheduleText: {
      selector: '.game-title',
      mode: 'text',
    },
    priceText: {
      selector: '.price-row',
      mode: 'text',
      transform: 'priceText',
    },
    statusText: {
      selector: '.spot-count',
      mode: 'text',
    },
    description: {
      selector: '.blurb-text',
      mode: 'text',
    },
    maxParticipantsText: {
      selector: '.blurb-text',
      mode: 'text',
    },
    currentParticipantsText: {
      selector: '.roster-toggle-btn',
      mode: 'text',
      regex: '\\((\\d+)\\)',
    },
    spotsRemainingText: {
      selector: '.spot-count',
      mode: 'text',
    },
    participantOptionsText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Individual registration through Portland Basketball.',
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
};

const requireSourceOrg = async () => {
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { id: true, ownerId: true, logoId: true },
  });
  if (!organization?.id) {
    throw new Error(`Source organization ${ORG_ID} was not found. Create the private org before configuring this source.`);
  }
  if (!organization.ownerId) {
    throw new Error(`Source organization ${ORG_ID} must be owned by samuel.r@razumly.com before scraping.`);
  }
  return organization;
};

const upsertSourceAndMapping = async () => {
  const existingSource = await (prisma as any).affiliateScrapeSources.findUnique({
    where: { sourceKey: SOURCE_KEY },
    select: { id: true },
  });
  const sourceId = existingSource?.id ?? SOURCE_ID;

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: sourceId },
    create: {
      id: sourceId,
      name: 'Portland Basketball Pick-to-Play',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: true,
      scrapeIntervalMinutes: 1440,
      notes: 'Scrapes public Portland Basketball pick-to-play signup cards, including hidden source date/location fields. Venue and address are normalized from location text for geocoding.',
      metadata: {
        inspectedAt: '2026-07-07',
        locationParsing: 'venue/address/city from hidden location[] field',
        logoFileId: '2cd0d47a-6e63-4b17-bfe4-fec575b509fe',
      },
    },
    update: {
      name: 'Portland Basketball Pick-to-Play',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: true,
      scrapeIntervalMinutes: 1440,
      notes: 'Scrapes public Portland Basketball pick-to-play signup cards, including hidden source date/location fields. Venue and address are normalized from location text for geocoding.',
      metadata: {
        inspectedAt: '2026-07-07',
        locationParsing: 'venue/address/city from hidden location[] field',
        logoFileId: '2cd0d47a-6e63-4b17-bfe4-fec575b509fe',
      },
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: {
      sourceId,
      NOT: { id: MAPPING_ID },
    },
    data: { isActive: false },
  });

  const existingMapping = await (prisma as any).affiliateScrapeMappings.findUnique({
    where: { id: MAPPING_ID },
    select: { version: true },
  });
  const latestMapping = await (prisma as any).affiliateScrapeMappings.findFirst({
    where: { sourceId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const mappingVersion = existingMapping?.version ?? ((latestMapping?.version ?? 0) + 1);

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId,
      version: mappingVersion,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Portland Basketball pick-to-play mapping with hidden location parsing for venue/address geocoding.',
      validatedAt: new Date(),
    },
    update: {
      sourceId,
      isActive: true,
      mapping,
      notes: 'Portland Basketball pick-to-play mapping with hidden location parsing for venue/address geocoding.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: sourceId },
    data: { activeMappingId: MAPPING_ID },
  });

  return sourceId;
};

const main = async () => {
  await loadAppModules();
  await requireSourceOrg();
  const sourceId = await upsertSourceAndMapping();
  console.log(`Portland Basketball affiliate source ready: ${SOURCE_KEY}`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(sourceId);
    console.log(`Scrape complete: ${result.candidates.length} candidates saved.`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
