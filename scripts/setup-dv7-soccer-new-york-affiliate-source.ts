/** Local-only setup for the DV7 Soccer Academy New York stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { DV7_SOCCER_NEW_YORK_HOME_URL, DV7_SOCCER_NEW_YORK_LISTING_URL, DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL, DV7_SOCCER_NEW_YORK_MAPPING, DV7_SOCCER_NEW_YORK_ORG_DESCRIPTION, DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE, DV7_SOCCER_NEW_YORK_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/dv7SoccerNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_dv7_soccer_academy_new_york';
const SOURCE_ID = 'affiliate_source_dv7_soccer_academy_new_york';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-new-york-dv7soccer-com';
const MAPPING_ID = 'affiliate_mapping_dv7_soccer_academy_new_york_v1';
const LOGO_FILE_ID = 'affiliate_file_dv7_soccer_academy_new_york_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/dv7SoccerNewYorkLogo.png');

const sourceMetadata = {
  sourceEvidence: DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.dv7soccer.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored DV7 New York academy listing is ALLOWED. Programs, summer camps, tryouts, LeagueApps registration, and exact locations are UNCHECKED and remain withheld.',
  reviewedUrls: [DV7_SOCCER_NEW_YORK_LISTING_URL],
  officialActionUrls: [DV7_SOCCER_NEW_YORK_LISTING_URL, 'https://www.dv7soccer.com/programs', 'https://www.dv7soccer.com/summercamps', 'https://www.dv7soccer.com/tryouts', 'https://forms.gle/TB8iiBUUGQoA1TYw8', 'https://forms.gle/ZTk3ifHNPrcLNfZq9'],
  officialLogoSourceUrl: DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-new-york-dv7soccer-com/4e4a2825-adf0-4df5-b3a3-dde76d8a6b55/002-logo_candidate-b3d02e72-dda4-45a2-8e78-35bac06e84bc.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party DV7 Academy crest candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party DV7 Academy crest was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'DV7 New York summer camps', reason: 'The allowed listing date ranges are June 22-August 28, July 6-July 30, or a stale 2025/2026 school-out season; current detail and registration pages are UNCHECKED and no stale EVENT is emitted.' },
    { title: 'DV7 New York tryouts and registrations', reason: 'Tryout forms and LeagueApps registration pages are UNCHECKED; no detailed price, exact venue, or registration candidate is inferred.' },
    { title: 'DV7 New York teams', reason: 'TEAM mappings are out of scope for this intake; only the CLUB profile is emitted.' },
  ],
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => new Promise((resolve, reject) => { const chunks: Buffer[] = []; stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(chunks))); });

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('DV7 New York logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) { try { const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket }); if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined }; } catch { /* recreate missing local object */ } }
  if (!stored) stored = await storage.putObject({ data, originalName: 'dv7-soccer-academy-new-york-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'dv7-soccer-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'dv7-soccer-academy-new-york-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'DV7 Soccer Academy New York', location: 'New York, NY', address: null, description: DV7_SOCCER_NEW_YORK_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: DV7_SOCCER_NEW_YORK_HOME_URL, sports: ['Soccer'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'DV7 Soccer Academy New York', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: DV7_SOCCER_NEW_YORK_HOME_URL, listUrl: DV7_SOCCER_NEW_YORK_LISTING_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake DV7 New York package with one ongoing CLUB profile for 2026/2027 academy programming; camp, tryout, registration, and TEAM rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: DV7_SOCCER_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed DV7 New York academy listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: DV7_SOCCER_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed DV7 New York academy listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: DV7_SOCCER_NEW_YORK_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-dv7-soccer-new-york-affiliate-source] failed', error); process.exitCode = 1; });
