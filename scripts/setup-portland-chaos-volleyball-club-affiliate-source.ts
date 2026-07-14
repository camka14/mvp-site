/**
 * Portland Chaos Volleyball Club affiliate source setup.
 *
 * Owns public club org `affiliate_org_portland_chaos_volleyball_club`, source
 * `affiliate_source_portland_chaos_volleyball_club`, and mapping
 * `affiliate_mapping_portland_chaos_volleyball_club_v1`.
 *
 * Official URLs:
 * - Home: https://www.portlandchaosvbc.com/
 * - Middle school clinics/camps:
 *   https://www.portlandchaosvbc.com/page/show/9229094-middle-school-clinics-
 * - High school clinics/camps: https://www.portlandchaosvbc.com/clinics
 *
 * Creates/repairs the public club org, official Chaos logo, source row,
 * mapping row, one club candidate, and high-confidence future camp candidates.
 * Safe for local or live DB; use `--live` for live and `--scrape` to
 * create/update discovered candidates.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
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
const ORG_ID = 'affiliate_org_portland_chaos_volleyball_club';
const LOGO_FILE_ID = 'affiliate_file_portland_chaos_volleyball_club_logo';
const SOURCE_ID = 'affiliate_source_portland_chaos_volleyball_club';
const SOURCE_KEY = 'portland-chaos-volleyball-club';
const MAPPING_ID = 'affiliate_mapping_portland_chaos_volleyball_club_v1';
const BASE_URL = 'https://www.portlandchaosvbc.com/';
const MIDDLE_SCHOOL_URL = 'https://www.portlandchaosvbc.com/page/show/9229094-middle-school-clinics-';
const HIGH_SCHOOL_URL = 'https://www.portlandchaosvbc.com/clinics';
const LOGO_SOURCE_URL = 'https://cdn2.sportngin.com/attachments/logo_graphic/2cd6-215112579/Chaos_logo_medium.jpg';
const PUBLIC_SLUG = 'portland-chaos-volleyball-club';
const ORG_DESCRIPTION =
  'Portland Chaos Volleyball Club is a Portland-area youth volleyball club offering girls and boys volleyball programming, beach volleyball, clinics, open gyms, camps, and club team opportunities.';
const CHAOS_GYM_NAME = 'Chaos Gym';
const CHAOS_GYM_ADDRESS = '13560 SE Pheasant Ct, Milwaukie, OR 97222';

const withheldRows = [
  {
    title: 'Open gym for 12U/14U girls and boys',
    reason: 'The homepage schedule lists July dates and times but does not expose a source event year in the visible row or detail link.',
    sourceUrl: BASE_URL,
  },
  {
    title: '12U/14U all-skills clinic sessions',
    reason: 'The middle-school clinic page lists July/August sessions and prices but does not include a source event year.',
    sourceUrl: MIDDLE_SCHOOL_URL,
  },
  {
    title: '16U/18U summer camp',
    reason: 'The high-school camp page lists July 27-29 and price but does not expose a linked calendar detail page with a source year.',
    sourceUrl: HIGH_SCHOOL_URL,
  },
  {
    title: 'Club hosted tournaments',
    reason: 'The tournaments page only says high school boys tournaments and does not expose dated tournament rows.',
    sourceUrl: 'https://www.portlandchaosvbc.com/page/show/9225855-club-hosted-tournaments-',
  },
];

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Portland Chaos Volleyball Club manual source.</main></body></html>',
    };
  },
};

const createCampDivision = (ageLabel: string, priceCents: number) => ({
  name: `Coed ${ageLabel}`,
  key: `c_${ageLabel.toLowerCase()}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: 'youth',
  priceCents,
  maxParticipants: null,
  ageCutoffLabel: ageLabel,
  ageCutoffSource: 'Portland Chaos middle-school clinics page inspected 2026-07-09.',
});

const manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']> = [
  {
    listingKind: 'CLUB',
    title: 'Portland Chaos Volleyball Club',
    officialActionUrl: BASE_URL,
    sourceUrl: BASE_URL,
    organizerName: 'Portland Chaos Volleyball Club',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Youth volleyball club',
    city: 'Milwaukie, OR',
    venueName: CHAOS_GYM_NAME,
    address: CHAOS_GYM_ADDRESS,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING',
    dateDisplayText: 'Club programs by season',
    scheduleText: 'Portland Chaos publishes club programs, beach volleyball, clinics, open gyms, camps, tournaments, and calendar items on its official website.',
    participantOptionsText: 'Use the official Portland Chaos website for current club, camp, clinic, open gym, tournament, and registration information.',
    description: `${ORG_DESCRIPTION} Use the official Portland Chaos website for current registration details and program links.`,
    warnings: withheldRows.map((row) => `${row.title}: ${row.reason}`),
  },
  {
    listingKind: 'EVENT',
    title: 'Portland Chaos 12U Summer Camp',
    officialActionUrl: 'https://portlandchaosvbc.sportngin.com/register/form/103429701',
    sourceUrl: 'https://www.portlandchaosvbc.com/event/show/587851986',
    organizerName: 'Portland Chaos Volleyball Club',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Youth volleyball camp',
    city: 'Milwaukie, OR',
    venueName: CHAOS_GYM_NAME,
    address: CHAOS_GYM_ADDRESS,
    startsAt: '2026-07-27T14:00:00-07:00',
    endsAt: '2026-07-29T16:00:00-07:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'July 27-29, 2026, 2:00 PM-4:00 PM.',
    dateDisplayMode: 'SCHEDULED',
    priceText: '$99',
    tags: ['Camp'],
    tagText: 'Camp',
    divisionText: '12U',
    participantOptionsText: 'Registration through Portland Chaos SportsEngine.',
    description:
      'Portland Chaos lists a 12U summer camp for July 27-29 with 2:00 PM-4:00 PM sessions and a $99 fee. The linked SportsEngine calendar detail provides the 2026 date and Chaos Gym location.',
    divisions: [createCampDivision('12U', 9900)],
    warnings: [
      'The middle-school clinic page labels the camp section as Dalzell Gym, while the linked calendar detail lists Chaos Gym; candidate uses the linked event detail location.',
    ],
  },
  {
    listingKind: 'EVENT',
    title: 'Portland Chaos 14U Summer Camp',
    officialActionUrl: 'https://portlandchaosvbc.sportngin.com/register/form/517493509',
    sourceUrl: 'https://www.portlandchaosvbc.com/event/show/587851989',
    organizerName: 'Portland Chaos Volleyball Club',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Youth volleyball camp',
    city: 'Milwaukie, OR',
    venueName: CHAOS_GYM_NAME,
    address: CHAOS_GYM_ADDRESS,
    startsAt: '2026-07-27T16:00:00-07:00',
    endsAt: '2026-07-29T19:00:00-07:00',
    timeZone: 'America/Los_Angeles',
    scheduleText: 'July 27-29, 2026, 4:00 PM-7:00 PM.',
    dateDisplayMode: 'SCHEDULED',
    priceText: '$175',
    tags: ['Camp'],
    tagText: 'Camp',
    divisionText: '14U',
    participantOptionsText: 'Registration through Portland Chaos SportsEngine.',
    description:
      'Portland Chaos lists a 14U summer camp for July 27-29 with 4:00 PM-7:00 PM sessions and a $175 fee. The linked SportsEngine calendar detail provides the 2026 date and Chaos Gym location.',
    divisions: [createCampDivision('14U', 17500)],
    warnings: [
      'The middle-school clinic page labels the camp section as Dalzell Gym, while the linked calendar detail lists Chaos Gym; candidate uses the linked event detail location.',
    ],
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: BASE_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Chaos Volleyball Club',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: BASE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates,
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const normalizeLogo = async (input: Buffer) => {
  const background = '#8a1c22';
  const logo = await sharp(input, { animated: false })
    .rotate()
    .resize({ width: 860, height: 860, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 860;
  const height = metadata.height ?? 860;

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
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
  if (!response.ok) {
    throw new Error(`Failed to download Portland Chaos logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-chaos-volleyball-club-logo-square.png',
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
      originalName: 'portland-chaos-volleyball-club-logo-square.png',
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
      originalName: 'portland-chaos-volleyball-club-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(CHAOS_GYM_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Chaos Volleyball Club',
      location: 'Milwaukie, OR',
      address: CHAOS_GYM_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Portland Chaos Volleyball Club programs',
      publicIntroText: 'Review Portland Chaos Volleyball Club programs, beach volleyball, clinics, open gyms, camps, tournaments, calendar items, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Chaos Volleyball Club',
      location: 'Milwaukie, OR',
      address: CHAOS_GYM_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball', 'Beach Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Portland Chaos Volleyball Club programs',
      publicIntroText: 'Review Portland Chaos Volleyball Club programs, beach volleyball, clinics, open gyms, camps, tournaments, calendar items, and registration links.',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const metadata = {
    inspectedAt: '2026-07-09',
    robotsAllowed: true,
    robotsNote:
      'portlandchaosvbc.com robots.txt allows public pages and event detail pages for normal user agents while disallowing private user and event-calendar date paths.',
    logoSourceUrl: LOGO_SOURCE_URL,
    withheldRows,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Portland Chaos Volleyball Club',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public Portland Chaos club source. Creates a club candidate and future camp candidates whose event detail pages expose exact 2026 dates.',
      metadata,
    },
    update: {
      name: 'Portland Chaos Volleyball Club',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: BASE_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes:
        'Public Portland Chaos club source. Creates a club candidate and future camp candidates whose event detail pages expose exact 2026 dates.',
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
      mapping,
      createdByUserId: null,
      notes:
        'Manual Portland Chaos club and camp mapping generated from the public homepage, clinic pages, linked event detail pages, and official SportsEngine logo metadata.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        'Manual Portland Chaos club and camp mapping generated from the public homepage, clinic pages, linked event detail pages, and official SportsEngine logo metadata.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const duplicateRows = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'Portland Chaos Volleyball Club',
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    duplicateRows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'Portland Chaos Volleyball Club',
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  if (duplicateOrgIds.length > 0) {
    await (prisma as any).organizations.deleteMany({
      where: {
        id: { in: duplicateOrgIds },
        name: 'Portland Chaos Volleyball Club',
        website: BASE_URL,
      },
    });
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Portland Chaos Volleyball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${manualCandidates.length} manual candidate(s) configured.`);
  console.log(`${withheldRows.length} row(s) withheld: missing source year, no dated rows, or conflicting location/detail data.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    await relinkClubCandidateToSourceOrganization();
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update the club and camp candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-portland-chaos-volleyball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
