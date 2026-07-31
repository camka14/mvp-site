/** Local-only setup for the Big League Ultimate Frisbee stored-intake EVENT package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  BIG_LEAGUE_ULTIMATE_HOME_URL,
  BIG_LEAGUE_ULTIMATE_LOGO_SOURCE_URL,
  BIG_LEAGUE_ULTIMATE_MAPPING,
  BIG_LEAGUE_ULTIMATE_ORG_DESCRIPTION,
  BIG_LEAGUE_ULTIMATE_REGISTER_URL,
  BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE,
  BIG_LEAGUE_ULTIMATE_STATIC_PAGE_CLIENT,
  BIG_LEAGUE_ULTIMATE_URL,
} from '../src/server/affiliateImports/bigLeagueUltimateFrisbeeSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_big_league_sports';
const SOURCE_ID = 'affiliate_source_big_league_ultimate_frisbee';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-ultimate-frisbee-playbigleaguesports-com';
const MAPPING_ID = 'affiliate_mapping_big_league_ultimate_frisbee_v1';

const sourceMetadata = {
  sourceEvidence: BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE,
  inspectedAt: BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://playbigleaguesports.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Big League Sports Ultimate Frisbee listing is ALLOWED. Registration, events, home, and other sport pages are UNCHECKED and remain withheld.',
  reviewedUrls: [BIG_LEAGUE_ULTIMATE_URL],
  officialActionUrls: [BIG_LEAGUE_ULTIMATE_HOME_URL, BIG_LEAGUE_ULTIMATE_URL, BIG_LEAGUE_ULTIMATE_REGISTER_URL, 'https://bigleaguesports.leagueapps.com/login', 'https://bigleaguesports.leagueapps.com/signup'],
  officialLogoSourceUrl: BIG_LEAGUE_ULTIMATE_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-ultimate-frisbee-playbigleaguesports-com/2a4917da-99b5-40a8-b7c1-2f2454150e12/002-logo_candidate-a5589762-dea2-46cf-9ee7-6cd918a7c31f.png',
  logoStatus: 'MANUAL_REVIEW_REQUIRED',
  logoSourceType: 'Stored favicon candidate; no clearly identified full official logo',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored branding artifact contains only a favicon candidate and is retained for human logo review; no organization logo is selected.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '2026 Spring Westchester Ultimate Frisbee (Tues)', reason: 'The stored listing marks the April 21, 2026 league Completed; no stale EVENT candidate is emitted.' },
    { title: 'Summer 2026 event time, end date, venue, address, and price', reason: 'The stored allowed listing does not publish those fields; no values are inferred.' },
    { title: 'Registration and other Big League Sports pages', reason: 'The stored registration, events, home, and other sport pages are UNCHECKED and remain outbound-only.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Big League Sports and Entertainment', location: 'Westchester, New York', address: null, description: BIG_LEAGUE_ULTIMATE_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: BIG_LEAGUE_ULTIMATE_HOME_URL, sports: ['Ultimate Frisbee'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Big League Ultimate Frisbee', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: BIG_LEAGUE_ULTIMATE_HOME_URL, listUrl: BIG_LEAGUE_ULTIMATE_URL, targetKind: 'EVENT', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Big League Sports EVENT package with one current Summer 2026 Westchester Ultimate Frisbee Tuesday league. The completed Spring 2026 row and missing event details remain withheld; logo is in manual review.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: BIG_LEAGUE_ULTIMATE_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from the stored allowed Big League Sports Ultimate Frisbee listing.', validatedAt: null }, update: { version: 1, isActive: true, mapping: BIG_LEAGUE_ULTIMATE_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from the stored allowed Big League Sports Ultimate Frisbee listing.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: BIG_LEAGUE_ULTIMATE_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, endsAt: candidate.endsAt, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-big-league-ultimate-frisbee-affiliate-source] failed', error); process.exitCode = 1; });
