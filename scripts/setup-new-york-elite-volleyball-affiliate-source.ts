/** Operator-approved setup for the New York Elite Volleyball stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL,
  NEW_YORK_ELITE_VOLLEYBALL_HOME_URL,
  NEW_YORK_ELITE_VOLLEYBALL_MAPPING,
  NEW_YORK_ELITE_VOLLEYBALL_ORG_DESCRIPTION,
  NEW_YORK_ELITE_VOLLEYBALL_PROGRAMS_URL,
  NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE,
  NEW_YORK_ELITE_VOLLEYBALL_STATIC_PAGE_CLIENT,
  NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL,
} from '../src/server/affiliateImports/newYorkEliteVolleyballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_new_york_elite_volleyball';
const SOURCE_ID = 'affiliate_source_new_york_elite_volleyball';
const SOURCE_KEY = 'new-york-elite-volleyball';
const MAPPING_ID = 'affiliate_mapping_new_york_elite_volleyball_v1';
const ORGANIZATION_NAME = 'New York Elite Volleyball';
const ORGANIZATION_WEBSITE = NEW_YORK_ELITE_VOLLEYBALL_HOME_URL;

const sourceMetadata = {
  sourceEvidence: NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE,
  inspectedAt: NEW_YORK_ELITE_VOLLEYBALL_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.newyorkelitevolleyball.com/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official homepage ALLOWED.',
  reviewedUrls: [NEW_YORK_ELITE_VOLLEYBALL_HOME_URL, NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL, NEW_YORK_ELITE_VOLLEYBALL_PROGRAMS_URL, NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL],
  officialActionUrls: [NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL, NEW_YORK_ELITE_VOLLEYBALL_PROGRAMS_URL, NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL],
  officialLogoSourceUrl: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'No supportable first-party New York Elite organization mark in stored evidence',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'Stored logo candidates are a Mid-Hudson Athletic Center mark, a SportsEngine mark, and a favicon; none is assigned to New York Elite Volleyball.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: '2026 Summer Camp', sourceUrl: NEW_YORK_ELITE_VOLLEYBALL_CAMPS_URL, reason: 'The stored homepage CTA points to the camp page but the detail page was not captured with a complete current date, time, venue, price, and action row.' },
    { title: 'Team tryouts', sourceUrl: NEW_YORK_ELITE_VOLLEYBALL_TRYOUTS_URL, reason: 'The stored homepage CTA points to tryout information but the detail page was not captured with a complete current dated row.' },
    { title: 'Fall training', reason: 'The stored homepage CTA has no captured detail page with a complete current date, time, venue, price, and action row.' },
    { title: 'New York Elite teams', reason: 'TEAM mappings are out of scope.' },
  ],
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = {
      updatedAt: new Date(),
      name: ORGANIZATION_NAME,
      location: null,
      address: null,
      description: NEW_YORK_ELITE_VOLLEYBALL_ORG_DESCRIPTION,
      logoId: null,
      ownerId: owner.id,
      website: ORGANIZATION_WEBSITE,
      sports: ['Volleyball'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: ORGANIZATION_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: ORGANIZATION_WEBSITE,
      listUrl: ORGANIZATION_WEBSITE,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake New York Elite Volleyball club package; dated details are withheld and logo remains manual review.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEW_YORK_ELITE_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only CLUB mapping from stored New York Elite Volleyball evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NEW_YORK_ELITE_VOLLEYBALL_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only CLUB mapping from stored New York Elite Volleyball evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEW_YORK_ELITE_VOLLEYBALL_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'CLUB', title: ORGANIZATION_NAME }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-new-york-elite-volleyball-affiliate-source] failed', error); process.exitCode = 1; });
