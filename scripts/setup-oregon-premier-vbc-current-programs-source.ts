/** Current Oregon Premier VBC public camp source. */
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
type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_ceva_club_directory_adidas_oregon_premier_vbc';
const SOURCE_ID = 'affiliate_source_oregon_premier_vbc_current_programs';
const SOURCE_KEY = 'oregon-premier-vbc-current-programs';
const MAPPING_ID = 'affiliate_mapping_oregon_premier_vbc_current_programs_v1';
const HOME_URL = 'https://www.oregonpremiervbc.com/';
const LIST_URL = 'https://www.oregonpremiervbc.com/upcoming-events';
const CAMPS_URL = 'https://www.oregonpremiervbc.com/summer-camps-2026';
const VENUE = 'Oregon Premier Futsal';
const ADDRESS = '12402 SE Jennifer St #190, Clackamas, OR 97015';

const campCandidate = (params: {
  title: string;
  actionUrl: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  scheduleText: string;
  ageGroup: string;
  divisionKey: string;
  divisionTypeId: string;
}): ManualCandidate => ({
  listingKind: 'EVENT',
  title: params.title,
  officialActionUrl: params.actionUrl,
  sourceUrl: LIST_URL,
  organizerName: 'Adidas Oregon Premier VBC',
  sportName: 'Indoor Volleyball',
  formatLabel: 'Summer volleyball camp',
  city: 'Clackamas, OR',
  venueName: VENUE,
  address: ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: params.scheduleText,
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: params.dateDisplayText,
  ageGroup: params.ageGroup,
  divisionText: params.ageGroup,
  participantOptionsText: 'Individual camper ticket',
  priceText: '$225',
  statusText: 'Tickets are available on the official event page.',
  description: `Oregon Premier VBC lists this four-day indoor volleyball camp for ${params.ageGroup.toLowerCase()}. The official ticket price is $225, with a separate $5.63 ticket service fee shown during checkout.`,
  tags: ['Camp'],
  divisions: [{
    name: params.ageGroup,
    key: params.divisionKey,
    gender: 'C',
    ratingType: 'AGE',
    divisionTypeId: params.divisionTypeId,
    priceCents: 22500,
    ageCutoffLabel: params.ageGroup,
    ageCutoffSource: params.actionUrl,
  }],
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Oregon Premier VBC current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: LIST_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: [
    campCandidate({
      title: 'OPV Middle School Summer Camp 2026',
      actionUrl: 'https://www.oregonpremiervbc.com/event-details/opv-middle-school-summer-camp-6th-8th-graders',
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-23T12:00:00-07:00',
      dateDisplayText: 'July 20-23, 2026',
      scheduleText: 'July 20-23, 2026, each day from 9:00 AM to noon.',
      ageGroup: '6th-8th Grade',
      divisionKey: 'c_age_u14_6th_8th_grade',
      divisionTypeId: 'u14',
    }),
    campCandidate({
      title: 'OPV High School Summer Camp 2026',
      actionUrl: 'https://www.oregonpremiervbc.com/event-details/opv-high-school-summer-camp-incoming-9th-12th-graders',
      startsAt: '2026-07-20T13:00:00-07:00',
      endsAt: '2026-07-23T16:00:00-07:00',
      dateDisplayText: 'July 20-23, 2026',
      scheduleText: 'July 20-23, 2026, each day from 1:00 PM to 4:00 PM.',
      ageGroup: 'Incoming 9th-12th Grade',
      divisionKey: 'c_age_u19_9th_12th_grade',
      divisionTypeId: 'u19',
    }),
    campCandidate({
      title: 'OPV Elementary School Summer Camp 2026',
      actionUrl: 'https://www.oregonpremiervbc.com/event-details/opv-summer-camp-elementary-school',
      startsAt: '2026-08-03T09:00:00-07:00',
      endsAt: '2026-08-06T12:00:00-07:00',
      dateDisplayText: 'August 3-6, 2026',
      scheduleText: 'August 3-6, 2026, each day from 9:00 AM to noon.',
      ageGroup: 'Elementary School',
      divisionKey: 'c_age_elementary_school',
      divisionTypeId: 'elementary',
    }),
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
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  const organization = await (prisma as any).organizations.findUnique({ where: { id: ORG_ID }, select: { logoId: true } });
  if (!organization?.logoId) throw new Error('Oregon Premier VBC must have an official logo before source setup.');
  const logo = await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } });
  if (!logo) throw new Error(`Oregon Premier VBC references missing logo ${organization.logoId}.`);
  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: { ownerId: owner.id, website: HOME_URL, location: 'Clackamas, OR', address: ADDRESS, updatedAt: new Date() },
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
    name: 'Oregon Premier VBC Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for current Oregon Premier VBC camp tickets.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, LIST_URL, CAMPS_URL, 'https://www.oregonpremiervbc.com/clinics', 'https://www.oregonpremiervbc.com/academy'],
      skippedRows: [
        { url: HOME_URL, reason: 'The current summer camp registration rows are handled by this mapping.' },
        { url: LIST_URL, reason: 'All three source-listed future events are handled by this mapping.' },
        { url: CAMPS_URL, reason: 'The camp overview links to the event rows handled by this mapping.' },
        { url: 'https://www.oregonpremiervbc.com/clinics', reason: 'No additional future dated clinic registration is published.' },
        { url: 'https://www.oregonpremiervbc.com/academy', reason: 'No additional future dated academy registration is published.' },
        { label: '2025-26 teams and tournament schedules', reason: 'Those club-season schedules ended by May 2026 and are historical.' },
      ],
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...sourcePayload }, update: sourcePayload });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping, createdByUserId: null, notes: 'Verified Oregon Premier VBC current camp mapping.', validatedAt: new Date() },
    update: { isActive: true, mapping, notes: 'Verified Oregon Premier VBC current camp mapping.', validatedAt: new Date() },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const main = async () => {
  await loadAppModules();
  await prepareOrganization();
  await upsertSourceAndMapping();
  console.log(`Oregon Premier VBC source is ready with ${mapping.manualCandidates?.length ?? 0} candidates.`);
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
    console.error('[setup-oregon-premier-vbc-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
