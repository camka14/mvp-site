/** Operator-approved setup for the Harvey Hockey Camp stored-intake package. */
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import path from 'node:path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  HARVEY_HOCKEY_CAMP_MAPPING,
  HARVEY_HOCKEY_CAMP_OFFICIAL_URLS,
  HARVEY_HOCKEY_CAMP_ORG_DESCRIPTION,
  HARVEY_HOCKEY_CAMP_REGISTRATION_URL,
  HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE,
  HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT,
  HARVEY_HOCKEY_CAMP_URL,
  HARVEY_SCHOOL_HOME_URL,
} from '../src/server/affiliateImports/harveyHockeyCampSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });
if (process.argv.includes('--live')) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_harvey_hockey_camp';
const SOURCE_ID = 'affiliate_source_harvey_hockey_camp';
const SOURCE_KEY = 'new-york-new-york-metropolitan-area-hockey-camp-harveyschool-org';
const MAPPING_ID = 'affiliate_mapping_harvey_hockey_camp_v1';

const sourceMetadata = {
  sourceEvidence: HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE,
  inspectedAt: HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE.capturedAt,
  robotsUrl: 'https://www.harveyschool.org/robots.txt',
  robotsAllowed: true,
  robotsNote: 'The stored Harvey hockey camp page is ALLOWED. The parent summer-camp, registration, school, rink, and rental pages are UNCHECKED and remain outbound-only.',
  reviewedUrls: [HARVEY_HOCKEY_CAMP_URL],
  officialActionUrls: HARVEY_HOCKEY_CAMP_OFFICIAL_URLS,
  officialLogoSourceUrl: HARVEY_HOCKEY_CAMP_LOGO_SOURCE_URL,
  officialLogoCandidateArtifact: 'output/affiliate-intakes/new-york-new-york-metropolitan-area-hockey-camp-harveyschool-org/c3adc29f-c5dc-4453-a6d9-b5c170adf021/002-logo_candidate-5cf1a205-5093-4a00-abfe-e7cebae3344b.txt',
  logoStatus: 'MANUAL_REVIEW',
  logoSourceType: 'Stored favicon-level Harvey School branding only; no suitable camp logo established',
  logoNormalizedFormat: null,
  logoBackground: null,
  logoNote: 'The stored branding evidence contains only a favicon-level Harvey School mark; no logo file is assigned pending manual review.',
  logoDisposition: 'MANUAL_REVIEW',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  withheldRows: [
    { title: 'Harvey Summer Programs beyond Hockey Camp', reason: 'The parent summer-camp and other program pages are UNCHECKED.' },
    { title: 'Harvey facilities rental and current registration details', reason: 'Rental and registration pages are UNCHECKED; the official registration URL remains outbound-only.' },
  ],
  officialOutboundNotes: {
    hockeyCamp: HARVEY_HOCKEY_CAMP_URL,
    home: HARVEY_SCHOOL_HOME_URL,
    registration: HARVEY_HOCKEY_CAMP_REGISTRATION_URL,
  },
};

const main = async () => {
  const prisma = (await import('../src/lib/prisma')).prisma;
  const runAffiliateSourceScrape = (await import('../src/server/affiliateImports/service')).runAffiliateSourceScrape;
  try {
    const owner = await prisma.authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
    if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
    const organization = {
      updatedAt: new Date(),
      name: 'Colton Orr Harvey Hockey Summer Camp',
      location: 'Katonah, NY',
      address: '260 Jay St, Katonah, NY 10536',
      description: HARVEY_HOCKEY_CAMP_ORG_DESCRIPTION,
      logoId: null,
      ownerId: owner.id,
      website: HARVEY_SCHOOL_HOME_URL,
      sports: ['Ice Hockey'],
      status: 'UNLISTED' as const,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    };
    await prisma.organizations.upsert({
      where: { id: ORG_ID },
      create: { id: ORG_ID, createdAt: new Date(), hasStripeAccount: false, verificationStatus: 'UNVERIFIED', verificationReviewStatus: 'NONE', ...organization },
      update: organization,
    });

    const source = {
      name: 'Harvey Hockey Camp',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: HARVEY_SCHOOL_HOME_URL,
      listUrl: HARVEY_HOCKEY_CAMP_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Stored-intake Harvey Hockey Camp CLUB and ongoing 2026 EVENT package; unchecked program, rental, and registration details plus favicon-only branding remain withheld or manual-review.',
      metadata: sourceMetadata,
    };
    await prisma.affiliateScrapeSources.upsert({ where: { id: SOURCE_ID }, create: { id: SOURCE_ID, ...source }, update: source });
    await prisma.affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
    await prisma.affiliateScrapeMappings.upsert({
      where: { id: MAPPING_ID },
      create: { id: MAPPING_ID, sourceId: SOURCE_ID, version: 1, isActive: true, mapping: HARVEY_HOCKEY_CAMP_MAPPING satisfies AffiliateScrapeMapping, createdByUserId: null, notes: 'Review-only EVENT mapping with a Harvey Hockey Camp CLUB profile from the stored hockey camp page.', validatedAt: null },
      update: { version: 1, isActive: true, mapping: HARVEY_HOCKEY_CAMP_MAPPING satisfies AffiliateScrapeMapping, notes: 'Review-only EVENT mapping with a Harvey Hockey Camp CLUB profile from the stored hockey camp page.', validatedAt: null },
    });
    await prisma.affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID, autoScrapeEnabled: false } });
    console.log(`Affiliate source ready for local review: ${SOURCE_KEY}`);
    if (process.argv.includes('--scrape')) {
      const result = await runAffiliateSourceScrape(SOURCE_ID, { importMode: 'REVIEW', client: HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT });
      const logs = result.run.logs as Record<string, unknown> | null;
      console.log(JSON.stringify({
        runId: result.run.id,
        candidateCount: result.candidates.length,
        normalizedCandidates: result.candidates.map((candidate: any) => ({ listingKind: candidate.listingKind, title: candidate.title, officialActionUrl: candidate.officialActionUrl, dateDisplayMode: candidate.dateDisplayMode })),
        createdCandidateCount: logs?.createdCandidateCount ?? null,
        updatedCandidateCount: logs?.updatedCandidateCount ?? null,
        rejectedCount: logs?.rejectedCount ?? null,
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => { console.error('[setup-harvey-hockey-camp-affiliate-source] failed', error); process.exitCode = 1; });
