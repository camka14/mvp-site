/** Local-only setup for the Impact Youth League NYC stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, IMPACT_YOUTH_LEAGUE_NYC_LOGO_SOURCE_URL, IMPACT_YOUTH_LEAGUE_NYC_MAPPING, IMPACT_YOUTH_LEAGUE_NYC_ORG_DESCRIPTION, IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL, IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE, IMPACT_YOUTH_LEAGUE_NYC_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/impactYouthLeagueNycSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_impact_youth_league_nyc';
const SOURCE_ID = 'affiliate_source_impact_youth_league_nyc';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-impact-youth-league-impactyouthleaguenyc-com';
const MAPPING_ID = 'affiliate_mapping_impact_youth_league_nyc_v1';
const LOGO_FILE_ID = 'affiliate_file_impact_youth_league_nyc_logo';
const LOGO_SOURCE_PATH = path.join(process.cwd(), 'output/affiliate-intakes/new-york-new-york-metropolitan-area-impact-youth-league-impactyouthleaguenyc-com/3deaec93-6e7e-4350-afc4-02b33dc0d25e/002-logo_candidate-8eb8c4e9-6119-424c-bf12-790863928d37.jpg');
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/impactYouthLeagueNycLogo.png');

const sourceMetadata = {
  sourceEvidence: IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE,
  inspectedAt: IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.impactyouthleaguenyc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Impact Youth League NYC homepage is ALLOWED. Schedule, registration, contact, team, tournament, and event-detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [IMPACT_YOUTH_LEAGUE_NYC_HOME_URL],
  officialActionUrls: [IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL, 'https://www.impactyouthleaguenyc.com/3v3registration', 'https://www.impactyouthleaguenyc.com/payment-request-page'],
  officialLogoSourceUrl: IMPACT_YOUTH_LEAGUE_NYC_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-impact-youth-league-impactyouthleaguenyc-com/3deaec93-6e7e-4350-afc4-02b33dc0d25e/002-logo_candidate-8eb8c4e9-6119-424c-bf12-790863928d37.jpg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Impact Youth League NYC wordmark candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party Impact wordmark was centered on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Impact Youth League NYC June 2026 clinics and summer league', reason: 'The stored allowed homepage dates were past as of 2026-07-31; no stale EVENT candidate is emitted.' },
    { title: 'Impact Youth League NYC schedule, registration, tournament, and event details', reason: 'The stored detail and listing pages are UNCHECKED.' },
    { title: 'Impact Youth League NYC teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
  ],
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => { const chunks: Buffer[] = []; stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks))); });

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Impact Youth League NYC logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) { try { const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket }); if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined }; } catch { /* recreate missing local object */ } }
  if (!stored) stored = await storage.putObject({ data, originalName: 'impact-youth-league-nyc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'impact-youth-league-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'impact-youth-league-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Impact Youth League NYC', location: 'New York, NY', address: 'W 118th Street and Morningside Avenue, New York, NY 10027', description: IMPACT_YOUTH_LEAGUE_NYC_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, sports: ['Basketball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Impact Youth League NYC', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, listUrl: IMPACT_YOUTH_LEAGUE_NYC_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Impact Youth League NYC package with one ongoing CLUB profile; dated summer rows and unchecked schedule, registration, tournament, event, and team pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: IMPACT_YOUTH_LEAGUE_NYC_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Impact Youth League NYC homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: IMPACT_YOUTH_LEAGUE_NYC_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Impact Youth League NYC homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: IMPACT_YOUTH_LEAGUE_NYC_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-impact-youth-league-nyc-affiliate-source] failed', error); process.exitCode = 1; });
