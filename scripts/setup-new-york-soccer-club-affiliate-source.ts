/** Local-only setup for the New York Soccer Club stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEW_YORK_SOCCER_CLUB_ABOUT_URL,
  NEW_YORK_SOCCER_CLUB_ADDRESS,
  NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
  NEW_YORK_SOCCER_CLUB_FACILITIES_URL,
  NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  NEW_YORK_SOCCER_CLUB_HOME_URL,
  NEW_YORK_SOCCER_CLUB_LOGO_SOURCE_URL,
  NEW_YORK_SOCCER_CLUB_MAPPING,
  NEW_YORK_SOCCER_CLUB_ORG_DESCRIPTION,
  NEW_YORK_SOCCER_CLUB_PROGRAMS_URL,
  NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE,
  NEW_YORK_SOCCER_CLUB_STATIC_PAGE_CLIENT,
  NEW_YORK_SOCCER_CLUB_TRYOUTS_URL,
} from '../src/server/affiliateImports/newYorkSoccerClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_new_york_soccer_club';
const SOURCE_ID = 'affiliate_source_new_york_soccer_club';
const SOURCE_KEY = 'new-york-soccer-club';
const MAPPING_ID = 'affiliate_mapping_new_york_soccer_club_v1';
const ORGANIZATION_NAME = 'New York Soccer Club';
const LOGO_FILE_ID = 'affiliate_file_new_york_soccer_club_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkSoccerClubLogo.png');

const sourceMetadata = {
  sourceEvidence: NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE,
  inspectedAt: NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://newyorksoccerclub.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the captured official pages ALLOWED; additional listing and registration paths remain evidence-scoped and are not blindly fetched.',
  reviewedUrls: [
    NEW_YORK_SOCCER_CLUB_HOME_URL,
    NEW_YORK_SOCCER_CLUB_ABOUT_URL,
    NEW_YORK_SOCCER_CLUB_FACILITIES_URL,
    NEW_YORK_SOCCER_CLUB_PROGRAMS_URL,
    NEW_YORK_SOCCER_CLUB_TRYOUTS_URL,
    NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
    NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  ],
  officialActionUrls: [
    NEW_YORK_SOCCER_CLUB_HOME_URL,
    NEW_YORK_SOCCER_CLUB_PROGRAMS_URL,
    NEW_YORK_SOCCER_CLUB_TRYOUTS_URL,
    NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
    NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  ],
  officialLogoSourceUrl: NEW_YORK_SOCCER_CLUB_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official New York Soccer Club page branding logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party 3D NYSC crest was normalized to an opaque white 1024px PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Directors Camp', reason: 'The stored July 20-30, 2026 dates are past as of the July 31, 2026 review.' },
    { title: 'Additional 2026 camps and programs', sourceUrl: NEW_YORK_SOCCER_CLUB_PROGRAMS_URL, reason: 'The listing capture provides partial date or program context but not a complete current detail row with all required fields; rows are withheld rather than completed from inference.' },
    { title: 'Tryouts and roster/team rows', sourceUrl: NEW_YORK_SOCCER_CLUB_TRYOUTS_URL, reason: 'The stored evidence does not provide a complete current tryout row or stable roster-level registration target for a safe import, and TEAM mappings are out of scope.' },
    { title: 'Facility rentals', sourceUrl: NEW_YORK_SOCCER_CLUB_FACILITIES_URL, reason: 'The facilities page lists fields and addresses but no official rental booking action, so no RENTAL candidate is created.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('New York Soccer Club logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-soccer-club-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-soccer-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-soccer-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = {
      updatedAt: new Date(),
      name: ORGANIZATION_NAME,
      location: 'Westchester County, NY, USA',
      address: NEW_YORK_SOCCER_CLUB_ADDRESS,
      description: NEW_YORK_SOCCER_CLUB_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: NEW_YORK_SOCCER_CLUB_HOME_URL,
      sports: ['Soccer'],
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: NEW_YORK_SOCCER_CLUB_HOME_URL,
      listUrl: NEW_YORK_SOCCER_CLUB_PROGRAMS_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake New York Soccer Club mixed EVENT/CLUB package; incomplete, past, undated, and TEAM-only rows are withheld and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEW_YORK_SOCCER_CLUB_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only mixed EVENT/CLUB mapping from stored New York Soccer Club evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NEW_YORK_SOCCER_CLUB_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only mixed EVENT/CLUB mapping from stored New York Soccer Club evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEW_YORK_SOCCER_CLUB_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-soccer-club-affiliate-source] failed', error); process.exitCode = 1; });
