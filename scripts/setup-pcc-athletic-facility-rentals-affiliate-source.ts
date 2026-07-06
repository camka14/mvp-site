import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_portland_community_college';
const LOGO_FILE_ID = 'affiliate_file_portland_community_college_logo';
const SOURCE_ID = 'affiliate_source_pcc_athletic_facility_rentals';
const SOURCE_KEY = 'pcc-athletic-facility-rentals';
const MAPPING_ID = 'affiliate_source_pcc_athletic_facility_rentals_mapping_v1';
const HOME_URL = 'https://www.pcc.edu/';
const LIST_URL = 'https://www.pcc.edu/facility-rental/athletic/';
const INQUIRY_FORM_URL = 'https://www.pcc.edu/facility-rental/inquiry-form/';
const FEE_SCHEDULE_URL = 'https://www.pcc.edu/facility-rental/wp-content/uploads/sites/58/2023/02/PricingListALL.pdf';
const LOGO_SOURCE_URL = 'https://www.pcc.edu/wp-content/themes/pcc/_source/images/logo.svg';

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Community College Athletic Facility Rentals',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: INQUIRY_FORM_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'Portland Community College Athletic Facility Rentals',
      officialActionUrl: INQUIRY_FORM_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Community College',
      sportName: 'Basketball',
      formatLabel: 'Athletic facility rental',
      city: 'Portland, OR',
      venueName: 'Portland Community College athletic facilities',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Facility requests are submitted through the official PCC inquiry form after reviewing rental rules and procedures.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Rental requests by PCC approval and availability',
      participantOptionsText: 'Gymnasiums, multi-use athletic studios, natural grass soccer field, and 8-lane track availability across PCC campuses.',
      statusText: 'Pricing is handled through the official fee schedule and rental inquiry process.',
      description: 'Portland Community College lists athletic facilities available for rent across several campuses. Gymnasiums for basketball, volleyball, and other activities are available at Cascade, Rock Creek, and Sylvania. Multi-use athletic studios are available at Cascade, Rock Creek, Southeast, and Sylvania. Sylvania also lists a natural grass soccer field and an 8-lane wide track. The official get-started flow asks renters to review the facility rental rules and procedures, then submit the PCC facility inquiry form. The source links a facility use fee schedule PDF, but exact rental pricing depends on facility, use type, staffing, and PCC approval.',
      warnings: [
        'Stored as one districtwide rental/facility source because PCC does not expose live athletic-space availability on the public page.',
        `Official fee schedule: ${FEE_SCHEDULE_URL}`,
      ],
    },
  ],
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

const downloadLogo = async () => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/svg+xml';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-community-college-logo.svg',
    contentType,
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'portland-community-college-logo.svg',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'portland-community-college-logo.svg',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { sports: true },
  });
  const sports = Array.from(new Set([
    ...(existing?.sports ?? []),
    'Basketball',
    'Volleyball',
    'Grass Soccer',
    'Other',
  ]));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Community College',
      location: 'Portland, OR',
      address: null,
      description: 'Portland Community College offers event and athletic facility rentals across its Portland-area campuses, including gyms, studios, a natural grass soccer field, and track access by request.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: null,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Community College',
      location: 'Portland, OR',
      address: null,
      description: 'Portland Community College offers event and athletic facility rentals across its Portland-area campuses, including gyms, studios, a natural grass soccer field, and track access by request.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'PCC Athletic Facility Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual rental source for PCC athletic facilities. PCC exposes facility categories and inquiry/fee links, not live availability.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'pcc.edu robots.txt allows /facility-rental/athletic/, /facility-rental/inquiry-form/, /facility-rental/procedures/, and the public fee PDF; disallowed schedule query paths are unrelated and not used.',
      logoSourceUrl: LOGO_SOURCE_URL,
      feeScheduleUrl: FEE_SCHEDULE_URL,
      officialActionUrl: INQUIRY_FORM_URL,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      ...sourcePayload,
    },
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
        version: 1,
      },
    },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manual PCC athletic facility rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual PCC athletic facility rental mapping.',
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
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`PCC athletic facility rental affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-pcc-athletic-facility-rentals-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
