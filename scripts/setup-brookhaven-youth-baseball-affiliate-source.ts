/** Operator-approved setup for the Brookhaven youth baseball stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  BROOKHAVEN_BASEBALL_LOGO_SOURCE_URL,
  BROOKHAVEN_BASEBALL_MAPPING,
  BROOKHAVEN_BASEBALL_OFFICIAL_URLS,
  BROOKHAVEN_BASEBALL_ORG_DESCRIPTION,
  BROOKHAVEN_BASEBALL_PAYMENTS_URL,
  BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE,
  BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT,
  BROOKHAVEN_BASEBALL_URL,
} from '../src/server/affiliateImports/brookhavenYouthBaseballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_brookhaven_youth_baseball';
const SOURCE_ID = 'affiliate_source_brookhaven_youth_baseball';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-baseball-brookhavenny-gov';
const MAPPING_ID = 'affiliate_mapping_brookhaven_youth_baseball_v1';

const sourceMetadata = {
  sourceEvidence: BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE,
  inspectedAt: BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.brookhavenny.gov/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Brookhaven Baseball page is ALLOWED. Payments, calendar, events, programs, parks, and other detail pages are UNCHECKED and remain withheld.',
  reviewedUrls: [BROOKHAVEN_BASEBALL_URL],
  officialActionUrls: BROOKHAVEN_BASEBALL_OFFICIAL_URLS,
  officialLogoSourceUrl: BROOKHAVEN_BASEBALL_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-baseball-brookhavenny-gov/f5831d83-9ba8-496f-ab9d-f1877a5608c8/002-page_branding-6cf4b43b-ce16-477d-b6a1-1dbc5854d0c3.json',
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored favicon-level Town of Brookhaven branding only; no suitable program logo established',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored branding evidence contains only a favicon-level Town of Brookhaven mark; no logo file is assigned pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'Brookhaven 2021 summer and fall leagues', reason: 'The stored detailed league section is explicitly labeled 2021 and is historical as of the review date.' },
    { title: 'Brookhaven tournament rows', reason: 'The stored tournament dates omit a year and are withheld rather than assigned to the current season.' },
    { title: 'Brookhaven current calendar, events, programs, payments, and registration', reason: 'The corresponding official pages are UNCHECKED.' },
  ],
  officialOutboundNotes: {
    baseball: BROOKHAVEN_BASEBALL_URL,
    payments: BROOKHAVEN_BASEBALL_PAYMENTS_URL,
    leagueLineup: 'http://www.leaguelineup.com/tobbaseball',
  },
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Town of Brookhaven Youth Baseball Program', location: 'Brookhaven, NY', address: null, description: BROOKHAVEN_BASEBALL_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: BROOKHAVEN_BASEBALL_URL, sports: ['Baseball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Town of Brookhaven Youth Baseball', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: 'https://www.brookhavenny.gov/', listUrl: BROOKHAVEN_BASEBALL_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake Brookhaven youth baseball CLUB package; historical 2021 and yearless rows, unchecked current pages, and favicon-only branding remain withheld or manual-review.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: BROOKHAVEN_BASEBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored Brookhaven Baseball page; stale and yearless dated rows are withheld.', validatedAt: null }, update: { version: 1, isActive: true, mapping: BROOKHAVEN_BASEBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored Brookhaven Baseball page; stale and yearless dated rows are withheld.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-brookhaven-youth-baseball-affiliate-source] failed', error); process.exitCode = 1; });
