/** Operator-approved setup for The Program NYC stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  THE_PROGRAM_NYC_ADULT_MEMBERSHIP_URL,
  THE_PROGRAM_NYC_HOME_URL,
  THE_PROGRAM_NYC_LOGO_SOURCE_URL,
  THE_PROGRAM_NYC_MAPPING,
  THE_PROGRAM_NYC_MEMBERSHIP_URL,
  THE_PROGRAM_NYC_ORG_DESCRIPTION,
  THE_PROGRAM_NYC_RENTALS_URL,
  THE_PROGRAM_NYC_SOURCE_EVIDENCE,
  THE_PROGRAM_NYC_STATIC_PAGE_CLIENT,
  THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL,
} from '../src/server/affiliateImports/theProgramNycSource';

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
const ORG_ID = 'affiliate_org_the_program_nyc';
const SOURCE_ID = 'affiliate_source_the_program_nyc';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-the-program-nyc-theprogramnyc-com';
const MAPPING_ID = 'affiliate_mapping_the_program_nyc_v1';
const LOGO_FILE_ID = 'affiliate_file_the_program_nyc_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/theProgramNycLogo.png');

const sourceMetadata = {
  sourceEvidence: THE_PROGRAM_NYC_SOURCE_EVIDENCE,
  inspectedAt: THE_PROGRAM_NYC_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.theprogramnyc.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored The Program NYC homepage is ALLOWED. Membership, schedule, historical-program, team, and rental pages are UNCHECKED and remain withheld.',
  reviewedUrls: [THE_PROGRAM_NYC_HOME_URL],
  officialActionUrls: [THE_PROGRAM_NYC_HOME_URL, THE_PROGRAM_NYC_MEMBERSHIP_URL, THE_PROGRAM_NYC_YOUTH_MEMBERSHIP_URL, THE_PROGRAM_NYC_ADULT_MEMBERSHIP_URL, 'https://www.theprogramnyc.com/private-training', THE_PROGRAM_NYC_RENTALS_URL],
  officialLogoSourceUrl: THE_PROGRAM_NYC_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-the-program-nyc-theprogramnyc-com/45af2e4a-4e00-4145-b22d-41f96770cf79/002-logo_candidate-43b68219-47b0-4e6f-b93a-17f5f17529ee.svg',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party The Program NYC colored logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111111',
  logoNote: 'The stored first-party The Program NYC SVG logo was rendered and centered on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'The Program NYC membership and class details', reason: 'The linked membership, private-training, and schedule pages are UNCHECKED.' },
    { title: 'The Program NYC rentals', reason: 'The homepage links to rental paths, but both rental pages are UNCHECKED; no RENTAL candidate is created.' },
    { title: 'Historical programs, clinics, and teams', reason: 'Historical program pages and the team page are UNCHECKED; no current EVENT or TEAM candidate is created.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('The Program NYC logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'the-program-nyc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'the-program-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'the-program-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'The Program NYC', location: 'Greenpoint, Brooklyn, NY', address: null, description: THE_PROGRAM_NYC_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: THE_PROGRAM_NYC_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'The Program NYC', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: THE_PROGRAM_NYC_HOME_URL, listUrl: THE_PROGRAM_NYC_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake The Program NYC CLUB package with one ongoing Greenpoint basketball facility profile. Membership, schedule, rental, historical-program, and team pages are unchecked, so no EVENT, RENTAL, or TEAM candidate is created.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: THE_PROGRAM_NYC_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed The Program NYC homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: THE_PROGRAM_NYC_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed The Program NYC homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: THE_PROGRAM_NYC_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-the-program-nyc-affiliate-source] failed', error); process.exitCode = 1; });
