/** Operator-approved setup for The NYC Volleyball Club stored-intake club package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  THE_NYC_VOLLEYBALL_BOYS_URL,
  THE_NYC_VOLLEYBALL_FACILITY_URL,
  THE_NYC_VOLLEYBALL_GIRLS_URL,
  THE_NYC_VOLLEYBALL_HOME_URL,
  THE_NYC_VOLLEYBALL_LEAGUEAPPS_TRYOUT_URL,
  THE_NYC_VOLLEYBALL_LOGO_SOURCE_URL,
  THE_NYC_VOLLEYBALL_MAPPING,
  THE_NYC_VOLLEYBALL_ORG_DESCRIPTION,
  THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE,
  THE_NYC_VOLLEYBALL_STATIC_PAGE_CLIENT,
  THE_NYC_VOLLEYBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/theNycVolleyballClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_the_nyc_volleyball_club';
const SOURCE_ID = 'affiliate_source_the_nyc_volleyball_club';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-the-nyc-volleyball-club-home-page-thenycvolleyball-com';
const MAPPING_ID = 'affiliate_mapping_the_nyc_volleyball_club_v1';
const LOGO_FILE_ID = 'affiliate_file_the_nyc_volleyball_club_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/theNycVolleyballClubLogo.png');

const sourceMetadata = {
  sourceEvidence: THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: THE_NYC_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://thenycvolleyball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored The NYC Volleyball homepage is ALLOWED. Boys, girls, facility, tryout, clinic, and registration pages are UNCHECKED and remain withheld.',
  reviewedUrls: [THE_NYC_VOLLEYBALL_HOME_URL],
  officialActionUrls: [THE_NYC_VOLLEYBALL_HOME_URL, THE_NYC_VOLLEYBALL_TRYOUTS_URL, THE_NYC_VOLLEYBALL_BOYS_URL, THE_NYC_VOLLEYBALL_GIRLS_URL, THE_NYC_VOLLEYBALL_FACILITY_URL, THE_NYC_VOLLEYBALL_LEAGUEAPPS_TRYOUT_URL],
  officialLogoSourceUrl: THE_NYC_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-the-nyc-volleyball-club-home-page-thenycvolleyball-com/4a511404-6f98-4d1f-9ffa-b06f2c40008c/003-logo_candidate-22b0a970-fd2f-44d6-8a42-380de1a0c44b.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party The NYC Volleyball page-branding/logo candidate 003',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party white TheNYCVolleyball logo was flattened onto a dark opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'The NYC Volleyball boys and girls programs', reason: 'The stored homepage links to the boys and girls pages, but those detail pages are UNCHECKED and no complete current schedule, price, or registration rows are captured.' },
    { title: 'The NYC Volleyball tryouts and clinics', reason: 'The stored homepage links to tryout, clinic, and LeagueApps registration pages, but their detail pages are UNCHECKED; the captured 2025-26 LeagueApps label is not emitted as a current dated event.' },
    { title: 'The NYC Volleyball facility address', reason: 'The allowed homepage identifies Fordham in the Bronx but does not expose a complete street address; the facility page is UNCHECKED.' },
    { title: 'The NYC Volleyball teams', reason: 'TEAM mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('The NYC Volleyball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'the-nyc-volleyball-club-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'the-nyc-volleyball-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'the-nyc-volleyball-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'The NYC Volleyball Club', location: 'Bronx, NY', address: null, description: THE_NYC_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: THE_NYC_VOLLEYBALL_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'The NYC Volleyball Club', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: THE_NYC_VOLLEYBALL_HOME_URL, listUrl: THE_NYC_VOLLEYBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake The NYC Volleyball Club package with one ongoing CLUB profile; unchecked program, registration, facility, and team rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: THE_NYC_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored The NYC Volleyball evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: THE_NYC_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored The NYC Volleyball evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: THE_NYC_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-the-nyc-volleyball-club-affiliate-source] failed', error); process.exitCode = 1; });
