import dotenv from 'dotenv';
import type { AffiliateListingKind, AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

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
const INSPECTED_AT = '2026-07-06';
const MONTH = 43200;

type SourceOrganizationDefinition = {
  id: string;
  logoFileId: string;
  logoSourceUrl: string;
  logoOriginalName: string;
  name: string;
  location: string;
  address: string;
  website: string;
  description: string;
  sports: string[];
};

type SourceDefinition = {
  id: string;
  sourceKey: string;
  name: string;
  orgId: string;
  baseUrl: string;
  listUrl: string;
  targetKind: AffiliateListingKind;
  mapping: AffiliateScrapeMapping;
  notes: string;
  metadata: Record<string, unknown>;
};

const orgDefinitions: SourceOrganizationDefinition[] = [
  {
    id: 'affiliate_org_gresham_barlow_school_district',
    logoFileId: 'affiliate_file_gresham_barlow_school_district_logo',
    logoSourceUrl: 'https://resources.finalsite.net/images/v1705939077/districtgreshamk12orus/y5ahllyz9elhkph7saoq/GBSD_LOGO.png',
    logoOriginalName: 'gresham-barlow-school-district-logo.png',
    name: 'Gresham-Barlow School District',
    location: 'Gresham, OR',
    address: '1331 NW Eastman Pkwy, Gresham, OR 97030',
    website: 'https://www.gresham.k12.or.us/departments/facilities-department/facility-use',
    description: 'Gresham-Barlow School District provides community access to district buildings and athletic spaces, including gyms, cafeterias, fields, tennis courts, tracks, and turf fields when staff support and school schedules allow.',
    sports: ['Basketball', 'Volleyball', 'Grass Soccer', 'Football', 'Baseball', 'Softball', 'Tennis', 'Track and Field'],
  },
  {
    id: 'affiliate_org_reynolds_school_district',
    logoFileId: 'affiliate_file_reynolds_school_district_logo',
    logoSourceUrl: 'https://www.reynolds.k12.or.us/sites/all/themes/aha_compass/logo.png',
    logoOriginalName: 'reynolds-school-district-logo.png',
    name: 'Reynolds School District',
    location: 'Fairview, OR',
    address: '1204 NE 201st Ave, Fairview, OR 97024',
    website: 'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
    description: 'Reynolds School District accepts community facility-use applications for selected school gyms, cafeterias, play fields, tennis courts, tracks, parking lots, and related spaces during the school year when staff and school schedules allow.',
    sports: ['Basketball', 'Volleyball', 'Grass Soccer', 'Football', 'Baseball', 'Softball', 'Tennis', 'Track and Field'],
  },
];

const literalFields = (title: string, officialActionUrl: string) => ({
  title: { selector: 'body', mode: 'literal' as const, value: title },
  officialActionUrl: { selector: 'body', mode: 'literal' as const, value: officialActionUrl },
});

const manualMapping = (
  kind: AffiliateListingKind,
  listUrl: string,
  title: string,
  officialActionUrl: string,
  manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']>,
): AffiliateScrapeMapping => ({
  kind,
  listUrl,
  itemSelector: 'body',
  fields: literalFields(title, officialActionUrl),
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates,
});

const sourceDefinitions: SourceDefinition[] = [
  {
    id: 'affiliate_source_gresham_barlow_school_district_facility_rentals',
    sourceKey: 'gresham-barlow-school-district-facility-rentals',
    name: 'Gresham-Barlow School District Facility Rentals',
    orgId: 'affiliate_org_gresham_barlow_school_district',
    baseUrl: 'https://www.gresham.k12.or.us/',
    listUrl: 'https://www.gresham.k12.or.us/departments/facilities-department/facility-use',
    targetKind: 'RENTAL',
    notes: 'Manual districtwide rental source. The public page and fee schedule are crawlable with crawl-delay 5, but current availability is handled by RentMyCampus and remains outbound only.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'Finalsite public facility-use page with RentMyCampus outbound reservation system',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 5,
      officialReservationUrl: 'https://gbsd.rentmycampus.com/',
      feeScheduleUrl: 'https://www.gresham.k12.or.us/departments/facilities-department/fee-schedule-july-1-2024',
      logoSourceUrl: orgDefinitions[0].logoSourceUrl,
    },
    mapping: manualMapping(
      'RENTAL',
      'https://www.gresham.k12.or.us/departments/facilities-department/facility-use',
      'Gresham-Barlow School District Facility Rentals',
      'https://gbsd.rentmycampus.com/',
      [
        {
          listingKind: 'RENTAL',
          title: 'Gresham-Barlow School District Facility Rentals',
          officialActionUrl: 'https://gbsd.rentmycampus.com/',
          sourceUrl: 'https://www.gresham.k12.or.us/departments/facilities-department/facility-use',
          organizerName: 'Gresham-Barlow School District',
          sportName: 'Basketball',
          formatLabel: 'School gym, field, court, and track rental',
          city: 'Gresham, OR',
          venueName: 'Gresham-Barlow School District facilities',
          address: '1331 NW Eastman Pkwy, Gresham, OR 97030',
          timeZone: 'America/Los_Angeles',
          scheduleText: 'Reserve through the official RentMyCampus reservation system. Requests depend on staff availability, school programming, and the approved permit time.',
          dateDisplayMode: 'ONGOING',
          dateDisplayText: 'Request through RentMyCampus',
          participantOptionsText: 'Districtwide community facility use for selected gyms, cafeterias, fields, tennis courts, tracks, turf fields, and related school spaces.',
          priceText: '$12-$60/hour for listed athletic spaces before staffing, equipment, and user-count fees.',
          statusText: 'Availability is reviewed by the district after a RentMyCampus request.',
          description: 'Gresham-Barlow School District provides community access to public buildings and fields for outside user groups when school programming, prior reservations, and staff support allow. The public facility-use page says all approved rentals require district personnel on site and that requesters are invoiced after the event for rental fees and staffing costs. The July 1, 2024 fee schedule lists athletic spaces such as grass fields, gymnasiums, tennis courts, tracks, and turf fields with hourly rates by user tier; equipment, service, personnel, and user-count fees may also apply.',
          warnings: [
            'Stored as a district-level rental link-out because live availability is controlled by RentMyCampus.',
            'Coordinates are district-office level because this source represents many school facilities.',
            'Do not scrape RentMyCampus availability without separate permission and policy review.',
          ],
        },
      ],
    ),
  },
  {
    id: 'affiliate_source_reynolds_school_district_facility_rentals',
    sourceKey: 'reynolds-school-district-facility-rentals',
    name: 'Reynolds School District Facility Rentals',
    orgId: 'affiliate_org_reynolds_school_district',
    baseUrl: 'https://www.reynolds.k12.or.us/',
    listUrl: 'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
    targetKind: 'RENTAL',
    notes: 'Manual districtwide rental source. The public Drupal facility-use application page is crawlable with crawl-delay 15 and includes the fee schedule, facility list, application requirements, and request form.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'Drupal public facility-use application form',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 15,
      officialReservationUrl: 'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
      logoSourceUrl: orgDefinitions[1].logoSourceUrl,
    },
    mapping: manualMapping(
      'RENTAL',
      'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
      'Reynolds School District Facility Rentals',
      'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
      [
        {
          listingKind: 'RENTAL',
          title: 'Reynolds School District Facility Rentals',
          officialActionUrl: 'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
          sourceUrl: 'https://www.reynolds.k12.or.us/facilities/facilities-use-application',
          organizerName: 'Reynolds School District',
          sportName: 'Basketball',
          formatLabel: 'School gym, field, court, and track rental',
          city: 'Fairview, OR',
          venueName: 'Reynolds School District facilities',
          address: '1204 NE 201st Ave, Fairview, OR 97024',
          timeZone: 'America/Los_Angeles',
          scheduleText: 'Submit one-time or continuous facility-use requests through the official district application page at least 30 days before the event.',
          dateDisplayMode: 'ONGOING',
          dateDisplayText: 'Request through district application',
          participantOptionsText: 'Districtwide community facility use for selected gyms, cafeterias, play fields, tennis courts, tracks, Woodland soccer field, parking lots, and related school spaces.',
          priceText: '$10-$55/hour for listed athletic spaces before staffing, deposit, and insurance requirements.',
          statusText: 'Facility use is school-year only and subject to district approval, staffing, closures, and school schedules.',
          description: 'Reynolds School District allows individuals and community members to apply for facility use when space is available and requests do not interfere with instruction, student athletics, activities, or school-related groups. The public page lists limited elementary, middle, and high school gyms, cafeterias, fields, tennis courts, tracks, Woodland soccer field, parking lots, and related spaces. The 2025-26 fee schedule on the application page lists hourly and seasonal rates by tier, and approved rentals require district staff, insurance, and post-event invoicing for rental fees and staffing costs.',
          warnings: [
            'Stored as a district-level rental link-out because the source is an application form rather than real-time availability.',
            'Coordinates are district-office level because this source represents many school facilities.',
          ],
        },
      ],
    ),
  },
];

const sourceByKey = new Map(sourceDefinitions.map((definition) => [definition.sourceKey, definition]));
const orgById = new Map(orgDefinitions.map((definition) => [definition.id, definition]));

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

const downloadLogo = async (org: SourceOrganizationDefinition) => {
  try {
    const response = await fetch(org.logoSourceUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'BracketIQ affiliate source setup (+https://bracket-iq.com)',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to download logo ${org.logoSourceUrl}: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    return { data, contentType };
  } catch (error) {
    console.warn(`Fetch failed for ${org.logoSourceUrl}; retrying with curl.`, error);
  }

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-fsSL',
      '--http1.1',
      '--max-time',
      '30',
      '-A',
      'Mozilla/5.0',
      '-H',
      'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      org.logoSourceUrl,
    ],
    {
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return {
    data: Buffer.from(stdout),
    contentType: org.logoSourceUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
  };
};

const upsertLogo = async (org: SourceOrganizationDefinition, ownerId: string) => {
  const { data, contentType } = await downloadLogo(org);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: org.logoOriginalName,
    contentType,
    organizationId: org.id,
  });

  await (prisma as any).file.upsert({
    where: { id: org.logoFileId },
    create: {
      id: org.logoFileId,
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: org.logoOriginalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: org.logoOriginalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const resolveCoordinates = async (org: SourceOrganizationDefinition) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: org.id },
    select: { coordinates: true },
  });
  try {
    return await geocodeAddressToCoordinates(org.address) ?? existing?.coordinates ?? null;
  } catch (error) {
    console.warn(`Could not geocode ${org.name}:`, error);
    return existing?.coordinates ?? null;
  }
};

const upsertOrganization = async (org: SourceOrganizationDefinition, ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: org.id },
    select: { sports: true },
  });
  const coordinates = await resolveCoordinates(org);
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...org.sports]));

  await (prisma as any).organizations.upsert({
    where: { id: org.id },
    create: {
      id: org.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: org.name,
      location: org.location,
      address: org.address,
      description: org.description,
      logoId: org.logoFileId,
      ownerId,
      website: org.website,
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
      name: org.name,
      location: org.location,
      address: org.address,
      description: org.description,
      logoId: org.logoFileId,
      ownerId,
      website: org.website,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async (source: SourceDefinition) => {
  const mappingId = `${source.id}_mapping_v1`;

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      name: source.name,
      sourceKey: source.sourceKey,
      organizationId: source.orgId,
      baseUrl: source.baseUrl,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: mappingId,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: MONTH,
      notes: source.notes,
      metadata: source.metadata,
    },
    update: {
      name: source.name,
      organizationId: source.orgId,
      baseUrl: source.baseUrl,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: mappingId,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: MONTH,
      notes: source.notes,
      metadata: source.metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: source.id },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: source.id,
        version: 1,
      },
    },
    create: {
      id: mappingId,
      sourceId: source.id,
      version: 1,
      isActive: true,
      mapping: source.mapping,
      createdByUserId: null,
      notes: `${source.name} manual rental mapping from official district facility-use source.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping: source.mapping,
      notes: `${source.name} manual rental mapping from official district facility-use source.`,
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: source.id },
    data: { activeMappingId: mappingId },
  });
};

const selectedSourcesFromArgs = () => {
  const requestedKeys = process.argv
    .filter((arg) => arg.startsWith('--source='))
    .flatMap((arg) => arg.slice('--source='.length).split(','))
    .map((key) => key.trim())
    .filter(Boolean);

  if (!requestedKeys.length) return sourceDefinitions;

  const missing = requestedKeys.filter((key) => !sourceByKey.has(key));
  if (missing.length) {
    throw new Error(`Unknown source key(s): ${missing.join(', ')}`);
  }

  return requestedKeys.map((key) => sourceByKey.get(key)!);
};

const logScrapeSummary = (sourceKey: string, result: Awaited<ReturnType<RunAffiliateSourceScrape>>) => {
  const logs = result.run.logs as any;
  console.log(
    `Scrape run ${result.run.id} for ${sourceKey}: ${result.candidates.length} candidate(s) saved `
    + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, `
    + `duplicates ${logs?.duplicateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
  );
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const selectedSources = selectedSourcesFromArgs();
  const selectedOrgIds = new Set(selectedSources.map((source) => source.orgId));
  const selectedOrgs = orgDefinitions.filter((org) => selectedOrgIds.has(org.id));
  const owner = await requireOwner();

  for (const org of selectedOrgs) {
    await upsertLogo(org, owner.id);
    await upsertOrganization(org, owner.id);
    console.log(`Source organization ready: ${org.id}`);
  }

  for (const source of selectedSources) {
    const org = orgById.get(source.orgId);
    if (!org) throw new Error(`Missing organization definition for ${source.orgId}`);
    await upsertSourceAndMapping(source);
    console.log(`Affiliate source ready: ${source.sourceKey}`);
  }

  if (shouldScrape) {
    for (const source of selectedSources) {
      const result = await runAffiliateSourceScrape(source.id);
      logScrapeSummary(source.sourceKey, result);
    }
  } else {
    console.log('Re-run with --scrape to fetch the source pages and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-school-district-facility-rental-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
