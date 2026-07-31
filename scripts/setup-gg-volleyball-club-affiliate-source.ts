/** Local-only setup for the G&G Volleyball Club stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  GG_VOLLEYBALL_LOGO_SOURCE_URL,
  GG_VOLLEYBALL_MAPPING,
  GG_VOLLEYBALL_ORG_DESCRIPTION,
  GG_VOLLEYBALL_REGISTER_URL,
  GG_VOLLEYBALL_SOURCE_EVIDENCE,
  GG_VOLLEYBALL_STATIC_PAGE_CLIENT,
  GG_VOLLEYBALL_TRAVEL_TRYOUT_URL,
  GG_VOLLEYBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/ggVolleyballClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_gg_volleyball_club';
const SOURCE_ID = 'affiliate_source_gg_volleyball_club';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-tryouts-ggvolleyballclub-com';
const MAPPING_ID = 'affiliate_mapping_gg_volleyball_club_v1';
const LOGO_FILE_ID = 'affiliate_file_gg_volleyball_club_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/ggVolleyballClubLogo.png');

const sourceMetadata = {
  sourceEvidence: GG_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: GG_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.ggvolleyballclub.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored G&G Volleyball Club tryout/registration page is ALLOWED. No other page was captured for this intake.',
  reviewedUrls: [GG_VOLLEYBALL_TRYOUTS_URL],
  officialActionUrls: [GG_VOLLEYBALL_TRYOUTS_URL, GG_VOLLEYBALL_REGISTER_URL, GG_VOLLEYBALL_TRAVEL_TRYOUT_URL, 'https://form.jotform.com/251945412509458', 'https://ggvolleyball.sportngin.com/resources', 'https://ggvolleyball.sportngin.com/ggteams'],
  officialLogoSourceUrl: GG_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-tryouts-ggvolleyballclub-com/27f3e511-52b2-404a-89e7-e6f04f5c9dca/003-logo_candidate-d0115459-cceb-459e-8865-9c24273ad413.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party G&G Volleyball Club wordmark candidate 003',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#000000',
  logoNote: 'The stored first-party G&G Volleyball Club circular wordmark was centered on an opaque black 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Travel Team Tryout Session August rows', reason: 'The stored page lists August 11 and August 16 month/day references without a source year and with inconsistent session/age wording; no EVENT dates are inferred.' },
    { title: 'G&G Volleyball Club teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('G&G Volleyball Club logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'gg-volleyball-club-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'gg-volleyball-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'gg-volleyball-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'G&G Volleyball Club', location: 'Brooklyn, NY', address: '1625 Ocean Ave, Brooklyn, NY 11230', description: GG_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: GG_VOLLEYBALL_TRYOUTS_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'G&G Volleyball Club Tryouts', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: GG_VOLLEYBALL_TRYOUTS_URL, listUrl: GG_VOLLEYBALL_TRYOUTS_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake G&G Volleyball Club CLUB package with recurring single-practice tryout schedule, South Brooklyn venue/address, and official registration links. Month/day travel tryout rows lack a source year and remain withheld; TEAM output is out of scope.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: GG_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed G&G Volleyball Club tryout page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: GG_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed G&G Volleyball Club tryout page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: GG_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-gg-volleyball-club-affiliate-source] failed', error); process.exitCode = 1; });
