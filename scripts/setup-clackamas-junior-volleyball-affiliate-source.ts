/**
 * Clackamas Jr Rec affiliate source setup.
 *
 * Creates/repairs the public organization, source, mapping, and intentional
 * manual candidates for the public Spring 2027 program. The optional clinic
 * remains excluded because the source only says TBA. Local DB only; rerun
 * with --scrape to exercise the duplicate-safe candidate import.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  CLACKAMAS_JR_BASE_URL,
  CLACKAMAS_JR_CITY,
  CLACKAMAS_JR_MAPPING,
  CLACKAMAS_JR_MANUAL_CANDIDATES,
  CLACKAMAS_JR_ORG_DESCRIPTION,
  CLACKAMAS_JR_REGISTRATION_URL,
  CLACKAMAS_JR_ROBOTS_URL,
  CLACKAMAS_JR_SCHEDULE_URL,
  CLACKAMAS_JR_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/clackamasJuniorVolleyballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Clackamas Jr Rec setup is local-only and refuses --live.');
}

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
const ORG_ID = 'affiliate_org_clackamas_junior_volleyball';
const SOURCE_ID = 'affiliate_source_clackamas_junior_volleyball';
const SOURCE_KEY = 'clackamas-junior-volleyball';
const MAPPING_ID = 'affiliate_mapping_clackamas_junior_volleyball_v1';
const PUBLIC_SLUG = 'clackamas-junior-volleyball';
const LOGO_FILE_ID = 'affiliate_file_clackamas_junior_volleyball_logo';
const LOGO_SOURCE_URL = 'https://d2jqoimos5um40.cloudfront.net/site_0865/1014c6.png';
const LOGO_FILE_NAME = 'clackamas-junior-volleyball-logo-square.png';

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const normalizeLogo = async (input: Buffer) => {
  const background = '#ffffff';
  // The official asset is a wide banner. Keep the official mark on its white
  // panel; the surrounding artwork is promotional and should not become part
  // of the org logo.
  const cropped = await sharp(input, { animated: false })
    .extract({ left: 1300, top: 55, width: 500, height: 500 })
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer();
  const logo = await sharp(cropped)
    .resize({ width: 1024, height: 1024, fit: 'fill', withoutEnlargement: false })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background,
    },
    })
    .composite([{ input: logo, left: 0, top: 0 }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) throw new Error(`Failed to download Clackamas Jr Rec logo: ${response.status} ${response.statusText}`);
  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: LOGO_FILE_NAME,
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
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
      originalName: LOGO_FILE_NAME,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(CLACKAMAS_JR_CITY);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Clackamas Jr Rec',
      location: CLACKAMAS_JR_CITY,
      address: null,
      description: CLACKAMAS_JR_ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: CLACKAMAS_JR_BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Clackamas Jr Rec volleyball program',
      publicIntroText: 'Review the annual Spring 2027 recreational volleyball season, age divisions, fees, dates, and official registration information.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Clackamas Jr Rec',
      location: CLACKAMAS_JR_CITY,
      address: null,
      description: CLACKAMAS_JR_ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: CLACKAMAS_JR_BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Clackamas Jr Rec volleyball program',
      publicIntroText: 'Review the annual Spring 2027 recreational volleyball season, age divisions, fees, dates, and official registration information.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const metadata = {
    inspectedAt: '2026-07-15',
    robotsAllowed: true,
    robotsUrl: CLACKAMAS_JR_ROBOTS_URL,
    robotsNote: 'Public crawling is allowed for normal user agents; no public no-scraping statement was found.',
    termsUrls: [
      'https://clackamasjrvolleyball.com/TermsOfService.aspx',
      'https://clackamasjrvolleyball.com/RefundPolicy.aspx',
      'https://clackamasjrvolleyball.com/PrivacySecurity.aspx',
    ],
    inspectedPages: [CLACKAMAS_JR_BASE_URL, CLACKAMAS_JR_REGISTRATION_URL, CLACKAMAS_JR_SCHEDULE_URL],
    officialActionUrls: {
      registration: CLACKAMAS_JR_REGISTRATION_URL,
      schedules: CLACKAMAS_JR_SCHEDULE_URL,
    },
    logoStatus: 'VERIFIED_OFFICIAL',
    logoSourceUrl: LOGO_SOURCE_URL,
    logoSourceType: 'Official rendered Clackamas Jr Rec site banner, center-cropped to the Junior Volleyball mark.',
    logoSourceDimensions: '3000x600 RGBA source; cropped to the centered mark and normalized to opaque 1024x1024 PNG on #ffffff.',
    logoNote: 'The crop removes the surrounding promotional banner artwork so the logo has one stable full-canvas background on all surfaces.',
    cadence: 'weekly',
    cadenceIntervalMinutes: 10080,
    limitations: [
      '2026 registration is closed; the public page states Spring 2027 registration opens January 11, 2027.',
      'The optional pre-season clinic remains TBA and is not a dated candidate.',
      'The program uses multiple gyms and team-selected practice locations rather than one fixed venue.',
    ],
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Clackamas Jr Rec',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: CLACKAMAS_JR_BASE_URL,
      listUrl: CLACKAMAS_JR_BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public Clackamas Jr Rec source with one club profile and one future Spring 2027 volleyball program event. Logo remains pending separate official-logo review.',
      metadata,
    },
    update: {
      name: 'Clackamas Jr Rec',
      organizationId: ORG_ID,
      baseUrl: CLACKAMAS_JR_BASE_URL,
      listUrl: CLACKAMAS_JR_BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public Clackamas Jr Rec source with one club profile and one future Spring 2027 volleyball program event. Logo remains pending separate official-logo review.',
      metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping: CLACKAMAS_JR_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual public Clackamas Jr Rec mapping: one club candidate and one future Spring 2027 program event; TBA clinic excluded.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: CLACKAMAS_JR_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual public Clackamas Jr Rec mapping: one club candidate and one future Spring 2027 program event; TBA clinic excluded.',
      validatedAt: new Date(),
    },
  });
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();
  console.log(`Clackamas Jr Rec affiliate source ready: ${SOURCE_KEY}`);
  console.log(`Mapping: ${MAPPING_ID}`);
  console.log(`Logo: ${LOGO_FILE_ID} from ${LOGO_SOURCE_URL}`);
  console.log(`Manual candidates: ${CLACKAMAS_JR_MANUAL_CANDIDATES.length}`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: CLACKAMAS_JR_STATIC_PAGE_CLIENT });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-clackamas-junior-volleyball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
