import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_portland_parks_recreation';
const LOGO_FILE_ID = 'affiliate_file_portland_parks_recreation_logo';
const SOURCE_ID = 'affiliate_source_portland_parks_athletic_field_rentals';
const SOURCE_KEY = 'portland-parks-athletic-field-rentals';
const MAPPING_ID = 'affiliate_mapping_portland_parks_athletic_field_rentals_v1';
const BASE_URL = 'https://www.portland.gov/parks';
const LIST_URL = 'https://www.portland.gov/parks/athletic-field-rental';
const REQUEST_FORM_URL = 'https://app.smartsheet.com/b/form/019ae055c93e7854b02daee20f816bad';
const RESERVATION_PORTAL_URL = 'https://anc.apm.activecommunities.com/portlandparks/home?onlineSiteId=0&from_original_cui=true';
const GUIDELINES_URL = 'https://www.portland.gov/parks/documents/2026-athletic-permitting-guidelines-1/download';
const FIELD_DETAILS_URL = 'https://www.portland.gov/parks/documents/2025-athletic-field-details-chart-0/download';
const LOGO_SOURCE_URL = 'https://www.portland.gov/themes/custom/cloudy/images/brand/seal-logo.png';
const ORG_SPORTS = ['Baseball', 'Softball', 'Grass Soccer', 'Football', 'Ultimate Frisbee', 'Lacrosse'];

const mapping: AffiliateScrapeMapping = {
  kind: 'RENTAL',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Parks Athletic Field Permits',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: REQUEST_FORM_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'Portland Parks Athletic Field Permits',
      officialActionUrl: REQUEST_FORM_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Parks & Recreation',
      sportName: 'Grass Soccer',
      formatLabel: 'Athletic field permit',
      city: 'Portland, OR',
      venueName: 'Portland Parks athletic fields',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'PP&R accepts athletic-field permit applications throughout the year for simple permits, leagues, tournaments, and camps. 2026 application windows start December 15, 2025 for spring primary-season sports, February 15, 2026 for spring secondary-season sports, June 1, 2026 for fall primary-season sports, July 15, 2026 for fall secondary-season sports, and September 15, 2026 for winter sports.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Apply through PP&R',
      participantOptionsText: 'Permit requests cover seasonal, occasional, tournament, league, and camp use across more than 200 athletic fields for softball, baseball, soccer, football, ultimate frisbee, lacrosse, and related sports.',
      priceText: 'Application and processing fees vary by permit type and timing. 2026 simple/adjustment fees range from $12.25 youth to $68.50 commercial; league/tournament/camp application fees range from $41.25-$379 depending on youth/adult/commercial status and how close the request is to the first reserved date. Usage fees vary by field and permit details.',
      statusText: 'Applications are reviewed by PP&R Reservations and Payments. No permit is issued until application fees, documentation, and required usage-fee payments are complete.',
      description: 'Portland Parks & Recreation permits more than 200 athletic fields for seasonal, occasional, league, tournament, and camp play. The official page says fields are suitable for softball, baseball, soccer, football, ultimate frisbee, lacrosse, and more, and that PP&R also issues select Portland Public Schools use permits. Applicants submit the Athletic Facilities Request Form with requested fields, dates, and times; PP&R then invoices application fees, may request documentation such as insurance or nonprofit status, confirms field availability, and collects required usage-fee payments before issuing permits. The 2026 guidelines list processing fees by permit type, timing, and youth/adult/commercial status, while usage fees depend on the facility, field, residency, commercial status, and season.',
      warnings: [
        'Stored as a rental/facility link-out because PP&R does not expose real-time field availability or a per-field public booking feed on the source page.',
        'The official page points users to the Athletic Facilities Request Form for new requests and ActiveCommunities for existing accounts/payments; availability and final fees are determined by PP&R after review.',
        'Coordinates are city-level because this source represents a citywide field-permitting inventory rather than one physical facility.',
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
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-parks-recreation-logo.png',
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
      originalName: 'portland-parks-recreation-logo.png',
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
      originalName: 'portland-parks-recreation-logo.png',
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
    select: { sports: true, coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates('Portland, OR')
    ?? existing?.coordinates
    ?? null;
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...ORG_SPORTS]));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Parks & Recreation',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, and public recreation facilities across Portland, including athletic fields for softball, baseball, soccer, football, ultimate frisbee, lacrosse, and related sports.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Parks & Recreation',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Portland Parks & Recreation manages parks, athletic field permitting, reservations, and public recreation facilities across Portland, including athletic fields for softball, baseball, soccer, football, ultimate frisbee, lacrosse, and related sports.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      operatesAthleticFacility: true,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Portland Parks Athletic Field Rentals',
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: LIST_URL,
    targetKind: 'RENTAL',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual rental/facility source. Portland Parks publishes athletic field permitting instructions, application windows, fee guidance, and request forms rather than real-time field availability.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      requestFormUrl: REQUEST_FORM_URL,
      reservationPortalUrl: RESERVATION_PORTAL_URL,
      guidelinesUrl: GUIDELINES_URL,
      fieldDetailsUrl: FIELD_DETAILS_URL,
      logoSourceUrl: LOGO_SOURCE_URL,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      sourceKey: SOURCE_KEY,
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
      notes: 'Manual rental mapping for Portland Parks citywide athletic field permitting link-out.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual rental mapping for Portland Parks citywide athletic field permitting link-out.',
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

  console.log(`Portland Parks athletic field affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-portland-parks-athletic-fields-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
