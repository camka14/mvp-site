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
const ORG_ID = 'affiliate_org_nwibl';
const LOGO_FILE_ID = 'affiliate_file_nwibl_logo';
const LOGO_PATH = 'affiliate_org_nwibl-nwibl-logo-upscaled.png';
const SOURCE_ID = 'affiliate_source_nwibl_adult_baseball_registration';
const SOURCE_KEY = 'nwibl-adult-baseball-registration';
const MAPPING_ID = 'affiliate_mapping_nwibl_adult_baseball_registration_v1';
const LIST_URL = 'https://www.nwibl.org/nwibl/AboutUs';
const BASE_URL = 'https://www.nwibl.org/nwibl/';
const REGISTRATION_URL = 'https://app.teamlinkt.com/register/find/nwibl';
const NEW_PLAYER_REGISTRATION_URL = 'https://app.teamlinkt.com/register/go/nwibl/152497?si=0';
const LOGO_SOURCE_URL = 'https://cdn-app.teamlinkt.com/media/association_data/35370/site_data/images/1.png?v=1771910044';
const ORG_SPORTS = ['Baseball'];

const leagueDescription = 'Northwest Independent Baseball League is a Portland-area adult wood-bat baseball league. NWIBL says the 2025 season hosted more than two dozen teams and nearly 300 games, and the 2026 season is adding teams and locations. The league offers 18 and older, 30 and older weekend, and 30 and older weeknight divisions. Teams usually play once per week, with 14-16 regular-season games plus playoffs.';

const newPlayerDescription = 'NWIBL uses this registration form for new adult baseball players after the 2026 tryouts. The league says the season has already started, but teams may still need players during the summer, so submitted player information is passed to coaches.';

const teamPaymentDivisions = [
  {
    name: '18 and older',
    key: 'm_age_18plus',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '18plus',
    priceCents: 638500,
    ageCutoffLabel: '18+',
    ageCutoffSource: 'NWIBL About/FAQ page and TeamLinkt 2026 Team Payment registration group.',
  },
  {
    name: '30 and older weekend',
    key: 'm_age_30plus_weekend',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '30plus',
    priceCents: 599500,
    ageCutoffLabel: '30+ weekend',
    ageCutoffSource: 'NWIBL About/FAQ page and TeamLinkt 2026 Team Payment registration group.',
  },
  {
    name: '30 and older weeknight',
    key: 'm_age_30plus_weeknight',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '30plus',
    priceCents: 657000,
    ageCutoffLabel: '30+ weeknight',
    ageCutoffSource: 'NWIBL About/FAQ page and TeamLinkt 2026 Team Payment registration group.',
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Northwest Independent Baseball League Adult Baseball Registration',
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
      title: 'Northwest Independent Baseball League 2026 Adult Baseball Season',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Northwest Independent Baseball League',
      sportName: 'Baseball',
      formatLabel: 'Adult baseball league',
      city: 'Portland, OR',
      venueName: 'Portland metro baseball fields',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'NWIBL says the adult baseball season starts in late April, runs regular-season games through August, and holds playoffs in August-September. Teams usually play once per week, with occasional two-game weeks.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: '2026 adult baseball season registration',
      registrationDeadlineText: 'October 1, 2026',
      ageGroup: 'Men 18+ and 30+',
      participantOptionsText: 'Team payment registration through TeamLinkt.',
      priceText: 'Team payment fees start at $5,995. Division fees: 18+ $6,385; 30+ weekend $5,995; 30+ weeknight $6,570.',
      statusText: 'Team payment registration is open February 27-October 1, 2026.',
      description: leagueDescription,
      divisions: teamPaymentDivisions,
      warnings: [
        'Stored as an evergreen/manual league listing because the public schedule rows are league games, not public registration opportunities.',
        'Division prices come from the public TeamLinkt registration detail payload for 2026 Team Payment groups 18+, 30+ WE, and 30+ WN.',
      ],
    },
    {
      title: 'Northwest Independent Baseball League 2026 New Player Registration',
      officialActionUrl: NEW_PLAYER_REGISTRATION_URL,
      sourceUrl: REGISTRATION_URL,
      organizerName: 'Northwest Independent Baseball League',
      sportName: 'Baseball',
      formatLabel: 'Adult baseball league player registration',
      city: 'Portland, OR',
      venueName: 'Portland metro baseball fields',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'NWIBL says the 2026 tryouts were held April 4 and the season began in late April. New player information submitted after tryouts may be passed to coaches looking for mid-season players.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'New player registration open until July 15, 2026',
      registrationDeadlineText: 'July 15, 2026',
      ageGroup: 'Men 18+',
      participantOptionsText: 'Individual new-player registration after tryouts.',
      priceText: 'Free new-player registration.',
      statusText: 'New-player registration is open April 5-July 15, 2026.',
      description: newPlayerDescription,
      divisions: [
        {
          name: 'Men 18+',
          key: 'm_age_18plus',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '18plus',
          priceCents: 0,
          ageCutoffLabel: '18+',
          ageCutoffSource: 'NWIBL adult baseball league FAQ and TeamLinkt new-player registration form.',
        },
      ],
      warnings: [
        'The public TeamLinkt form does not publish a fixed event date; it is stored as a no-fixed-date registration listing.',
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
    originalName: 'nwibl-logo-upscaled.png',
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
      originalName: 'nwibl-logo-upscaled.png',
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
      originalName: 'nwibl-logo-upscaled.png',
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
      name: 'Northwest Independent Baseball League',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Northwest Independent Baseball League organizes adult wood-bat baseball in the Portland metro area with 18+ and 30+ divisions, public player registration, team payment registration, league schedules, standings, and playoffs.',
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
      name: 'Northwest Independent Baseball League',
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'Northwest Independent Baseball League organizes adult wood-bat baseball in the Portland metro area with 18+ and 30+ divisions, public player registration, team payment registration, league schedules, standings, and playoffs.',
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
      name: 'NWIBL Adult Baseball Registration',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual evergreen source for NWIBL adult baseball registration. Public game schedule rows are not imported as affiliate events; the mapping emits league registration and new-player registration candidates from the official NWIBL/TeamLinkt pages.',
      metadata: {
        inspectedAt: '2026-07-04',
        robotsAllowed: true,
        robotsNote: 'Public pages allowed; /leagues/get* endpoints are disallowed and were not used.',
        logoSourceUrl: LOGO_SOURCE_URL,
        registrationUrl: REGISTRATION_URL,
        inspectionScreenshots: [
          'output/playwright/nwibl-home.png',
          'output/playwright/nwibl-about.png',
          'output/playwright/nwibl-registration.png',
        ],
      },
    },
    update: {
      name: 'NWIBL Adult Baseball Registration',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual evergreen source for NWIBL adult baseball registration. Public game schedule rows are not imported as affiliate events; the mapping emits league registration and new-player registration candidates from the official NWIBL/TeamLinkt pages.',
      metadata: {
        inspectedAt: '2026-07-04',
        robotsAllowed: true,
        robotsNote: 'Public pages allowed; /leagues/get* endpoints are disallowed and were not used.',
        logoSourceUrl: LOGO_SOURCE_URL,
        registrationUrl: REGISTRATION_URL,
        inspectionScreenshots: [
          'output/playwright/nwibl-home.png',
          'output/playwright/nwibl-about.png',
          'output/playwright/nwibl-registration.png',
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
      notes: 'Manual evergreen mapping for NWIBL adult baseball with one league registration candidate carrying division-level team payment fees and one free new-player registration candidate.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual evergreen mapping for NWIBL adult baseball with one league registration candidate carrying division-level team payment fees and one free new-player registration candidate.',
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

  console.log(`NWIBL affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-nwibl-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
