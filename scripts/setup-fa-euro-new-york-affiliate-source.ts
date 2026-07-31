/**
 * Operator-approved setup for the FA Euro New York stored-intake package.
 *
 * The package emits one review-only CLUB candidate from the stored official
 * tryouts page. Dated camp, registration, and tournament rows are withheld
 * when their evidence is stale, registration-only, or undated.
 */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  FA_EURO_NEW_YORK_HOME_URL,
  FA_EURO_NEW_YORK_LOGO_SOURCE_URL,
  FA_EURO_NEW_YORK_MAPPING,
  FA_EURO_NEW_YORK_ORG_DESCRIPTION,
  FA_EURO_NEW_YORK_SOURCE_EVIDENCE,
  FA_EURO_NEW_YORK_STATIC_PAGE_CLIENT,
  FA_EURO_NEW_YORK_TRYOUTS_URL,
} from '../src/server/affiliateImports/faEuroNewYorkSource';

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
const ORG_ID = 'affiliate_org_fa_euro_new_york';
const SOURCE_ID = 'affiliate_source_fa_euro_new_york';
const SOURCE_KEY = 'fa-euro-new-york';
const MAPPING_ID = 'affiliate_mapping_fa_euro_new_york_v1';
const ORGANIZATION_NAME = 'FA Euro New York';
const LOGO_FILE_ID = 'affiliate_file_fa_euro_new_york_logo';
const LOGO_FILE_NAME = 'fa-euro-new-york-logo-square.png';
const LOGO_PATH = path.join(
  process.cwd(),
  'src/server/affiliateImports/fixtures/faEuroNewYorkLogo.png',
);

const sourceMetadata = {
  sourceEvidence: FA_EURO_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: FA_EURO_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.faeuro.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots artifact reports allow: / for the captured official tryouts page.',
  reviewedUrls: [FA_EURO_NEW_YORK_HOME_URL, FA_EURO_NEW_YORK_TRYOUTS_URL],
  officialActionUrls: [
    FA_EURO_NEW_YORK_TRYOUTS_URL,
    'https://forms.wix.com/r/7325527419601813799',
    'https://www.faeuro.com/events/2026-27-season-registration',
    'https://www.faeuro.com/events/2026-nyc-cup-late-registration',
    'https://www.faeuro.com/events/summer-goalkeeper-camp-2026',
  ],
  officialLogoSourceUrl: FA_EURO_NEW_YORK_LOGO_SOURCE_URL,
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored official FA Euro New York page-branding/logo candidate',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoNote: 'The stored official FA Euro New York crest was trimmed and centered on an opaque white 1024px canvas without inventing or altering the mark.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    {
      title: 'Summer Goalkeeper Camp 2026',
      sourceUrl: 'https://www.faeuro.com/events/summer-goalkeeper-camp-2026',
      reason: 'The stored page lists July 27-29, 2026, which is past as of the July 31, 2026 review date.',
    },
    {
      title: '2026/27 Season Registration',
      sourceUrl: 'https://www.faeuro.com/events/2026-27-season-registration',
      reason: 'The captured row is a season registration surface, not a standalone event; it is withheld under the registration-page rule.',
    },
    {
      title: '2026 NYC Cup Late Registration',
      sourceUrl: 'https://www.faeuro.com/events/2026-nyc-cup-late-registration',
      reason: 'The stored row explicitly says date and time are TBD.',
    },
    {
      title: 'Team and roster rows',
      reason: 'TEAM mappings and affiliate teams are out of scope.',
    },
  ],
};

const loadAppModules = async () => ({
  prisma: (await import('../src/lib/prisma')).prisma,
  runAffiliateSourceScrape: (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape,
});

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const requireOwner = async (prisma: any) => {
  const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner.id;
};

const upsertLogo = async (prisma: any, ownerId: string) => {
  const data = await fs.readFile(LOGO_PATH);
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('FA Euro New York logo must be an opaque 1024x1024 PNG.');
  }
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existingFile = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existingFile?.path) {
    try {
      const existing = await storage.getObjectStream({ key: existingFile.path, bucket: existingFile.bucket });
      if ((await streamToBuffer(existing.stream)).equals(data)) {
        stored = { key: existingFile.path, sizeBytes: data.length, bucket: existingFile.bucket ?? undefined };
      }
    } catch {
      // Recreate missing local storage objects.
    }
  }
  if (!stored) {
    stored = await storage.putObject({ data, originalName: LOGO_FILE_NAME, contentType: 'image/png', organizationId: ORG_ID });
  }
  await prisma.file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return LOGO_FILE_ID;
};

const upsertOrganization = async (prisma: any, ownerId: string, logoId: string) => {
  const data = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'Brooklyn and Staten Island, NY',
    address: null,
    description: FA_EURO_NEW_YORK_ORG_DESCRIPTION,
    logoId,
    ownerId,
    website: FA_EURO_NEW_YORK_HOME_URL,
    sports: ['Soccer'],
    status: 'UNLISTED' as const,
    publicPageEnabled: false,
    publicWidgetsEnabled: false,
  };
  await prisma.organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      ...data,
    },
    update: data,
  });
};

const upsertSourceAndMapping = async (prisma: any) => {
  await prisma.affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: FA_EURO_NEW_YORK_HOME_URL,
      listUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake FA Euro New York club package; dated or incomplete event rows are withheld and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    },
    update: {
      name: ORGANIZATION_NAME,
      organizationId: ORG_ID,
      baseUrl: FA_EURO_NEW_YORK_HOME_URL,
      listUrl: FA_EURO_NEW_YORK_TRYOUTS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake FA Euro New York club package; dated or incomplete event rows are withheld and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    },
  });
  await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await prisma.affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping: FA_EURO_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Review-only CLUB mapping derived from stored FA Euro New York tryouts evidence; human validation required.',
      validatedAt: null,
    },
    update: {
      version: 1,
      isActive: true,
      mapping: FA_EURO_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Review-only CLUB mapping derived from stored FA Euro New York tryouts evidence; human validation required.',
      validatedAt: null,
    },
  });
  await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
};

const relinkCandidate = async (prisma: any) => {
  await prisma.affiliateImportCandidates.updateMany({
    where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME },
    data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() },
  });
};

const main = async () => {
  const { prisma, runAffiliateSourceScrape } = await loadAppModules();
  try {
    const ownerId = await requireOwner(prisma);
    const logoId = await upsertLogo(prisma, ownerId);
    await upsertOrganization(prisma, ownerId, logoId);
    await upsertSourceAndMapping(prisma);
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, {
        importMode: 'REVIEW',
        client: FA_EURO_NEW_YORK_STATIC_PAGE_CLIENT,
      });
      await relinkCandidate(prisma);
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({
        runId: result.run.id,
        candidateCount: result.candidates.length,
        normalizedCandidates: result.candidates.map((candidate: any) => ({
          listingKind: candidate.listingKind,
          title: candidate.title,
          officialActionUrl: candidate.officialActionUrl,
          dateDisplayMode: candidate.dateDisplayMode,
        })),
        createdCandidateCount: logs?.createdCandidateCount ?? null,
        updatedCandidateCount: logs?.updatedCandidateCount ?? null,
        rejectedCount: logs?.rejectedCount ?? null,
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error('[setup-fa-euro-new-york-affiliate-source] failed', error);
  process.exitCode = 1;
});
