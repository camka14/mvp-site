/** Operator-approved setup for the New York Diamond Girls stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEW_YORK_DIAMOND_GIRLS_CLINIC_URL,
  NEW_YORK_DIAMOND_GIRLS_HOME_URL,
  NEW_YORK_DIAMOND_GIRLS_LOGO_SOURCE_URL,
  NEW_YORK_DIAMOND_GIRLS_MAPPING,
  NEW_YORK_DIAMOND_GIRLS_ORG_DESCRIPTION,
  NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE,
  NEW_YORK_DIAMOND_GIRLS_STATIC_PAGE_CLIENT,
  NEW_YORK_DIAMOND_GIRLS_TOURNAMENTS_URL,
  NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
} from '../src/server/affiliateImports/newYorkDiamondGirlsSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_new_york_diamond_girls';
const SOURCE_ID = 'affiliate_source_new_york_diamond_girls';
const SOURCE_KEY = 'new-york-diamond-girls';
const MAPPING_ID = 'affiliate_mapping_new_york_diamond_girls_v1';
const ORGANIZATION_NAME = 'New York Diamond Girls Softball';
const LOGO_FILE_ID = 'affiliate_file_new_york_diamond_girls_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkDiamondGirlsLogo.png');

const sourceMetadata = {
  sourceEvidence: NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE,
  inspectedAt: NEW_YORK_DIAMOND_GIRLS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.newyorkdiamondgirls.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official tryouts page ALLOWED.',
  reviewedUrls: [
    NEW_YORK_DIAMOND_GIRLS_HOME_URL,
    NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
    'https://www.newyorkdiamondgirls.com/announcements',
    NEW_YORK_DIAMOND_GIRLS_TOURNAMENTS_URL,
    NEW_YORK_DIAMOND_GIRLS_CLINIC_URL,
  ],
  officialActionUrls: [
    NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL,
    NEW_YORK_DIAMOND_GIRLS_TOURNAMENTS_URL,
    NEW_YORK_DIAMOND_GIRLS_CLINIC_URL,
  ],
  officialLogoSourceUrl: NEW_YORK_DIAMOND_GIRLS_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official New York Diamond Girls JSON-LD logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party mark was normalized to an opaque white 1024px PNG without changing the mark.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '2026-2027 tryouts', sourceUrl: NEW_YORK_DIAMOND_GIRLS_TRYOUTS_URL, reason: 'The stored capture announces the schedule but does not include a complete date, time, venue, price, and action row.' },
    { title: '2026 College Skills Clinic', sourceUrl: NEW_YORK_DIAMOND_GIRLS_CLINIC_URL, reason: 'The source-stated July 23, 2026 date is past as of the review date.' },
    { title: '2026 Open Tournament', reason: 'The source-stated July 10-12, 2026 dates are past as of the review date.' },
    { title: '2026 Showcase Tournament', reason: 'The source-stated July 24-26, 2026 dates are past as of the review date.' },
    { title: 'Diamond Girls teams', reason: 'TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('New York Diamond Girls logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-diamond-girls-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-diamond-girls-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-diamond-girls-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
      location: 'Western New York and Southern Ontario',
      address: null,
      description: NEW_YORK_DIAMOND_GIRLS_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: NEW_YORK_DIAMOND_GIRLS_HOME_URL,
      sports: ['Softball'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: NEW_YORK_DIAMOND_GIRLS_HOME_URL,
      listUrl: NEW_YORK_DIAMOND_GIRLS_HOME_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake New York Diamond Girls club package; incomplete and past dated rows are withheld and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEW_YORK_DIAMOND_GIRLS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored New York Diamond Girls evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NEW_YORK_DIAMOND_GIRLS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored New York Diamond Girls evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEW_YORK_DIAMOND_GIRLS_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-diamond-girls-affiliate-source] failed', error); process.exitCode = 1; });
