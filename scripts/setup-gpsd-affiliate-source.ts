import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

loadEnv({ path: path.join(process.cwd(), '.env.local'), override: false });

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_greater_portland_soccer_district';
const LOGO_FILE_ID = 'affiliate_file_gpsd_logo';
const LOGO_PATH = 'affiliate_org_gpsd-gpsd-logo-upscaled.png';
const SOURCE_ID = 'affiliate_source_gpsd_adult_soccer_seasons';
const SOURCE_KEY = 'gpsd-adult-soccer-seasons';
const MAPPING_ID = 'affiliate_mapping_gpsd_adult_soccer_seasons_v3';
const LIST_URL = 'https://www.gpsdsoccer.com/about/gpsd-seasons';
const LEGACY_GENERIC_TITLE = 'GPSD Adult Outdoor Soccer Leagues';

const buildGpsdDivisions = (
  divisions: Array<{ name: string; divisionTypeId: string; priceCents: number }>,
  sourceLabel: string,
) => divisions.map((division) => ({
  ...division,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  ageCutoffLabel: division.name === 'Open' ? 'Adult 18+' : `${division.name.replace('Over ', '')}+`,
  ageCutoffSource: sourceLabel,
}));

const gpsdSpringFallDivisions = buildGpsdDivisions([
  { name: 'Open', divisionTypeId: '18plus', priceCents: 229500 },
  { name: 'Over 30', divisionTypeId: '30plus', priceCents: 224500 },
  { name: 'Over 40', divisionTypeId: '40plus', priceCents: 224500 },
  { name: 'Over 50', divisionTypeId: '50plus', priceCents: 204500 },
  { name: 'Over 58', divisionTypeId: '58plus', priceCents: 204500 },
  { name: 'Over 65', divisionTypeId: '65plus', priceCents: 169500 },
], 'Latest published GPSD Spring/Fall registration fee table');

const gpsdWinterDivisions = buildGpsdDivisions([
  { name: 'Open', divisionTypeId: '18plus', priceCents: 105000 },
  { name: 'Over 30', divisionTypeId: '30plus', priceCents: 100000 },
  { name: 'Over 40', divisionTypeId: '40plus', priceCents: 95000 },
  { name: 'Over 58', divisionTypeId: '58plus', priceCents: 90000 },
  { name: 'Over 60', divisionTypeId: '60plus', priceCents: 90000 },
  { name: 'Over 65', divisionTypeId: '65plus', priceCents: 60000 },
], 'Latest published GPSD Winter registration fee table');

const baseSeasonCandidate = {
  officialActionUrl: LIST_URL,
  sourceUrl: LIST_URL,
  organizerName: 'Greater Portland Soccer District',
  sportName: 'Grass Soccer',
  city: 'Portland, OR',
  venueName: 'Portland metro area',
  address: 'Portland, OR',
  timeZone: 'America/Los_Angeles',
  dateDisplayMode: 'NO_FIXED_DATE' as const,
  ageGroup: 'Adult 18+',
  participantOptionsText: 'Team registration',
  warnings: [
    'Stored as an evergreen/manual season listing because the current GPSD dated registration pages are stale or already past-dated as of 2026-07-04.',
  ],
};

const gpsdSeasonCandidates = [
  {
    ...baseSeasonCandidate,
    title: 'GPSD Winter Adult Outdoor Soccer League',
    formatLabel: 'Winter outdoor soccer league',
    scheduleText: 'GPSD describes winter as a 5-game adult outdoor soccer season with no championships. The season usually starts around the first or second weekend of January and ends in late February, with registration opening around early November and closing around early December of the previous year.',
    dateDisplayText: 'Winter seasonal registration',
    priceText: 'From $600 per team; division-specific winter fees go up to $1,050.',
    divisions: gpsdWinterDivisions,
    statusText: 'Evergreen winter league listing; confirm current registration on the official GPSD site.',
    description: 'Greater Portland Soccer District runs a recurring winter adult grass soccer league season in the Portland metro area. GPSD describes winter as a 5-game season with no championships, typically starting around the first or second weekend of January and ending in late February. Teams select an age bracket during registration and request a division.',
  },
  {
    ...baseSeasonCandidate,
    title: 'GPSD Spring Adult Outdoor Soccer League',
    formatLabel: 'Spring outdoor soccer league',
    scheduleText: 'GPSD describes spring as a 10-game adult outdoor soccer season plus championship games. The season usually starts around the first or second weekend of March and ends around the last weekend of June, with registration opening around mid-December and closing around late January.',
    dateDisplayText: 'Spring seasonal registration',
    priceText: 'From $1,695 per team; division-specific spring fees go up to $2,295.',
    divisions: gpsdSpringFallDivisions,
    statusText: 'Evergreen spring league listing; confirm current registration on the official GPSD site.',
    description: 'Greater Portland Soccer District runs a recurring spring adult grass soccer league season in the Portland metro area. GPSD describes spring as a 10-game season plus championship games, typically running from March through late June. Teams select an age bracket during registration and request a division.',
  },
  {
    ...baseSeasonCandidate,
    title: 'GPSD Fall Adult Outdoor Soccer League',
    formatLabel: 'Fall outdoor soccer league',
    scheduleText: 'GPSD describes fall as a 10-game adult outdoor soccer season plus championship games. The season usually starts the second weekend of September after Labor Day and ends the first weekend of December, with registration opening around mid-June and closing around late July.',
    dateDisplayText: 'Fall seasonal registration',
    priceText: 'From $1,695 per team; division-specific fall fees go up to $2,295 before any posted late fee.',
    divisions: gpsdSpringFallDivisions,
    statusText: 'Evergreen fall league listing; confirm current registration on the official GPSD site.',
    description: 'Greater Portland Soccer District runs a recurring fall adult grass soccer league season in the Portland metro area. GPSD describes fall as a 10-game season plus championship games, typically starting after Labor Day and ending in early December. Teams select an age bracket during registration and request a division.',
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'GPSD Adult Outdoor Soccer Seasons',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: gpsdSeasonCandidates,
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

const upsertLogo = async (ownerId: string) => {
  const logoAbsolutePath = path.join(process.cwd(), 'uploads', LOGO_PATH);
  const data = await fs.readFile(logoAbsolutePath);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'gpsd-logo-upscaled.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'gpsd-logo-upscaled.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'gpsd-logo-upscaled.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Greater Portland Soccer District',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Greater Portland Soccer District organizes adult outdoor soccer league seasons in the Portland metro area, including winter, spring, and fall play with age-bracketed divisions.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: 'https://www.gpsdsoccer.com/',
      sports: ['Grass Soccer'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.6784, 45.5152],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Greater Portland Soccer District',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Greater Portland Soccer District organizes adult outdoor soccer league seasons in the Portland metro area, including winter, spring, and fall play with age-bracketed divisions.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: 'https://www.gpsdsoccer.com/',
      sports: ['Grass Soccer'],
      status: 'UNLISTED',
      coordinates: [-122.6784, 45.5152],
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'GPSD Adult Soccer Seasons',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: 'https://www.gpsdsoccer.com/',
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual evergreen source. GPSD current dated registration pages are stale or past-dated, so imports emit season-labeled winter, spring, and fall league listings from the official season overview until reliable future registration pages are available.',
      metadata: {
        inspectedAt: '2026-07-04',
        inspectionScreenshot: 'output/playwright/gpsd-spring-registration.png',
        robotsAllowed: true,
        logoSourceUrl: 'https://www.gpsdsoccer.com/_templates/_design_files/logo.png',
      },
    },
    update: {
      name: 'GPSD Adult Soccer Seasons',
      organizationId: ORG_ID,
      baseUrl: 'https://www.gpsdsoccer.com/',
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual evergreen source. GPSD current dated registration pages are stale or past-dated, so imports emit season-labeled winter, spring, and fall league listings from the official season overview until reliable future registration pages are available.',
      metadata: {
        inspectedAt: '2026-07-04',
        inspectionScreenshot: 'output/playwright/gpsd-spring-registration.png',
        robotsAllowed: true,
        logoSourceUrl: 'https://www.gpsdsoccer.com/_templates/_design_files/logo.png',
      },
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: SOURCE_ID,
        version: 3,
      },
    },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 3,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manual evergreen mapping for GPSD adult grass soccer seasons with season-labeled winter, spring, and fall candidates, explicit source divisions, and season-specific latest published team fees.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual evergreen mapping for GPSD adult grass soccer seasons with season-labeled winter, spring, and fall candidates, explicit source divisions, and season-specific latest published team fees.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const deleteLegacyGenericCandidates = async () => {
  const candidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      title: LEGACY_GENERIC_TITLE,
      status: { not: 'PUBLISHED' },
    },
    select: { id: true },
  });
  if (!candidates.length) return;

  const { deleteAffiliateCandidate } = await import('../src/server/affiliateImports/service');
  for (const candidate of candidates) {
    await deleteAffiliateCandidate(candidate.id);
  }
  console.log(`Deleted ${candidates.length} legacy generic GPSD candidate(s).`);
};

const main = async () => {
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`GPSD affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    await deleteLegacyGenericCandidates();
    const { runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service');
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-gpsd-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
