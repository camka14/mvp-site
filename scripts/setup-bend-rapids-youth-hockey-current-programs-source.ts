/**
 * Bend Rapids Youth Hockey current program source setup.
 *
 * The club's Crossbar pages mix expired tryouts with current season and
 * tournament registrations. This mapping records only source-backed current
 * listings and keeps the expired tryout dates as reviewed exclusions.
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
const ORG_ID = 'affiliate_org_oregon_state_hockey_youth_directory_bend_rapids_youth_hockey';
const SOURCE_ID = 'affiliate_source_bend_rapids_current_programs';
const SOURCE_KEY = 'bend-rapids-current-programs';
const MAPPING_ID = 'affiliate_mapping_bend_rapids_current_programs_v1';
const HOME_URL = 'https://www.bendrapidsyouthhockey.org/';
const SEASON_URL = 'https://www.bendrapidsyouthhockey.org/program/season-registration/21556';
const SEASON_UPDATES_URL = 'https://www.bendrapidsyouthhockey.org/about/season-updates/105082';
const TRYOUT_URL = 'https://www.bendrapidsyouthhockey.org/program/evals-tryouts-pre-season-ice/21525';
const WINTER_CLASSIC_URL = 'https://www.bendrapidsyouthhockey.org/program/bend-winter-classic/24268';
const WINTER_CLASSIC_REGISTRATION_URL = 'https://www.bendrapidsyouthhockey.org/registration/71517';
const CASCADE_INVITATIONAL_URL = 'https://www.bendrapidsyouthhockey.org/program/cascade-invitational/24410';
const CASCADE_INVITATIONAL_REGISTRATION_URL = 'https://www.bendrapidsyouthhockey.org/registration/71518';
const VENUE = 'The Pavilion';
const ADDRESS = '1001 SW Bradbury Way, Bend, OR 97702';

const ageDivision = (
  name: string,
  divisionTypeId: string,
  sourceUrl: string,
  maxParticipants: number | null = null,
): ManualDivision => ({
  name,
  key: `c_age_${divisionTypeId}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
  gender: 'C',
  ratingType: 'AGE',
  divisionTypeId,
  priceCents: null,
  maxParticipants,
  ageCutoffLabel: name,
  ageCutoffSource: sourceUrl,
});

const seasonDivisions: ManualDivision[] = [8, 10, 12, 14, 16, 18].map((age) => (
  ageDivision(`${age}U`, `u${age}`, SEASON_URL)
));

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: SEASON_UPDATES_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Bend Rapids Current Programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Bend Rapids Youth Hockey 2026-27 Season Registration',
      officialActionUrl: SEASON_URL,
      sourceUrl: SEASON_UPDATES_URL,
      organizerName: 'Bend Rapids Youth Hockey',
      sportName: 'Hockey',
      formatLabel: 'Youth hockey season registration',
      city: 'Bend, OR',
      venueName: VENUE,
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Registration opens July 11 and closes July 31, 2026 for 10U-18U. The club estimates that practices will begin in late October; 8U registration remains open after July 31.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Registration July 11-31, 2026',
      ageGroup: '8U-18U',
      divisionText: '8U; 10U; 12U; 14U; 16U; 18U',
      participantOptionsText: 'Individual athlete season registration',
      priceText: null,
      statusText: 'Registration opens July 11, 2026. The total team fee is assigned after rostering.',
      registrationDeadlineText: 'July 31, 2026 for 10U-18U; 8U remains open',
      description: 'Bend Rapids lists 2026-27 season registration for 8U through 18U athletes. Registration opens July 11 and closes July 31 for all divisions except 8U. The club requires a $400 deposit during registration, then invoices the remaining team fee after the athlete is rostered; because the source does not publish the current total team fees, no event price is displayed. Practices are estimated to begin in late October at The Pavilion.',
      tags: ['League'],
      divisions: seasonDivisions,
      warnings: [
        'The $400 source amount is a deposit deducted from a later team fee, so it is kept in the description rather than stored as the event price.',
        'The source gives only an estimated late-October practice start, so this registration uses no fixed start date.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Bend Winter Classic 2027',
      officialActionUrl: WINTER_CLASSIC_REGISTRATION_URL,
      sourceUrl: WINTER_CLASSIC_URL,
      organizerName: 'Bend Rapids Youth Hockey',
      sportName: 'Hockey',
      formatLabel: 'Youth hockey tournament',
      city: 'Bend, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2027-01-22T00:00:00-08:00',
      endsAt: '2027-01-24T23:59:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'January 22-24, 2027. Games begin Friday morning and conclude around midday Sunday; exact game times are assigned by the tournament.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'January 22-24, 2027',
      ageGroup: '12U and 14U',
      divisionText: '12U Rep B; 14U Rep B Checking',
      maxParticipantsText: '6 teams per division',
      participantOptionsText: 'Team registration through Crossbar',
      priceText: null,
      statusText: 'Registration opened July 6, 2026.',
      description: 'Bend Rapids lists the 2027 Bend Winter Classic as a USA Hockey sanctioned tournament at The Pavilion. The source lists 12U Rep B and 14U Rep B Checking divisions, six teams per division, a four-game guarantee, and a registration gift for every player. Registration and payment are handled through Crossbar; the public page does not expose a price.',
      tags: ['Tournament'],
      divisions: [
        ageDivision('12U Rep B', 'u12', WINTER_CLASSIC_URL, 6),
        ageDivision('14U Rep B Checking', 'u14', WINTER_CLASSIC_URL, 6),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Cascade Invitational 2027',
      officialActionUrl: CASCADE_INVITATIONAL_REGISTRATION_URL,
      sourceUrl: CASCADE_INVITATIONAL_URL,
      organizerName: 'Bend Rapids Youth Hockey',
      sportName: 'Hockey',
      formatLabel: 'Youth hockey tournament',
      city: 'Bend, OR',
      venueName: VENUE,
      address: ADDRESS,
      startsAt: '2027-02-12T00:00:00-08:00',
      endsAt: '2027-02-14T23:59:00-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'February 12-14, 2027. Games begin Friday evening and conclude around midday Sunday; exact game times are assigned by the tournament.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'February 12-14, 2027',
      ageGroup: '10U',
      divisionText: '10U Rep B',
      maxParticipantsText: '6 teams',
      participantOptionsText: 'Team registration through Crossbar',
      priceText: null,
      statusText: 'Registration opened July 6, 2026.',
      description: 'Bend Rapids lists the 2027 Cascade Invitational as a USA Hockey sanctioned 10U Rep B tournament at The Pavilion. The source lists six teams, a registration gift for every player, and games running from Friday evening through midday Sunday. Registration and payment are handled through Crossbar; the public page does not expose a price.',
      tags: ['Tournament'],
      divisions: [
        ageDivision('10U Rep B', 'u10', CASCADE_INVITATIONAL_URL, 6),
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
    throw new Error('Bend Rapids must exist with an official logo before source setup.');
  }
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) {
    throw new Error(`Bend Rapids references missing logo ${organization.logoId}.`);
  }

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      website: HOME_URL,
      address: ADDRESS,
      location: 'Bend, OR',
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
      'Tournament Host',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Bend Rapids Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: SEASON_UPDATES_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual mapping for current Bend Rapids season and tournament registrations on mixed current/expired Crossbar pages.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, SEASON_URL, SEASON_UPDATES_URL, WINTER_CLASSIC_URL, CASCADE_INVITATIONAL_URL],
      venueAddressSource: 'https://www.bendparksandrec.org/facility/the-pavilion/',
      skippedRows: [
        { url: HOME_URL, reason: 'Current season and tournament rows are handled by this validated manual mapping.' },
        { url: SEASON_URL, reason: 'Current season registration is handled by this validated manual mapping.' },
        { url: SEASON_UPDATES_URL, reason: 'Current season dates are handled by this validated manual mapping.' },
        { url: WINTER_CLASSIC_URL, reason: 'The 2027 tournament is handled by this validated manual mapping.' },
        { url: CASCADE_INVITATIONAL_URL, reason: 'The 2027 tournament is handled by this validated manual mapping.' },
        { url: TRYOUT_URL, reason: 'Published April 18-19, 2026 tryout dates are past and are not imported as evergreen content.' },
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
      notes: 'Manually verified Bend Rapids current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified Bend Rapids current-program mapping.',
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
  console.log('Bend Rapids current-program source is ready with three candidates.');

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
    console.error('[setup-bend-rapids-youth-hockey-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
