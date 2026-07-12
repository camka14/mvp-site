/** Current Central Valley FC public registration source. */
import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });
if (process.argv.includes('--live') && process.env.DATABASE_URL_LIVE) process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];
type ManualDivision = NonNullable<ManualCandidate['divisions']>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;
const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_central_valley_futbol_club';
const SOURCE_ID = 'affiliate_source_central_valley_fc_current_programs';
const SOURCE_KEY = 'central-valley-fc-current-programs';
const MAPPING_ID = 'affiliate_mapping_central_valley_fc_current_programs_v1';
const HOME_URL = 'https://www.centralvalleyfc.club/';
const REC_URL = 'https://www.centralvalleyfc.club/rec.html';
const REGISTER_INFO_URL = 'https://www.centralvalleyfc.club/rec-pre-sign-up.html';
const REGISTER_URL = 'https://login.stacksports.com/login?app_name=Central+Valley+FC&client_id=612b0399b1854a002e427f78&instancekey=leagues&portalid=82683&redirect_uri=https%3A%2F%2Fcore-api.bluesombrero.com%2Flogin%2Fredirect%2Fportal%2F82683';
const CALENDAR_URL = 'https://www.centralvalleyfc.club/calendar.html';
const COMPETITIVE_URL = 'https://www.centralvalleyfc.club/competitive.html';
const CAMP_URL = 'https://www.centralvalleyfc.club/2026-summer-camp.html';
const CRATER_CAMP_URL = 'https://www.centralvalleyfc.club/crater-camp-info.html';
const FIELD_URL = 'https://www.centralvalleyfc.club/field-info.html';
const ADDRESS = '555 Twin Creeks Crossing Loop, Central Point, OR 97502';

const division = (
  name: string, key: string, gender: 'M' | 'F' | 'C', divisionTypeId: string,
  priceCents: number, ageCutoffLabel: string,
): ManualDivision => ({
  name, key, gender, ratingType: 'AGE', divisionTypeId, priceCents,
  ageCutoffLabel, ageCutoffSource: REC_URL,
});

const divisions: ManualDivision[] = [
  division('Kinder Coed', 'c_age_u7_kinder', 'C', 'u7', 3500, 'Birth years 2020-2021'),
  division('U8 Boys', 'm_age_u8', 'M', 'u8', 6000, 'Birth years 2018-2019'),
  division('U8 Girls', 'f_age_u8', 'F', 'u8', 6000, 'Birth years 2018-2019'),
  division('U10 Boys', 'm_age_u10', 'M', 'u10', 6000, 'Birth years 2016-2017'),
  division('U10 Girls', 'f_age_u10', 'F', 'u10', 6000, 'Birth years 2016-2017'),
  division('U12 Boys', 'm_age_u12', 'M', 'u12', 6000, 'Birth years 2014-2015'),
  division('U12 Girls', 'f_age_u12', 'F', 'u12', 6000, 'Birth years 2014-2015'),
  division('U14 Boys', 'm_age_u14', 'M', 'u14', 6000, 'Birth years 2012-2013; 2011 if in 8th grade'),
  division('U14 Girls', 'f_age_u14', 'F', 'u14', 6000, 'Birth years 2012-2013; 2011 if in 8th grade'),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT', listUrl: REC_URL, itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Central Valley FC current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: REGISTER_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: [{
    listingKind: 'EVENT',
    title: 'Central Valley FC Fall 2026 Recreational Soccer',
    officialActionUrl: REGISTER_URL,
    sourceUrl: REC_URL,
    organizerName: 'Central Valley Futbol Club',
    sportName: 'Grass Soccer',
    formatLabel: 'Fall recreational soccer league',
    city: 'Central Point, OR',
    venueName: 'Twin Creeks Soccer Fields',
    address: ADDRESS,
    startsAt: '2026-08-24T00:00:00-07:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'Practices begin August 24 and games begin September 5, 2026. The program page describes the Fall season as late August through mid-October; team practice schedules are assigned separately.',
    dateDisplayMode: 'SCHEDULED',
    dateDisplayText: 'Late August to mid-October 2026',
    ageGroup: 'Kindergarten-U14',
    divisionText: 'Coed Kinder; boys and girls U8, U10, U12, and U14',
    participantOptionsText: 'Individual player registration',
    priceText: '$35-$60',
    statusText: 'Fall registration is open through July 26, 2026.',
    registrationDeadlineText: 'July 26, 2026',
    description: 'Central Valley FC offers Fall 2026 recreational soccer with no tryouts or cuts. Kinder is coed and costs $35. Boys and girls U8, U10, U12, and U14 divisions cost $60. The fee does not include the separately purchased game jersey. Most practices are at Twin Creeks in Central Point, with games in Central Point and nearby Southern Oregon communities.',
    tags: ['League'],
    divisions,
    warnings: [
      'The program page gives only a mid-October season end, so no exact endsAt value is invented.',
      'The calendar says Fall registration closes July 19 while the dedicated Rec page says July 26; the later dedicated-program deadline is used and the discrepancy remains documented.',
    ],
  }],
};

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({ url, finalUrl: url, statusCode: 200, body: '<html><body></body></html>', fetchedAt: new Date().toISOString() }),
};

const prepareOrganization = async () => {
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  const organization = await (prisma as any).organizations.findUnique({ where: { id: ORG_ID }, select: { logoId: true } });
  if (!organization?.logoId) throw new Error('Central Valley FC must have an official logo before source setup.');
  if (!await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } })) throw new Error(`Central Valley FC references missing logo ${organization.logoId}.`);
  await (prisma as any).organizations.update({ where: { id: ORG_ID }, data: { ownerId: owner.id, website: HOME_URL, location: 'Central Point, OR', address: ADDRESS, updatedAt: new Date() } });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({ where: { organizationId: ORG_ID }, select: { tagNameSnapshot: true } });
  await syncOrganizationTags(ORG_ID, Array.from(new Set([
    ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
    'Event Manager', 'League Operator',
  ])), prisma);
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Central Valley FC Current Programs', sourceKey: SOURCE_KEY, organizationId: ORG_ID,
    baseUrl: HOME_URL, listUrl: REC_URL, targetKind: 'EVENT', status: 'ACTIVE', activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false, scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for the current Central Valley FC recreational season.',
    metadata: {
      inspectedAt: '2026-07-09', robotsAllowed: true, strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, REC_URL, REGISTER_INFO_URL, REGISTER_URL, CALENDAR_URL, COMPETITIVE_URL, CAMP_URL, CRATER_CAMP_URL, FIELD_URL],
      venueAddressSourceUrl: 'https://www.centralpointoregon.gov/500/Athletic-Field-Use',
      skippedRows: [
        { url: HOME_URL, reason: 'The current Fall recreational program is handled by this mapping.' },
        { url: REC_URL, reason: 'The Fall 2026 Kinder-U14 league divisions are handled by this mapping.' },
        { url: REGISTER_INFO_URL, reason: 'This warning page links to the official registration action used by the mapped candidate.' },
        { url: CALENDAR_URL, reason: 'The calendar supplies the mapped practice and game start dates; its earlier July 19 deadline conflicts with the dedicated Rec page.' },
        { url: COMPETITIVE_URL, reason: 'The 2026-27 competitive tryouts occurred in May 2026 and are past.' },
        { url: CAMP_URL, reason: 'The June 8-11, 2026 youth soccer camp is past.' },
        { url: CRATER_CAMP_URL, reason: 'The June 2026 Crater camp is past.' },
        { url: FIELD_URL, reason: 'The field page identifies Twin Creeks but does not advertise public facility rentals.' },
        { label: 'Spring 2026 recreational and high-school leagues', reason: 'Those seasons ended in May 2026 and are past.' },
      ],
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...sourcePayload }, update: sourcePayload });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping, createdByUserId: null, notes: 'Verified Central Valley FC current-program mapping.', validatedAt: new Date() },
    update: { isActive: true, mapping, notes: 'Verified Central Valley FC current-program mapping.', validatedAt: new Date() },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const main = async () => {
  await loadAppModules(); await prepareOrganization(); await upsertSourceAndMapping();
  console.log(`Central Valley FC source is ready with ${mapping.manualCandidates?.length ?? 0} candidate(s).`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`);
  }
};

main().catch((error) => { console.error('[setup-central-valley-fc-current-programs-source] failed', error); process.exitCode = 1; }).finally(async () => { if (prisma) await prisma.$disconnect(); });
