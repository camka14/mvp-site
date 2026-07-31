/** Local-only setup for the Prospect Park Tennis Center stored-intake rental package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL,
  PROSPECT_PARK_TENNIS_CENTER_MAPPING,
  PROSPECT_PARK_TENNIS_CENTER_ORG_DESCRIPTION,
  PROSPECT_PARK_TENNIS_CENTER_SIGNUP_URL,
  PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE,
  PROSPECT_PARK_TENNIS_CENTER_STATIC_PAGE_CLIENT,
  PROSPECT_PARK_TENNIS_CENTER_URL,
} from '../src/server/affiliateImports/prospectParkTennisCenterSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_prospect_park_tennis_center';
const SOURCE_ID = 'affiliate_source_prospect_park_tennis_center';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-prospect-park-tennis-center-prospectpark-org';
const MAPPING_ID = 'affiliate_mapping_prospect_park_tennis_center_v1';

const sourceMetadata = {
  sourceEvidence: PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE,
  inspectedAt: PROSPECT_PARK_TENNIS_CENTER_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.prospectpark.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Prospect Park Tennis Center listing is ALLOWED. Booking, permit, league, class, lesson, youth-program, and tournament detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [PROSPECT_PARK_TENNIS_CENTER_URL],
  officialActionUrls: [PROSPECT_PARK_TENNIS_CENTER_URL, PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL, PROSPECT_PARK_TENNIS_CENTER_SIGNUP_URL, 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/tennis-permits'],
  officialLogoSourceUrl: 'https://www.prospectpark.org/wp-content/uploads/2022/01/PPA_LOGO_BLK.jpg',
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-prospect-park-tennis-center-prospectpark-org/15694515-9357-4bad-b801-c2d2c9c0203c/002-logo_candidate-bd0d7a3c-8cda-4189-a48a-1af3ea1a81d9.jpg',
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored Prospect Park Alliance umbrella logo candidate; Tennis Center-specific mark not established',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored official logo candidates identify Prospect Park Alliance rather than a clearly Tennis Center-specific mark, so no logo file is assigned pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Tennis league, class, lesson, youth, junior, and tournament rows', reason: 'The allowed listing links to these pages, but each detail page is UNCHECKED and no complete current booking row is captured.' },
    { title: 'Live court availability and price', sourceUrl: PROSPECT_PARK_TENNIS_CENTER_BOOKING_URL, reason: 'The stored listing only says courts can be booked one week in advance; live availability and public pricing remain in the unchecked booking flow.' },
    { title: 'Outdoor tennis permit details', sourceUrl: 'https://www.prospectpark.org/visit-the-park/places-to-go/tennis-center/tennis-permits', reason: 'The permit detail page is UNCHECKED.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Prospect Park Tennis Center', location: 'Brooklyn, NY', address: null, description: PROSPECT_PARK_TENNIS_CENTER_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: PROSPECT_PARK_TENNIS_CENTER_URL, sports: ['Tennis'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Prospect Park Tennis Center', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: PROSPECT_PARK_TENNIS_CENTER_URL, listUrl: PROSPECT_PARK_TENNIS_CENTER_URL, targetKind: 'RENTAL', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake Prospect Park Tennis Center rental package with one ongoing RENTAL link-out; live availability, pricing, address, and unchecked program rows remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: PROSPECT_PARK_TENNIS_CENTER_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only RENTAL mapping from stored Prospect Park Tennis Center evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: PROSPECT_PARK_TENNIS_CENTER_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only RENTAL mapping from stored Prospect Park Tennis Center evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: PROSPECT_PARK_TENNIS_CENTER_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-prospect-park-tennis-center-affiliate-source] failed', error); process.exitCode = 1; });
