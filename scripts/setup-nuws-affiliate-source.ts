import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_northwest_united_womens_soccer';
const LOGO_FILE_ID = 'affiliate_file_nuws_logo';
const LOGO_PATH = 'affiliate_org_northwest_united_womens_soccer-nuws-logo-upscaled.png';
const SOURCE_ID = 'affiliate_source_nuws_fall_2026_registration';
const SOURCE_KEY = 'nuws-fall-2026-registration';
const MAPPING_ID = 'affiliate_mapping_nuws_fall_2026_registration_v1';
const BASE_URL = 'https://www.oregonwomenssoccer.com/';
const LEAGUE_URL = 'https://www.oregonwomenssoccer.com/page/show/8505957-league';
const SEASONS_URL = 'https://www.oregonwomenssoccer.com/page/show/8505944-seasons-and-divisions';
const REGISTRATION_URL = 'https://oregonwomenssoccer.sportngin.com/register/form/833129740';
const LIST_URL = REGISTRATION_URL;
const LOGO_SOURCE_URL = 'https://cdn1.sportngin.com/attachments/touch_icon_graphic/a451-146209654/nuws_icon_size_192.png';
const ORG_SPORTS = ['Grass Soccer'];

const divisionSource = 'NUWS Seasons and Divisions page.';
const baseDivisionPriceCents = 50000;

const divisionDescriptions = [
  {
    name: 'Division 1',
    key: 'f_skill_division_1',
    divisionTypeId: 'division_1',
    ageCutoffLabel: null,
    ageCutoffSource: 'Most competitive NUWS division; generally younger ex-college players with faster, physical play.',
  },
  {
    name: 'Division 2',
    key: 'f_skill_division_2',
    divisionTypeId: 'division_2',
    ageCutoffLabel: null,
    ageCutoffSource: 'Competitive NUWS division for older ex-college or highly skilled players with faster, physical play.',
  },
  {
    name: 'Division 3',
    key: 'f_skill_division_3',
    divisionTypeId: 'division_3',
    ageCutoffLabel: null,
    ageCutoffSource: 'Competitive NUWS division for ex-college and intermediate-level players at a moderate pace.',
  },
  {
    name: 'Division 4',
    key: 'f_skill_division_4',
    divisionTypeId: 'division_4',
    ageCutoffLabel: null,
    ageCutoffSource: 'Intermediate competitive NUWS division.',
  },
  {
    name: 'Division 5',
    key: 'f_skill_division_5',
    divisionTypeId: 'division_5',
    ageCutoffLabel: null,
    ageCutoffSource: 'Recreational to intermediate NUWS division.',
  },
  {
    name: 'Division 6',
    key: 'f_skill_division_6',
    divisionTypeId: 'division_6',
    ageCutoffLabel: null,
    ageCutoffSource: 'Recreational NUWS division for generally older or less experienced players.',
  },
  {
    name: 'Division 7',
    key: 'f_skill_division_7_30plus',
    divisionTypeId: 'division_7_30plus',
    ageCutoffLabel: '30+',
    ageCutoffSource: 'NUWS describes Division 7 as limited to players over 30.',
  },
];

const divisions = divisionDescriptions.map((division) => ({
  ...division,
  gender: 'F' as const,
  ratingType: 'SKILL' as const,
  priceCents: baseDivisionPriceCents,
  ageCutoffSource: `${division.ageCutoffSource} ${divisionSource}`,
}));

const leagueDescription = 'Northwest United Women\'s Soccer is a non-profit recreational women\'s soccer league in the Greater Portland area with more than 50 teams and 750 players. NUWS says the fall season is a 10-week Sunday season, with games primarily scheduled at 10am, noon, and 2pm, plus later games when field availability requires it. Teams register through the official SportsEngine form and division placement is handled through the league registration process.';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'NUWS Fall 2026 Women\'s Soccer League',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: REGISTRATION_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      title: 'NUWS Fall 2026 Women\'s Soccer League',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: REGISTRATION_URL,
      organizerName: 'Northwest United Women\'s Soccer',
      sportName: 'Grass Soccer',
      formatLabel: 'Fall women\'s soccer league',
      city: 'Portland, OR',
      venueName: 'Greater Portland area',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'NUWS says the fall season is a 10-week Sunday season. Games are primarily scheduled at 10am, noon, and 2pm, with later or evening games based on field availability.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall 2026 registration open through July 19',
      registrationDeadlineText: 'July 19, 2026',
      ageGroup: null,
      participantOptionsText: 'Team registration through SportsEngine.',
      priceText: 'From $500 per team; teams without their own home field pay an additional $750 home field fee.',
      statusText: 'Fall 2026 team registration is open through July 19, 2026.',
      description: leagueDescription,
      divisions,
      warnings: [
        'Stored as a no-fixed-date registration listing because NUWS publishes fall registration status and season structure but no exact public start date on the inspected pages.',
        'The numeric event price uses the required $150 NUWS fee plus $350 referee fee; the optional $750 home-field fee remains in priceText instead of being applied to every team.',
      ],
    },
  ],
};

const requireOwner = async () => {
  const owner = await (prisma as any).authUser.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true },
  });
  if (!owner?.id) {
    throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  }
  return owner;
};

const upsertLogo = async (ownerId: string) => {
  const logoAbsolutePath = path.join(process.cwd(), 'uploads', LOGO_PATH);
  const data = await fs.readFile(logoAbsolutePath);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'nuws-logo-upscaled.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });

  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'nuws-logo-upscaled.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'nuws-logo-upscaled.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Northwest United Women\'s Soccer',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Northwest United Women\'s Soccer is a non-profit recreational women\'s soccer league serving the Greater Portland area with more than 50 teams, spring and fall league seasons, divisional play, player resources, and team registration through SportsEngine.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ORG_SPORTS,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.6784, 45.5152],
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Northwest United Women\'s Soccer',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Northwest United Women\'s Soccer is a non-profit recreational women\'s soccer league serving the Greater Portland area with more than 50 teams, spring and fall league seasons, divisional play, player resources, and team registration through SportsEngine.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ORG_SPORTS,
      status: 'UNLISTED',
      coordinates: [-122.6784, 45.5152],
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
      name: 'NUWS Fall 2026 Registration',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual no-fixed-date source for the current NUWS fall registration form. The direct SportsEngine form exposes Fall 2026 registration and fees, while the official public pages provide league season/division context but no exact start date, so the mapping emits one Fall 2026 league registration candidate linked to SportsEngine.',
      metadata: {
        inspectedAt: '2026-07-04',
        robotsAllowed: true,
        robotsNote: 'robots.txt allows public pages and disallows deep event calendar paths; inspection stayed on public home, league, seasons/divisions, and direct registration pages.',
        logoSourceUrl: LOGO_SOURCE_URL,
        homeUrl: BASE_URL,
        leagueUrl: LEAGUE_URL,
        seasonsUrl: SEASONS_URL,
        registrationUrl: REGISTRATION_URL,
        inspectionScreenshots: [
          'output/playwright/nuws-seasons-divisions.png',
          'output/playwright/nuws-fall-2026-registration.png',
        ],
      },
    },
    update: {
      name: 'NUWS Fall 2026 Registration',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual no-fixed-date source for the current NUWS fall registration form. The direct SportsEngine form exposes Fall 2026 registration and fees, while the official public pages provide league season/division context but no exact start date, so the mapping emits one Fall 2026 league registration candidate linked to SportsEngine.',
      metadata: {
        inspectedAt: '2026-07-04',
        robotsAllowed: true,
        robotsNote: 'robots.txt allows public pages and disallows deep event calendar paths; inspection stayed on public home, league, seasons/divisions, and direct registration pages.',
        logoSourceUrl: LOGO_SOURCE_URL,
        homeUrl: BASE_URL,
        leagueUrl: LEAGUE_URL,
        seasonsUrl: SEASONS_URL,
        registrationUrl: REGISTRATION_URL,
        inspectionScreenshots: [
          'output/playwright/nuws-seasons-divisions.png',
          'output/playwright/nuws-fall-2026-registration.png',
        ],
      },
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
      mapping,
      createdByUserId: null,
      notes: 'Manual mapping for NUWS Fall 2026 team registration with seven source-described divisions and a no-fixed-date display.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual mapping for NUWS Fall 2026 team registration with seven source-described divisions and a no-fixed-date display.',
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
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`NUWS affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-nuws-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
