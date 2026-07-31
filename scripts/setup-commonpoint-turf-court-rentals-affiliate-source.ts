/** Operator-approved setup for the Commonpoint Turf and Court Rentals stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  COMMONPOINT_COURT_LOGIN_URL,
  COMMONPOINT_HOME_URL,
  COMMONPOINT_LOGO_SOURCE_URL,
  COMMONPOINT_OFFICIAL_URLS,
  COMMONPOINT_ORG_DESCRIPTION,
  COMMONPOINT_SOURCE_EVIDENCE,
  COMMONPOINT_STATIC_PAGE_CLIENT,
  COMMONPOINT_TURF_BOOKING_URL,
  COMMONPOINT_TURF_COURT_RENTALS_MAPPING,
  COMMONPOINT_TURF_COURT_RENTALS_URL,
} from '../src/server/affiliateImports/commonpointTurfCourtRentalsSource';

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
const ORG_ID = 'affiliate_org_commonpoint_tennis_athletic_center';
const SOURCE_ID = 'affiliate_source_commonpoint_turf_court_rentals';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-turf-and-court-rentals-commonpoint-org';
const MAPPING_ID = 'affiliate_mapping_commonpoint_turf_court_rentals_v1';
const LOGO_FILE_ID = 'affiliate_file_commonpoint_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/commonpointLogo.png');

const sourceMetadata = {
  sourceEvidence: COMMONPOINT_SOURCE_EVIDENCE,
  inspectedAt: COMMONPOINT_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.commonpoint.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored turf and court rental page is ALLOWED. The homepage, facility-rentals page, program details, and booking/account flows are UNCHECKED and remain outbound-only.',
  reviewedUrls: [COMMONPOINT_TURF_COURT_RENTALS_URL],
  officialActionUrls: COMMONPOINT_OFFICIAL_URLS,
  officialLogoSourceUrl: COMMONPOINT_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-turf-and-court-rentals-commonpoint-org/a98d6e90-498b-4b63-ab8f-e1edf473e9ef/004-logo_candidate-8cf41378-9910-4301-8237-5ea43201ec60.png',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Commonpoint logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored first-party Commonpoint logo was normalized locally to an opaque 1024px square PNG on white.',
  logoDisposition: 'OFFICIAL_ASSET',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Current rental availability', reason: 'CatchCorner and court-login flows are UNCHECKED; no live availability or reservation date is inferred.' },
    { title: 'Commonpoint programs and facility inventory beyond the stored listing', reason: 'Homepage, program, calendar, locations, and facility-rentals pages are UNCHECKED.' },
  ],
  officialOutboundNotes: {
    listing: COMMONPOINT_TURF_COURT_RENTALS_URL,
    home: COMMONPOINT_HOME_URL,
    courtLogin: COMMONPOINT_COURT_LOGIN_URL,
    turfBooking: COMMONPOINT_TURF_BOOKING_URL,
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Commonpoint logo must be opaque 1024x1024 PNG.');
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
  if (!stored) stored = await storage.putObject({ data, originalName: 'commonpoint-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'commonpoint-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() },
    update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'commonpoint-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() },
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
      name: 'Commonpoint Tennis and Athletic Center',
      location: 'Queens Village, NY',
      address: '79-20 Winchester Boulevard, Queens Village, NY 11427',
      description: COMMONPOINT_ORG_DESCRIPTION,
      logoId,
      ownerId: owner.id,
      website: COMMONPOINT_HOME_URL,
      sports: ['Tennis', 'Pickleball', 'Soccer'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({
      where: { id: ORG_ID },
      create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization },
      update: organization,
    });

    const source = {
      name: 'Commonpoint Turf and Court Rentals',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: COMMONPOINT_HOME_URL,
      listUrl: COMMONPOINT_TURF_COURT_RENTALS_URL,
      targetKind: 'RENTAL',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake Commonpoint Tennis and Athletic Center CLUB and RENTAL package; current availability and unchecked program inventory remain withheld.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: COMMONPOINT_TURF_COURT_RENTALS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping with a facility CLUB profile from the stored Commonpoint rental page.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: COMMONPOINT_TURF_COURT_RENTALS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping with a facility CLUB profile from the stored Commonpoint rental page.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: COMMONPOINT_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({
        runId: result.run.id,
        candidateCount: result.candidates.length,
        normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })),
        createdCandidateCount: logs?.createdCandidateCount ?? null,
        updatedCandidateCount: logs?.updatedCandidateCount ?? null,
        rejectedCount: logs?.rejectedCount ?? null,
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-commonpoint-turf-court-rentals-affiliate-source] failed', error); process.exitCode = 1; });
