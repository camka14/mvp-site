/** Operator-approved setup for the John McEnroe Tennis Academy stored-intake club package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { JMTA_HOME_URL, JMTA_LOGO_SOURCE_URL, JMTA_MAPPING, JMTA_ORG_DESCRIPTION, JMTA_SOURCE_EVIDENCE, JMTA_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/johnMcEnroeTennisAcademySource';

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
const ORG_ID = 'affiliate_org_john_mcenroe_tennis_academy';
const SOURCE_ID = 'affiliate_source_john_mcenroe_tennis_academy';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-john-mcenroe-tennis-academy-johnmcenroetennisacademy-com';
const MAPPING_ID = 'affiliate_mapping_john_mcenroe_tennis_academy_v1';
const LOGO_FILE_ID = 'affiliate_file_john_mcenroe_tennis_academy_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/johnMcEnroeTennisAcademyLogo.png');

const sourceMetadata = {
  sourceEvidence: JMTA_SOURCE_EVIDENCE,
  inspectedAt: JMTA_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.johnmcenroetennisacademy.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored JMTA homepage is ALLOWED. Camp, event, tournament, location, staff, and registration detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [JMTA_HOME_URL],
  officialActionUrls: [JMTA_HOME_URL, 'https://www.johnmcenroetennisacademy.com/explore/jmtacamp', 'https://www.sportimecamps.com/jmta', 'https://www.johnmcenroetennisacademy.com/JMTA/Locations', 'https://www.sportimeny.com/content/competition'],
  officialLogoSourceUrl: JMTA_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-john-mcenroe-tennis-academy-johnmcenroetennisacademy-com/23385d65-e76d-4630-8eb7-902ff9088f99/004-logo_candidate-450673b9-63cd-4cc3-b341-1b1d0ed4bebc.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party JMTA logo candidate 004',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party JMTA logo was normalized locally to an opaque 1024px square PNG on a dark background.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'JMTA summer training camps', reason: 'The stored homepage links to camp registration, but the camp detail page is UNCHECKED and no complete current dated row is captured.' },
    { title: 'JMTA locations, tournaments, and events', reason: 'Location, event, tournament, staff, and registration pages are UNCHECKED; no additional EVENT, RENTAL, or TEAM candidate is inferred.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('JMTA logo must be opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: any = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch {}
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'john-mcenroe-tennis-academy-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'john-mcenroe-tennis-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'john-mcenroe-tennis-academy-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'John McEnroe Tennis Academy (JMTA)', location: 'New York, NY', address: null, description: JMTA_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: JMTA_HOME_URL, sports: ['Tennis'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'John McEnroe Tennis Academy (JMTA)', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: JMTA_HOME_URL, listUrl: JMTA_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake JMTA club package with one ongoing CLUB profile; unchecked camp, event, tournament, and location rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: JMTA_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored JMTA homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: JMTA_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored JMTA homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: JMTA_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-john-mcenroe-tennis-academy-affiliate-source] failed', error); process.exitCode = 1; });
