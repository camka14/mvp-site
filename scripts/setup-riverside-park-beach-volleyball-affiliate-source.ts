/** Operator-approved setup for the Riverside Park South beach volleyball stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  RIVERSIDE_PARK_COURTS_URL,
  RIVERSIDE_PARK_HOME_URL,
  RIVERSIDE_PARK_LOGO_SOURCE_URL,
  RIVERSIDE_PARK_MAPPING,
  RIVERSIDE_PARK_ORG_DESCRIPTION,
  RIVERSIDE_PARK_PERMIT_URL,
  RIVERSIDE_PARK_SOURCE_EVIDENCE,
  RIVERSIDE_PARK_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/riversideParkBeachVolleyballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_riverside_park_conservancy';
const SOURCE_ID = 'affiliate_source_riverside_park_beach_volleyball';
const SOURCE_KEY = 'riverside-park-south-beach-volleyball-courts';
const MAPPING_ID = 'affiliate_mapping_riverside_park_beach_volleyball_v1';
const ORGANIZATION_NAME = 'Riverside Park Conservancy';
const LOGO_FILE_ID = 'affiliate_file_riverside_park_conservancy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/riversideParkConservancyLogo.png');

const sourceMetadata = {
  sourceEvidence: RIVERSIDE_PARK_SOURCE_EVIDENCE,
  inspectedAt: RIVERSIDE_PARK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://riversideparknyc.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official court page and captured public paths ALLOWED; linked pages marked UNCHECKED remain evidence-scoped.',
  reviewedUrls: [RIVERSIDE_PARK_HOME_URL, RIVERSIDE_PARK_COURTS_URL],
  officialActionUrls: [RIVERSIDE_PARK_PERMIT_URL, RIVERSIDE_PARK_COURTS_URL],
  officialLogoSourceUrl: RIVERSIDE_PARK_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official Riverside Park Conservancy JSON-LD organization logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Riverside Park Conservancy logo was normalized to an opaque 1024px square without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Riverside Park sports camps', sourceUrl: 'https://riversideparknyc.org/sport-camp/riverside-park-volleyball', reason: 'The stored intake does not include a complete current volleyball camp row with date, time, price, and registration details.' },
    { title: 'Riverside Park general events', sourceUrl: 'https://riversideparknyc.org/events', reason: 'The stored events page contains unrelated dated park programming and no volleyball rental/session row.' },
    { title: 'Riverside Park address and court availability', sourceUrl: RIVERSIDE_PARK_COURTS_URL, reason: 'The captured court page provides a map link and use policy but no street address, price, or real-time availability.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Riverside Park logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'riverside-park-conservancy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'riverside-park-conservancy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'riverside-park-conservancy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
      location: 'New York City, NY',
      address: null,
      description: RIVERSIDE_PARK_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: RIVERSIDE_PARK_HOME_URL,
      sports: ['Beach Volleyball'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: 'Riverside Park South Beach Volleyball Courts',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: RIVERSIDE_PARK_HOME_URL,
      listUrl: RIVERSIDE_PARK_COURTS_URL,
      targetKind: 'RENTAL',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 43200,
      notes: 'Stored-intake public court rental package; no real-time availability or price is claimed, permit policy is preserved, and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: RIVERSIDE_PARK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored Riverside Park South court evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: RIVERSIDE_PARK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored Riverside Park South court evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: RIVERSIDE_PARK_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-riverside-park-beach-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
