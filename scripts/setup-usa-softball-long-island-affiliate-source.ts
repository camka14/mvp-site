/** Operator-approved setup for the USA Softball Long Island stored-intake CLUB package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import { USA_SOFTBALL_LI_HOME_URL, USA_SOFTBALL_LI_MAPPING, USA_SOFTBALL_LI_ORG_DESCRIPTION, USA_SOFTBALL_LI_REGISTRATION_URL, USA_SOFTBALL_LI_SOURCE_EVIDENCE, USA_SOFTBALL_LI_STATIC_PAGE_CLIENT } from '../src/server/affiliateImports/usaSoftballLongIslandSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_usa_softball_long_island';
const SOURCE_ID = 'affiliate_source_usa_softball_long_island';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-usa-softball-long-island-home-usasoftballli-com';
const MAPPING_ID = 'affiliate_mapping_usa_softball_long_island_v1';

const sourceMetadata = {
  sourceEvidence: USA_SOFTBALL_LI_SOURCE_EVIDENCE,
  inspectedAt: USA_SOFTBALL_LI_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://usasoftballli.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored USA Softball Long Island homepage is ALLOWED. Registration, contact, news, and linked program pages are UNCHECKED and remain withheld.',
  reviewedUrls: [USA_SOFTBALL_LI_HOME_URL],
  officialActionUrls: [USA_SOFTBALL_LI_HOME_URL, USA_SOFTBALL_LI_REGISTRATION_URL, 'https://usasoftballli.com/register', 'https://usasoftballli.com/59-2/', 'https://usasoftballli.com/news'],
  officialLogoSourceUrl: 'https://usasoftballli.com/wp-content/uploads/2021/03/USA_SOFTBALL_LI_SQUARE_800px.png',
  officialLogoCandidateArtifact: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored favicon-level USA Softball Long Island mark only; generic Divi branding candidate excluded',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored official branding evidence includes only a 32px favicon-level mark; no suitable normalized logo file is assigned pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'monthly',
  cadenceIntervalMinutes: 43200,
  withheldRows: [
    { title: 'USA Softball Long Island dated tournaments', reason: 'The stored homepage teasers are historical June/July 2021 or omit a year; no current complete dated event row is emitted.' },
    { title: 'USA Softball Long Island registration and program details', reason: 'Registration, contact, news, and linked program pages are UNCHECKED.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = { updatedAt: new Date(), name: 'USA Softball Long Island', location: 'Long Island, NY', address: null, description: USA_SOFTBALL_LI_ORG_DESCRIPTION, logoId: null, ownerId: owner.id, website: USA_SOFTBALL_LI_HOME_URL, sports: ['Softball'], status: 'UNLISTED' as const, publicPageEnabled: false, publicWidgetsEnabled: false };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = { name: 'USA Softball Long Island', sourceKey: SOURCE_KEY, organizationId: ORG_ID, baseUrl: USA_SOFTBALL_LI_HOME_URL, listUrl: USA_SOFTBALL_LI_HOME_URL, targetKind: 'CLUB', status: 'ACTIVE', autoScrapeEnabled: false, scrapeIntervalMinutes: 43200, notes: 'Stored-intake USA Softball Long Island package with one ongoing CLUB profile; stale dated teasers and unchecked registration/program pages remain withheld.', metadata: sourceMetadata };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({ where: { id: MAPPING_ID }, create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: USA_SOFTBALL_LI_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from the stored allowed USA Softball Long Island homepage.', validatedAt: null }, update: { version: 1, isActive: true, mapping: USA_SOFTBALL_LI_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from the stored allowed USA Softball Long Island homepage.', validatedAt: null } });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: USA_SOFTBALL_LI_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-usa-softball-long-island-affiliate-source] failed', error); process.exitCode = 1; });
