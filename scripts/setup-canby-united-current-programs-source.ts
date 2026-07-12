/** Current Canby United Soccer Association public registration source. */
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_canby_united_soccer_association';
const SOURCE_ID = 'affiliate_source_canby_united_current_programs';
const SOURCE_KEY = 'canby-united-current-programs';
const MAPPING_ID = 'affiliate_mapping_canby_united_current_programs_v1';
const HOME_URL = 'https://www.canbysoccer.org/';
const AVAILABLE_URL = 'https://www.canbysoccer.org/Default.aspx?tabid=445677';
const REGISTER_URL = 'https://www.canbysoccer.org/Default.aspx?tabid=445680';
const MICRO_URL = 'https://www.canbysoccer.org/Default.aspx?tabid=580284';
const REC_URL = 'https://www.canbysoccer.org/Default.aspx?tabid=580285';
const LOCATIONS_URL = 'https://www.canbysoccer.org/Default.aspx?tabid=445675';
const ADDRESS = '721 SW 4th Ave, Canby, OR 97013';

const division = (
  name: string,
  key: string,
  gender: 'M' | 'F' | 'C',
  divisionTypeId: string,
  priceCents: number,
  ageCutoffLabel: string,
  ageCutoffSource: string,
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  ageCutoffLabel,
  ageCutoffSource,
});

const divisions: ManualDivision[] = [
  division('U6 Pre-Micro Coed', 'c_age_u6_pre_micro', 'C', 'u6', 8500, 'Ages 4-5', MICRO_URL),
  division('U8 Micro Boys', 'm_age_u8_micro', 'M', 'u8', 8500, 'Ages 6-7', MICRO_URL),
  division('U8 Micro Girls', 'f_age_u8_micro', 'F', 'u8', 8500, 'Ages 6-7', MICRO_URL),
  division('Boys 3rd-8th Grade Recreational', 'm_age_u15_3rd_8th', 'M', 'u15', 14500, '3rd-8th grade; ages 8-14', REC_URL),
  division('Girls 3rd-8th Grade Recreational', 'f_age_u15_3rd_8th', 'F', 'u15', 14500, '3rd-8th grade; ages 8-14', REC_URL),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Canby United current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: REGISTER_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: [{
    listingKind: 'EVENT',
    title: 'Canby United Fall 2026 Recreational Soccer',
    officialActionUrl: REGISTER_URL,
    sourceUrl: HOME_URL,
    organizerName: 'Canby United Soccer Association',
    sportName: 'Grass Soccer',
    formatLabel: 'Fall recreational soccer league',
    city: 'Canby, OR',
    venueName: 'Canby High School Stadium Fields',
    address: ADDRESS,
    startsAt: '2026-08-31T00:00:00-07:00',
    endsAt: '2026-10-31T23:59:00-07:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'Recreational practices begin August 31 and games run Saturdays September 12-October 31, 2026. Micro practices begin September 7 and games run September 12-October 24. Team practice times are assigned after teams form.',
    dateDisplayMode: 'SCHEDULED',
    dateDisplayText: 'August 31-October 31, 2026',
    ageGroup: 'Ages 4-14; Pre-K through 8th grade',
    divisionText: 'U6 coed, U8 boys and girls, and boys/girls 3rd-8th grade',
    participantOptionsText: 'Individual player registration',
    priceText: '$85-$145',
    statusText: 'The homepage says Fall 2026 registration is open through August 2.',
    registrationDeadlineText: 'August 2, 2026',
    description: 'Canby United offers Fall 2026 recreational soccer for players ages 4-14. U6 Pre-Micro and U8 Micro cost $85 and include a game T-shirt. The 3rd-8th-grade recreational program costs $145. The separately purchased Nike uniform kit for 3rd-8th grade is not included in the division price. Games are played Saturdays, with practice schedules assigned after teams form.',
    tags: ['League'],
    divisions,
    warnings: [
      'The public Available Programs page currently renders no rows while the homepage explicitly says Fall 2026 registration is open through August 2; the official Register action is retained as the outbound link.',
      'The 3rd-8th-grade page says placement is generally grade-level and gender-specific but does not publish narrower division groupings, so no narrower U10/U12 breakdown is invented.',
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
  if (!organization?.logoId) throw new Error('Canby United must have an official logo before source setup.');
  if (!await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } })) {
    throw new Error(`Canby United references missing logo ${organization.logoId}.`);
  }
  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: { ownerId: owner.id, website: HOME_URL, location: 'Canby, OR', address: ADDRESS, updatedAt: new Date() },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({ where: { organizationId: ORG_ID }, select: { tagNameSnapshot: true } });
  await syncOrganizationTags(ORG_ID, Array.from(new Set([
    ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
    'Event Manager',
    'League Operator',
  ])), prisma);
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Canby United Current Programs', sourceKey: SOURCE_KEY, organizationId: ORG_ID,
    baseUrl: HOME_URL, listUrl: HOME_URL, targetKind: 'EVENT', status: 'ACTIVE', activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false, scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for the current Canby United recreational season.',
    metadata: {
      inspectedAt: '2026-07-09', robotsAllowed: true, strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, AVAILABLE_URL, REGISTER_URL, MICRO_URL, REC_URL, LOCATIONS_URL],
      skippedRows: [
        { url: HOME_URL, reason: 'The current Fall 2026 league is handled by this mapping.' },
        { url: AVAILABLE_URL, reason: 'The widget currently renders no program rows; the homepage is the source for the active Fall 2026 announcement.' },
        { url: REGISTER_URL, reason: 'This is the official registration action used by the mapped Fall 2026 candidate.' },
        { url: MICRO_URL, reason: 'The U6 and U8 Fall divisions are included in the mapped league.' },
        { url: REC_URL, reason: 'The 3rd-8th-grade divisions are included in the mapped league.' },
        { url: LOCATIONS_URL, reason: 'The field directory supplies the mapped CHS Stadium street address and does not advertise rentals.' },
        { label: 'Spring 2026 recreational season', reason: 'The spring season started April 5 and is past.' },
        { label: 'Oregon Trail Futbol Club', reason: 'Competitive soccer is owned by the separately linked OTFC organization, not Canby United.' },
      ],
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...sourcePayload }, update: sourcePayload });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping, createdByUserId: null, notes: 'Verified Canby United current-program mapping.', validatedAt: new Date() },
    update: { isActive: true, mapping, notes: 'Verified Canby United current-program mapping.', validatedAt: new Date() },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const main = async () => {
  await loadAppModules(); await prepareOrganization(); await upsertSourceAndMapping();
  console.log(`Canby United source is ready with ${mapping.manualCandidates?.length ?? 0} candidate(s).`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`);
  }
};

main().catch((error) => { console.error('[setup-canby-united-current-programs-source] failed', error); process.exitCode = 1; }).finally(async () => { if (prisma) await prisma.$disconnect(); });
