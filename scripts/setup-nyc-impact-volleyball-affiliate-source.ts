/** Operator-approved setup for the NYC Impact Boys Volleyball stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { NYC_IMPACT_VOLLEYBALL_HOME_URL, NYC_IMPACT_VOLLEYBALL_LOGO_SOURCE_URL, NYC_IMPACT_VOLLEYBALL_MAPPING, NYC_IMPACT_VOLLEYBALL_ORG_DESCRIPTION, NYC_IMPACT_VOLLEYBALL_REGISTER_URL, NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE, NYC_IMPACT_VOLLEYBALL_STATIC_PAGE_CLIENT, NYC_IMPACT_VOLLEYBALL_TRYOUT_URL } from '../src/server/affiliateImports/nycImpactVolleyballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_nyc_impact_volleyball';
const SOURCE_ID = 'affiliate_source_nyc_impact_volleyball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-nyc-impact-boys-volleyball-tryout-nycimpact-com';
const MAPPING_ID = 'affiliate_mapping_nyc_impact_volleyball_v1';
const LOGO_FILE_ID = 'affiliate_file_nyc_impact_volleyball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nycImpactVolleyballLogo.png');

const sourceMetadata = {
  sourceEvidence: NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.nycimpact.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NYC Impact boys-tryout page is ALLOWED. Season, program, schedule, tournament, payment, and team pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NYC_IMPACT_VOLLEYBALL_TRYOUT_URL],
  officialActionUrls: [NYC_IMPACT_VOLLEYBALL_TRYOUT_URL, NYC_IMPACT_VOLLEYBALL_REGISTER_URL, 'https://www.nycimpact.com/payment', 'https://www.nycimpact.com/usa-volleyball-registration', NYC_IMPACT_VOLLEYBALL_HOME_URL],
  officialLogoSourceUrl: NYC_IMPACT_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-nyc-impact-boys-volleyball-tryout-nycimpact-com/a1ff2db1-05b3-4c71-abad-042a3cb82897/002-logo_candidate-80fc6ac8-1311-4c49-8b32-7707ba941545.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party NYC Impact Volleyball wordmark candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party NYC Impact Volleyball wordmark was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'NYC Impact 15U-18U tryout dates', reason: 'The stored allowed page lists month/day and time rows but does not state an individual source year or publish-ready venue address; no EVENT dates are inferred.' },
    { title: 'NYC Impact season, program, schedule, tournament, payment, and team detail', reason: 'The stored pages are UNCHECKED.' },
    { title: 'NYC Impact teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
  ],
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => { const chunks: Buffer[] = []; stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks))); });

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('NYC Impact Volleyball logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) { try { const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket }); if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined }; } catch { /* recreate missing local object */ } }
  if (!stored) stored = await storage.putObject({ data, originalName: 'nyc-impact-volleyball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-impact-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'nyc-impact-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'NYC Impact Boys Volleyball', location: null, address: null, description: NYC_IMPACT_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NYC_IMPACT_VOLLEYBALL_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NYC Impact Boys Volleyball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NYC_IMPACT_VOLLEYBALL_HOME_URL, listUrl: NYC_IMPACT_VOLLEYBALL_TRYOUT_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NYC Impact Boys Volleyball package with one ongoing CLUB profile; month/day tryout rows without individual source years, unchecked season/program/team pages, and missing canonical location remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NYC_IMPACT_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed NYC Impact boys-tryout page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NYC_IMPACT_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed NYC Impact boys-tryout page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NYC_IMPACT_VOLLEYBALL_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-nyc-impact-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
