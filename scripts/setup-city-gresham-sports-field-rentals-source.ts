import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_city_of_gresham';
const SOURCE_ID = 'f3a46cda-2cfe-4d2e-9217-f9036c543ba4';
const SOURCE_KEY = 'city-gresham-sports-field-rentals';
const MAPPING_ID = 'affiliate_mapping_city_gresham_sports_field_rentals_v3';
const BASE_URL = 'https://www.greshamoregon.gov';
const LIST_URL = 'https://www.greshamoregon.gov/services/parks-and-recreation/parks-reservations/';
const GENERAL_CALENDAR_URL = 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=';

const parkRows = [
  {
    title: 'Aspen Highland Park',
    address: '147 NE 24th St, Gresham, OR 97030',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31397',
    priceText: '$15-$30',
  },
  {
    title: 'Bella Vista Park',
    address: '401 NW Bella Vista Dr, Gresham, OR 97030',
    bookingUrl: GENERAL_CALENDAR_URL,
    priceText: '$15-$30',
  },
  {
    title: 'Butler Creek Park',
    address: '2385 SW 27th Dr, Gresham, OR 97080',
    bookingUrl: GENERAL_CALENDAR_URL,
    priceText: '$15-$30',
  },
  {
    title: 'Gradin Community Sports Park',
    address: '2303 SE Palmquist Rd, Gresham, OR 97080',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31395',
    priceText: '$35-$70',
  },
  {
    title: 'Hall Park',
    address: '2727 NE 23rd St, Gresham, OR 97030',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31403',
    priceText: '$15-$30',
  },
  {
    title: 'Hollybrook Park',
    address: '535 SW Birdsdale Dr, Gresham, OR 97080',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31405',
    priceText: '$15-$30',
  },
  {
    title: 'John Deere Field',
    address: '2100 NE 181st Ave, Portland, OR 97230',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31407',
    priceText: '$15-$30',
  },
  {
    title: 'Kirk Park',
    address: '1087 NE 188th Ave, Portland, OR 97230',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31444',
    priceText: '$15-$30',
  },
  {
    title: 'Main City Park',
    address: '219 S Main Ave, Gresham, OR 97030',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31130',
    priceText: '$15-$30',
  },
  {
    title: 'North Gresham Park',
    address: '1111 SE 217th Ave, Gresham, OR 97030',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31409',
    priceText: '$15-$30',
  },
  {
    title: 'Pat Pfeifer Park',
    address: '424 NE 172nd Ave, Portland, OR 97230',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31411',
    priceText: '$15-$30',
  },
  {
    title: 'Red Sunset Park',
    address: '2403 NE Red Sunset Dr, Gresham, OR 97030',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31133',
    priceText: '$15-$30',
  },
  {
    title: 'Rockwood Central Park',
    address: '17707 SE Main St, Portland, OR 97233',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31462',
    priceText: '$15-$30',
  },
  {
    title: 'Vance Park',
    address: '1400 SE 182nd Ave, Portland, OR 97233',
    bookingUrl: 'https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=31413',
    priceText: '$15-$30',
  },
] as const;

const valueMap = <K extends 'address' | 'bookingUrl' | 'priceText'>(key: K) =>
  Object.fromEntries(parkRows.map((row) => [row.title, row[key]]));

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: '#sportsfield h3 + table li',
  fields: {
    title: {
      selector: 'a',
      mode: 'text',
      required: true,
    },
    sourceUrl: {
      selector: 'a',
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
    },
    officialActionUrl: {
      selector: 'a',
      mode: 'text',
      valueMap: valueMap('bookingUrl'),
      required: true,
    },
    organizerName: {
      selector: ':scope',
      mode: 'literal',
      value: 'City of Gresham',
    },
    sportName: {
      selector: ':scope',
      mode: 'literal',
      value: 'Softball',
    },
    formatLabel: {
      selector: ':scope',
      mode: 'literal',
      value: 'Soccer and softball field rental',
    },
    city: {
      selector: ':scope',
      mode: 'literal',
      value: 'Gresham, OR',
    },
    venueName: {
      selector: 'a',
      mode: 'text',
    },
    address: {
      selector: 'a',
      mode: 'text',
      valueMap: valueMap('address'),
      required: true,
    },
    scheduleText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Sports-field reservations run April 1-October 31 from 8:00 AM to 10:00 PM; fields are first-come, first-served November 1-March 31.',
    },
    dateDisplayMode: {
      selector: ':scope',
      mode: 'literal',
      value: 'ONGOING',
    },
    dateDisplayText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Seasonal reservations April-October',
    },
    participantOptionsText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Recreation, youth or adult organized sports, tournaments, and for-profit field use.',
    },
    priceText: {
      selector: 'a',
      mode: 'text',
      valueMap: valueMap('priceText'),
    },
    statusText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Check the official CommunityPass calendar for current availability.',
    },
    description: {
      selector: ':scope',
      mode: 'literal',
      value: 'The City of Gresham accepts seasonal reservations for public soccer and softball fields. Current availability, permits, and payment are handled through the official CommunityPass reservation flow. Gradin Community Sports Park uses a separate fee tier; detailed resident, non-resident, youth, adult, tournament, and for-profit terms remain on the official City page.',
    },
    tagText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Rental',
    },
  },
  dedupe: {
    fields: ['title', 'sourceUrl'],
  },
};

const directPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'BracketIQ affiliate source validator; contact samuel.r@razumly.com',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    return {
      url,
      finalUrl: response.url || url,
      statusCode: response.status,
      body: await response.text(),
      fetchedAt: new Date().toISOString(),
    };
  },
};

const requireOwnerAndOrganization = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);

  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { id: true, logoId: true },
  });
  if (!organization) throw new Error(`Organization ${ORG_ID} was not found.`);
  if (!organization.logoId) throw new Error('City of Gresham must have an official logo before source setup.');
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) throw new Error(`City of Gresham references missing logo ${organization.logoId}.`);

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      operatesAthleticFacility: true,
      updatedAt: new Date(),
    },
  });
  await syncOrganizationTags(ORG_ID, ['Facility', 'Rental Provider'], prisma);
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'City of Gresham Sports Field Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: true,
    scrapeIntervalMinutes: 43200,
    notes: 'Municipal sports-field inventory. Official availability and reservations are handled through CommunityPass.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      sourceCategory: 'municipal-parks-rental',
      bookingUrl: GENERAL_CALENDAR_URL,
      expectedCandidateCount: parkRows.length,
      missingFacilitySpecificBookingIds: ['Bella Vista Park', 'Butler Creek Park'],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...sourcePayload },
    update: sourcePayload,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: SOURCE_ID,
        version: 3,
      },
    },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 3,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Validated 14-park City of Gresham sports-field mapping with addresses and current fee ranges.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Validated 14-park City of Gresham sports-field mapping with addresses and current fee ranges.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  await requireOwnerAndOrganization();
  await upsertSourceAndMapping();
  console.log(`City of Gresham source ready for ${parkRows.length} sports-field rental candidates.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: directPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    if (result.candidates.length !== parkRows.length) {
      throw new Error(`Expected ${parkRows.length} candidates but saved ${result.candidates.length}.`);
    }
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to validate the live page and update the local candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-city-gresham-sports-field-rentals-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
