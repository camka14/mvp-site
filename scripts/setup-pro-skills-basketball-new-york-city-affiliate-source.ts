/** Operator-approved setup for the Pro Skills Basketball New York City stored-intake club package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PRO_SKILLS_NYC_HOME_URL,
  PRO_SKILLS_NYC_LOGO_SOURCE_URL,
  PRO_SKILLS_NYC_MAPPING,
  PRO_SKILLS_NYC_ORG_DESCRIPTION,
  PRO_SKILLS_NYC_REGISTER_URL,
  PRO_SKILLS_NYC_SOURCE_EVIDENCE,
  PRO_SKILLS_NYC_STATIC_PAGE_CLIENT,
  PRO_SKILLS_NYC_TEAMS_URL,
} from '../src/server/affiliateImports/proSkillsBasketballNewYorkCitySource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_pro_skills_basketball_new_york_city';
const SOURCE_ID = 'affiliate_source_pro_skills_basketball_new_york_city';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-new-york-city-club-teams-proskillsbasketball-com';
const MAPPING_ID = 'affiliate_mapping_pro_skills_basketball_new_york_city_v1';
const LOGO_FILE_ID = 'affiliate_file_pro_skills_basketball_new_york_city_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/proSkillsBasketballNewYorkCityLogo.png');

const sourceMetadata = {
  sourceEvidence: PRO_SKILLS_NYC_SOURCE_EVIDENCE,
  inspectedAt: PRO_SKILLS_NYC_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://proskillsbasketball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Pro Skills Basketball NYC teams page is ALLOWED. City-directory, registration, location, camp, and clinic pages are UNCHECKED and remain withheld.',
  reviewedUrls: [PRO_SKILLS_NYC_TEAMS_URL],
  officialActionUrls: [PRO_SKILLS_NYC_HOME_URL, PRO_SKILLS_NYC_TEAMS_URL, PRO_SKILLS_NYC_REGISTER_URL],
  officialLogoSourceUrl: PRO_SKILLS_NYC_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-new-york-city-club-teams-proskillsbasketball-com/167ecacd-32c0-472f-98d0-8915ef69667f/002-logo_candidate-a7794b1b-8776-4192-93f2-f5a21682e5a6.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Pro Skills Basketball page-branding/logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#111827',
  logoNote: 'The stored first-party Pro Skills Basketball crest was centered and flattened onto a dark opaque 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Pro Skills Basketball NYC tryouts', reason: 'The stored listing mixes many city catalogs and does not expose a complete current NYC date, time, venue, price, and registration row; the registration and city-detail pages are UNCHECKED.' },
    { title: 'Pro Skills Basketball NYC camps and clinics', reason: 'The stored camps and clinics pages are UNCHECKED and are not part of the captured NYC team listing.' },
    { title: 'Pro Skills Basketball NYC teams', reason: 'Team and roster mappings are out of scope.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Pro Skills Basketball logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'pro-skills-basketball-nyc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'pro-skills-basketball-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'pro-skills-basketball-nyc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const organization = { updatedAt: new Date(), name: 'Pro Skills Basketball New York City', location: 'New York, NY', address: null, description: PRO_SKILLS_NYC_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: PRO_SKILLS_NYC_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Pro Skills Basketball New York City', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: PRO_SKILLS_NYC_HOME_URL, listUrl: PRO_SKILLS_NYC_TEAMS_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Pro Skills Basketball NYC club package with one ongoing CLUB profile; mixed-city tryout rows and unchecked detail pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: PRO_SKILLS_NYC_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Pro Skills Basketball NYC evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: PRO_SKILLS_NYC_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Pro Skills Basketball NYC evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: PRO_SKILLS_NYC_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-pro-skills-basketball-new-york-city-affiliate-source] failed', error); process.exitCode = 1; });
