/** Operator-approved setup for the Long Island Volleyball Association stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  LONG_ISLAND_VOLLEYBALL_CALENDAR_URL,
  LONG_ISLAND_VOLLEYBALL_CEDAR_SCHEDULE_URL,
  LONG_ISLAND_VOLLEYBALL_CEDAR_URL,
  LONG_ISLAND_VOLLEYBALL_CONTACT_URL,
  LONG_ISLAND_VOLLEYBALL_FACEBOOK_URL,
  LONG_ISLAND_VOLLEYBALL_HOME_URL,
  LONG_ISLAND_VOLLEYBALL_INSTAGRAM_URL,
  LONG_ISLAND_VOLLEYBALL_JUNIORS_URL,
  LONG_ISLAND_VOLLEYBALL_LOGO_SOURCE_URL,
  LONG_ISLAND_VOLLEYBALL_MAPPING,
  LONG_ISLAND_VOLLEYBALL_OFFICIAL_URLS,
  LONG_ISLAND_VOLLEYBALL_ORG_DESCRIPTION,
  LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE,
  LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/longIslandVolleyballAssociationSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  const liveDatabaseUrl = process.env.DATABASE_URL_LIVE?.trim();
  if (!liveDatabaseUrl) throw new Error('DATABASE_URL_LIVE is required with --live.');
  process.env.DATABASE_URL = liveDatabaseUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_long_island_volleyball_association';
const SOURCE_ID = 'affiliate_source_long_island_volleyball_association';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-long-island-volleyball-longislandvolleyball-com';
const MAPPING_ID = 'affiliate_mapping_long_island_volleyball_association_v1';
const LOGO_FILE_ID = 'affiliate_file_long_island_volleyball_association_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/longIslandVolleyballAssociationLogo.png');

const sourceMetadata = {
  sourceEvidence: LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://longislandvolleyball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Long Island Volleyball Association homepage is ALLOWED. Calendar, league, schedule, Cedar Beach, registration, directions, and juniors pages are UNCHECKED and remain withheld or outbound-only.',
  reviewedUrls: [LONG_ISLAND_VOLLEYBALL_HOME_URL],
  officialActionUrls: LONG_ISLAND_VOLLEYBALL_OFFICIAL_URLS,
  officialLogoSourceUrl: LONG_ISLAND_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-long-island-volleyball-longislandvolleyball-com/b0280a90-39d6-4e03-9b4f-5b558a2442bc/002-logo_candidate-92ef3139-a335-4299-8df9-b8b641e7e602.svg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party LIVA homepage SVG logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party LIVA SVG was rendered and centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'LIVA 2026 league and schedule rows', reason: 'The homepage says leagues are live but does not publish complete current dated rows; calendar and schedule pages are UNCHECKED.' },
    { title: 'Cedar Beach facilities and rental rows', reason: 'Cedar Beach, court-map, directions, and registration pages are UNCHECKED; no venue address, rental availability, or price is inferred.' },
    { title: 'LIVA juniors and tournament rows', reason: 'Those pages are UNCHECKED and remain outbound-only.' },
  ],
  officialOutboundNotes: {
    home: LONG_ISLAND_VOLLEYBALL_HOME_URL,
    cedarBeach: LONG_ISLAND_VOLLEYBALL_CEDAR_URL,
    juniors: LONG_ISLAND_VOLLEYBALL_JUNIORS_URL,
    cedarSchedule: LONG_ISLAND_VOLLEYBALL_CEDAR_SCHEDULE_URL,
    calendar: LONG_ISLAND_VOLLEYBALL_CALENDAR_URL,
    contact: LONG_ISLAND_VOLLEYBALL_CONTACT_URL,
    facebook: LONG_ISLAND_VOLLEYBALL_FACEBOOK_URL,
    instagram: LONG_ISLAND_VOLLEYBALL_INSTAGRAM_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('LIVA logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'long-island-volleyball-association-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'long-island-volleyball-association-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'long-island-volleyball-association-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Long Island Volleyball Association', location: 'Long Island, NY', address: null, description: LONG_ISLAND_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: LONG_ISLAND_VOLLEYBALL_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Long Island Volleyball Association', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: LONG_ISLAND_VOLLEYBALL_HOME_URL, listUrl: LONG_ISLAND_VOLLEYBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake LIVA CLUB package; unchecked Cedar Beach, calendar, league, schedule, registration, directions, and juniors pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: LONG_ISLAND_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Long Island Volleyball Association homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: LONG_ISLAND_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Long Island Volleyball Association homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-long-island-volleyball-association-affiliate-source] failed', error); process.exitCode = 1; });
