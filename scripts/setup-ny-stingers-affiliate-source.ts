/** Local-only setup for the NY Stingers stored-intake club package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { NY_STINGERS_HOME_URL, NY_STINGERS_MAPPING, NY_STINGERS_ORG_DESCRIPTION, NY_STINGERS_SOURCE_EVIDENCE, NY_STINGERS_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/nyStingersSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) throw new Error('This source setup is local-only and does not accept --live.');

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_ny_stingers';
const SOURCE_ID = 'affiliate_source_ny_stingers';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-ny-stingers-nystingers-com';
const MAPPING_ID = 'affiliate_mapping_ny_stingers_v1';

const sourceMetadata = {
  sourceEvidence: NY_STINGERS_SOURCE_EVIDENCE,
  inspectedAt: NY_STINGERS_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://nystingers.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored NY Stingers homepage is ALLOWED. Teams, facilities, and staff pages are UNCHECKED and remain withheld.',
  reviewedUrls: [NY_STINGERS_HOME_URL],
  officialActionUrls: [NY_STINGERS_HOME_URL, 'https://nystingers.com/teams', 'https://nystingers.com/facilities', 'https://nystingers.com/staff'],
  officialLogoSourceUrl: null,
  officialLogoCandidateArtifact: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'No official logo candidate captured in stored intake',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'No logo candidate or branding logo URL was captured; manual logo review is required.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'NY Stingers teams and facilities', reason: 'The allowed homepage links to teams and facilities, but those pages are UNCHECKED; no TEAM or RENTAL candidate is inferred.' },
    { title: 'NY Stingers logo', reason: 'The stored intake captured no logo candidates or branding logo URL; manual review is required.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'NY Stingers', location: 'New York, NY', address: null, description: NY_STINGERS_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: NY_STINGERS_HOME_URL, sports: ['Baseball'], status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'NY Stingers', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: NY_STINGERS_HOME_URL, listUrl: NY_STINGERS_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 10080, notes: 'Stored-intake NY Stingers club package with one ongoing CLUB profile; teams, facilities, staff, and logo rows remain manual-review or withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NY_STINGERS_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored NY Stingers homepage evidence.', validatedAt: null }, update: { version: 1, isActive: true, mapping: NY_STINGERS_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored NY Stingers homepage evidence.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NY_STINGERS_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as any;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-ny-stingers-affiliate-source] failed', error); process.exitCode = 1; });
