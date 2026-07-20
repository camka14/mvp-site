/**
 * Portland Reign Basketball affiliate source setup.
 *
 * Owns public org `affiliate_org_portland_reign_basketball`, source
 * `affiliate_source_portland_reign_basketball`, and mapping
 * `affiliate_mapping_portland_reign_basketball_camps_v1`.
 * Official URLs: https://www.pdxreignbasketball.com/ and
 * https://www.pdxreignbasketball.com/camps. Owner: samuel.r@razumly.com.
 * Creates only reviewed future camp EVENT candidates from the public camp form;
 * it creates no CLUB or TEAM candidates. This script is local-only, `--scrape`
 * creates or updates candidates, and auto-scraping remains disabled. Logo work
 * is intentionally deferred and this script does not assign `logoId`.
 */
import dotenv from 'dotenv';
import path from 'path';
import {
  PORTLAND_REIGN_CAMPS_URL,
  PORTLAND_REIGN_HOME_URL,
  PORTLAND_REIGN_MANUAL_CANDIDATES,
  PORTLAND_REIGN_MAPPING,
  PORTLAND_REIGN_ORG_DESCRIPTION,
  PORTLAND_REIGN_STATIC_PAGE_CLIENT,
  PORTLAND_REIGN_VENUE_ADDRESS,
  PORTLAND_REIGN_WITHHELD_ROWS,
} from '../src/server/affiliateImports/portlandReignBasketballSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This Portland Reign Basketball setup is local-only and refuses --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_portland_reign_basketball';
const SOURCE_ID = 'affiliate_source_portland_reign_basketball';
const SOURCE_KEY = 'portland-reign-basketball';
const MAPPING_ID = 'affiliate_mapping_portland_reign_basketball_camps_v1';
const PUBLIC_SLUG = 'portland-reign-basketball';

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const venueCoordinates = async () => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });

  return await geocodeAddressToCoordinates(PORTLAND_REIGN_VENUE_ADDRESS) ?? existing?.coordinates ?? null;
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await venueCoordinates();
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Reign Basketball',
      location: 'Portland, OR',
      address: PORTLAND_REIGN_VENUE_ADDRESS,
      description: PORTLAND_REIGN_ORG_DESCRIPTION,
      ownerId,
      website: PORTLAND_REIGN_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Portland Reign Basketball camps and programs',
      publicIntroText: 'Review Portland Reign Basketball camps, youth programs, and official registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Reign Basketball',
      location: 'Portland, OR',
      address: PORTLAND_REIGN_VENUE_ADDRESS,
      description: PORTLAND_REIGN_ORG_DESCRIPTION,
      ownerId,
      website: PORTLAND_REIGN_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Portland Reign Basketball camps and programs',
      publicIntroText: 'Review Portland Reign Basketball camps, youth programs, and official registration links.',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsAllowed: true,
  robotsNote: 'pdxreignbasketball.com/robots.txt allows public crawling and disallows only the lightbox query pattern for normal user agents.',
  termsNote: 'The inspected Terms & Conditions and Privacy Policy pages contain Wix template boilerplate; no source-specific anti-bot or no-scraping restriction was found.',
  renderingRequired: true,
  renderingNote: 'The Wix camp registration form was rendered to verify the date groups, registration options, prices, and action URL.',
  logoStatus: 'DEFERRED',
  logoNote: 'Logo discovery, normalization, file creation, and Organizations.logoId assignment are intentionally deferred to a separate agent after canonical IDs are established.',
  cadence: 'weekly',
  cadenceIntervalMinutes: 10080,
  sourceActionUrl: PORTLAND_REIGN_CAMPS_URL,
  withheldRows: PORTLAND_REIGN_WITHHELD_ROWS,
};

const upsertSourceAndMapping = async () => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'Portland Reign Basketball',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: PORTLAND_REIGN_HOME_URL,
      listUrl: PORTLAND_REIGN_CAMPS_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public Portland Reign source. Creates only reviewed future camp event candidates from the official registration form; no club or team candidates are created.',
      metadata: sourceMetadata,
    },
    update: {
      name: 'Portland Reign Basketball',
      organizationId: ORG_ID,
      baseUrl: PORTLAND_REIGN_HOME_URL,
      listUrl: PORTLAND_REIGN_CAMPS_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public Portland Reign source. Creates only reviewed future camp event candidates from the official registration form; no club or team candidates are created.',
      metadata: sourceMetadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { id: MAPPING_ID },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping: PORTLAND_REIGN_MAPPING,
      createdByUserId: null,
      notes: 'Manual Portland Reign future camp mapping from the rendered public Wix registration form reviewed July 15, 2026.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping: PORTLAND_REIGN_MAPPING,
      notes: 'Manual Portland Reign future camp mapping from the rendered public Wix registration form reviewed July 15, 2026.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Portland Reign Basketball affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${PORTLAND_REIGN_MANUAL_CANDIDATES.length} future camp candidate(s) configured.`);
  console.log(`${PORTLAND_REIGN_WITHHELD_ROWS.length} row(s) withheld: past, undated, or without a stable roster-level action target.`);
  console.log('Logo work is deferred; no logo file or logoId is changed by this script.');

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: PORTLAND_REIGN_STATIC_PAGE_CLIENT });
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create or update the future camp candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-portland-reign-basketball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
