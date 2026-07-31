/** Operator-approved setup for the Globall Competitions stored-intake CLUB package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  GLOBALL_COMPETITIONS_BEACH_BASH_URL,
  GLOBALL_COMPETITIONS_CAREERS_URL,
  GLOBALL_COMPETITIONS_CONTACT_URL,
  GLOBALL_COMPETITIONS_FACEBOOK_URL,
  GLOBALL_COMPETITIONS_HOME_URL,
  GLOBALL_COMPETITIONS_INSTAGRAM_URL,
  GLOBALL_COMPETITIONS_KICK_OFF_URL,
  GLOBALL_COMPETITIONS_LEAGUES_URL,
  GLOBALL_COMPETITIONS_LOCATIONS_URL,
  GLOBALL_COMPETITIONS_LOGO_SOURCE_URL,
  GLOBALL_COMPETITIONS_MAPPING,
  GLOBALL_COMPETITIONS_MLS_GO_URL,
  GLOBALL_COMPETITIONS_ORG_DESCRIPTION,
  GLOBALL_COMPETITIONS_REFUND_URL,
  GLOBALL_COMPETITIONS_SOURCE_EVIDENCE,
  GLOBALL_COMPETITIONS_STATIC_PAGE_CLIENT,
  GLOBALL_COMPETITIONS_STORE_URL,
  GLOBALL_COMPETITIONS_TOURNAMENTS_URL,
} from '../src/server/affiliateImports/globallCompetitionsSource';

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
const ORG_ID = 'affiliate_org_globall_competitions';
const SOURCE_ID = 'affiliate_source_globall_competitions';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-competitions-globallcompetitions-com';
const MAPPING_ID = 'affiliate_mapping_globall_competitions_v1';

const sourceMetadata = {
  sourceEvidence: GLOBALL_COMPETITIONS_SOURCE_EVIDENCE,
  inspectedAt: GLOBALL_COMPETITIONS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://globallcompetitions.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Globall Competitions homepage is ALLOWED. League, tournament, location, detail, policy, and linked third-party pages are UNCHECKED and remain withheld.',
  reviewedUrls: [GLOBALL_COMPETITIONS_HOME_URL],
  officialActionUrls: [GLOBALL_COMPETITIONS_HOME_URL, GLOBALL_COMPETITIONS_MLS_GO_URL, GLOBALL_COMPETITIONS_TOURNAMENTS_URL, GLOBALL_COMPETITIONS_LEAGUES_URL, GLOBALL_COMPETITIONS_LOCATIONS_URL, GLOBALL_COMPETITIONS_CONTACT_URL, GLOBALL_COMPETITIONS_STORE_URL, GLOBALL_COMPETITIONS_BEACH_BASH_URL, GLOBALL_COMPETITIONS_KICK_OFF_URL, GLOBALL_COMPETITIONS_CAREERS_URL, GLOBALL_COMPETITIONS_REFUND_URL, GLOBALL_COMPETITIONS_FACEBOOK_URL, GLOBALL_COMPETITIONS_INSTAGRAM_URL],
  officialLogoSourceUrl: GLOBALL_COMPETITIONS_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-competitions-globallcompetitions-com/2975283c-b4aa-464f-a70e-e448c5f64f02/002-logo_candidate-155ae484-18b4-4d33-9319-e4d28c51b896.png',
  logoStatus: 'MANUAL_REVIEW_REQUIRED',
  logoSourceType: 'Stored favicon globe candidate; no clearly identified full official logo',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored branding artifact contains only a favicon globe candidate. It is retained for human logo review and is not uploaded as an organization logo.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Globall Competitions leagues and tournaments', reason: 'Stored homepage names programs but does not publish complete current date, time, venue, and registration rows; linked listing pages are UNCHECKED.' },
    { title: 'Globall Competitions locations and rentals', reason: 'The stored locations page is UNCHECKED and no rental inventory is inferred from the homepage.' },
    { title: 'Globall Competitions logo', reason: 'Only a favicon globe candidate is stored; explicit manual review is required before selecting an organization logo.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'Globall Competitions', location: 'New York region', address: null, description: GLOBALL_COMPETITIONS_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: GLOBALL_COMPETITIONS_HOME_URL, sports: ['Soccer'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'Globall Competitions', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: GLOBALL_COMPETITIONS_HOME_URL, listUrl: GLOBALL_COMPETITIONS_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake Globall Competitions CLUB package with one ongoing New York-region soccer competition organizer profile. Current tournament and league pages are unchecked and the stored homepage lacks complete dated rows, so no EVENT or RENTAL candidate is created; logo remains in manual review.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: GLOBALL_COMPETITIONS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed Globall Competitions homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: GLOBALL_COMPETITIONS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed Globall Competitions homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: GLOBALL_COMPETITIONS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-globall-competitions-affiliate-source] failed', error); process.exitCode = 1; });
