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
const ORG_ID = 'affiliate_org_lake_oswego_parks_recreation';
const LOGO_FILE_ID = 'affiliate_file_lake_oswego_parks_recreation_logo';
const LOGO_PATH = 'affiliate_org_lake_oswego_parks_recreation-lopr-logo-upscaled.png';
const SOURCE_ID = 'affiliate_source_lake_oswego_adult_basketball';
const SOURCE_KEY = 'lake-oswego-adult-basketball';
const MAPPING_ID = 'affiliate_mapping_lake_oswego_adult_basketball_v1';
const LIST_URL = 'https://www.ci.oswego.or.us/parksrec/adult-basketball-league-0';
const BASE_URL = 'https://www.ci.oswego.or.us/parksrec';
const LOGO_SOURCE_URL = 'https://www.ci.oswego.or.us/sites/default/files/LOPR-Logo-Color-RGB.png';

const leagueDescription = 'Lake Oswego Parks & Recreation runs a Summer 2026 adult basketball league on Sundays, July 12 through September 13, at Lake Oswego Recreation and Aquatics Center. The league includes six games plus a season tournament with officials provided. Team managers create teams through LOPR, and approved roster players sign up using the team name and password.';

const baseLeagueCandidate = {
  sourceUrl: LIST_URL,
  organizerName: 'Lake Oswego Parks & Recreation',
  sportName: 'Basketball',
  formatLabel: 'League',
  city: 'Lake Oswego, OR',
  venueName: 'Lake Oswego Recreation and Aquatics Center',
  address: '17525 Stafford Rd, Lake Oswego, OR 97034',
  startsAt: '2026-07-12T12:00:00-07:00',
  endsAt: '2026-09-13T20:00:00-07:00',
  scheduleText: 'July 12 - Sept 13, 2026 | Sundays, 12-8 p.m. | 6 games plus season tournament | Officials provided',
  participantOptionsText: 'Team manager setup with approved roster-player registration and individual player payment through LOPR.',
  priceText: 'Regular per-player fee: $101 residents, $123 non-residents. Early bird fees before the team deadline were $86 resident and $108 non-resident.',
  statusText: 'Registration is open. Team registration closed June 24, 2026, and additional players may be added throughout the season.',
  description: leagueDescription,
  timeZone: 'America/Los_Angeles',
};

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Lake Oswego Summer Adult Basketball League',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      ...baseLeagueCandidate,
      title: "Lake Oswego Summer Adult Basketball League - Men's 18+",
      officialActionUrl: 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26641?onlineSiteId=0&locale=en-US&from_original_cui=true',
      ageGroup: 'Men 18+',
      divisionText: "Men's 18+",
      divisions: [
        {
          name: "Men's 18+",
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '18plus',
          ageCutoffLabel: '18+',
          ageCutoffSource: 'City of Lake Oswego division registration link',
        },
      ],
    },
    {
      ...baseLeagueCandidate,
      title: "Lake Oswego Summer Adult Basketball League - Men's 30+",
      officialActionUrl: 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26642?onlineSiteId=0&locale=en-US&from_original_cui=true',
      ageGroup: 'Men 30+',
      divisionText: "Men's 30+",
      divisions: [
        {
          name: "Men's 30+",
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: '30plus',
          ageCutoffLabel: '30+',
          ageCutoffSource: 'City of Lake Oswego division registration link',
        },
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
    originalName: 'lake-oswego-parks-rec-logo.png',
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
      originalName: 'lake-oswego-parks-rec-logo.png',
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
      originalName: 'lake-oswego-parks-rec-logo.png',
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
      name: 'Lake Oswego Parks & Recreation',
      location: 'Lake Oswego, OR',
      address: '17525 Stafford Rd, Lake Oswego, OR 97034',
      description: 'Lake Oswego Parks & Recreation operates city recreation programs, adult sports leagues, drop-in sports, park facilities, and registration through the City of Lake Oswego and LOPR/ActiveCommunities systems.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Basketball'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.687027, 45.398621],
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'GOVERNMENT_ENTITY',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Lake Oswego Parks & Recreation',
      location: 'Lake Oswego, OR',
      address: '17525 Stafford Rd, Lake Oswego, OR 97034',
      description: 'Lake Oswego Parks & Recreation operates city recreation programs, adult sports leagues, drop-in sports, park facilities, and registration through the City of Lake Oswego and LOPR/ActiveCommunities systems.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Basketball'],
      status: 'UNLISTED',
      coordinates: [-122.687027, 45.398621],
      operatesAthleticFacility: true,
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
      name: 'Lake Oswego Adult Basketball',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'City-hosted adult basketball league source. The City page owns the season, divisions, fees, venue, and registration copy; ActiveCommunities detail URLs are stored as affiliate action links.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'City of Lake Oswego with ActiveCommunities registration links',
        logoSourceUrl: LOGO_SOURCE_URL,
        venueCoordinatesSource: 'Bing Maps link on source page',
      },
    },
    update: {
      name: 'Lake Oswego Adult Basketball',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'City-hosted adult basketball league source. The City page owns the season, divisions, fees, venue, and registration copy; ActiveCommunities detail URLs are stored as affiliate action links.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'City of Lake Oswego with ActiveCommunities registration links',
        logoSourceUrl: LOGO_SOURCE_URL,
        venueCoordinatesSource: 'Bing Maps link on source page',
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
      notes: 'Selector mapping for the two City of Lake Oswego adult basketball division registration links, with source-derived shared league details and fees.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Selector mapping for the two City of Lake Oswego adult basketball division registration links, with source-derived shared league details and fees.',
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

  console.log(`Lake Oswego affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-lake-oswego-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
