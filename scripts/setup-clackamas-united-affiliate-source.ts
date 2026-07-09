/**
 * Clackamas United affiliate source setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_clackamas_united_soccer_club`
 * and event source `affiliate_source_clackamas_united_club_events`.
 * Official URLs:
 * - Club: https://www.clackamasunited.com/
 * - Rangers camp: https://www.clackamasunited.com/news/2026-06-01-2026-rangers-summer-camp.html
 *
 * Creates/repairs the public club org and official logo. With `--scrape`, writes
 * current future event candidates. Safe for local or live DB; use `--live` for live.
 */
import crypto from 'crypto';
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
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_clackamas_united_soccer_club';
const SOURCE_ID = 'affiliate_source_clackamas_united_club_events';
const SOURCE_KEY = 'clackamas-united-club-events';
const MAPPING_ID = 'affiliate_mapping_clackamas_united_club_events_v1';
const BASE_URL = 'https://www.clackamasunited.com/';
const CAMP_URL = 'https://www.clackamasunited.com/news/2026-06-01-2026-rangers-summer-camp.html';
const REGISTER_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0xMDA2LTE3ODU2MTI3MzF8bTJaekVsdCtDdXAzakRmaktrdm5GOTRCZ25nT3gwYjdnazM5NXRjUmQxND0=&program_id=98213';
const LOGO_SOURCE_URL = 'https://www.clackamasunited.com/images/club-logo.png';
const SCHOOL_ADDRESS = '14486 SE 122nd Ave, Clackamas, OR 97015';
const CLUB_DESCRIPTION = 'Clackamas United Soccer Club is an Oregon Youth Soccer Association member youth soccer club offering recreational, developmental, competitive, goalkeeper, camp, and Rangers-affiliated soccer programs in the North Clackamas area.';

const normalizeLogo = async (source: Buffer): Promise<Buffer> => {
  const background = '#ffffff';
  const base = await sharp(source, { animated: false }).rotate().png().toBuffer();
  const trimmed = await sharp(base)
    .trim({ threshold: 12 })
    .flatten({ background })
    .trim({ background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(base).flatten({ background }).png().toBuffer());
  const logo = await sharp(trimmed)
    .resize({ width: 820, height: 820, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 820;
  const height = metadata.height ?? 820;
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

const fetchLogo = async (): Promise<Buffer> => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Clackamas United logo: HTTP ${response.status}`);
  }
  return normalizeLogo(Buffer.from(await response.arrayBuffer()));
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

const upsertLogo = async (ownerId: string) => {
  const data = await fetchLogo();
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
  const fileId = `${ORG_ID}_logo_square_${hash}`;
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'clackamas-united-logo-square.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  await (prisma as any).file.upsert({
    where: { id: fileId },
    create: {
      id: fileId,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'clackamas-united-logo-square.png',
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
      originalName: 'clackamas-united-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const clackamasMapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: BASE_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Clackamas United Club Events' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BASE_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Clackamas United 2026 Rangers Summer Camp',
      officialActionUrl: REGISTER_URL,
      sourceUrl: CAMP_URL,
      organizerName: 'Clackamas United Soccer Club',
      sportName: 'Grass Soccer',
      formatLabel: 'Camp',
      city: 'Clackamas, OR',
      venueName: 'Clackamas High School Stadium',
      address: SCHOOL_ADDRESS,
      startsAt: '2026-07-27T09:00:00-07:00',
      endsAt: '2026-07-31T16:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 27-31, 2026. 2nd-4th grade camp runs 9:00 AM-12:00 PM; 5th-10th grade camp runs 1:00 PM-4:00 PM; goalkeeper sessions run 9:00-10:30 AM and 10:30 AM-12:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 27-31, 2026',
      ageGroup: '2nd-12th grade by division',
      divisionText: '2nd-4th Grade; 5th-10th Grade; Goalkeeper 4th-6th; Goalkeeper 7th-12th',
      participantOptionsText: 'External registration through Clackamas United PlayMetrics.',
      priceText: '$170-$275',
      statusText: 'Registration link is visible on the official Clackamas United camp page.',
      description: 'Clackamas United describes the 2026 Rangers Summer Academy Camp as a five-day competitive player camp led by Rangers Academy coaches from Scotland, with a Nike camp jersey included. Source prices are $250 for 2nd-4th grade, $275 for 5th-10th grade, $170 for 4th-6th grade goalkeeper training, and $175 for 7th-12th grade goalkeeper training. Goalkeeper sessions are limited to 10 players per session.',
      tags: ['Camp'],
      divisions: [
        {
          key: 'c_age_u10_2nd_4th_grade',
          name: '2nd-4th Grade',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u10',
          priceCents: 25000,
          ageCutoffLabel: '2nd-4th grade',
          ageCutoffSource: 'Clackamas United camp page',
        },
        {
          key: 'c_age_u16_5th_10th_grade',
          name: '5th-10th Grade',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u16',
          priceCents: 27500,
          ageCutoffLabel: '5th-10th grade',
          ageCutoffSource: 'Clackamas United camp page',
        },
        {
          key: 'c_age_u12_goalkeeper_4th_6th_grade',
          name: 'Goalkeeper 4th-6th Grade',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u12',
          priceCents: 17000,
          maxParticipants: 10,
          ageCutoffLabel: '4th-6th grade',
          ageCutoffSource: 'Clackamas United camp page',
        },
        {
          key: 'c_age_u19_goalkeeper_7th_12th_grade',
          name: 'Goalkeeper 7th-12th Grade',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u19',
          priceCents: 17500,
          maxParticipants: 10,
          ageCutoffLabel: '7th-12th grade',
          ageCutoffSource: 'Clackamas United camp page',
        },
      ],
      warnings: [
        'Source page provides a venue name but not a street address; address was resolved from Clackamas High School official school page.',
        'Summer Rec Camp page has a future July 20-23 session but the location is still TBD, so it is intentionally not emitted.',
        'Classic and PDP tryout pages list May 2026 dates, which are past as of July 2026.',
      ],
    },
  ],
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates(SCHOOL_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Clackamas United Soccer Club',
      location: 'Clackamas, OR',
      address: SCHOOL_ADDRESS,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: 'clackamas-united-soccer-club',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Clackamas United Soccer Club programs',
      publicIntroText: 'Explore Clackamas United recreational, developmental, competitive, camp, and registration links.',
    },
    update: {
      updatedAt: new Date(),
      name: 'Clackamas United Soccer Club',
      location: 'Clackamas, OR',
      address: SCHOOL_ADDRESS,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'clackamas-united-soccer-club',
      publicPageEnabled: true,
      publicHeadline: 'Clackamas United Soccer Club programs',
      publicIntroText: 'Explore Clackamas United recreational, developmental, competitive, camp, and registration links.',
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
      name: 'Clackamas United Club Events',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: BASE_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Manual club-event source. Emits only current future dated Clackamas United event rows with source-visible dates and publishable locations.',
      metadata: {
        inspectedAt: '2026-07-09',
        logoSourceUrl: LOGO_SOURCE_URL,
        venueAddressSourceUrl: 'https://chs.nclack.k12.or.us/',
        skippedRows: [
          '2026 Summer Rec Camps July 20-23 session has TBD location.',
          '2026/27 Classic Tryouts and PDP Tryouts are May 2026 and past.',
        ],
      },
    },
    update: {
      updatedAt: now,
      name: 'Clackamas United Club Events',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: BASE_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Manual club-event source. Emits only current future dated Clackamas United event rows with source-visible dates and publishable locations.',
      metadata: {
        inspectedAt: '2026-07-09',
        logoSourceUrl: LOGO_SOURCE_URL,
        venueAddressSourceUrl: 'https://chs.nclack.k12.or.us/',
        skippedRows: [
          '2026 Summer Rec Camps July 20-23 session has TBD location.',
          '2026/27 Classic Tryouts and PDP Tryouts are May 2026 and past.',
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
      mapping: clackamasMapping,
      createdByUserId: null,
      notes: 'Manual Clackamas United Rangers camp candidate with source-derived prices, divisions, dates, and official action link.',
      validatedAt: now,
    },
    update: {
      isActive: true,
      mapping: clackamasMapping,
      notes: 'Manual Clackamas United Rangers camp candidate with source-derived prices, divisions, dates, and official action link.',
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
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();
  console.log(`Clackamas United affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-clackamas-united-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
