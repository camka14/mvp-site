/**
 * ALBION SC Portland current-program source setup.
 *
 * The homepage mixes news-card dates, past tryouts, current registration, and
 * undated tournament promotion. Only source-backed future programs are emitted.
 */
import dotenv from 'dotenv';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive && process.env.DATABASE_URL_LIVE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
}

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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_albion_sc_portland';
const SOURCE_ID = 'affiliate_source_albion_sc_portland_current_programs';
const SOURCE_KEY = 'albion-sc-portland-current-programs';
const MAPPING_ID = 'affiliate_mapping_albion_sc_portland_current_programs_v1';
const HOME_URL = 'https://www.albionscportland.org/';
const FALL_URL = 'https://www.albionscportland.org/juniors/juniors-program-overview';
const FALL_REGISTRATION_URL = 'https://albionscportland.byga.net/programs/gmztkwtv0j/signup';
const CAMPS_URL = 'https://www.albionscportland.org/juniors/juniors-camps/albion-portland-summer-camps';
const TRYOUTS_URL = 'https://www.albionscportland.org/tryouts/tryout-information';
const DEVELOPMENT_URL = 'https://www.albionscportland.org/programs/albion-development-academy-u9-u10';
const DEVELOPMENT_PATHWAY_URL = 'https://www.albionscportland.org/programs/development-advancement-placement';
const CUP_TEASER_URL = 'https://www.albionscportland.org/aug-16';
const TIGARD_HIGH_ADDRESS = '9000 SW Durham Rd, Tigard, OR 97224';

const ageDivision = (
  name: string,
  key: string,
  gender: 'M' | 'F' | 'C',
  divisionTypeId: string,
  priceCents: number,
  ageCutoffLabel: string,
  sourceUrl: string,
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  ageCutoffLabel,
  ageCutoffSource: sourceUrl,
});

const fallDivisions: ManualDivision[] = [
  ['Boys Kindergarten-2nd Grade', 'm_age_u8_k_2', 'M', 'u8', 12500, 'Kindergarten-2nd grade'],
  ['Girls Kindergarten-2nd Grade', 'f_age_u8_k_2', 'F', 'u8', 12500, 'Kindergarten-2nd grade'],
  ['Boys 3rd-4th Grade', 'm_age_u10_3_4', 'M', 'u10', 14500, '3rd-4th grade'],
  ['Girls 3rd-4th Grade', 'f_age_u10_3_4', 'F', 'u10', 14500, '3rd-4th grade'],
  ['Boys 5th-8th Grade', 'm_age_u14_5_8', 'M', 'u14', 16500, '5th-8th grade'],
  ['Girls 5th-8th Grade', 'f_age_u14_5_8', 'F', 'u14', 16500, '5th-8th grade'],
  ['High School Coed 9th-10th Grade', 'c_age_u16_9_10', 'C', 'u16', 16500, '9th-10th grade'],
  ['High School Coed 11th-12th Grade', 'c_age_u19_11_12', 'C', 'u19', 16500, '11th-12th grade'],
].map(([name, key, gender, divisionTypeId, priceCents, ageCutoffLabel]) => ageDivision(
  name as string,
  key as string,
  gender as 'M' | 'F' | 'C',
  divisionTypeId as string,
  priceCents as number,
  ageCutoffLabel as string,
  FALL_REGISTRATION_URL,
));

const campCandidate = (params: {
  title: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
}): ManualCandidate => ({
  listingKind: 'EVENT',
  title: params.title,
  officialActionUrl: CAMPS_URL,
  sourceUrl: CAMPS_URL,
  organizerName: 'ALBION SC Portland',
  sportName: 'Grass Soccer',
  formatLabel: 'Youth soccer camp',
  city: 'Tigard, OR',
  venueName: 'Tigard High School Swim Center Soccer Field',
  address: TIGARD_HIGH_ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `${params.dateDisplayText}, Tuesday-Thursday from 9:00 AM to noon.`,
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: params.dateDisplayText,
  ageGroup: 'Kindergarten-8th grade',
  divisionText: 'Coed kindergarten-8th grade',
  participantOptionsText: 'Individual camp registration',
  priceText: '$155',
  statusText: 'The source lists the current post-March 15 camp fee as $155.',
  description: 'ALBION SC Portland describes this three-morning recreational camp as foundation-focused soccer training for players in kindergarten through 8th grade. Sessions include skill building, touches on the ball, soccer games, and fundamentals. The current fee after March 15 is $155 per camp.',
  tags: ['Camp'],
  divisions: [ageDivision(
    'Kindergarten-8th Grade',
    'c_age_u14_k_8_camp',
    'C',
    'u14',
    15500,
    'Kindergarten-8th grade',
    CAMPS_URL,
  )],
  warnings: [
    'The camp page prints ZIP code 97062 for Tigard High School; the school district publishes the same 9000 SW Durham Rd address with ZIP code 97224, which is used for geocoding.',
  ],
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'ALBION SC Portland current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'ALBION Juniors Fall 2026 Recreational League',
      officialActionUrl: FALL_REGISTRATION_URL,
      sourceUrl: FALL_URL,
      organizerName: 'ALBION SC Portland',
      sportName: 'Grass Soccer',
      formatLabel: 'Fall recreational soccer league',
      city: 'Tigard, OR',
      venueName: 'Tigard-area fields',
      address: 'Tigard, OR',
      startsAt: '2026-08-10T00:00:00-07:00',
      endsAt: '2026-10-31T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Practices begin the week of August 10, games run Saturdays from September 12 through October 31, 2026, and team practice times are assigned after teams are formed.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 10-October 31, 2026',
      ageGroup: 'Kindergarten-12th grade',
      divisionText: 'Boys and girls kindergarten-8th grade; coed high school divisions',
      participantOptionsText: 'Individual player registration',
      priceText: '$125-$165',
      statusText: 'Registration is open through July 15, 2026.',
      registrationDeadlineText: 'July 15, 2026',
      description: 'ALBION Juniors offers a local Fall 2026 recreational league for kindergarten through high school players. Teams practice in the Tigard area and play Saturday games. Registration costs $125 for kindergarten-2nd grade, $145 for 3rd-4th grade, and $165 for 5th-12th grade. A reusable $75 uniform kit and any $35 late fee are described separately because they are not the base division price.',
      tags: ['League'],
      divisions: fallDivisions,
      warnings: [
        'The source gives a start week but no universal practice time or field; midnight stores the official date boundary without inventing a team schedule.',
      ],
    },
    campCandidate({
      title: 'ALBION Portland Summer Camp - July 14-16, 2026',
      startsAt: '2026-07-14T09:00:00-07:00',
      endsAt: '2026-07-16T12:00:00-07:00',
      dateDisplayText: 'July 14-16, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - July 27-29, 2026',
      startsAt: '2026-07-27T09:00:00-07:00',
      endsAt: '2026-07-29T12:00:00-07:00',
      dateDisplayText: 'July 27-29, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - August 11-13, 2026',
      startsAt: '2026-08-11T09:00:00-07:00',
      endsAt: '2026-08-13T12:00:00-07:00',
      dateDisplayText: 'August 11-13, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - August 18-20, 2026',
      startsAt: '2026-08-18T09:00:00-07:00',
      endsAt: '2026-08-20T12:00:00-07:00',
      dateDisplayText: 'August 18-20, 2026',
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
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { id: true, logoId: true },
  });
  if (!organization?.logoId) throw new Error('ALBION SC Portland must have an official logo before source setup.');
  const logo = await (prisma as any).file.findUnique({ where: { id: organization.logoId }, select: { id: true } });
  if (!logo) throw new Error(`ALBION SC Portland references missing logo ${organization.logoId}.`);

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      website: HOME_URL,
      location: 'Tigard, OR',
      address: 'Tigard, OR',
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
      'Training Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'ALBION SC Portland Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source-backed mapping for current ALBION Juniors registration and future Portland camps.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourcePages: [HOME_URL, FALL_URL, FALL_REGISTRATION_URL, CAMPS_URL, TRYOUTS_URL, DEVELOPMENT_URL, DEVELOPMENT_PATHWAY_URL, CUP_TEASER_URL],
      venueAddressSourceUrl: 'https://ths.ttsdschools.org/athletics/athletic-directory',
      skippedRows: [
        { url: HOME_URL, reason: 'Current Fall league and future camp rows are handled by this mapping.' },
        { url: FALL_URL, reason: 'The Fall 2026 recreational league is handled by this mapping.' },
        { url: CAMPS_URL, reason: 'All source-listed camps that start after July 9, 2026 are handled by this mapping.' },
        { url: TRYOUTS_URL, reason: 'The 2026-27 tryouts were May 4-14, 2026 and are past.' },
        { url: DEVELOPMENT_URL, reason: 'The published Spring 2026 Development Academy registration is closed and its season dates are past.' },
        { url: DEVELOPMENT_PATHWAY_URL, reason: 'The generic pathway page provides no additional future dated registration row.' },
        { url: CUP_TEASER_URL, reason: 'The Portland showcase teaser provides no event year, exact event date, fee, or registration action and cannot be published as a current tournament.' },
        { label: 'June 29-July 1 Summer Camp', reason: 'The camp dates are past.' },
        { label: 'July 7-9 Summer Camp', reason: 'The camp started before the July 9 review and cannot be added as a new future candidate.' },
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...sourcePayload },
    update: sourcePayload,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manually verified ALBION SC Portland current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified ALBION SC Portland current-program mapping.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const main = async () => {
  await loadAppModules();
  await prepareOrganization();
  await upsertSourceAndMapping();
  console.log(`ALBION SC Portland source is ready with ${mapping.manualCandidates?.length ?? 0} candidates.`);
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
    console.error('[setup-albion-sc-portland-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
