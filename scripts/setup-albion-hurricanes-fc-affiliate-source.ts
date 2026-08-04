/** Operator-approved setup for the Albion Hurricanes FC stored-intake package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ALBION_HURRICANES_HOME_URL,
  ALBION_HURRICANES_LOGO_SOURCE_URL,
  ALBION_HURRICANES_MANUAL_CANDIDATES,
  ALBION_HURRICANES_MAPPING,
  ALBION_HURRICANES_ORG_DESCRIPTION,
  ALBION_HURRICANES_REGISTRATION_URL,
  ALBION_HURRICANES_SOURCE_EVIDENCE,
  ALBION_HURRICANES_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/albionHurricanesFcSource';
import { normalizeAffiliateCoordinates } from '../src/server/affiliateImports/locationResolution';
import { resolveAddressToPlace } from '../src/server/geocoding';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) throw new Error('DATABASE_URL_LIVE is missing.');
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_albion_hurricanes_fc';
const SOURCE_ID = 'affiliate_source_albion_hurricanes_fc';
const SOURCE_KEY = 'albion-hurricanes-fc';
const MAPPING_ID = 'affiliate_mapping_albion_hurricanes_fc_v1';
const LOGO_FILE_ID = 'affiliate_file_albion_hurricanes_fc_logo';
const LOGO_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/albionHurricanesLogo.png');

const sourceMetadata = {
  sourceEvidence: ALBION_HURRICANES_SOURCE_EVIDENCE,
  inspectedAt: ALBION_HURRICANES_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: `${ALBION_HURRICANES_HOME_URL}robots.txt`,
  robotsAllowed: true,
  robotsNote: 'The stored Albion Hurricanes FC homepage is ALLOWED. Registration, tryout, camp, tournament, facility, and other detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [ALBION_HURRICANES_HOME_URL],
  officialActionUrls: [ALBION_HURRICANES_HOME_URL, ALBION_HURRICANES_REGISTRATION_URL],
  officialLogoSourceUrl: ALBION_HURRICANES_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/houston-texas-metropolitan-area-albion-hurricanes-fc-youth-soccer-club-in-houston-tx-albionhurricane/0486a3b6-7a79-4f15-afd2-7893e798cb78/002-logo_candidate-a3cb8b9c-2685-4124-8d58-1e3fc0a012d6.png',
  officialLogoCandidateSha256: '42d2425c34c34c36489059113f5dfb29b005b83e64b02a1065068e387d62be93',
  logoStatus: 'VERIFIED_OFFICIAL',
  logoSourceType: 'Stored first-party Albion Hurricanes FC crest page-branding candidate 002',
  logoNormalizedFormat: 'opaque-1024-square-png',
  logoBackground: '#ffffff',
  logoDisposition: 'OFFICIAL_ASSET',
  logoNote: 'The stored first-party AHFC crest was centered and flattened onto an opaque 1024px square PNG without changing the mark.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Albion Hurricanes FC 2026 Spring Season rows', reason: 'The stored spring-season remainder is past at review time and no current future dated row is captured on the allowed homepage.' },
    { title: 'Albion Hurricanes FC tryout, camp, tournament, and facility rows', reason: 'Those pages are UNCHECKED and remain withheld.' },
    { title: 'Albion Hurricanes FC exact facility addresses and availability', reason: 'The allowed homepage names multiple Greater Houston locations but publishes no canonical street address or current inventory.' },
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
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) throw new Error('Albion Hurricanes FC logo must be an opaque 1024x1024 PNG.');
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existing = await prisma.file.findUnique({ where: { id: LOGO_FILE_ID }, select: { path: true, bucket: true } });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existing?.path) {
    try {
      const object = await storage.getObjectStream({ key: existing.path, bucket: existing.bucket });
      if ((await streamToBuffer(object.stream)).equals(data)) stored = { key: existing.path, sizeBytes: data.length, bucket: existing.bucket ?? undefined };
    } catch {
      // Recreate a missing local object from the stored fixture.
    }
  }
  if (!stored) stored = await storage.putObject({ data, originalName: 'albion-hurricanes-fc-logo-square.png', contentType: 'image/png', organizationId: ORG_ID });
  await prisma.file.upsert({ where: { id: LOGO_FILE_ID }, create: { id: LOGO_FILE_ID, uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'albion-hurricanes-fc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, createdAt: new Date(), updatedAt: new Date() }, update: { uploaderId: ownerId, organizationId: ORG_ID, bucket: stored.bucket ?? null, originalName: 'albion-hurricanes-fc-logo-square.png', mimeType: 'image/png', sizeBytes: stored.sizeBytes, path: stored.key, updatedAt: new Date() } });
  return LOGO_FILE_ID;
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const logoId = await upsertLogo(prisma, owner.id);
    const existingOrganization = await prisma.organizations.findUnique({
      where: { id: ORG_ID },
      select: { coordinates: true },
    });
    const organizationCoordinates = normalizeAffiliateCoordinates(existingOrganization?.coordinates)
      ?? normalizeAffiliateCoordinates(
        (await resolveAddressToPlace('Albion Hurricanes FC, Houston, TX')).coordinates,
      )
      ?? normalizeAffiliateCoordinates((await resolveAddressToPlace('Houston, TX')).coordinates);
    if (!organizationCoordinates) {
      throw new Error('Albion Hurricanes FC requires valid Houston coordinates.');
    }
    const organization = { updatedAt: new Date(), name: 'Albion Hurricanes FC', location: 'Houston, TX', address: null, coordinates: organizationCoordinates, description: ALBION_HURRICANES_ORG_DESCRIPTION, logoId, ownerId: owner.id, website: ALBION_HURRICANES_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Albion Hurricanes FC', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ALBION_HURRICANES_HOME_URL, listUrl: ALBION_HURRICANES_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Albion Hurricanes FC package with one ongoing CLUB profile; past spring rows and unchecked tryout, camp, tournament, facility, and detail pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ALBION_HURRICANES_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored Albion Hurricanes FC evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ALBION_HURRICANES_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored Albion Hurricanes FC evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    console.log(`${ALBION_HURRICANES_MANUAL_CANDIDATES.length} ongoing club candidate configured; dated and unchecked rows withheld.`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ALBION_HURRICANES_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({
        where: {
          sourceId: SOURCE_ID,
          listingKind: 'CLUB',
          title: 'Albion Hurricanes FC',
        },
        data: {
          publishedOrganizationId: ORG_ID,
          city: 'Houston, TX',
          updatedAt: new Date(),
        },
      });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-albion-hurricanes-fc-affiliate-source] failed', error); process.exitCode = 1; });
