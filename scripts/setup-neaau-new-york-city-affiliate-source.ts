/** Operator-approved setup for the NEAAU New York City stored-intake package. */
import dotenv from 'dotenv';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  NEAAU_NEW_YORK_CITY_MAPPING,
  NEAAU_NEW_YORK_CITY_REGISTRATION_URL,
  NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE,
  NEAAU_NEW_YORK_CITY_STATIC_PAGE_CLIENT,
  NEAAU_NEW_YORK_CITY_URL,
  NEAAU_NEW_YORK_CITY_VENUE_URL,
} from '../src/server/affiliateImports/neaauNewYorkCitySource';

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
const ORG_ID = 'affiliate_org_neaau_volleyball';
const SOURCE_ID = 'affiliate_source_neaau_new_york_city';
const SOURCE_KEY = 'neaau-new-york-city';
const MAPPING_ID = 'affiliate_mapping_neaau_new_york_city_v1';
const ORGANIZATION_NAME = 'NEAAU Volleyball';
const ORGANIZATION_DESCRIPTION = 'NEAAU Volleyball presents the stored official New York City club volleyball event and related team registration information.';

const sourceMetadata = {
  sourceEvidence: NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE,
  inspectedAt: NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.neaauvolleyball.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored robots evidence marks the official New York City listing ALLOWED.',
  reviewedUrls: [NEAAU_NEW_YORK_CITY_URL, NEAAU_NEW_YORK_CITY_REGISTRATION_URL, NEAAU_NEW_YORK_CITY_VENUE_URL],
  officialActionUrls: [NEAAU_NEW_YORK_CITY_URL, NEAAU_NEW_YORK_CITY_REGISTRATION_URL, NEAAU_NEW_YORK_CITY_VENUE_URL],
  officialLogoSourceUrl: null,
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'No supportable first-party NEAAU organization mark in stored evidence',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'Stored logo candidates are a NYC Tourism mark, a SportsEngine mark, and an AAU mark; none is assigned to the NEAAU organization.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Individual game times', reason: 'The official page provides March 12-14, 2027 but no individual game times; the event row retains the source date range without invented times.' },
    { title: 'NEAAU organization logo', reason: 'The three stored logo candidates are third-party or umbrella marks and do not establish a supportable NEAAU organization logo.' },
    { title: 'Teams', reason: 'TEAM mappings are out of scope.' },
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
      description: ORGANIZATION_DESCRIPTION,
      logoId: null,
      ownerId: owner.id,
      website: 'https://www.neaauvolleyball.org/',
      sports: ['Volleyball'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({ where: { id: ORG_ID }, create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization }, update: organization });
    const source = {
      name: 'NEAAU Volleyball - New York City',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: 'https://www.neaauvolleyball.org/',
      listUrl: NEAAU_NEW_YORK_CITY_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake NEAAU New York City event package; logo remains manual review and mapping validation remains human-gated.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: NEAAU_NEW_YORK_CITY_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping from stored NEAAU New York City evidence.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: NEAAU_NEW_YORK_CITY_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping from stored NEAAU New York City evidence.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: NEAAU_NEW_YORK_CITY_STATIC_PAGE_CLIENT });
      await prisma.affiliateImportCandidates.updateMany({ where: { sourceId: SOURCE_ID, listingKind: 'EVENT', title: 'New York City' }, data: { publishedOrganizationId: ORG_ID, updatedAt: new Date() } });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({ runId: result.run.id, candidateCount: result.candidates.length, normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, startsAt: candidate.startsAt, endsAt: candidate.endsAt })), createdCandidateCount: logs?.createdCandidateCount ?? null, updatedCandidateCount: logs?.updatedCandidateCount ?? null, rejectedCount: logs?.rejectedCount ?? null }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-neaau-new-york-city-affiliate-source] failed', error); process.exitCode = 1; });
