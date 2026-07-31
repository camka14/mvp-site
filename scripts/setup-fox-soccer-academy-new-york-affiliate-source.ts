/** Operator-approved setup for the Fox Soccer Academy New York stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL,
  FOX_SOCCER_ACADEMY_NEW_YORK_LOGO_SOURCE_URL,
  FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING,
  FOX_SOCCER_ACADEMY_NEW_YORK_ORG_DESCRIPTION,
  FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE,
  FOX_SOCCER_ACADEMY_NEW_YORK_STATIC_PAGE_CLIENT,
  FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL,
} from '../src/server/affiliateImports/foxSoccerAcademyNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_fox_soccer_academy_new_york';
const SOURCE_ID = 'affiliate_source_fox_soccer_academy_new_york';
const SOURCE_KEY = 'fox-soccer-academy-new-york';
const MAPPING_ID = 'affiliate_mapping_fox_soccer_academy_new_york_v1';
const ORGANIZATION_NAME = 'Fox Soccer Academy New York';
const LOGO_FILE_ID = 'affiliate_file_fox_soccer_academy_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/foxSoccerAcademyNewYorkLogo.png');

const sourceMetadata = {
  sourceEvidence: FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.foxsoccer.academy/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official New York tryout page ALLOWED.',
  reviewedUrls: [FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL, FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL],
  officialActionUrls: [FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL, 'https://www.foxsoccer.academy/youth-academy-programs-ny'],
  officialLogoSourceUrl: FOX_SOCCER_ACADEMY_NEW_YORK_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official Fox Soccer Academy page-branding/logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored official fox crest was trimmed and centered on an opaque white 1024px canvas without inventing or altering the mark.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '2026/2027 academy tryouts', sourceUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL, reason: 'The displayed June dates have no source-provided year, so they are not inferred as scheduled events.' },
    { title: 'Fox Soccer Academy teams', reason: 'TEAM mappings and affiliate teams are out of scope.' },
  ],
};

const loadAppModules = async () => ({
  prisma: (await import('../src/lib/prisma')).prisma,
  runAffiliateSourceScrape: (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape,
});
const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks)));
});

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const meta = await sharp(data).metadata();
  if (meta.width !== 1024 || meta.height !== 1024 || meta.hasAlpha) throw new Error('Fox logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch { /* recreate missing local object */ }
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'fox-soccer-academy-new-york-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'fox-soccer-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'fox-soccer-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
  });
  return LOGO_FILE_ID;
};

const main = async () => {
  const { prisma, runAffiliateSourceScrape } = await loadAppModules();
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: ORGANIZATION_NAME, location: 'New York, NY', address: null, description: FOX_SOCCER_ACADEMY_NEW_YORK_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: ORGANIZATION_NAME, sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: FOX_SOCCER_ACADEMY_NEW_YORK_HOME_URL, listUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Fox Soccer Academy New York club package; ambiguous tryout dates are withheld and mapping validation remains human-gated.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Fox Soccer Academy New York evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Fox Soccer Academy New York evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: FOX_SOCCER_ACADEMY_NEW_YORK_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally { await prisma.$disconnect(); }
};
main().catch((error) => { console.error('[setup-fox-soccer-academy-new-york-affiliate-source] failed', error); process.exitCode = 1; });
