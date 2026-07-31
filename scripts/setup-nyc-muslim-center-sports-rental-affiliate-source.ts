/** Local-only setup for the NYC Muslim Center stored-intake RENTAL package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NYC_MUSLIM_CENTER_ABOUT_URL,
  NYC_MUSLIM_CENTER_BOOKING_URL,
  NYC_MUSLIM_CENTER_EVENT_RENTAL_URL,
  NYC_MUSLIM_CENTER_FACEBOOK_URL,
  NYC_MUSLIM_CENTER_HOME_URL,
  NYC_MUSLIM_CENTER_INSTAGRAM_URL,
  NYC_MUSLIM_CENTER_LOGO_SOURCE_URL,
  NYC_MUSLIM_CENTER_MAPPING,
  NYC_MUSLIM_CENTER_ORG_DESCRIPTION,
  NYC_MUSLIM_CENTER_OFFICIAL_URLS,
  NYC_MUSLIM_CENTER_RENTAL_RULES_URL,
  NYC_MUSLIM_CENTER_SOURCE_EVIDENCE,
  NYC_MUSLIM_CENTER_SPORTS_URL,
  NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT,
  NYC_MUSLIM_CENTER_YOUTUBE_URL,
} from '../src/server/affiliateImports/nycMuslimCenterSportsRentalSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_nyc_muslim_center';
const SOURCE_ID = 'affiliate_source_nyc_muslim_center_sports_rental';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-sports-rental-nycmc-net';
const MAPPING_ID = 'affiliate_mapping_nyc_muslim_center_sports_rental_v1';
const LOGO_FILE_ID = 'affiliate_file_nyc_muslim_center_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycMuslimCenterLogo.png');

const sourceMetadata = {
  sourceEvidence: NYC_MUSLIM_CENTER_SOURCE_EVIDENCE,
  inspectedAt: NYC_MUSLIM_CENTER_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nycmc.net/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYC Muslim Center sports listing is ALLOWED. Home, event-rental, classroom, about, and policy pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NYC_MUSLIM_CENTER_SPORTS_URL],
  officialActionUrls: NYC_MUSLIM_CENTER_OFFICIAL_URLS,
  officialLogoSourceUrl: NYC_MUSLIM_CENTER_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-sports-rental-nycmc-net/5b88e181-0971-49b8-ba61-3556aef4dc58/002-logo_candidate-e0bb9fa4-3b1c-42a2-9f29-c6b1edda084c.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYC Muslim Center sports-page logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party NYC Muslim Center mark was placed on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'NYCMC sports rental price and availability rows', reason: 'The allowed sports page provides a CatchCorner booking link but no public price, live availability, or approved rental dates.' },
    { title: 'NYCMC event and classroom rentals', reason: 'Event-rental and classroom pages are UNCHECKED and are not retried.' },
  ],
  officialOutboundNotes: {
    booking: NYC_MUSLIM_CENTER_BOOKING_URL,
    sports: NYC_MUSLIM_CENTER_SPORTS_URL,
    eventRental: NYC_MUSLIM_CENTER_EVENT_RENTAL_URL,
    rentalRules: NYC_MUSLIM_CENTER_RENTAL_RULES_URL,
    about: NYC_MUSLIM_CENTER_ABOUT_URL,
    instagram: NYC_MUSLIM_CENTER_INSTAGRAM_URL,
    facebook: NYC_MUSLIM_CENTER_FACEBOOK_URL,
    youtube: NYC_MUSLIM_CENTER_YOUTUBE_URL,
  },
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks)));
});

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYC Muslim Center logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch { /* recreate a missing local object */ }
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'nyc-muslim-center-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-muslim-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-muslim-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
  });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'NYC Muslim Center', location: 'New York City, NY', address: null, description: NYC_MUSLIM_CENTER_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NYC_MUSLIM_CENTER_HOME_URL, sports: ['Basketball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NYC Muslim Center Sports Rental', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NYC_MUSLIM_CENTER_HOME_URL, listUrl: NYC_MUSLIM_CENTER_SPORTS_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYC Muslim Center sports rental package with one ongoing basketball-court rental link-out; price, availability, address, and unchecked rental pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYC_MUSLIM_CENTER_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from the stored allowed NYC Muslim Center sports page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYC_MUSLIM_CENTER_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from the stored allowed NYC Muslim Center sports page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-nyc-muslim-center-sports-rental-affiliate-source] failed', error); process.exitCode = 1; });
