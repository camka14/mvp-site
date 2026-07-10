/**
 * Ashland Soccer Club program source setup.
 *
 * Ashland publishes useful current season/program descriptions without exact
 * start dates. These rows use the no-fixed-date display rather than inventing
 * dates from stale registration or schedule pages.
 */
import dotenv from 'dotenv';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualDivision = NonNullable<
  NonNullable<AffiliateScrapeMapping['manualCandidates']>[number]['divisions']
>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_ashland_soccer_club';
const SOURCE_ID = 'affiliate_source_ashland_soccer_club_programs';
const SOURCE_KEY = 'ashland-soccer-club-programs';
const MAPPING_ID = 'affiliate_mapping_ashland_soccer_club_programs_v1';
const HOME_URL = 'https://ashlandsoccerclub.com/';
const YOUTH_URL = 'https://ashlandsoccerclub.com/youth-programs/';
const ADULT_URL = 'https://ashlandsoccerclub.com/adult-program/';
const ADULT_CURRENT_URL = 'https://www.ashlandadultsoccer.com/';
const ADULT_REGISTRATION_URL = 'https://www.ashlandadultsoccer.com/register';
const FIELDS_URL = 'https://ashlandsoccerclub.com/fields-facilities/';
const YOUTH_REGISTRATION_URL = 'https://ashlandsoccerclub.sprocketsports.com/';
const VENUE = 'North Mountain Park';
const ADDRESS = '620 N Mountain Ave, Ashland, OR 97520';

const ageDivision = (
  name: string,
  key: string,
  divisionTypeId: string,
  priceCents: number | null,
  ageCutoffLabel: string,
): ManualDivision => ({
  name,
  key,
  gender: 'C',
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  maxParticipants: null,
  ageCutoffLabel,
  ageCutoffSource: YOUTH_URL,
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Ashland Soccer Club Programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Ashland Soccer Club Youth Soccer Programs',
      officialActionUrl: YOUTH_REGISTRATION_URL,
      sourceUrl: YOUTH_URL,
      organizerName: 'Ashland Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth recreational and competitive soccer',
      city: 'Ashland, OR',
      venueName: VENUE,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Fall games run on weekends from after Labor Day through the last weekend in October. Spring games run from after spring break through the weekend before Memorial Day. Exact current team dates are posted by the club.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall and spring seasons',
      ageGroup: 'Kindergarten through 8th grade',
      divisionText: 'Kindergarten-2nd Grade; U11 Academy; Recreational; Competitive',
      participantOptionsText: 'Individual player registration through the club registration site',
      priceText: null,
      statusText: 'Use the current Ashland Soccer Club registration site for available programs.',
      description: 'Ashland Soccer Club offers youth soccer from kindergarten through 8th grade in fall and spring seasons. The source says kindergarten through 2nd grade players have no registration fee, and players starting at U11 may be placed into recreational or competitive teams when numbers allow. Teams receive ten fall games and ten spring games, with practices in Ashland and games in Ashland and other Southern Oregon communities. Current paid-division fees are not published on the public page.',
      tags: ['League'],
      divisions: [
        ageDivision('Kindergarten-2nd Grade', 'c_age_u8_k_2', 'u8', 0, 'Kindergarten through 2nd grade'),
        ageDivision('U11 Academy', 'c_age_u11_academy', 'u11', null, 'U11'),
        ageDivision('Recreational Youth', 'c_age_youth_recreational', 'youth', null, 'Youth recreational division; exact ages vary by team'),
        ageDivision('Competitive Youth', 'c_age_youth_competitive', 'youth', null, 'Youth competitive division; exact ages vary by team'),
      ],
      warnings: [
        'The public program page provides seasonal windows but not exact 2026-27 team dates or current paid-division fees.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Ashland Adult Soccer Fall 2026 League',
      officialActionUrl: ADULT_CURRENT_URL,
      sourceUrl: ADULT_CURRENT_URL,
      organizerName: 'Ashland Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Adult 7v7 coed soccer league',
      city: 'Ashland, OR',
      venueName: VENUE,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Monday evenings at 6:45 PM or 8:00 PM during September and October 2026. Exact dates and registration are scheduled to be published in August.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall 2026, September-October',
      ageGroup: 'Ages 16+',
      divisionText: 'Coed 16+',
      participantOptionsText: 'All players register individually; players may form a team of ten or request placement',
      priceText: null,
      statusText: 'The official page says Fall 2026 registration is coming in August.',
      description: 'Ashland Adult Soccer lists a Fall 2026 7v7 coed league for players age 16 and older at North Mountain Park. Games are planned for Monday evenings at 6:45 PM or 8:00 PM in September and October, with a seven-game guarantee. Players may organize teams of ten or register for placement on a team. The current fall fee has not yet been published.',
      tags: ['League'],
      divisions: [
        {
          name: 'Coed 16+',
          key: 'c_age_16plus_coed',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '16plus',
          priceCents: null,
          maxParticipants: null,
          ageCutoffLabel: 'Ages 16+',
          ageCutoffSource: ADULT_CURRENT_URL,
        },
      ],
      warnings: [
        'The separate registration page still shows a closed Spring 2026 form and fee, so that stale fee is intentionally not used for Fall 2026.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Ashland Adult Soccer Sunday Pickup Games',
      officialActionUrl: ADULT_CURRENT_URL,
      sourceUrl: ADULT_CURRENT_URL,
      organizerName: 'Ashland Adult Soccer',
      sportName: 'Grass Soccer',
      formatLabel: 'Public pickup soccer',
      city: 'Ashland, OR',
      venueName: VENUE,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sundays around 10:00-11:00 AM. Check the official page for current field conditions and updates.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Sundays around 10:00-11:00 AM',
      divisionText: 'Open public play',
      participantOptionsText: 'Public pickup; no supervised registration program is stated',
      priceText: null,
      statusText: 'The source says the game is open to the public and is not sanctioned or supervised by Ashland Adult Soccer.',
      description: 'Ashland Adult Soccer lists recurring Sunday pickup games around 10:00-11:00 AM at North Mountain Park. The source asks players to use the side of the main field to protect the grass and states that the pickup game is open to the public, unsanctioned, and unsupervised.',
      tags: ['Pickup Game'],
      divisions: [
        {
          name: 'Open',
          key: 'c_skill_open',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'open',
          priceCents: null,
          maxParticipants: null,
        },
      ],
    },
  ],
};

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: '<html><body></body></html>',
    fetchedAt: new Date().toISOString(),
  }),
};

const prepareOrganization = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { id: true, logoId: true },
  });
  if (!organization?.logoId) {
    throw new Error('Ashland Soccer Club must exist with an official logo before source setup.');
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Ashland Soccer Club references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      address: ADDRESS,
      location: 'Ashland, OR',
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: ORG_ID },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    ORG_ID,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      'Event Manager',
      'League Operator',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Ashland Soccer Club Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for current Ashland youth, adult league, and public pickup program pages.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-and-evergreen-programs',
      sourcePages: [HOME_URL, YOUTH_URL, ADULT_URL, ADULT_CURRENT_URL, ADULT_REGISTRATION_URL, FIELDS_URL, YOUTH_REGISTRATION_URL],
      skippedRows: [
        { url: HOME_URL, reason: 'Current club programs are handled by this validated manual mapping.' },
        { url: YOUTH_URL, reason: 'The youth fall/spring program is handled by this validated manual mapping.' },
        { url: ADULT_URL, reason: 'The current adult program is handled from its linked official adult-soccer site.' },
        { url: ADULT_CURRENT_URL, reason: 'The Fall 2026 league and Sunday pickup rows are handled by this validated manual mapping.' },
        { url: FIELDS_URL, reason: 'North Mountain Park is a program venue; the club does not publish it as a rental.' },
        { url: ADULT_REGISTRATION_URL, reason: 'The page still shows a closed Spring 2026 registration and is retained only as stale-price evidence.' },
      ],
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
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manually verified Ashland Soccer Club program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified Ashland Soccer Club program mapping.',
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
  await prepareOrganization();
  await upsertSourceAndMapping();
  console.log('Ashland Soccer Club source is ready with three candidates.');

  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-ashland-soccer-club-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
