/** Local-only setup for the NYC Footy stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NYC_FOOTY_ABOUT_URL,
  NYC_FOOTY_ALL_CURRENT_LEAGUES_URL,
  NYC_FOOTY_CALENDAR_URL,
  NYC_FOOTY_HOME_URL,
  NYC_FOOTY_LOGO_SOURCE_URL,
  NYC_FOOTY_MAPPING,
  NYC_FOOTY_ORG_DESCRIPTION,
  NYC_FOOTY_PRICING_URL,
  NYC_FOOTY_REGISTER_URL,
  NYC_FOOTY_SOURCE_EVIDENCE,
  NYC_FOOTY_STATIC_PAGE_CLIENT,
  NYC_FOOTY_UPCOMING_EVENTS_URL,
} from '../src/server/affiliateImports/nycFootySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_nyc_footy';
const SOURCE_ID = 'affiliate_source_nyc_footy';
const SOURCE_KEY = 'nyc-footy';
const MAPPING_ID = 'affiliate_mapping_nyc_footy_v1';
const ORGANIZATION_NAME = 'NYC Footy';
const LOGO_FILE_ID = 'affiliate_file_nyc_footy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycFootyLogo.png');

const sourceMetadata = {
  sourceEvidence: NYC_FOOTY_SOURCE_EVIDENCE,
  inspectedAt: NYC_FOOTY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nycfooty.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official homepage ALLOWED; linked pages remain evidence-scoped and are not blindly fetched.',
  reviewedUrls: [
    NYC_FOOTY_HOME_URL,
    NYC_FOOTY_ABOUT_URL,
    NYC_FOOTY_REGISTER_URL,
    NYC_FOOTY_CALENDAR_URL,
    NYC_FOOTY_PRICING_URL,
    NYC_FOOTY_UPCOMING_EVENTS_URL,
    NYC_FOOTY_ALL_CURRENT_LEAGUES_URL,
  ],
  officialActionUrls: [
    NYC_FOOTY_REGISTER_URL,
    NYC_FOOTY_CALENDAR_URL,
    NYC_FOOTY_PRICING_URL,
    NYC_FOOTY_UPCOMING_EVENTS_URL,
  ],
  officialLogoSourceUrl: NYC_FOOTY_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official NYC Footy page branding logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party white NYC Footy logo was normalized to an opaque dark 1024px square so the official mark remains legible on light and dark review surfaces.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Featured Summer 2026 leagues', sourceUrl: NYC_FOOTY_HOME_URL, reason: 'The stored homepage supplies league names and outbound links but no complete current date, time, venue, and price row.' },
    { title: 'Fall season leagues', sourceUrl: NYC_FOOTY_REGISTER_URL, reason: 'The homepage says Fall Registration is Open but the stored evidence does not capture a complete season schedule row.' },
    { title: 'Upcoming tournaments and events', sourceUrl: NYC_FOOTY_UPCOMING_EVENTS_URL, reason: 'The path is discovered but its detail content was not captured in the stored intake evidence.' },
    { title: 'All current leagues rental path', sourceUrl: NYC_FOOTY_ALL_CURRENT_LEAGUES_URL, reason: 'The discovered path is marked RENTAL, but no captured rental booking flow or field-level rental row is available.' },
    { title: 'NYC Footy teams', reason: 'TEAM mappings are out of scope.' },
  ],
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYC Footy logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'nyc-footy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-footy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-footy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = {
      updatedAt: new Date(),
      name: ORGANIZATION_NAME,
      location: 'New York City metro area',
      address: null,
      description: NYC_FOOTY_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: NYC_FOOTY_HOME_URL,
      sports: ['Soccer'],
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: NYC_FOOTY_HOME_URL,
      listUrl: NYC_FOOTY_HOME_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake NYC Footy club package; incomplete season and rental rows are withheld and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYC_FOOTY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored NYC Footy evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NYC_FOOTY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored NYC Footy evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYC_FOOTY_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-nyc-footy-affiliate-source] failed', error); process.exitCode = 1; });
