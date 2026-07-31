/** Local-only setup for the Columbia Summer Tennis Camp stored-intake package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING,
  COLUMBIA_SUMMER_TENNIS_CAMP_OFFICIAL_URLS,
  COLUMBIA_SUMMER_TENNIS_CAMP_ORG_DESCRIPTION,
  COLUMBIA_SUMMER_TENNIS_CAMP_REGISTRATION_URL,
  COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE,
  COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT,
} from '../src/server/affiliateImports/columbiaSummerTennisCampSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_columbia_summer_tennis_camp';
const SOURCE_ID = 'affiliate_source_columbia_summer_tennis_camp';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-columbia-summer-tennis-camp-home-columbiasummertenniscamp-com';
const MAPPING_ID = 'affiliate_mapping_columbia_summer_tennis_camp_v1';

// This source only stored a favicon-level candidate. It is preserved as provenance and kept out of the organization record.
const sourceMetadata = {
  sourceEvidence: COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE,
  inspectedAt: COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.columbiasummertenniscamp.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Columbia homepage is ALLOWED. Product and detail pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL],
  officialActionUrls: COLUMBIA_SUMMER_TENNIS_CAMP_OFFICIAL_URLS,
  officialLogoSourceUrl: COLUMBIA_SUMMER_TENNIS_CAMP_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-columbia-summer-tennis-camp-home-columbiasummertenniscamp-com/4d3281db-e6ff-4ad5-b674-2e45e153abac/002-logo_candidate-available-in-branding-artifact.jpg',
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored favicon-level candidate only',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored evidence contains only a favicon-level candidate; no normalized organization logo is assigned.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Registration products and daily camp schedules', reason: 'The linked Blume, Google Form, and product/detail pages are UNCHECKED; no product inventory or daily hours is inferred.' },
  ],
  officialOutboundNotes: {
    home: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
    registration: COLUMBIA_SUMMER_TENNIS_CAMP_REGISTRATION_URL,
    form: COLUMBIA_SUMMER_TENNIS_CAMP_OFFICIAL_URLS[2],
    instagram: COLUMBIA_SUMMER_TENNIS_CAMP_OFFICIAL_URLS[3],
  },
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);

    const organization = {
      updatedAt: new Date(),
      name: 'Columbia Summer Tennis Camp',
      location: 'New York, NY',
      address: '603 W 218th Street, New York, NY 10034',
      description: COLUMBIA_SUMMER_TENNIS_CAMP_ORG_DESCRIPTION,
      logoId: null,
      ownerId: owner.id,
      website: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
      sports: ['Tennis'],
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({
      where: { id: ORG_ID },
      create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization },
      update: organization,
    });

    const source = {
      name: 'Columbia Summer Tennis Camp',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
      listUrl: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake Columbia Summer Tennis Camp CLUB and ongoing EVENT package; unchecked registration products and favicon-only branding remain outbound-only or manual-review.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping with manual CLUB and ongoing EVENT candidates from the stored Columbia homepage.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping with manual CLUB and ongoing EVENT candidates from the stored Columbia homepage.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);

    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT });
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

main().catch((error) => { console.error('[setup-columbia-summer-tennis-camp-affiliate-source] failed', error); process.exitCode = 1; });
