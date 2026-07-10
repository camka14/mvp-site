/** Current Aspire NW VBC Vancouver programs verified from the official clinic page. */
import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live') && process.env.DATABASE_URL_LIVE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

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
const ORG_ID = 'affiliate_org_ceva_club_directory_aspire_nw_vbc_vancouver';
const SOURCE_ID = 'affiliate_source_aspire_nw_vancouver_current_programs';
const SOURCE_KEY = 'aspire-nw-vancouver-current-programs';
const MAPPING_ID = 'affiliate_mapping_aspire_nw_vancouver_current_programs_v1';
const HOME_URL = 'https://aspirenwvolleyball.com/';
const CLINICS_URL = 'https://aspirenwvolleyball.com/clinics/vancouver-wa/';
const TRYOUTS_URL = 'https://aspirenwvolleyball.com/tryouts/vancouver-wa/';
const TEAMS_URL = 'https://aspirenwvolleyball.com/teams-list/vancouver-wa/';
const TRYOUTS_INDEX_URL = 'https://aspirenwvolleyball.com/tryouts/';
const CLINICS_INDEX_URL = 'https://aspirenwvolleyball.com/clinics/';
const BEAVERTON_CLINICS_URL = 'https://aspirenwvolleyball.com/clinics/beaverton-ymca/';
const FACILITY_INFO_URL = 'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-facility-info/';
const TOURNAMENT_INFO_URL = 'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-info/';
const ACADEMY_ACTION_URL = 'https://aspirenwvolleyball.leagueapps.com/events/5046679-aspire-2026-fall-academy---vancouver';
const SEMI_PRIVATE_ACTION_URL = 'https://aspirenwvolleyball.leagueapps.com/classes/5001615-semi-private-training-sessions---springsummer-2026';
const KINGS_WAY_ADDRESS = '3606 NE 78th St, Vancouver, WA 98665';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: CLINICS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Aspire NW VBC Vancouver current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: CLINICS_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Aspire Vancouver Fall Academy 2026',
      officialActionUrl: ACADEMY_ACTION_URL,
      sourceUrl: CLINICS_URL,
      organizerName: 'Aspire NW VBC Vancouver',
      sportName: 'Indoor Volleyball',
      formatLabel: 'Six-week youth volleyball academy',
      city: 'Vancouver, WA',
      venueName: "King's Way Christian Schools",
      address: KINGS_WAY_ADDRESS,
      startsAt: '2026-09-13T00:00:00-07:00',
      endsAt: '2026-10-18T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Six weekly Sunday sessions from September 13 through October 18, 2026. Each session lasts 1.5 hours; the public page does not specify a universal start time.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'Sundays, September 13-October 18, 2026',
      ageGroup: 'Youth athletes; age range not specified',
      divisionText: 'Youth academy; age range not specified',
      participantOptionsText: 'Individual academy registration; an Aspire Academy T-shirt is included',
      statusText: 'Use the official registration link for current availability and price.',
      description: "Aspire NW Volleyball Club describes this as a six-week youth volleyball development program that introduces the fundamentals in a supportive environment. Sessions run every Sunday from September 13 through October 18 at King's Way Christian Schools, last 1.5 hours, and include an Aspire Academy T-shirt. The public source does not specify the session start time, participant age range, capacity, or price.",
      tags: ['Clinic'],
      divisions: [{
        name: 'Youth Academy',
        key: 'c_skill_youth_academy',
        gender: 'C',
        ratingType: 'SKILL',
        divisionTypeId: 'open',
        priceCents: null,
        ageCutoffLabel: 'Not specified',
        ageCutoffSource: CLINICS_URL,
      }],
      warnings: [
        'The official page publishes dates and duration but no universal start time; midnight preserves the official start date without inventing a time.',
        'The official page does not publish the age range, capacity, or price.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Aspire Vancouver Semi-Private Volleyball Training',
      officialActionUrl: SEMI_PRIVATE_ACTION_URL,
      sourceUrl: CLINICS_URL,
      organizerName: 'Aspire NW VBC Vancouver',
      sportName: 'Indoor Volleyball',
      formatLabel: 'Semi-private volleyball training',
      city: 'Vancouver, WA',
      venueName: 'Aspire NW Vancouver training location',
      address: 'Vancouver, WA',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sixty-minute sessions are scheduled through the official registration flow. The public page asks participants to remain available for the entire offered scheduling block.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Sessions by current booking availability',
      ageGroup: 'Matched by age, skill, and position',
      divisionText: 'Two-athlete semi-private training',
      participantOptionsText: 'Individual registration; two athletes are matched by Aspire',
      priceText: '$75',
      statusText: 'The public page lists $75 per athlete per session and says sessions remain open until full.',
      description: 'Aspire NW Volleyball Club offers 60-minute semi-private training sessions for two athletes matched by age, skill, and position. Aspire coaches provide position-specific work and targeted feedback. The public source lists a price of $75 per athlete per session and does not publish a fixed schedule or street address.',
      tags: ['Clinic'],
      divisions: [{
        name: 'Semi-Private Training',
        key: 'c_skill_semi_private_training',
        gender: 'C',
        ratingType: 'SKILL',
        divisionTypeId: 'open',
        priceCents: 7500,
        ageCutoffLabel: 'Matched by age and skill',
        ageCutoffSource: CLINICS_URL,
      }],
      warnings: [
        'The official page does not publish fixed session dates, times, a street address, capacity, or a participant age range.',
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
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);

  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { logoId: true },
  });
  if (!organization?.logoId) throw new Error('Aspire NW VBC Vancouver must have an official logo before source setup.');
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) throw new Error(`Aspire NW VBC Vancouver references missing logo ${organization.logoId}.`);

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      website: HOME_URL,
      location: 'Vancouver, WA',
      address: 'Vancouver, WA',
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
      'Training Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Aspire NW VBC Vancouver Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: CLINICS_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for Aspire Vancouver academy and semi-private training.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, CLINICS_INDEX_URL, CLINICS_URL, TRYOUTS_INDEX_URL, TRYOUTS_URL, TEAMS_URL, FACILITY_INFO_URL, TOURNAMENT_INFO_URL, ACADEMY_ACTION_URL, SEMI_PRIVATE_ACTION_URL],
      venueAddressSourceUrl: 'https://www.kwcs.org/contact/',
      skippedRows: [
        { url: HOME_URL, reason: 'Current Vancouver program rows are handled by this mapping.' },
        { url: CLINICS_URL, reason: 'The academy and semi-private training rows are handled by this mapping.' },
        { url: CLINICS_INDEX_URL, reason: 'The clinic index links to the Vancouver rows handled by this mapping and the separately reviewed Beaverton page.' },
        { url: BEAVERTON_CLINICS_URL, reason: 'This page belongs to the separately modeled Aspire NW VBC Beaverton organization.' },
        { url: TRYOUTS_INDEX_URL, reason: 'The index only links to the historical 2025-26 location tryout pages.' },
        { url: TRYOUTS_URL, reason: 'The published 2025-26 tryouts occurred in November 2025 and are past.' },
        { url: TEAMS_URL, reason: 'The 2025-26 team schedules are historical and are not public registrations.' },
        { url: FACILITY_INFO_URL, reason: 'This is participant facility-policy information, not an Aspire facility rental offering.' },
        { url: TOURNAMENT_INFO_URL, reason: 'The index describes tournaments on Aspire team schedules, not public registrations owned by Aspire.' },
        { label: 'Club team tournament schedules', reason: 'Team schedule rows are not registrations owned by Aspire and should not be imported as Aspire events.' },
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
      notes: 'Verified Aspire NW VBC Vancouver current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Verified Aspire NW VBC Vancouver current-program mapping.',
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
  console.log(`Aspire NW VBC Vancouver source is ready with ${mapping.manualCandidates?.length ?? 0} candidates.`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`);
  } else {
    console.log('Re-run with --scrape to create or update the candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-aspire-nw-vancouver-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
