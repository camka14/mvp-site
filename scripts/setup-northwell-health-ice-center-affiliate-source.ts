/** Operator-approved setup for the Northwell Health Ice Center stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NORTHWELL_ICE_CENTER_ADULT_LEAGUE_URL,
  NORTHWELL_ICE_CENTER_CLINICS_URL,
  NORTHWELL_ICE_CENTER_GIRLS_ELITE_URL,
  NORTHWELL_ICE_CENTER_HOCKEY_URL,
  NORTHWELL_ICE_CENTER_HOME_URL,
  NORTHWELL_ICE_CENTER_HOUSE_PROGRAMS_URL,
  NORTHWELL_ICE_CENTER_LOGO_SOURCE_URL,
  NORTHWELL_ICE_CENTER_MAPPING,
  NORTHWELL_ICE_CENTER_OFFICIAL_URLS,
  NORTHWELL_ICE_CENTER_ORG_DESCRIPTION,
  NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE,
  NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/northwellHealthIceCenterSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_northwell_health_ice_center';
const SOURCE_ID = 'affiliate_source_northwell_health_ice_center';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-hockey-northwellhealthicecenter-com';
const MAPPING_ID = 'affiliate_mapping_northwell_health_ice_center_v1';
const LOGO_FILE_ID = 'affiliate_file_northwell_health_ice_center_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/northwellHealthIceCenterLogo.png');

const sourceMetadata = {
  sourceEvidence: NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE,
  inspectedAt: NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://northwellhealthicecenter.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Northwell Health Ice Center Hockey page is ALLOWED. Homepage, girls elite, house programs, adult league, and clinics pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NORTHWELL_ICE_CENTER_HOCKEY_URL],
  officialActionUrls: NORTHWELL_ICE_CENTER_OFFICIAL_URLS,
  officialLogoSourceUrl: NORTHWELL_ICE_CENTER_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-hockey-northwellhealthicecenter-com/e263e77d-93a1-437d-90a3-78f138c4d5be/002-logo_candidate-7c1e3bbb-3a5a-417b-b458-da5daba728f9.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Northwell Health Ice Center Hockey page logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#132c48',
  logoNote: 'The stored first-party white Northwell Health Ice Center mark was placed on an opaque dark 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Northwell youth, girls elite, adult league, and clinic rows', reason: 'The linked program pages are UNCHECKED and the allowed page has no complete current dated rows.' },
    { title: 'Northwell rental inventory', reason: 'No rental page or rental row is present in the stored allowed evidence.' },
  ],
  officialOutboundNotes: {
    hockey: NORTHWELL_ICE_CENTER_HOCKEY_URL,
    girlsElite: NORTHWELL_ICE_CENTER_GIRLS_ELITE_URL,
    housePrograms: NORTHWELL_ICE_CENTER_HOUSE_PROGRAMS_URL,
    adultLeague: NORTHWELL_ICE_CENTER_ADULT_LEAGUE_URL,
    clinics: NORTHWELL_ICE_CENTER_CLINICS_URL,
    home: NORTHWELL_ICE_CENTER_HOME_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Northwell Health Ice Center logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'northwell-health-ice-center-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'northwell-health-ice-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'northwell-health-ice-center-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'Northwell Health Ice Center', location: 'Long Island, NY', address: null, description: NORTHWELL_ICE_CENTER_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NORTHWELL_ICE_CENTER_HOME_URL, sports: ['Ice Hockey'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Northwell Health Ice Center Hockey', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NORTHWELL_ICE_CENTER_HOME_URL, listUrl: NORTHWELL_ICE_CENTER_HOCKEY_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Northwell Health Ice Center CLUB package; unchecked program pages and undated inventory remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NORTHWELL_ICE_CENTER_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Northwell Health Ice Center Hockey page.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NORTHWELL_ICE_CENTER_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Northwell Health Ice Center Hockey page.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-northwell-health-ice-center-affiliate-source] failed', error); process.exitCode = 1; });
