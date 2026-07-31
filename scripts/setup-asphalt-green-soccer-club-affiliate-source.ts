/**
 * Local-only setup for the Asphalt Green Soccer Club intake package.
 *
 * The stored intake contains a policy-allowed homepage and a review-ready
 * club profile, but no captured program detail pages or recognizable official
 * club logo. This script intentionally keeps the source disabled and the
 * organization private until independent review resolves those gaps.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  ASPHALT_GREEN_HOME_URL,
  ASPHALT_GREEN_MAPPING,
  ASPHALT_GREEN_ORG_DESCRIPTION,
  ASPHALT_GREEN_SOURCE_EVIDENCE,
  ASPHALT_GREEN_STATIC_PAGE_CLIENT,
  ASPHALT_GREEN_TRYOUTS_URL,
} from '../src/server/affiliateImports/asphaltGreenSoccerClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_asphalt_green_soccer_club';
const SOURCE_ID = 'affiliate_source_asphalt_green_soccer_club';
const SOURCE_KEY = 'asphalt-green-soccer-club';
const MAPPING_ID = 'affiliate_mapping_asphalt_green_soccer_club_v1';
const ORGANIZATION_NAME = 'Asphalt Green Soccer Club';

const sourceMetadata = {
  sourceEvidence: ASPHALT_GREEN_SOURCE_EVIDENCE,
  inspectedAt: ASPHALT_GREEN_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.agsoccerclub.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots artifact allows the public homepage and blocks only lightbox, selected bot, and Wix internal paths. This package uses only the homepage.',
  reviewedUrls: [ASPHALT_GREEN_HOME_URL],
  logoDisposition: 'MANUAL_REVIEW',
  logoStatus: 'MANUAL_REVIEW',
  logoNote: 'Stored logo candidates are third-party Adidas, EDP, USYS, NAL, and WPSL marks; no identifiable Asphalt Green Soccer Club mark is assigned.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { sourceUrl: ASPHALT_GREEN_TRYOUTS_URL, reason: 'The URL was discovered but its detail content was not captured in the stored intake run.' },
    { reason: 'All program and registration detail URLs remain withheld until their own policy-checked intake evidence exists.' },
  ],
};

const loadAppModules = async () => ({
  prisma: (await import('../src/lib/prisma')).prisma,
  runAffiliateSourceScrape: (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape,
});

const requireOwner = async (prisma: any) => {
  const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  return owner;
};

const upsertOrganization = async (prisma: any, ownerId: string) => {
  const data = {
    updatedAt: new Date(),
    name: ORGANIZATION_NAME,
    location: 'New York City, NY',
    address: null,
    description: ASPHALT_GREEN_ORG_DESCRIPTION,
    logoId: null,
    ownerId,
    website: ASPHALT_GREEN_HOME_URL,
    sports: ['Soccer'],
    status: 'UNLISTED',
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
      baseUrl: ASPHALT_GREEN_HOME_URL,
      listUrl: ASPHALT_GREEN_HOME_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Homepage-backed review-only club source; detail pages and official logo require human follow-up.',
      metadata: sourceMetadata,
    },
    update: {
      name: ORGANIZATION_NAME,
      organizationId: ORG_ID,
      baseUrl: ASPHALT_GREEN_HOME_URL,
      listUrl: ASPHALT_GREEN_HOME_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Homepage-backed review-only club source; detail pages and official logo require human follow-up.',
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
      mapping: ASPHALT_GREEN_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Homepage-only Asphalt Green Soccer Club mapping from live intake evidence; human validation required.',
      validatedAt: null,
    },
    update: {
      version: 1,
      isActive: true,
      mapping: ASPHALT_GREEN_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Homepage-only Asphalt Green Soccer Club mapping from live intake evidence; human validation required.',
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
    const owner = await requireOwner(prisma);
    await upsertOrganization(prisma, owner.id);
    await upsertSourceAndMapping(prisma);
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, {
        importMode: 'REVIEW',
        client: ASPHALT_GREEN_STATIC_PAGE_CLIENT,
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
  console.error('[setup-asphalt-green-soccer-club-affiliate-source] failed', error);
  process.exitCode = 1;
});
