/** Local-only setup for the New York Tennis Club stored-intake RENTAL package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEW_YORK_TENNIS_CLUB_ADDRESS,
  NEW_YORK_TENNIS_CLUB_BOOKING_URL,
  NEW_YORK_TENNIS_CLUB_CALENDAR_URL,
  NEW_YORK_TENNIS_CLUB_COURT_RATES_URL,
  NEW_YORK_TENNIS_CLUB_HOME_URL,
  NEW_YORK_TENNIS_CLUB_LOGO_SOURCE_URL,
  NEW_YORK_TENNIS_CLUB_MAPPING,
  NEW_YORK_TENNIS_CLUB_MEMBERSHIP_URL,
  NEW_YORK_TENNIS_CLUB_ORG_DESCRIPTION,
  NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE,
  NEW_YORK_TENNIS_CLUB_STATIC_PAGE_CLIENT,
  NEW_YORK_TENNIS_CLUB_URL,
} from '../src/server/affiliateImports/newYorkTennisClubRentalSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_new_york_tennis_club';
const SOURCE_ID = 'affiliate_source_new_york_tennis_club_rentals';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-new-york-tennis-club-advantagetennisclubs-com';
const MAPPING_ID = 'affiliate_mapping_new_york_tennis_club_rentals_v1';
const LOGO_FILE_ID = 'affiliate_file_new_york_tennis_club_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkTennisClubLogo.png');

const sourceMetadata = {
  sourceEvidence: NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE,
  inspectedAt: NEW_YORK_TENNIS_CLUB_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://advantagetennisclubs.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored New York Tennis Club listing is ALLOWED. Court booking, rates, calendar, program, camp, membership, tournament, and team pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NEW_YORK_TENNIS_CLUB_URL],
  officialActionUrls: [NEW_YORK_TENNIS_CLUB_HOME_URL, NEW_YORK_TENNIS_CLUB_URL, NEW_YORK_TENNIS_CLUB_BOOKING_URL, NEW_YORK_TENNIS_CLUB_COURT_RATES_URL, NEW_YORK_TENNIS_CLUB_CALENDAR_URL, NEW_YORK_TENNIS_CLUB_MEMBERSHIP_URL, 'https://advantagetennisclubs.com/adult-programs/', 'https://advantagetennisclubs.com/junior-programs/', 'https://advantagetennisclubs.com/tennis-camps/', 'https://advantagetennisclubs.com/junior-tournaments/', 'https://advantagetennisclubs.com/team/'],
  officialLogoSourceUrl: NEW_YORK_TENNIS_CLUB_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-new-york-tennis-club-advantagetennisclubs-com/a643a11c-a232-4359-bc27-04f54c4bd52b/002-logo_candidate-cefdd62f-253f-494a-b327-9879e4f1dc29.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Advantage Tennis Clubs organization logo candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Advantage Tennis Clubs wordmark was centered on an opaque white 1024px square PNG without changing the mark.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Live court availability and booking confirmation', reason: 'The official Book Courts page is UNCHECKED; live availability is not inferred.' },
    { title: 'Programs, camps, calendar, tournaments, and team rows', reason: 'The linked pages are UNCHECKED; no additional EVENT or TEAM candidates are emitted.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('New York Tennis Club logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'new-york-tennis-club-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-tennis-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'new-york-tennis-club-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
    const organization = { updatedAt: new Date(), name: 'New York Tennis Club', location: 'Bronx, NY', address: NEW_YORK_TENNIS_CLUB_ADDRESS, description: NEW_YORK_TENNIS_CLUB_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: NEW_YORK_TENNIS_CLUB_URL, sports: ['Tennis'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'New York Tennis Club Court Rentals', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NEW_YORK_TENNIS_CLUB_HOME_URL, listUrl: NEW_YORK_TENNIS_CLUB_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake New York Tennis Club RENTAL package with one court-time candidate. The listing provides 2025-2026 rate ranges, hours, six clay courts, Bronx address, and official booking URL; live availability and other program rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEW_YORK_TENNIS_CLUB_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from the stored allowed New York Tennis Club listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NEW_YORK_TENNIS_CLUB_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from the stored allowed New York Tennis Club listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEW_YORK_TENNIS_CLUB_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-tennis-club-rental-affiliate-source] failed', error); process.exitCode = 1; });
