/** Local-only setup for the 516 Elite Volleyball stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FIVE_ONE_SIX_ELITE_ABOUT_URL,
  FIVE_ONE_SIX_ELITE_BEACH_URL,
  FIVE_ONE_SIX_ELITE_CLUB_INFO_URL,
  FIVE_ONE_SIX_ELITE_CONTACT_URL,
  FIVE_ONE_SIX_ELITE_FACEBOOK_URL,
  FIVE_ONE_SIX_ELITE_HOME_URL,
  FIVE_ONE_SIX_ELITE_INSTAGRAM_URL,
  FIVE_ONE_SIX_ELITE_LOGO_SOURCE_URL,
  FIVE_ONE_SIX_ELITE_MAPPING,
  FIVE_ONE_SIX_ELITE_OFFICIAL_URLS,
  FIVE_ONE_SIX_ELITE_ORG_DESCRIPTION,
  FIVE_ONE_SIX_ELITE_PAYMENT_URL,
  FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE,
  FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT,
  FIVE_ONE_SIX_ELITE_SUMMER_URL,
  FIVE_ONE_SIX_ELITE_TIKTOK_URL,
  FIVE_ONE_SIX_ELITE_TRYOUTS_URL,
} from '../src/server/affiliateImports/fiveOneSixEliteVolleyballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_five_one_six_elite_volleyball';
const SOURCE_ID = 'affiliate_source_five_one_six_elite_volleyball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-516-elite-volleyball-home-516elitevolleyball-com';
const MAPPING_ID = 'affiliate_mapping_five_one_six_elite_volleyball_v1';
const LOGO_FILE_ID = 'affiliate_file_five_one_six_elite_volleyball_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/fiveOneSixEliteVolleyballLogo.png');

const sourceMetadata = {
  sourceEvidence: FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE,
  inspectedAt: FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.516elitevolleyball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored 516 Elite Volleyball homepage is ALLOWED. Team, tryout, summer, clinic, schedule, product, and contact pages are UNCHECKED and remain withheld or outbound-only.',
  reviewedUrls: [FIVE_ONE_SIX_ELITE_HOME_URL],
  officialActionUrls: FIVE_ONE_SIX_ELITE_OFFICIAL_URLS,
  officialLogoSourceUrl: FIVE_ONE_SIX_ELITE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-516-elite-volleyball-home-516elitevolleyball-com/c2f32c8b-b7e5-4e78-b45c-ff4f903d7e08/002-logo_candidate-df186e76-3612-4fde-a622-eaceff1eb475.jpg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party FiveOneSix Elite Volleyball homepage Open Graph logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party FiveOneSix Elite Volleyball wordmark was normalized to an opaque 1024px square PNG on white without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '516 Elite team rows', reason: 'Team pages are UNCHECKED and TEAM mappings are out of scope; no team candidate is created.' },
    { title: '516 Elite tryout and summer-program rows', reason: 'The homepage provides registration-open statements but no complete current dated rows; tryout and summer pages are UNCHECKED.' },
    { title: '516 Elite rental rows', reason: 'No rental inventory is present in the allowed homepage evidence.' },
  ],
  officialOutboundNotes: {
    home: FIVE_ONE_SIX_ELITE_HOME_URL,
    clubInfo: FIVE_ONE_SIX_ELITE_CLUB_INFO_URL,
    tryouts: FIVE_ONE_SIX_ELITE_TRYOUTS_URL,
    summer: FIVE_ONE_SIX_ELITE_SUMMER_URL,
    about: FIVE_ONE_SIX_ELITE_ABOUT_URL,
    beach: FIVE_ONE_SIX_ELITE_BEACH_URL,
    contact: FIVE_ONE_SIX_ELITE_CONTACT_URL,
    payment: FIVE_ONE_SIX_ELITE_PAYMENT_URL,
    instagram: FIVE_ONE_SIX_ELITE_INSTAGRAM_URL,
    facebook: FIVE_ONE_SIX_ELITE_FACEBOOK_URL,
    tiktok: FIVE_ONE_SIX_ELITE_TIKTOK_URL,
  },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('516 Elite Volleyball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'five-one-six-elite-volleyball-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-one-six-elite-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'five-one-six-elite-volleyball-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: '516 Elite Volleyball', location: 'Nassau County, NY', address: null, description: FIVE_ONE_SIX_ELITE_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: FIVE_ONE_SIX_ELITE_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: '516 Elite Volleyball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: FIVE_ONE_SIX_ELITE_HOME_URL, listUrl: FIVE_ONE_SIX_ELITE_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake 516 Elite Volleyball CLUB package; unchecked team, tryout, summer, schedule, fee, product, and contact pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: FIVE_ONE_SIX_ELITE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed 516 Elite Volleyball homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: FIVE_ONE_SIX_ELITE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed 516 Elite Volleyball homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-five-one-six-elite-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
