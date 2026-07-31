/** Operator-approved setup for the Middle School Matchup New York stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  MSM_HOME_URL,
  MSM_NEW_YORK_HOME_URL,
  MSM_NEW_YORK_MAPPING,
  MSM_NEW_YORK_PREREGISTER_URL,
  MSM_NEW_YORK_SOURCE_EVIDENCE,
  MSM_NEW_YORK_STATIC_PAGE_CLIENT,
  MSM_ORG_DESCRIPTION,
} from '../src/server/affiliateImports/middleSchoolMatchupNewYorkSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_middle_school_matchup_new_york';
const SOURCE_ID = 'affiliate_source_middle_school_matchup_new_york';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-msm-newyork-registration-baseball-middleschoolmatchup-com';
const MAPPING_ID = 'affiliate_mapping_middle_school_matchup_new_york_v1';

const sourceMetadata = {
  sourceEvidence: MSM_NEW_YORK_SOURCE_EVIDENCE,
  inspectedAt: MSM_NEW_YORK_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.middleschoolmatchup.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Middle School Matchup New York listing is ALLOWED. The home, registration, other-location, policy, and tournament pages are UNCHECKED and remain withheld.',
  reviewedUrls: [MSM_NEW_YORK_HOME_URL],
  officialActionUrls: [MSM_NEW_YORK_HOME_URL, MSM_NEW_YORK_PREREGISTER_URL, 'https://www.middleschoolmatchup.com/faq/'],
  officialLogoSourceUrl: null,
  officialLogoCandidateArtifact: null,
  logoStatus: 'NO_RELIABLE_OFFICIAL_ASSET',
  logoSourceType: 'No clearly identified official MSM mark in stored branding candidates',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored candidates are a baseball photograph and a generic baseball image rather than a clearly identified official Middle School Matchup mark; organization logo remains unset for manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Summer 2026 New York baseball championship dates', reason: 'The allowed listing states only Summer 2026 and New York area fields; no exact date, field, price, capacity, or time is published.' },
    { title: 'Middle School Matchup registration and detail pages', reason: 'The stored pages are UNCHECKED; the Formstack URL is retained as an outbound action link only.' },
    { title: 'Middle School Matchup teams', reason: 'The source describes temporary school/grade teams, but TEAM mappings are out of scope.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Middle School Matchup New York', location: 'New York Area', address: null, description: MSM_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: MSM_HOME_URL, sports: ['Baseball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Middle School Matchup New York', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: MSM_HOME_URL, listUrl: MSM_NEW_YORK_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Middle School Matchup New York CLUB package with one ongoing Summer 2026 profile. Exact dates, fields, prices, and times are not published in the allowed listing; no EVENT or TEAM candidate is created, and logo remains in manual review.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: MSM_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Middle School Matchup New York listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: MSM_NEW_YORK_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Middle School Matchup New York listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: MSM_NEW_YORK_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-middle-school-matchup-new-york-affiliate-source] failed', error); process.exitCode = 1; });
