import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

type RentalSourceConfig = {
  organizationId: string;
  sourceId: string;
  sourceKey: string;
  mappingId: string;
  name: string;
  baseUrl: string;
  listUrl: string;
  notes: string;
  metadata: Record<string, unknown>;
  candidates: ManualCandidate[];
};

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const INSPECTED_AT = '2026-07-09';
const COURTHOUSE_ACTION_URL = 'https://courthousefit.com/party-rental/';

const rentalCandidate = (params: {
  title: string;
  officialActionUrl: string;
  sourceUrl: string;
  organizerName: string;
  sportName: string;
  formatLabel: string;
  city: string;
  venueName: string;
  address: string;
  scheduleText: string;
  participantOptionsText: string;
  description: string;
  priceText?: string;
  statusText?: string;
  warnings?: string[];
}): ManualCandidate => ({
  listingKind: 'RENTAL',
  title: params.title,
  officialActionUrl: params.officialActionUrl,
  sourceUrl: params.sourceUrl,
  organizerName: params.organizerName,
  sportName: params.sportName,
  formatLabel: params.formatLabel,
  city: params.city,
  venueName: params.venueName,
  address: params.address,
  timeZone: 'America/Los_Angeles',
  scheduleText: params.scheduleText,
  dateDisplayMode: 'ONGOING',
  dateDisplayText: 'Check official availability',
  participantOptionsText: params.participantOptionsText,
  priceText: params.priceText,
  statusText: params.statusText ?? 'Submit an inquiry on the official rental page for current availability.',
  description: params.description,
  tags: ['Rental'],
  warnings: params.warnings,
});

const courthouseCandidate = (
  venueName: string,
  address: string,
  city: string,
  locationPageUrl: string,
): ManualCandidate => rentalCandidate({
  title: `${venueName} Gym and Event Rentals`,
  officialActionUrl: COURTHOUSE_ACTION_URL,
  sourceUrl: locationPageUrl,
  organizerName: 'Courthouse VBC',
  sportName: 'Indoor Volleyball',
  formatLabel: 'Gym, court, pool, and event rental',
  city,
  venueName,
  address,
  scheduleText: 'Request a gym, court, pool, party, or private-space rental through the official Courthouse event inquiry page. Availability and rates vary by location and time.',
  participantOptionsText: 'Private gym and court rentals, parties, team gatherings, poolside events, and private-space rentals.',
  priceText: '$275-$375',
  statusText: 'Party packages start at $275-$375; gym and private-space pricing varies by location and time.',
  description: `${venueName} is one of the Courthouse Club Fitness locations covered by the official parties and events inquiry page. Courthouse lists private gym rentals for activities such as basketball, volleyball, and pickleball, along with party, poolside, graduation, team, and private-space rentals. Published party packages start at $275-$375; the source says court availability is limited and gym or private-event rates vary by location and time.`,
  warnings: [
    'The displayed range is the source-provided starting range for party packages. Gym, court, and private-space rates are confirmed during the official inquiry process.',
  ],
});

const sourceConfigs: RentalSourceConfig[] = [
  {
    organizationId: 'affiliate_org_oregon_youth_soccer_find_a_club_basin_united_soccer_club',
    sourceId: 'affiliate_source_basin_united_facility_rentals',
    sourceKey: 'basin-united-facility-rentals',
    mappingId: 'affiliate_mapping_basin_united_facility_rentals_v1',
    name: "Mike's Fieldhouse and Basin United Facility Rentals",
    baseUrl: 'https://www.mikesfieldhouse.org/',
    listUrl: 'https://www.mikesfieldhouse.org/newpage',
    notes: "Manual rental mapping for Mike's Fieldhouse, Steen Sports Park fields, courts, parties, practices, and large events.",
    metadata: {
      inspectedAt: INSPECTED_AT,
      robotsAllowed: true,
      sourceType: 'manual official-page summary',
      rateSheetUrl: 'https://cdn.website-editor.net/s/53e2e5b7b9e242eb84a498152ca82f6b/files/uploaded/Rate%2520Sheet.pdf',
      skippedRows: [
        {
          url: 'https://www.mikesfieldhouse.org/newpage',
          reason: 'Handled by the address-level manual facility rental mapping.',
        },
      ],
    },
    candidates: [
      rentalCandidate({
        title: "Mike's Fieldhouse and Steen Sports Park Rentals",
        officialActionUrl: 'https://www.mikesfieldhouse.org/newpage',
        sourceUrl: 'https://www.mikesfieldhouse.org/newpage',
        organizerName: 'Basin United Soccer Club',
        sportName: 'Indoor Soccer',
        formatLabel: 'Indoor arena, court, and outdoor field rental',
        city: 'Klamath Falls, OR',
        venueName: "Mike's Fieldhouse and Steen Sports Park",
        address: '4500 Foothills Blvd, Klamath Falls, OR 97603',
        scheduleText: 'Submit the rental interest form on the official page for current availability. Summer office hours are Monday-Thursday, 4:00 PM-7:00 PM, with Friday-Sunday by appointment.',
        participantOptionsText: 'Full or partial indoor arena, basketball, pickleball, volleyball, outdoor soccer fields, practices, parties, and large events.',
        priceText: '$40-$175',
        statusText: 'Hourly sports-space rates run from $40-$175; party packages and add-ons are priced separately.',
        description: "Mike's Fieldhouse lists a 60,000-square-foot indoor facility and four outdoor grass fields for practices, sports events, parties, and large events. The official rate sheet lists a full arena at $175 per hour, one-third arena and basketball, pickleball, or volleyball court rentals at $50 per hour, full outdoor fields at $75 per hour without lights or $150 with lights, and half fields at $40 per hour. A two-hour birthday package is listed at $150, with separate add-on and deposit terms on the rate sheet.",
        warnings: [
          'The displayed range covers hourly sports-space rentals. Party packages, staffing, deposits, tables, and room add-ons are described in the details and official rate sheet.',
        ],
      }),
    ],
  },
  {
    organizationId: 'affiliate_org_oregon_youth_soccer_find_a_club_capital_fc',
    sourceId: 'affiliate_source_capital_fc_facility_rentals',
    sourceKey: 'capital-fc-facility-rentals',
    mappingId: 'affiliate_mapping_capital_fc_facility_rentals_v1',
    name: 'Capital FC Facility Rentals',
    baseUrl: 'https://www.cfcsalem.com/',
    listUrl: 'https://www.cfcsalem.com/rent-a-field',
    notes: 'Manual rental mapping for Pioneer Sports Park, Salem Indoor, and Final Pass Field.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      robotsAllowed: true,
      sourceType: 'manual official-page summary',
      sourcePages: [
        'https://www.cfcsalem.com/rent-a-field',
        'https://www.cfcsalem.com/salemindoor',
        'https://www.cfcsalem.com/finalpassfield',
      ],
      skippedRows: [
        {
          url: 'https://www.cfcsalem.com/rent-a-field',
          reason: 'Handled by the three-facility Capital FC manual rental mapping.',
        },
        {
          url: 'https://www.cfcsalem.com/salemindoor',
          reason: 'Handled by the three-facility Capital FC manual rental mapping.',
        },
        {
          url: 'https://www.cfcsalem.com/finalpassfield',
          reason: 'Handled by the three-facility Capital FC manual rental mapping.',
        },
      ],
    },
    candidates: [
      rentalCandidate({
        title: 'Pioneer Sports Park Field Rentals',
        officialActionUrl: 'https://forms.gle/akmdEBqgoEw6d2Xe9',
        sourceUrl: 'https://www.cfcsalem.com/rent-a-field',
        organizerName: 'Capital FC',
        sportName: 'Grass Soccer',
        formatLabel: 'Outdoor turf and grass field rental',
        city: 'Salem, OR',
        venueName: 'Pioneer Sports Park',
        address: '5201 State St, Salem, OR 97317',
        scheduleText: 'Submit the official Capital FC facility rental application for current field availability.',
        participantOptionsText: 'Turf and grass areas configurable for 7v7, 9v9, 11v11, soccer, and other sports.',
        description: "Capital FC's 37-acre Pioneer Sports Park is available to outside groups. The source lists John Chambers Turf Field, Ed Davison Field, and about 700,000 square feet of playable grass area that can be configured for multiple soccer fields or other sports, with parking, office space, power, Wi-Fi, water, and bathrooms available.",
      }),
      rentalCandidate({
        title: 'Salem Indoor Field Rentals',
        officialActionUrl: 'https://calendly.com/salemindoor/field-rental?back=1',
        sourceUrl: 'https://www.cfcsalem.com/salemindoor',
        organizerName: 'Capital FC',
        sportName: 'Indoor Soccer',
        formatLabel: 'Indoor and outdoor soccer field rental',
        city: 'Salem, OR',
        venueName: 'Salem Indoor',
        address: '4701 Portland Rd NE, Salem, OR 97305',
        scheduleText: 'Use the official Calendly page to view hourly availability and book a rental time.',
        participantOptionsText: 'A 180-by-80-foot padded-turf indoor field and a 9v9-sized outdoor field.',
        priceText: '$135',
        statusText: 'The official page lists $135 per hour with a $50 non-refundable deposit.',
        description: 'Salem Indoor is operated by Capital FC and features a 180-by-80-foot padded-turf indoor soccer field plus a 9v9-sized outdoor field available for use and rental. The official page lists hourly rentals at $135, with a $50 non-refundable deposit and the remaining $85 due at the front counter on the rental day.',
      }),
      rentalCandidate({
        title: 'Final Pass Field Rentals',
        officialActionUrl: 'https://calendar.google.com/calendar/u/0/embed?src=c_t33f55h71tjonn8bbk6ut33sc8@group.calendar.google.com&ctz=America/Los_Angeles',
        sourceUrl: 'https://www.cfcsalem.com/finalpassfield',
        organizerName: 'Capital FC',
        sportName: 'Grass Soccer',
        formatLabel: 'Community grass field rental',
        city: 'Salem, OR',
        venueName: 'Final Pass Field at East Salem Community Center',
        address: '1850 45th Ave NE, Salem, OR 97305',
        scheduleText: 'Use the official Google Calendar to check field availability, then contact Capital FC to arrange the rental.',
        participantOptionsText: 'Community and team rentals on a 9v9 grass soccer field.',
        description: 'Final Pass Field is a 9v9 grass field at the East Salem Community Center managed by Capital FC. The source says the field supports Capital FC programs and community partners and is also available for community rentals by families, teams, and organizations. Current availability is published through the linked official calendar.',
      }),
    ],
  },
  {
    organizationId: 'affiliate_org_ceva_club_directory_courthouse_vbc',
    sourceId: 'affiliate_source_courthouse_vbc_facility_rentals',
    sourceKey: 'courthouse-vbc-facility-rentals',
    mappingId: 'affiliate_mapping_courthouse_vbc_facility_rentals_v1',
    name: 'Courthouse VBC Facility Rentals',
    baseUrl: 'https://courthousefit.com/',
    listUrl: COURTHOUSE_ACTION_URL,
    notes: 'Manual rental mapping for the five Courthouse Club Fitness locations associated with Courthouse VBC programs.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      robotsAllowed: true,
      sourceType: 'manual official-page summary',
      officialActionUrl: COURTHOUSE_ACTION_URL,
      skippedRows: [
        {
          url: COURTHOUSE_ACTION_URL,
          reason: 'Handled by the five-location Courthouse manual rental mapping.',
        },
      ],
    },
    candidates: [
      courthouseCandidate(
        'Courthouse South River Road',
        '2975 River Rd S, Salem, OR 97302',
        'Salem, OR',
        'https://courthousefit.com/locations-south-river-rd/',
      ),
      courthouseCandidate(
        'Courthouse Lancaster',
        '4132 Devonshire Ct NE, Salem, OR 97305',
        'Salem, OR',
        'https://courthousefit.com/locations-lancaster/',
      ),
      courthouseCandidate(
        'Courthouse Keizer',
        '117 McNary Estates Dr N, Keizer, OR 97303',
        'Keizer, OR',
        'https://courthousefit.com/locations/keizer/',
      ),
      courthouseCandidate(
        'Courthouse West Salem',
        '300 Glen Creek Rd NW, Salem, OR 97304',
        'Salem, OR',
        'https://courthousefit.com/locations-west-salem/',
      ),
      courthouseCandidate(
        'Courthouse Battle Creek',
        '6250 Commercial St SE, Salem, OR 97306',
        'Salem, OR',
        'https://courthousefit.com/locations/battlecreek/',
      ),
    ],
  },
];

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: '<html><body></body></html>',
    fetchedAt: new Date().toISOString(),
  }),
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const requireOrganization = async (config: RentalSourceConfig, ownerId: string) => {
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: config.organizationId },
    select: { id: true, name: true, logoId: true },
  });
  if (!organization) {
    throw new Error(`Organization ${config.organizationId} was not found.`);
  }
  if (!organization.logoId) {
    throw new Error(`Organization ${organization.name ?? organization.id} must have an official logo before rental setup.`);
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Organization ${organization.name ?? organization.id} references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: organization.id },
    data: {
      ownerId,
      operatesAthleticFacility: true,
      updatedAt: new Date(),
    },
  });

  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: organization.id },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    organization.id,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      'Facility',
      'Rental Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async (config: RentalSourceConfig) => {
  const mapping: AffiliateScrapeMapping = {
    kind: 'RENTAL',
    listUrl: config.listUrl,
    itemSelector: 'body',
    fields: {
      title: {
        selector: 'body',
        mode: 'literal',
        value: config.name,
      },
      officialActionUrl: {
        selector: 'body',
        mode: 'literal',
        value: config.listUrl,
      },
    },
    dedupe: {
      fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
    },
    manualCandidates: config.candidates,
  };

  const sourcePayload = {
    name: config.name,
    sourceKey: config.sourceKey,
    organizationId: config.organizationId,
    baseUrl: config.baseUrl,
    listUrl: config.listUrl,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: config.mappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: config.notes,
    metadata: config.metadata,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: config.sourceId },
    create: {
      id: config.sourceId,
      ...sourcePayload,
    },
    update: sourcePayload,
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: config.sourceId },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: config.sourceId,
        version: 1,
      },
    },
    create: {
      id: config.mappingId,
      sourceId: config.sourceId,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: config.notes,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: config.notes,
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: config.sourceId },
    data: { activeMappingId: config.mappingId },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  for (const config of sourceConfigs) {
    await requireOrganization(config, owner.id);
    await upsertSourceAndMapping(config);
    console.log(`${config.name} source ready with ${config.candidates.length} rental candidate(s).`);

    if (shouldScrape) {
      const result = await runAffiliateSourceScrape(config.sourceId, { client: staticPageClient });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(
        `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
        + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
      );
    }
  }

  if (!shouldScrape) {
    console.log('Re-run with --scrape to create or update the rental candidates locally.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-club-facility-rental-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
