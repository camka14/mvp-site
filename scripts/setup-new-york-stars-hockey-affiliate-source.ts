/** Operator-approved setup for the New York Stars Hockey stored-intake CLUB package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEW_YORK_STARS_HOCKEY_ABOUT_URL,
  NEW_YORK_STARS_HOCKEY_CONTACT_URL,
  NEW_YORK_STARS_HOCKEY_HOME_URL,
  NEW_YORK_STARS_HOCKEY_HOUSE_LEAGUE_URL,
  NEW_YORK_STARS_HOCKEY_INSTAGRAM_URL,
  NEW_YORK_STARS_HOCKEY_LOGO_SOURCE_URL,
  NEW_YORK_STARS_HOCKEY_MAPPING,
  NEW_YORK_STARS_HOCKEY_OFFICIAL_URLS,
  NEW_YORK_STARS_HOCKEY_ORG_DESCRIPTION,
  NEW_YORK_STARS_HOCKEY_REGISTRATION_URL,
  NEW_YORK_STARS_HOCKEY_SCHEDULE_URL,
  NEW_YORK_STARS_HOCKEY_SKILLS_URL,
  NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE,
  NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/newYorkStarsHockeySource';

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
const ORG_ID = 'affiliate_org_new_york_stars_hockey';
const SOURCE_ID = 'affiliate_source_new_york_stars_hockey';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-new-york-stars-hockey-newyorkstarshockey-com';
const MAPPING_ID = 'affiliate_mapping_new_york_stars_hockey_v1';
const LOGO_FILE_ID = 'affiliate_file_new_york_stars_hockey_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkStarsHockeyLogo.png');

const sourceMetadata = {
  sourceEvidence: NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE,
  inspectedAt: NEW_YORK_STARS_HOCKEY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.newyorkstarshockey.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored New York Stars Hockey homepage is ALLOWED. Registration, schedule, team, league, program, news, and policy pages are UNCHECKED and remain withheld or outbound-only.',
  reviewedUrls: [NEW_YORK_STARS_HOCKEY_HOME_URL],
  officialActionUrls: NEW_YORK_STARS_HOCKEY_OFFICIAL_URLS,
  officialLogoSourceUrl: NEW_YORK_STARS_HOCKEY_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-new-york-stars-hockey-newyorkstarshockey-com/ca50c6ed-3af7-4a7d-8edc-fef2ff064774/003-logo_candidate-297cc820-be0d-4477-b26c-6150493db972.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party New York Stars Hockey homepage Open Graph logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Stars mark was normalized to an opaque 1024px square PNG on white without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'New York Stars 14U schedule rows', reason: 'The allowed homepage displays 8/29 and 8/30 rows without a year; no year is inferred.' },
    { title: 'New York Stars teams and league programs', reason: 'Team, league, registration, schedule, and program pages are UNCHECKED; TEAM mappings are out of scope.' },
    { title: 'New York Stars rental rows', reason: 'No rental inventory is present in the allowed homepage evidence.' },
  ],
  officialOutboundNotes: {
    home: NEW_YORK_STARS_HOCKEY_HOME_URL,
    registration: NEW_YORK_STARS_HOCKEY_REGISTRATION_URL,
    skills: NEW_YORK_STARS_HOCKEY_SKILLS_URL,
    houseLeague: NEW_YORK_STARS_HOCKEY_HOUSE_LEAGUE_URL,
    about: NEW_YORK_STARS_HOCKEY_ABOUT_URL,
    contact: NEW_YORK_STARS_HOCKEY_CONTACT_URL,
    schedule: NEW_YORK_STARS_HOCKEY_SCHEDULE_URL,
    instagram: NEW_YORK_STARS_HOCKEY_INSTAGRAM_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('New York Stars Hockey logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-stars-hockey-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-stars-hockey-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-stars-hockey-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'New York Stars Hockey', location: 'Brooklyn, NY', address: null, description: NEW_YORK_STARS_HOCKEY_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NEW_YORK_STARS_HOCKEY_HOME_URL, sports: ['Ice Hockey'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'New York Stars Hockey', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NEW_YORK_STARS_HOCKEY_HOME_URL, listUrl: NEW_YORK_STARS_HOCKEY_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake New York Stars Hockey CLUB package; yearless schedule rows and unchecked registration, team, league, and program pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEW_YORK_STARS_HOCKEY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed New York Stars Hockey homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NEW_YORK_STARS_HOCKEY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed New York Stars Hockey homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEW_YORK_STARS_HOCKEY_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-stars-hockey-affiliate-source] failed', error); process.exitCode = 1; });
