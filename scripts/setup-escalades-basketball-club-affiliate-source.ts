/** Operator-approved setup for the Escalades Basketball Club stored-intake CLUB package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { ESCALADES_BASKETBALL_CLUB_HOME_URL, ESCALADES_BASKETBALL_CLUB_LOGO_SOURCE_URL, ESCALADES_BASKETBALL_CLUB_MAPPING, ESCALADES_BASKETBALL_CLUB_ORG_DESCRIPTION, ESCALADES_BASKETBALL_CLUB_REGISTER_URL, ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE, ESCALADES_BASKETBALL_CLUB_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/escaladesBasketballClubSource';

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
const ORG_ID = 'affiliate_org_escalades_basketball_club';
const SOURCE_ID = 'affiliate_source_escalades_basketball_club';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-escalades-basketball-club-escaladesnyc-org';
const MAPPING_ID = 'affiliate_mapping_escalades_basketball_club_v1';

const sourceMetadata = {
  sourceEvidence: ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE,
  inspectedAt: ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.escaladesnyc.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Escalades Basketball Club homepage is ALLOWED. Registration, program, schedule, team, announcement, policy, and apparel-store pages are UNCHECKED and remain withheld.',
  reviewedUrls: [ESCALADES_BASKETBALL_CLUB_HOME_URL],
  officialActionUrls: [ESCALADES_BASKETBALL_CLUB_HOME_URL, ESCALADES_BASKETBALL_CLUB_REGISTER_URL, 'https://www.escaladesnyc.org/signup', 'https://www.escaladesnyc.org/program/spring-season-2026/29927'],
  officialLogoSourceUrl: ESCALADES_BASKETBALL_CLUB_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored Crossbar page-branding logo URL; no stored binary logo candidate',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored page branding identifies an official logo URL, but the intake retained no binary logo candidate or screenshot crop. No remote asset was downloaded; logo remains pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Escalades Basketball Club Spring Season - 2026', reason: 'The stored program page is UNCHECKED and the season is past as of 2026-07-31; no EVENT candidate is emitted.' },
    { title: 'Escalades Basketball Club registration, schedule, teams, and announcements', reason: 'The stored pages are UNCHECKED.' },
    { title: 'Escalades Basketball Club apparel store', reason: 'The stored apparel-store path is not a facility rental and remains UNCHECKED.' },
    { title: 'Escalades Basketball Club teams', reason: 'TEAM mappings are out of scope; no team candidate is created.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Escalades Basketball Club', location: 'Manhattan, NY 10065', address: 'Manhattan, NY 10065', description: ESCALADES_BASKETBALL_CLUB_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: ESCALADES_BASKETBALL_CLUB_HOME_URL, sports: ['Basketball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Escalades Basketball Club', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: ESCALADES_BASKETBALL_CLUB_HOME_URL, listUrl: ESCALADES_BASKETBALL_CLUB_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Escalades Basketball Club package with one ongoing CLUB profile; stale Spring 2026, unchecked registration/program/team pages, and the apparel-store path remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: ESCALADES_BASKETBALL_CLUB_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Escalades Basketball Club homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: ESCALADES_BASKETBALL_CLUB_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Escalades Basketball Club homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) { const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: ESCALADES_BASKETBALL_CLUB_STATIC_PAGE_CLIENT }); const logs = result.run.logs as Record<string, unknown> | null; console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2)); }
  } finally { await prisma.$disconnect(); }
};

main().catch((error) => { console.error('[setup-escalades-basketball-club-affiliate-source] failed', error); process.exitCode = 1; });
