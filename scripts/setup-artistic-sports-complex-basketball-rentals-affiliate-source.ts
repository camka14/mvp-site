/** Operator-approved setup for the Artistic Sports Complex stored-intake rental package. */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { ARTISTIC_SPORTS_COMPLEX_ADDRESS, ARTISTIC_SPORTS_COMPLEX_CITY, ARTISTIC_SPORTS_COMPLEX_HOME_URL, ARTISTIC_SPORTS_COMPLEX_MAPPING, ARTISTIC_SPORTS_COMPLEX_ORG_DESCRIPTION, ARTISTIC_SPORTS_COMPLEX_RENTALS_URL, ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE, ARTISTIC_SPORTS_COMPLEX_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/artisticSportsComplexBasketballRentalsSource';

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
const ORG_ID = 'affiliate_org_artistic_sports_complex';
const SOURCE_ID = 'affiliate_source_artistic_sports_complex_basketball_rentals';
const SOURCE_KEY = 'artistic-sports-complex-basketball-rentals';
const MAPPING_ID = 'affiliate_mapping_artistic_sports_complex_basketball_rentals_v1';

const sourceMetadata = {
  sourceEvidence: ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE,
  inspectedAt: ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.artisticsportscomplex.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored basketball court-rentals page is ALLOWED; booking, clinic, and policy pages are UNCHECKED discovery evidence.',
  reviewedUrls: [ARTISTIC_SPORTS_COMPLEX_RENTALS_URL],
  officialActionUrls: [ARTISTIC_SPORTS_COMPLEX_RENTALS_URL, 'https://www.artisticsportscomplex.com/basketball_full_court_booking.php', 'https://www.artisticsportscomplex.com/basketball_half_court_booking.php', 'https://www.artisticsportscomplex.com/basketball_half_court_reduced_booking.php', 'https://www.artisticsportscomplex.com/basketball_open_court_booking.php'],
  officialLogoSourceUrl: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'No stored LOGO_CANDIDATE or page-branding logo was captured.',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'Manual review required because the stored intake contains no official logo candidate.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Basketball clinics and programs', reason: 'Clinic pages were discovered but not captured with complete current date, venue, price, and registration rows.' },
    { title: 'Baseball tunnel rentals', reason: 'The linked baseball rental page was not captured; no rental details are inferred.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Artistic Sports Complex', location: ARTISTIC_SPORTS_COMPLEX_CITY, address: ARTISTIC_SPORTS_COMPLEX_ADDRESS, description: ARTISTIC_SPORTS_COMPLEX_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: ARTISTIC_SPORTS_COMPLEX_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Artistic Sports Complex Basketball Rentals', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ARTISTIC_SPORTS_COMPLEX_HOME_URL, listUrl: ARTISTIC_SPORTS_COMPLEX_RENTALS_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake basketball rental package with exact public rates and booking paths; logo remains manual review.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ARTISTIC_SPORTS_COMPLEX_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored Artistic Sports Complex evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ARTISTIC_SPORTS_COMPLEX_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored Artistic Sports Complex evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ARTISTIC_SPORTS_COMPLEX_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode, priceText: candidate.priceText })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-artistic-sports-complex-basketball-rentals-affiliate-source] failed', error); process.exitCode = 1; });
