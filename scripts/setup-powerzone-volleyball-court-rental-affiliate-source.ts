/** Operator-approved setup for the PowerZone Volleyball Court Rental stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  POWERZONE_COURT_RENTAL_URL,
  POWERZONE_HOME_URL,
  POWERZONE_LOGO_SOURCE_URL,
  POWERZONE_MAPPING,
  POWERZONE_OFFICIAL_URLS,
  POWERZONE_ORG_DESCRIPTION,
  POWERZONE_PICKLEBALL_RENTAL_URL,
  POWERZONE_SOURCE_EVIDENCE,
  POWERZONE_STATIC_PAGE_CLIENT,
  POWERZONE_VOLLEYBALL_BOOKING_URL,
} from '../src/server/affiliateImports/powerzoneVolleyballCourtRentalSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_powerzone_volleyball';
const SOURCE_ID = 'affiliate_source_powerzone_volleyball_court_rental';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-court-rental-powerzonevb-com';
const MAPPING_ID = 'affiliate_mapping_powerzone_volleyball_court_rental_v1';

const sourceMetadata = {
  sourceEvidence: POWERZONE_SOURCE_EVIDENCE,
  inspectedAt: POWERZONE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.powerzonevb.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored PowerZone Court Rental page is ALLOWED. Homepage, booking, pickleball, rules, tournament, and other detail pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [POWERZONE_COURT_RENTAL_URL],
  officialActionUrls: POWERZONE_OFFICIAL_URLS,
  officialLogoSourceUrl: POWERZONE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-court-rental-powerzonevb-com/413e1a7b-678f-4a2b-bcd9-a4f8669c6832/002-logo_candidate-98489838-874a-4536-9113-dabbf33b10bc.png',
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored favicon-level PowerZone branding only; no suitable organization logo established',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored branding evidence contains only a favicon-level PowerZone mark; no logo file is assigned pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Current volleyball court availability and booking details', reason: 'The volleyball booking page is UNCHECKED; no current availability, price, reservation date, or package is inferred.' },
    { title: 'PowerZone pickleball rental inventory and facility details', reason: 'The pickleball and other detail pages are UNCHECKED; the stored page supports only a limited-schedule link-out.' },
  ],
  officialOutboundNotes: {
    courtRental: POWERZONE_COURT_RENTAL_URL,
    home: POWERZONE_HOME_URL,
    volleyballBooking: POWERZONE_VOLLEYBALL_BOOKING_URL,
    pickleballRental: POWERZONE_PICKLEBALL_RENTAL_URL,
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
      name: 'PowerZone Volleyball',
      location: 'Long Island, NY',
      address: null,
      description: POWERZONE_ORG_DESCRIPTION,
      logoId: null,
      ownerId: owner.id,
      website: POWERZONE_HOME_URL,
      sports: ['Volleyball', 'Pickleball'],
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
      name: 'PowerZone Volleyball Court Rental',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: POWERZONE_HOME_URL,
      listUrl: POWERZONE_COURT_RENTAL_URL,
      targetKind: 'RENTAL',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake PowerZone Volleyball CLUB and RENTAL package; current availability, limited-schedule pickleball details, and favicon-only branding remain withheld or manual-review.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: POWERZONE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping with a PowerZone Volleyball facility CLUB profile from the stored Court Rental page.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: POWERZONE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping with a PowerZone Volleyball facility CLUB profile from the stored Court Rental page.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: POWERZONE_STATIC_PAGE_CLIENT });
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

main().catch((error) => { console.error('[setup-powerzone-volleyball-court-rental-affiliate-source] failed', error); process.exitCode = 1; });
