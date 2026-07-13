/**
 * Soccer Chance Academy affiliate program source setup.
 *
 * Owns event source `affiliate_source_soccer_chance_academy_programs`
 * and reuses public club organization `affiliate_org_soccer_chance_academy`.
 * Official URLs:
 * - Club: https://soccerchanceacademy.us/
 * - Camps: https://soccerchanceacademy.us/programs/camps/
 * - AirPitch tournament: https://airpitchusa.com/portlandor-3v3soccer-airpitch-tournament
 *
 * Creates/repairs the public club org and official logo. With `--scrape`, writes
 * current future event candidates. Safe for local or live DB; use `--live` for live.
 */
import dotenv from 'dotenv';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

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
const ORG_ID = 'affiliate_org_soccer_chance_academy';
const LOGO_FILE_ID = 'affiliate_file_soccer_chance_academy_logo';
const SOURCE_ID = 'affiliate_source_soccer_chance_academy_programs';
const SOURCE_KEY = 'soccer-chance-academy-programs';
const MAPPING_ID = 'affiliate_mapping_soccer_chance_academy_programs_v1';
const HOME_URL = 'https://soccerchanceacademy.us/';
const CAMPS_URL = 'https://soccerchanceacademy.us/programs/camps/';
const SUMMER_CAMP_URL = 'https://soccerchanceacademy.us/portland-youth-soccer-events/sca-summer-camp/';
const TOURNAMENTS_URL = 'https://soccerchanceacademy.us/tournaments/';
const AIRPITCH_URL = 'https://airpitchusa.com/portlandor-3v3soccer-airpitch-tournament';
const AIRPITCH_REGISTER_URL = 'https://bracketteam.com/event/7800/SCA_3v3_Airpitch_Jamboree_3v3_Soccer_Tournament/registration';
const SUMMER_CAMP_REGISTER_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS02NTUtMTc4Mjk1NDY2MHxVUm1GUVV5N0tYODVFSGxkNWIxQlIxTHRPN2JLcmw2VVlxcmd0a3BpdnVnPQ==&program_id=101465';
const LOGO_SOURCE_URL = 'https://soccerchanceacademy.us/wp-content/uploads/2026/02/sca-web-logo-new.png';
const ORGANIZER_NAME = 'Soccer Chance Academy Portland';
const ORG_ADDRESS = '1500 SE 96th Ave, Portland, OR 97216';
const PAA_ADDRESS = '1500 SE 96th Ave, Portland, OR 97216';
const ORGANIZER_DESCRIPTION = 'Soccer Chance Academy Portland is a youth soccer academy offering player development, academy programs, camps, futsal training, tournaments such as Oregon Super Cup, and soccer education programs for players in the Portland metro area.';
const PUBLIC_SLUG = 'soccer-chance-academy-portland';

const normalizeLogo = async (source: Buffer): Promise<Buffer> => {
  const background = '#ffffff';
  const flattened = await sharp(source, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 8 })
    .png()
    .toBuffer()
    .catch(async () => sharp(source, { animated: false }).rotate().flatten({ background }).png().toBuffer());
  const logo = await sharp(flattened)
    .resize({ width: 860, height: 560, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 860;
  const height = metadata.height ?? 560;
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

const downloadLogo = async () => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download Soccer Chance Academy logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  return normalizeLogo(Buffer.from(await response.arrayBuffer()));
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
  const data = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'soccer-chance-academy-logo-square.png',
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
      originalName: 'soccer-chance-academy-logo-square.png',
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
      originalName: 'soccer-chance-academy-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const openDivision = (name: string, priceCents: number | null) => ({
  name,
  key: `c_open_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
  gender: 'C' as const,
  ratingType: 'SKILL' as const,
  divisionTypeId: 'OPEN',
  priceCents,
  maxParticipants: null,
});

const ageDivision = (name: string, divisionTypeId: string, priceCents: number | null) => ({
  name,
  key: `c_age_${divisionTypeId}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  priceCents,
  maxParticipants: null,
  ageCutoffLabel: name,
  ageCutoffSource: 'AirPitch SCA 3v3 tournament page',
});

const campCandidate = (
  title: string,
  startsAt: string,
  endsAt: string,
  scheduleText: string,
  sourceTheme: string,
) => ({
  listingKind: 'EVENT' as const,
  title,
  officialActionUrl: SUMMER_CAMP_REGISTER_URL,
  sourceUrl: SUMMER_CAMP_URL,
  organizerName: ORGANIZER_NAME,
  sportName: 'Grass Soccer',
  formatLabel: 'Camp',
  city: 'Portland, OR',
  venueName: 'Portland Adventist Academy',
  address: PAA_ADDRESS,
  startsAt,
  endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: scheduleText.split('.')[0],
  divisionText: 'Open camp registration',
  participantOptionsText: 'External registration through Soccer Chance Academy PlayMetrics.',
  priceText: '$245',
  statusText: 'Registration link is visible on the official Soccer Chance Academy camps page.',
  description: `Soccer Chance Academy lists ${sourceTheme} as one of its 2026 summer camp weeks at Portland Adventist Academy. The official page says each week features a different SCA coach and lists the price as $245 for each week. The source does not expose a public age range for these day-camp weeks, so age filtering is left open.`,
  tags: ['Camp'],
  divisions: [openDivision('Open Camp Registration', 24500)],
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Soccer Chance Academy Programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    campCandidate(
      'SCA Summer Camp: Creativity in Soccer with Coach Joe',
      '2026-07-13T09:00:00-07:00',
      '2026-07-16T12:00:00-07:00',
      'July 13-16, 2026. 9:00 AM-12:00 PM.',
      'Creativity in Soccer with Coach Joe',
    ),
    campCandidate(
      'SCA Summer Camp: High School Prep Camp with Coach Ricky',
      '2026-07-20T09:00:00-07:00',
      '2026-07-23T11:30:00-07:00',
      'July 20-23, 2026. 9:00 AM-11:30 AM.',
      'High School Prep Camp with Coach Ricky',
    ),
    campCandidate(
      'SCA Summer Camp: Coach Frank Week',
      '2026-08-03T09:00:00-07:00',
      '2026-08-06T12:00:00-07:00',
      'August 3-6, 2026. 9:00 AM-12:00 PM.',
      'Coach Frank week',
    ),
    campCandidate(
      'SCA Summer Camp: Coach Abdi Week',
      '2026-08-10T09:00:00-07:00',
      '2026-08-13T12:00:00-07:00',
      'August 10-13, 2026. 9:00 AM-12:00 PM.',
      'Coach Abdi week',
    ),
    campCandidate(
      'SCA Summer Camp: Coach Dan Vincent Week',
      '2026-08-17T10:00:00-07:00',
      '2026-08-20T13:00:00-07:00',
      'August 17-20, 2026. 10:00 AM-1:00 PM.',
      'Coach Dan Vincent week',
    ),
    {
      listingKind: 'EVENT',
      title: 'SCA 3v3 AirPitch Jamboree',
      officialActionUrl: AIRPITCH_REGISTER_URL,
      sourceUrl: AIRPITCH_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Tournament',
      city: 'Portland, OR',
      venueName: 'Portland Adventist Academy',
      address: PAA_ADDRESS,
      startsAt: '2026-08-30T10:00:00-07:00',
      endsAt: '2026-08-30T17:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Sunday, August 30, 2026. Soccer Chance lists a 10:00 AM start; AirPitch says games typically run between 9:00 AM and 5:00 PM depending on participation.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 30, 2026',
      ageGroup: 'U6-adult',
      skillLevel: 'All competition levels welcome',
      divisionText: 'Boys/Girls U6-U12; Middle School U13-U14; High School U15-U19; Adult Open',
      participantOptionsText: 'Team registration',
      priceText: '$300',
      registrationDeadlineText: 'August 27, 2026 at 11:59 PM or when full',
      statusText: 'Register through the official BracketTeam event link from AirPitch.',
      description: 'AirPitch describes the SCA 3v3 AirPitch Jamboree as a single-day 3v3 soccer tournament on August 30, 2026 at Portland Adventist Academy. Teams play on the AirPitch format with a roster size of three to five players, a minimum of five 15-minute games, pool play and playoffs in most divisions, one referee per field, and no goalkeepers. Registration is $300 per team before August 10 and $350 per team after August 11; registration closes August 27 at 11:59 PM or when full. The visible BracketIQ price uses the current $300 team price and keeps late-fee details here.',
      tags: ['Tournament'],
      divisions: [
        ageDivision('Boys/Girls U6-U12', 'u12', 30000),
        ageDivision('Middle School U13-U14', 'u14', 30000),
        ageDivision('High School U15-U19', 'u19', 30000),
        openDivision('Adult Open', 30000),
      ],
      warnings: [
        'Late registration is $350 per team after August 11 and is intentionally stored in the description instead of the card price.',
        'AirPitch allows boys, girls, men, and women divisions but does not publish a full division table on the public page.',
      ],
    },
  ],
};

const upsertOrganization = async (ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates(ORG_ADDRESS)
    ?? existing?.coordinates
    ?? null;

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Soccer Chance Academy Portland programs',
      publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Soccer Chance Academy Portland programs',
      publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
      coordinates,
      operatesAthleticFacility: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const now = new Date();
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      createdAt: now,
      updatedAt: now,
      name: 'Soccer Chance Academy Programs',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: HOME_URL,
      listUrl: HOME_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Manual Soccer Chance Academy program source. Emits current future dated camps and tournament rows with source-visible dates and publishable locations.',
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'soccerchanceacademy.us robots.txt only disallows /wp-admin/ and allows public program pages. airpitchusa.com blocks Tilda internal paths but allows the public tournament detail page.',
        logoSourceUrl: LOGO_SOURCE_URL,
        sourcePages: [CAMPS_URL, SUMMER_CAMP_URL, TOURNAMENTS_URL, AIRPITCH_URL],
        skippedRows: [
          'Supplemental tryouts on Soccer Chance Academy list May 20 only and are past as of July 2026.',
          'The Escape Artist with Coach Abdi camp week started July 6, 2026 and is not emitted as a new candidate.',
          'SCA Juniors weekly free sessions started June 23, 2026; leave out until we decide whether to import source-schedule-derived future weekly occurrences.',
          'SCA Sleepaway Camp is dated July 27-31, 2026 but is skipped because Soccer Chance and Camp Cedar Ridge public pages did not expose a street address.',
          'Oregon Super Cup stays in the existing oregon-super-cup source to avoid duplicate tournament candidates.',
        ],
      },
    },
    update: {
      updatedAt: now,
      name: 'Soccer Chance Academy Programs',
      organizationId: ORG_ID,
      baseUrl: HOME_URL,
      listUrl: HOME_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Manual Soccer Chance Academy program source. Emits current future dated camps and tournament rows with source-visible dates and publishable locations.',
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'soccerchanceacademy.us robots.txt only disallows /wp-admin/ and allows public program pages. airpitchusa.com blocks Tilda internal paths but allows the public tournament detail page.',
        logoSourceUrl: LOGO_SOURCE_URL,
        sourcePages: [CAMPS_URL, SUMMER_CAMP_URL, TOURNAMENTS_URL, AIRPITCH_URL],
        skippedRows: [
          'Supplemental tryouts on Soccer Chance Academy list May 20 only and are past as of July 2026.',
          'The Escape Artist with Coach Abdi camp week started July 6, 2026 and is not emitted as a new candidate.',
          'SCA Juniors weekly free sessions started June 23, 2026; leave out until we decide whether to import source-schedule-derived future weekly occurrences.',
          'SCA Sleepaway Camp is dated July 27-31, 2026 but is skipped because Soccer Chance and Camp Cedar Ridge public pages did not expose a street address.',
          'Oregon Super Cup stays in the existing oregon-super-cup source to avoid duplicate tournament candidates.',
        ],
      },
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manual Soccer Chance Academy camps and AirPitch tournament candidates with source-derived dates, prices, divisions, tags, and official action links.',
      validatedAt: now,
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Soccer Chance Academy camps and AirPitch tournament candidates with source-derived dates, prices, divisions, tags, and official action links.',
      validatedAt: now,
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
  console.log(`Soccer Chance Academy affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-soccer-chance-academy-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
