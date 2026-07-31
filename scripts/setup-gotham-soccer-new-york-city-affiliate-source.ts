/** Operator-approved setup for the Gotham Soccer New York City stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL,
  GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL,
  GOTHAM_SOCCER_NEW_YORK_CITY_LOGO_SOURCE_URL,
  GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING,
  GOTHAM_SOCCER_NEW_YORK_CITY_ORG_DESCRIPTION,
  GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE,
  GOTHAM_SOCCER_NEW_YORK_CITY_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/gothamSoccerNewYorkCitySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_gotham_soccer_new_york_city';
const SOURCE_ID = 'affiliate_source_gotham_soccer_new_york_city';
const SOURCE_KEY = 'gotham-soccer-new-york-city';
const MAPPING_ID = 'affiliate_mapping_gotham_soccer_new_york_city_v1';
const ORGANIZATION_NAME = 'Gotham Soccer New York City';
const LOGO_FILE_ID = 'affiliate_file_gotham_soccer_new_york_city_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/gothamSoccerNewYorkCityLogo.png');

const sourceMetadata = {
  sourceEvidence: GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE,
  inspectedAt: GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://gothamsoccer.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the New York City listing ALLOWED.',
  reviewedUrls: [GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL, GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL],
  officialActionUrls: [GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL, 'https://app.gothamsoccer.com/gotham-new-york-city'],
  officialLogoSourceUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official Gotham Soccer page-branding/logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored official Gotham Soccer mark was trimmed and centered on an opaque white 1024px canvas without inventing or altering the mark.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York City leagues, tournaments, and pickup', reason: 'The stored listing has no current dated detail row, venue, price, or schedule to emit safely.' },
    { title: 'Gotham teams', reason: 'TEAM mappings and affiliate teams are out of scope.' },
  ],
};

const loadAppModules = async () => ({ prisma: (await import('../src/lib/prisma')).prisma, runAffiliateSourceScrape: (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape });
const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => { const chunks: Buffer[] = []; stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks))); });

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH); const meta = await sharp(data).metadata();
  if (meta.width !== 1024 || meta.height !== 1024 || meta.hasAlpha) throw new Error('Gotham logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider'); const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } }); let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) { try { const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket }); if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined }; } catch { /* recreate missing local object */ } }
  if (!stored) stored = await storage.putObject({ data, originalName: 'gotham-soccer-new-york-city-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'gotham-soccer-new-york-city-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'gotham-soccer-new-york-city-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const { prisma, runAffiliateSourceScrape } = await loadAppModules();
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } }); if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: ORGANIZATION_NAME, location: 'New York City, NY', address: null, description: GOTHAM_SOCCER_NEW_YORK_CITY_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: ORGANIZATION_NAME, sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: GOTHAM_SOCCER_NEW_YORK_CITY_HOME_URL, listUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Gotham Soccer New York City club package; current dated league rows require detail evidence and mapping validation remains human-gated.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Gotham Soccer New York City evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Gotham Soccer New York City evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } }); console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: GOTHAM_SOCCER_NEW_YORK_CITY_STATIC_PAGE_CLIENT }); await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};
main().catch((error) => { console.error('[setup-gotham-soccer-new-york-city-affiliate-source] failed', error); process.exitCode = 1; });
