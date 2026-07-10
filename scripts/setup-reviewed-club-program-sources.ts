/**
 * Records source-backed club reviews that intentionally produced no current
 * event or rental candidates. Add only pages that were manually inspected.
 */
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

type ReviewConfig = {
  key: string;
  organizationId: string;
  organizationName: string;
  website: string;
  location: string;
  sourcePages: string[];
  skippedRows: Array<{ url?: string; label?: string; reason: string }>;
  organizationTags: string[];
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

const reviews: ReviewConfig[] = [
  {
    key: 'eastern-oregon-vbc',
    organizationId: 'affiliate_org_ceva_club_directory_eastern_oregon_vbc',
    organizationName: 'Eastern Oregon VBC',
    website: 'https://easternoregonvbc.com/',
    location: 'Eastern Oregon',
    sourcePages: [
      'https://easternoregonvbc.com/',
      'https://easternoregonvbc.com/e',
      'https://easternoregonvbc.com/e/2025-2026-tryouts',
      'https://easternoregonvbc.com/club-tryout-information',
      'https://easternoregonvbc.com/postsupdates',
    ],
    skippedRows: [
      { url: 'https://easternoregonvbc.com/', reason: 'The homepage links only to the historical 2025-26 tryout registration and team-season information.' },
      { url: 'https://easternoregonvbc.com/e', reason: 'The public event index contains only the historical 2025-26 tryout row.' },
      { url: 'https://easternoregonvbc.com/e/2025-2026-tryouts', reason: 'The published tryouts occurred November 9-16, 2025 and are past.' },
      { url: 'https://easternoregonvbc.com/club-tryout-information', reason: 'The information page supports the historical 2025-26 tryout row and publishes no future dates.' },
      { url: 'https://easternoregonvbc.com/postsupdates', reason: 'The update feed contains team-season notices, not current public registrations.' },
    ],
    organizationTags: ['Club'],
  },
  {
    key: 'gorge-juniors-vbc',
    organizationId: 'affiliate_org_ceva_club_directory_gorge_juniors_vbc',
    organizationName: 'Gorge Juniors VBC',
    website: 'https://gorgejuniorsvolleyball.com/',
    location: 'Columbia River Gorge',
    sourcePages: [
      'https://gorgejuniorsvolleyball.com/',
      'https://gorgejuniorsvolleyball.com/e',
      'https://gorgejuniorsvolleyball.com/e/2025-2026-season-registration',
    ],
    skippedRows: [
      { url: 'https://gorgejuniorsvolleyball.com/', reason: 'The homepage links only to the historical 2025-26 season registration.' },
      { url: 'https://gorgejuniorsvolleyball.com/e', reason: 'The public event index contains only the historical 2025-26 season row.' },
      { url: 'https://gorgejuniorsvolleyball.com/e/2025-2026-season-registration', reason: 'The published season ran November 16, 2025-April 18, 2026 and is past.' },
    ],
    organizationTags: ['Club'],
  },
  {
    key: 'axiom-vbc',
    organizationId: 'affiliate_org_ceva_club_directory_axiom_vbc',
    organizationName: 'Axiom VBC',
    website: 'https://axiomvolleyballclub.com/',
    location: 'Battle Ground, WA',
    sourcePages: [
      'https://axiomvolleyballclub.com/',
      'https://axiomvolleyballclub.com/academyteams',
      'https://axiomvolleyballclub.com/pricing',
      'https://axiomvolleyballclub.com/about-us',
      'https://axiomvolleyballclub.com/coaches-and-staff',
    ],
    skippedRows: [
      { url: 'https://axiomvolleyballclub.com/', reason: 'The homepage contains general club information and no current future-dated registration.' },
      { url: 'https://axiomvolleyballclub.com/academyteams', reason: 'The published Winter and Spring academy sessions ended April 15, 2026.' },
      { url: 'https://axiomvolleyballclub.com/pricing', reason: 'The page lists 2025-26 academy pricing but no future session dates or current registration action.' },
      { url: 'https://axiomvolleyballclub.com/about-us', reason: 'The page generally mentions workouts, clinics, and private lessons but provides no current dates, price, schedule, or booking action.' },
      { url: 'https://axiomvolleyballclub.com/coaches-and-staff', reason: 'Coach biographies mention historical clinics and open gyms but do not publish current registration rows.' },
    ],
    organizationTags: ['Club', 'Training Provider'],
  },
  {
    key: 'aspire-nw-vbc-beaverton',
    organizationId: 'affiliate_org_ceva_club_directory_aspire_nw_vbc_beaverton',
    organizationName: 'Aspire NW VBC Beaverton',
    website: 'https://aspirenwvolleyball.com/',
    location: 'Beaverton, OR',
    sourcePages: [
      'https://aspirenwvolleyball.com/',
      'https://aspirenwvolleyball.com/clinics/',
      'https://aspirenwvolleyball.com/clinics/beaverton-ymca/',
      'https://aspirenwvolleyball.com/tryouts/',
      'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-facility-info/',
      'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-info/',
    ],
    skippedRows: [
      { url: 'https://aspirenwvolleyball.com/', reason: 'No additional future Beaverton registration row is published on the homepage.' },
      { url: 'https://aspirenwvolleyball.com/clinics/', reason: 'The Beaverton clinic section links to the reviewed summer camp page.' },
      { url: 'https://aspirenwvolleyball.com/clinics/beaverton-ymca/', reason: 'The four Beaverton Summer Camp sessions occurred July 6-9, 2026 and are not eligible future candidates as of the July 9 review.' },
      { url: 'https://aspirenwvolleyball.com/tryouts/', reason: 'The published 2025-26 tryout information is historical and has no future 2026-27 Beaverton dates.' },
      { url: 'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-facility-info/', reason: 'This is participant facility-policy information, not an Aspire facility rental offering.' },
      { url: 'https://aspirenwvolleyball.com/tournaments-and-travel/tournament-info/', reason: 'The index describes tournaments on Aspire team schedules, not public registrations owned by Aspire.' },
      { label: 'Aspire team tournament schedules', reason: 'Club team schedule rows are not registrations owned by Aspire and are not imported as Aspire events.' },
    ],
    organizationTags: ['Club', 'Training Provider'],
  },
];

const selectedReview = (() => {
  const flag = process.argv.find((argument) => argument.startsWith('--club='));
  if (!flag) return reviews;
  const value = flag.slice('--club='.length).trim().toLowerCase();
  return reviews.filter((review) => (
    review.key.toLowerCase() === value
    || review.organizationName.toLowerCase().includes(value)
  ));
})();

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: '<html><body><main>No current source-backed listings.</main></body></html>',
    fetchedAt: new Date().toISOString(),
  }),
};

const sourceId = (review: ReviewConfig) => `affiliate_source_${review.key.replace(/-/g, '_')}_reviewed_programs`;
const sourceKey = (review: ReviewConfig) => `${review.key}-reviewed-programs`;
const mappingId = (review: ReviewConfig) => `affiliate_mapping_${review.key.replace(/-/g, '_')}_reviewed_programs_v1`;

const mappingFor = (review: ReviewConfig): AffiliateScrapeMapping => ({
  kind: 'EVENT',
  listUrl: review.sourcePages[0] ?? review.website,
  itemSelector: '[data-no-current-listings]',
  fields: {
    title: { selector: '[data-no-current-listings]', mode: 'text' },
    officialActionUrl: { selector: '[data-no-current-listings]', mode: 'literal', value: review.website },
  },
  dedupe: { fields: ['officialActionUrl', 'title'] },
  manualCandidates: [],
});

const setupReview = async (review: ReviewConfig, ownerId: string) => {
  const organization = await (prisma as any).organizations.findUnique({
    where: { id: review.organizationId },
    select: { logoId: true },
  });
  if (!organization?.logoId) throw new Error(`${review.organizationName} must have an official logo before source setup.`);
  const logo = await (prisma as any).file.findUnique({
    where: { id: organization.logoId },
    select: { id: true },
  });
  if (!logo) throw new Error(`${review.organizationName} references missing logo ${organization.logoId}.`);

  await (prisma as any).organizations.update({
    where: { id: review.organizationId },
    data: {
      ownerId,
      website: review.website,
      location: review.location,
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: review.organizationId },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    review.organizationId,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      ...review.organizationTags,
    ])),
    prisma,
  );

  const id = sourceId(review);
  const activeMappingId = mappingId(review);
  const mapping = mappingFor(review);
  const sourcePayload = {
    name: `${review.organizationName} Reviewed Current Programs`,
    sourceKey: sourceKey(review),
    organizationId: review.organizationId,
    baseUrl: review.website,
    listUrl: review.sourcePages[0] ?? review.website,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual source review with no eligible current event or rental candidates.',
    metadata: {
      inspectedAt: '2026-07-09',
      robotsAllowed: true,
      strategy: 'manual-reviewed-no-current-listings',
      sourcePages: review.sourcePages,
      skippedRows: review.skippedRows,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id },
    create: { id, ...sourcePayload },
    update: sourcePayload,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: id },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: id, version: 1 } },
    create: {
      id: activeMappingId,
      sourceId: id,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: `Verified no-current-listings review for ${review.organizationName}.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: `Verified no-current-listings review for ${review.organizationName}.`,
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({
    where: { id },
    data: { activeMappingId },
  });

  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(id, { client: staticPageClient });
    console.log(`${review.organizationName}: scrape run ${result.run.id} saved ${result.candidates.length} candidate(s).`);
  } else {
    console.log(`${review.organizationName}: reviewed source is ready; re-run with --scrape to record the successful zero-row scrape.`);
  }
};

const main = async () => {
  await loadAppModules();
  if (selectedReview.length === 0) throw new Error('No reviewed club matched --club.');
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  for (const review of selectedReview) await setupReview(review, owner.id);
};

main()
  .catch((error) => {
    console.error('[setup-reviewed-club-program-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
