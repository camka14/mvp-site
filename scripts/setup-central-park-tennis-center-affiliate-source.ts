/** Operator-approved setup for the Central Park Tennis Center stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  CENTRAL_PARK_TENNIS_ADULTS_URL,
  CENTRAL_PARK_TENNIS_CLASSES_URL,
  CENTRAL_PARK_TENNIS_HOME_URL,
  CENTRAL_PARK_TENNIS_JUNIORS_URL,
  CENTRAL_PARK_TENNIS_LOGO_SOURCE_URL,
  CENTRAL_PARK_TENNIS_MAPPING,
  CENTRAL_PARK_TENNIS_ORG_DESCRIPTION,
  CENTRAL_PARK_TENNIS_PAYG_URL,
  CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE,
  CENTRAL_PARK_TENNIS_STATIC_PAGE_CLIENT,
  CENTRAL_PARK_TENNIS_SUMMER_CAMP_URL,
} from '../src/server/affiliateImports/centralParkTennisCenterSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_central_park_tennis_center';
const SOURCE_ID = 'affiliate_source_central_park_tennis_center';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-central-park-tennis-center-ny-tennis-at-central-park-centralpark';
const MAPPING_ID = 'affiliate_mapping_central_park_tennis_center_v1';
const LOGO_FILE_ID = 'affiliate_file_central_park_tennis_center_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/centralParkTennisCenterLogo.png');

const sourceMetadata = {
  sourceEvidence: CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE,
  inspectedAt: CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.centralparktenniscenter.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Central Park Tennis Center homepage is ALLOWED. Future-class, summer-camp, corporate-event, rates, facility, instruction, permit, and booking pages are UNCHECKED and remain withheld.',
  reviewedUrls: [CENTRAL_PARK_TENNIS_HOME_URL],
  officialActionUrls: [CENTRAL_PARK_TENNIS_HOME_URL, CENTRAL_PARK_TENNIS_CLASSES_URL, CENTRAL_PARK_TENNIS_ADULTS_URL, CENTRAL_PARK_TENNIS_JUNIORS_URL, CENTRAL_PARK_TENNIS_SUMMER_CAMP_URL, CENTRAL_PARK_TENNIS_PAYG_URL],
  officialLogoSourceUrl: CENTRAL_PARK_TENNIS_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-central-park-tennis-center-ny-tennis-at-central-park-centralpark/8de41860-2003-4542-8e4d-3ad61b6b9010/002-logo_candidate-76cb33ce-b6f5-4d61-8974-95bc813191a4.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NY Tennis at Central Park logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#1f2937',
  logoNote: 'The stored first-party NY Tennis at Central Park wordmark was centered on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Adult Mid-Summer 2026 and Junior Summer Camp 2026 dates', reason: 'The allowed homepage dates started July 20 and June 8 and were past as of 2026-07-31; no stale EVENT candidate is emitted.' },
    { title: 'Central Park Tennis Center future classes and rentals', reason: 'Future-class, rate, facility, instruction, permit, authentication, and summer-camp detail pages are UNCHECKED; seasonal locker rentals are not facility rental output.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Central Park Tennis Center logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'central-park-tennis-center-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'central-park-tennis-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'central-park-tennis-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Central Park Tennis Center', location: 'New York City, NY', address: null, description: CENTRAL_PARK_TENNIS_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: CENTRAL_PARK_TENNIS_HOME_URL, sports: ['Tennis'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Central Park Tennis Center', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: CENTRAL_PARK_TENNIS_HOME_URL, listUrl: CENTRAL_PARK_TENNIS_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Central Park Tennis Center CLUB package with one ongoing tennis-program profile. Captured 2026 start dates are past, detail/booking pages are unchecked, and no EVENT or RENTAL candidate is created.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: CENTRAL_PARK_TENNIS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Central Park Tennis Center homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: CENTRAL_PARK_TENNIS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Central Park Tennis Center homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: CENTRAL_PARK_TENNIS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-central-park-tennis-center-affiliate-source] failed', error); process.exitCode = 1; });
