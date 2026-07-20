/**
 * Oregon Basketball Club affiliate club source setup.
 *
 * Owns public club organization `affiliate_org_oregon_basketball_club`, source
 * `affiliate_source_oregon_basketball_club`, mapping
 * `affiliate_mapping_oregon_basketball_club_v1`, and one ongoing CLUB candidate.
 * Official pages: https://obc.work/ and https://obc.work/teams/.
 *
 * This script is local-only. It creates or repairs the public club org, source,
 * mapping, and (with `--scrape`) the reviewed club candidate. It does not
 * download or assign the logo; a separate logo pass owns that asset.
 */
import dotenv from 'dotenv';
import path from 'path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';
import {
  OBC_CALENDAR_URL,
  OBC_CAMPS_URL,
  OBC_HOME_URL,
  OBC_LOGO_SOURCE_URL,
  OBC_MAPPING,
  OBC_MANUAL_CANDIDATES,
  OBC_REGISTRATION_URL,
  OBC_ROBOTS_URL,
  OBC_TEAMS_URL,
} from '../src/server/affiliateImports/oregonBasketballClubSource';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

if (process.argv.includes('--live')) {
  throw new Error('This source setup is local-only and does not accept --live.');
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
const ORG_ID = 'affiliate_org_oregon_basketball_club';
const SOURCE_ID = 'affiliate_source_oregon_basketball_club';
const SOURCE_KEY = 'oregon-basketball-club';
const MAPPING_ID = 'affiliate_mapping_oregon_basketball_club_v1';
const PUBLIC_SLUG = 'oregon-basketball-club';
const CLUB_NAME = 'Oregon Basketball Club';
const CLUB_DESCRIPTION =
  'Oregon Basketball Club is a youth basketball club offering boys and girls competitive team options from travel teams to beginning youth basketball, with teams for grades 3rd-12th, seasonal practices, skill clinics, games, and tournament play.';

const sourceMetadata = {
  inspectedAt: '2026-07-15',
  robotsUrl: OBC_ROBOTS_URL,
  robotsAllowed: true,
  robotsNote: 'Public crawling is allowed; /wp-admin/ is disallowed and was not requested. The policy specifies a 10-second crawl delay.',
  reviewedUrls: [OBC_HOME_URL, OBC_TEAMS_URL, OBC_REGISTRATION_URL, OBC_CAMPS_URL, OBC_CALENDAR_URL],
  officialLogoSourceUrl: OBC_LOGO_SOURCE_URL,
  registrationUrl: 'https://go.teamsnap.com/forms/515318',
  withheldRows: [
    {
      title: 'OBC Player Evaluation',
      sourceUrl: OBC_TEAMS_URL,
      reason: 'The page lists March 16 and 18 without a source year; the linked TeamSnap form identifies Spring & Summer 2026, which is past as of 2026-07-15.',
    },
    {
      title: 'OBC Spring Break Camp',
      sourceUrl: OBC_CAMPS_URL,
      reason: 'The page is labeled 2026 and contains conflicting March 23-25 versus March 24-26 dates; it is past as of 2026-07-15.',
    },
    {
      title: 'OBC calendar events',
      sourceUrl: OBC_CALENDAR_URL,
      reason: 'The public calendar was checked for July 2026 and did not expose future event rows; no dates were inferred from the seasonal overview.',
    },
  ],
};

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

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates('Beaverton, OR');

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: CLUB_NAME,
      location: 'Beaverton, OR',
      address: null,
      description: CLUB_DESCRIPTION,
      ownerId,
      website: OBC_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Oregon Basketball Club programs',
      publicIntroText: 'Explore OBC youth basketball teams, player evaluations, seasonal training, skill clinics, games, and tournament information.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: CLUB_NAME,
      location: 'Beaverton, OR',
      address: null,
      description: CLUB_DESCRIPTION,
      ownerId,
      website: OBC_HOME_URL,
      sports: ['Basketball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Oregon Basketball Club programs',
      publicIntroText: 'Explore OBC youth basketball teams, player evaluations, seasonal training, skill clinics, games, and tournament information.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: CLUB_NAME,
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: OBC_HOME_URL,
      listUrl: OBC_TEAMS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public OBC club source. The current public pages support an ongoing club listing; dated evaluations/camp rows are withheld when past or when the source year is not explicit.',
      metadata: sourceMetadata,
    },
    update: {
      name: CLUB_NAME,
      organizationId: ORG_ID,
      baseUrl: OBC_HOME_URL,
      listUrl: OBC_TEAMS_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: 'Public OBC club source. The current public pages support an ongoing club listing; dated evaluations/camp rows are withheld when past or when the source year is not explicit.',
      metadata: sourceMetadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: SOURCE_ID },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: SOURCE_ID,
        version: 1,
      },
    },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping: OBC_MAPPING satisfies AffiliateScrapeMapping,
      createdByUserId: null,
      notes: 'Manual public club mapping for OBC. Only the ongoing club candidate is emitted; dated evaluation and camp rows remain withheld until the source publishes reliable future dates.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping: OBC_MAPPING satisfies AffiliateScrapeMapping,
      notes: 'Manual public club mapping for OBC. Only the ongoing club candidate is emitted; dated evaluation and camp rows remain withheld until the source publishes reliable future dates.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const rows = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: CLUB_NAME,
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    rows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: CLUB_NAME,
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  if (duplicateOrgIds.length > 0) {
    const dependentEvents = await (prisma as any).events.count({
      where: { organizationId: { in: duplicateOrgIds } },
    });
    const dependentFacilities = await (prisma as any).facilities.count({
      where: { organizationId: { in: duplicateOrgIds } },
    });
    const dependentTeams = await (prisma as any).canonicalTeams.count({
      where: { organizationId: { in: duplicateOrgIds } },
    });

    if (dependentEvents === 0 && dependentFacilities === 0 && dependentTeams === 0) {
      await (prisma as any).organizations.deleteMany({
        where: {
          id: { in: duplicateOrgIds },
          name: CLUB_NAME,
          website: OBC_HOME_URL,
        },
      });
    } else {
      console.warn(`Preserved duplicate OBC org rows because dependencies exist: ${duplicateOrgIds.join(', ')}`);
    }
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();

  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Oregon Basketball Club affiliate source ready: ${SOURCE_KEY}`);
  console.log(`Mapping: ${MAPPING_ID}`);
  console.log(`${OBC_MANUAL_CANDIDATES.length} manual club candidate configured.`);
  console.log(`${sourceMetadata.withheldRows.length} dated/program row(s) withheld.`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    await relinkClubCandidateToSourceOrganization();
    // The generic scraper marks discovered club organizations as unlisted. Reapply
    // the intended public source-org state after relinking the candidate.
    await upsertOrganization(owner.id);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to fetch the official teams page and create/update the club candidate.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-oregon-basketball-club-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
