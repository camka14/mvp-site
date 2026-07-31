/** Operator-approved setup for the New York Crush SC stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NY_CRUSH_HOME_URL,
  NY_CRUSH_LOGO_SOURCE_URL,
  NY_CRUSH_MAPPING,
  NY_CRUSH_ORG_DESCRIPTION,
  NY_CRUSH_REGISTER_URL,
  NY_CRUSH_SOURCE_EVIDENCE,
  NY_CRUSH_STATIC_PAGE_CLIENT,
  NY_CRUSH_TRYOUTS_FAQ_URL,
} from '../src/server/affiliateImports/nyCrushSoccerClubSource';

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
const ORG_ID = 'affiliate_org_new_york_crush_sc';
const SOURCE_ID = 'affiliate_source_new_york_crush_sc';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-soccer-tryouts-for-ny-crush-soccer-club-nycramapovalleysc-com';
const MAPPING_ID = 'affiliate_mapping_new_york_crush_sc_v1';
const LOGO_FILE_ID = 'affiliate_file_new_york_crush_sc_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/nyCrushSoccerClubLogo.png');

const sourceMetadata = {
  sourceEvidence: NY_CRUSH_SOURCE_EVIDENCE,
  inspectedAt: NY_CRUSH_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://nycramapovalleysc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NY Crush SC tryout FAQ is ALLOWED. Home, mission, program, field, team, tournament, and registration pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NY_CRUSH_TRYOUTS_FAQ_URL],
  officialActionUrls: [NY_CRUSH_HOME_URL, NY_CRUSH_TRYOUTS_FAQ_URL, NY_CRUSH_REGISTER_URL, 'https://nycramapovalleysc.com/club/mission', 'https://nycramapovalleysc.com/programs', 'https://nycramapovalleysc.com/teams', 'https://nycramapovalleysc.com/fields', 'https://nycramapovalleysc.com/tournament'],
  officialLogoSourceUrl: NY_CRUSH_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-soccer-tryouts-for-ny-crush-soccer-club-nycramapovalleysc-com/ede02847-b4be-4890-862f-a9611b81ee3d/002-logo_candidate-0dd0d985-99a7-4283-80ea-af498b87dd39.jpg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored JSON-LD New York Crush SC organization logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party New York Crush SC organization logo was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York Crush SC tryout dates, times, venues, and age groups', reason: 'The stored allowed FAQ describes the workflow but publishes none of those current facts.' },
    { title: 'New York Crush SC programs, teams, fields, and tournaments', reason: 'The stored linked pages are UNCHECKED; no EVENT, RENTAL, or TEAM candidate is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('New York Crush SC logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-crush-sc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-crush-sc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-crush-sc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'New York Crush SC', location: 'New York metropolitan area', address: null, description: NY_CRUSH_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NY_CRUSH_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'New York Crush SC', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NY_CRUSH_HOME_URL, listUrl: NY_CRUSH_TRYOUTS_FAQ_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake New York Crush SC CLUB package with one minimal review-only profile based on the allowed tryout FAQ and stored organization logo. Current dates, venues, programs, fields, teams, and tournament rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NY_CRUSH_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed New York Crush SC tryout FAQ.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NY_CRUSH_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed New York Crush SC tryout FAQ.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NY_CRUSH_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-ny-crush-soccer-club-affiliate-source] failed', error); process.exitCode = 1; });
