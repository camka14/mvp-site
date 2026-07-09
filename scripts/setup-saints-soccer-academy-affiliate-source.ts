/**
 * Saints Soccer Academy affiliate source setup.
 *
 * Owns public club organization
 * `affiliate_org_oregon_youth_soccer_find_a_club_saints_soccer_academy`
 * and event source `affiliate_source_saints_soccer_academy_club_events`.
 * Official URLs:
 * - Club: https://saintssocceracademy.org/
 * - Summer camp: https://saintssocceracademy.org/2026-summer-camp-series/
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
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_saints_soccer_academy';
const SOURCE_ID = 'affiliate_source_saints_soccer_academy_club_events';
const SOURCE_KEY = 'saints-soccer-academy-club-events';
const MAPPING_ID = 'affiliate_mapping_saints_soccer_academy_club_events_v1';
const BASE_URL = 'https://saintssocceracademy.org/';
const CAMP_URL = 'https://saintssocceracademy.org/2026-summer-camp-series/';
const REGISTER_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0yNDgtMTc4MDE4NTQ3NXxxWTJkWHA5ejdWQUhyc1YvdGZ1SDFWOHYzenI0UFFoTFBIaG5IMFB6Mi8wPQ==&program_id=97254';
const LOGO_SOURCE_URL = 'https://saintssocceracademy.org/wp-content/uploads/2016/07/saints-logo.png';
const CAMP_ADDRESS = '4503 N Lombard St, Portland, OR 97203';
const CLUB_DESCRIPTION = 'Saints Soccer Academy is a Portland youth soccer academy and Oregon Youth Soccer Association member club offering boys and girls programs, ongoing player placements, summer camps, TOPSoccer, and player development for a broad range of ages and skill levels.';

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
    throw new Error(`Failed to fetch Saints Soccer Academy logo: HTTP ${response.status}`);
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
    originalName: 'saints-soccer-academy-logo-square.png',
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
      originalName: 'saints-soccer-academy-logo-square.png',
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
      originalName: 'saints-soccer-academy-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: BASE_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Saints Soccer Academy Club Events' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: BASE_URL },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Saints Soccer Academy 2026 Full Day Skills Camp',
      officialActionUrl: REGISTER_URL,
      sourceUrl: CAMP_URL,
      organizerName: 'Saints Soccer Academy',
      sportName: 'Grass Soccer',
      formatLabel: 'Camp',
      city: 'Portland, OR',
      venueName: 'Columbia Park Annex Soccer Field',
      address: CAMP_ADDRESS,
      startsAt: '2026-07-13T09:00:00-07:00',
      endsAt: '2026-07-16T15:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 13-16, 2026, Monday-Thursday, 9:00 AM-3:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 13-16, 2026',
      ageGroup: 'Ages 5-13',
      divisionText: 'Boys and girls ages 5-13',
      participantOptionsText: 'External registration through Saints Soccer Academy PlayMetrics.',
      priceText: '$285',
      statusText: 'Spaces are limited; register through the official Saints Soccer Academy PlayMetrics link.',
      description: 'Saints Soccer Academy describes the 2026 Full Day Skills Camp as a July 13-16 program at Columbia Park Annex Soccer Field for boys and girls ages 5-13 and all skill levels. The camp runs 9 AM-3 PM, includes a supervised lunch break, groups campers by age and ability, and focuses on ball control, tight-space play, strategy, positioning, dribbling, passing, shooting, defending, goalkeeping, teamwork, and personal development. The listed registration cost is $285.',
      tags: ['Camp'],
      divisions: [
        {
          key: 'c_age_u14_ages_5_13',
          name: 'Ages 5-13',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: 'u14',
          priceCents: 28500,
          ageCutoffLabel: 'Ages 5-13',
          ageCutoffSource: 'Saints Soccer Academy summer camp page',
        },
      ],
      warnings: [
        'Ongoing tryout pages are not emitted because the source schedules individual evaluations after registration instead of publishing session dates.',
        'May 2026 supplemental and annual tryout rows are past as of July 2026.',
        'TOPSoccer spring registration is closed and spring dates are past.',
      ],
    },
  ],
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates(CAMP_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Saints Soccer Academy',
      location: 'Portland, OR',
      address: CAMP_ADDRESS,
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
      publicSlug: 'saints-soccer-academy',
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Saints Soccer Academy programs',
      publicIntroText: 'Explore Saints Soccer Academy camps, player placements, and official registration links.',
    },
    update: {
      updatedAt: new Date(),
      name: 'Saints Soccer Academy',
      location: 'Portland, OR',
      address: CAMP_ADDRESS,
      description: CLUB_DESCRIPTION,
      logoId,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      coordinates,
      publicSlug: 'saints-soccer-academy',
      publicPageEnabled: true,
      publicHeadline: 'Saints Soccer Academy programs',
      publicIntroText: 'Explore Saints Soccer Academy camps, player placements, and official registration links.',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const now = new Date();
  const sourcePayload = {
    name: 'Saints Soccer Academy Club Events',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: BASE_URL,
    listUrl: BASE_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual club-event source. Emits only current future dated Saints Soccer Academy event rows with source-visible dates and publishable locations.',
    metadata: {
      inspectedAt: '2026-07-09',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedRows: [
        '2026/27 ongoing tryouts have no fixed public evaluation date.',
        'May 2026 supplemental/annual tryouts are past.',
        'Spring 2026 TOPSoccer is closed and past.',
      ],
    },
  };
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      createdAt: now,
      updatedAt: now,
      ...sourcePayload,
    },
    update: {
      updatedAt: now,
      ...sourcePayload,
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
      notes: 'Manual Saints Soccer Academy summer camp candidate with source-derived date, venue, price, and official action link.',
      validatedAt: now,
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Saints Soccer Academy summer camp candidate with source-derived date, venue, price, and official action link.',
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
  console.log(`Saints Soccer Academy affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-saints-soccer-academy-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
