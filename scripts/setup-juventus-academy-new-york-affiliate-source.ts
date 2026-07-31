/** Operator-approved setup for the Juventus Academy New York stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { JUVENTUS_ACADEMY_NY_BOOKINGS_URL, JUVENTUS_ACADEMY_NY_HOME_URL, JUVENTUS_ACADEMY_NY_LOGO_SOURCE_URL, JUVENTUS_ACADEMY_NY_MAPPING, JUVENTUS_ACADEMY_NY_ORG_DESCRIPTION, JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE, JUVENTUS_ACADEMY_NY_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/juventusAcademyNewYorkSource';

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
const ORG_ID = 'affiliate_org_juventus_academy_new_york';
const SOURCE_ID = 'affiliate_source_juventus_academy_new_york';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-juventus-academy-ny-home-juventusny-com';
const MAPPING_ID = 'affiliate_mapping_juventus_academy_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_juventus_academy_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/juventusAcademyNewYorkLogo.png');

const sourceMetadata = {
  sourceEvidence: JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE,
  inspectedAt: JUVENTUS_ACADEMY_NY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://juventusny.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Juventus Academy New York homepage is ALLOWED. Program, registration, tournament, international-travel, and facility pages are UNCHECKED and remain withheld.',
  reviewedUrls: [JUVENTUS_ACADEMY_NY_HOME_URL],
  officialActionUrls: [JUVENTUS_ACADEMY_NY_HOME_URL, JUVENTUS_ACADEMY_NY_BOOKINGS_URL, 'https://juventusny.com/programs', 'https://juventusny.com/registration', 'https://juventusny.com/international-travel-program'],
  officialLogoSourceUrl: JUVENTUS_ACADEMY_NY_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-juventus-academy-ny-home-juventusny-com/a47c3e4f-64ab-42a8-9dec-9707144b4995/002-logo_candidate-5bb27345-cd73-4367-a4f1-f2cd249e3f7d.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Juventus Academy New York white panorama candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party white Juventus Academy New York logo was centered on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Juventus Academy New York Spring 2027 European Soccer Experience', reason: 'The stored home teaser links to an UNCHECKED detail page and contains a date line that conflicts with its weekday; no EVENT candidate is inferred.' },
    { title: 'Juventus Academy New York programs and registration', reason: 'Program, registration, booking, winter-tournament, international-travel, and facility pages are UNCHECKED.' },
    { title: 'Juventus Academy New York teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
  ],
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => { const chunks: Buffer[] = []; stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks))); });

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Juventus Academy New York logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) { try { const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket }); if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined }; } catch { /* recreate missing local object */ } }
  if (!stored) stored = await storage.putObject({ data, originalName: 'juventus-academy-new-york-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'juventus-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'juventus-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Juventus Academy New York', location: 'New York, NY', address: null, description: JUVENTUS_ACADEMY_NY_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: JUVENTUS_ACADEMY_NY_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Juventus Academy New York', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: JUVENTUS_ACADEMY_NY_HOME_URL, listUrl: JUVENTUS_ACADEMY_NY_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Juventus Academy New York package with one ongoing CLUB profile; unchecked program, registration, travel, tournament, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: JUVENTUS_ACADEMY_NY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Juventus Academy New York homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: JUVENTUS_ACADEMY_NY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Juventus Academy New York homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: JUVENTUS_ACADEMY_NY_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-juventus-academy-new-york-affiliate-source] failed', error); process.exitCode = 1; });
