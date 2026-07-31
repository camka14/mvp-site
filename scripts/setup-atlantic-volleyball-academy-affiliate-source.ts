/** Local-only setup for the Atlantic Volleyball Academy stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ATLANTIC_VOLLEYBALL_ABOUT_URL,
  ATLANTIC_VOLLEYBALL_ADULT_CLINIC_URL,
  ATLANTIC_VOLLEYBALL_CONTACT_URL,
  ATLANTIC_VOLLEYBALL_FACILITIES_URL,
  ATLANTIC_VOLLEYBALL_FACEBOOK_URL,
  ATLANTIC_VOLLEYBALL_FALL_CLINICS_URL,
  ATLANTIC_VOLLEYBALL_HOME_URL,
  ATLANTIC_VOLLEYBALL_INSTAGRAM_URL,
  ATLANTIC_VOLLEYBALL_LOGO_SOURCE_URL,
  ATLANTIC_VOLLEYBALL_MAPPING,
  ATLANTIC_VOLLEYBALL_NEWS_URL,
  ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION,
  ATLANTIC_VOLLEYBALL_PROGRAMS_URL,
  ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE,
  ATLANTIC_VOLLEYBALL_SPRING_CLINICS_URL,
  ATLANTIC_VOLLEYBALL_STATIC_PAGE_CLIENT,
  ATLANTIC_VOLLEYBALL_STORE_URL,
  ATLANTIC_VOLLEYBALL_TEAMS_URL,
  ATLANTIC_VOLLEYBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/atlanticVolleyballAcademySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_atlantic_volleyball_academy';
const SOURCE_ID = 'affiliate_source_atlantic_volleyball_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-atlantic-volleyball-academy-atlanticvba-com';
const MAPPING_ID = 'affiliate_mapping_atlantic_volleyball_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_atlantic_volleyball_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/atlanticVolleyballAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: ATLANTIC_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://atlanticvba.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Atlantic Volleyball Academy homepage is ALLOWED. Linked teams, programs, clinic, facility, tryout, and detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [ATLANTIC_VOLLEYBALL_HOME_URL],
  officialActionUrls: [ATLANTIC_VOLLEYBALL_HOME_URL, ATLANTIC_VOLLEYBALL_TEAMS_URL, ATLANTIC_VOLLEYBALL_ABOUT_URL, ATLANTIC_VOLLEYBALL_PROGRAMS_URL, ATLANTIC_VOLLEYBALL_FACILITIES_URL, ATLANTIC_VOLLEYBALL_TRYOUTS_URL, ATLANTIC_VOLLEYBALL_SPRING_CLINICS_URL, ATLANTIC_VOLLEYBALL_FALL_CLINICS_URL, ATLANTIC_VOLLEYBALL_ADULT_CLINIC_URL, ATLANTIC_VOLLEYBALL_NEWS_URL, ATLANTIC_VOLLEYBALL_CONTACT_URL, ATLANTIC_VOLLEYBALL_STORE_URL, ATLANTIC_VOLLEYBALL_INSTAGRAM_URL, ATLANTIC_VOLLEYBALL_FACEBOOK_URL],
  officialLogoSourceUrl: ATLANTIC_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-atlantic-volleyball-academy-atlanticvba-com/7dc35ec8-2aa4-4d55-b505-312d53c5b0f0/002-logo_candidate-a2607179-b59f-46a2-92ac-3de087208a32.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Atlantic Volleyball Academy AVA logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party AVA logo was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Atlantic Volleyball Academy teams', reason: 'The stored homepage exposes a 2026 Teams link, but TEAM mappings are out of scope.' },
    { title: 'Atlantic Volleyball Academy clinics and tryouts', reason: 'The stored linked listing and registration pages are UNCHECKED and do not supply complete captured current dated rows.' },
    { title: 'Atlantic Volleyball Academy facilities and rentals', reason: 'The stored facilities page is UNCHECKED; no rental inventory is inferred from the homepage link.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Atlantic Volleyball Academy logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'atlantic-volleyball-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'atlantic-volleyball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'atlantic-volleyball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Atlantic Volleyball Academy', location: 'Long Island, NY', address: null, description: ATLANTIC_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ATLANTIC_VOLLEYBALL_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Atlantic Volleyball Academy', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ATLANTIC_VOLLEYBALL_HOME_URL, listUrl: ATLANTIC_VOLLEYBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Atlantic Volleyball Academy CLUB package with one ongoing Long Island profile. Linked teams, programs, clinic, facility, tryout, and detail pages are unchecked, so no EVENT, RENTAL, or TEAM candidate is created.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ATLANTIC_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Atlantic Volleyball Academy homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ATLANTIC_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Atlantic Volleyball Academy homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ATLANTIC_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-atlantic-volleyball-academy-affiliate-source] failed', error); process.exitCode = 1; });
