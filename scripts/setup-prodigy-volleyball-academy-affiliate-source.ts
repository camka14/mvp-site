/** Local-only setup for the Prodigy Volleyball Academy stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PRODIGY_VOLLEYBALL_ADULT_PROGRAMS_URL,
  PRODIGY_VOLLEYBALL_CAMPS_URL,
  PRODIGY_VOLLEYBALL_CONTACT_URL,
  PRODIGY_VOLLEYBALL_FACEBOOK_URL,
  PRODIGY_VOLLEYBALL_HOME_URL,
  PRODIGY_VOLLEYBALL_INSTAGRAM_URL,
  PRODIGY_VOLLEYBALL_LOCATIONS_URL,
  PRODIGY_VOLLEYBALL_LOGO_SOURCE_URL,
  PRODIGY_VOLLEYBALL_MAPPING,
  PRODIGY_VOLLEYBALL_OFFICIAL_URLS,
  PRODIGY_VOLLEYBALL_ORG_DESCRIPTION,
  PRODIGY_VOLLEYBALL_PROGRAMS_URL,
  PRODIGY_VOLLEYBALL_SCHEDULE_URL,
  PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE,
  PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT,
  PRODIGY_VOLLEYBALL_SUMMER_URL,
  PRODIGY_VOLLEYBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/prodigyVolleyballAcademySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_prodigy_volleyball_academy';
const SOURCE_ID = 'affiliate_source_prodigy_volleyball_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-prodigy-volleyball-academy-prodigyvb-com';
const MAPPING_ID = 'affiliate_mapping_prodigy_volleyball_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_prodigy_volleyball_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/prodigyVolleyballAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: PRODIGY_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.prodigyvb.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Prodigy Volleyball Academy homepage is ALLOWED. Tryout, camp, schedule, practice, location, fee, program, and handbook pages are UNCHECKED and remain withheld or outbound-only.',
  reviewedUrls: [PRODIGY_VOLLEYBALL_HOME_URL],
  officialActionUrls: PRODIGY_VOLLEYBALL_OFFICIAL_URLS,
  officialLogoSourceUrl: PRODIGY_VOLLEYBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-prodigy-volleyball-academy-prodigyvb-com/08d32120-f818-4eb0-9c0f-3053964da7ad/003-logo_candidate-840d53b0-f94e-40e0-8d8f-14f0dacf805a.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Prodigy Volleyball Academy homepage Open Graph logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Prodigy Volleyball Academy wordmark was normalized to an opaque 1024px square PNG on white without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Prodigy tryout, camp, league, practice, tournament, and program rows', reason: 'The relevant pages are UNCHECKED and the allowed homepage has no complete current dated rows.' },
    { title: 'Prodigy location and season-fee rows', reason: 'Location and fee pages are UNCHECKED; no city, venue, address, or price is inferred.' },
    { title: 'Prodigy rental rows', reason: 'The stored handbook path is UNCHECKED and no rental inventory is present in the allowed homepage evidence.' },
  ],
  officialOutboundNotes: {
    home: PRODIGY_VOLLEYBALL_HOME_URL,
    summer: PRODIGY_VOLLEYBALL_SUMMER_URL,
    tryouts: PRODIGY_VOLLEYBALL_TRYOUTS_URL,
    programs: PRODIGY_VOLLEYBALL_PROGRAMS_URL,
    camps: PRODIGY_VOLLEYBALL_CAMPS_URL,
    schedule: PRODIGY_VOLLEYBALL_SCHEDULE_URL,
    locations: PRODIGY_VOLLEYBALL_LOCATIONS_URL,
    adultPrograms: PRODIGY_VOLLEYBALL_ADULT_PROGRAMS_URL,
    contact: PRODIGY_VOLLEYBALL_CONTACT_URL,
    facebook: PRODIGY_VOLLEYBALL_FACEBOOK_URL,
    instagram: PRODIGY_VOLLEYBALL_INSTAGRAM_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Prodigy Volleyball Academy logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'prodigy-volleyball-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'prodigy-volleyball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'prodigy-volleyball-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Prodigy Volleyball Academy', location: null, address: null, description: PRODIGY_VOLLEYBALL_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: PRODIGY_VOLLEYBALL_HOME_URL, sports: ['Volleyball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Prodigy Volleyball Academy', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: PRODIGY_VOLLEYBALL_HOME_URL, listUrl: PRODIGY_VOLLEYBALL_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Prodigy Volleyball Academy CLUB package; unchecked program, schedule, location, fee, and rental pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: PRODIGY_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Prodigy Volleyball Academy homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: PRODIGY_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Prodigy Volleyball Academy homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: PRODIGY_VOLLEYBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-prodigy-volleyball-academy-affiliate-source] failed', error); process.exitCode = 1; });
