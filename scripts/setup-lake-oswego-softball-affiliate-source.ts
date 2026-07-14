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
const SOURCE_ID = 'affiliate_source_lake_oswego_adult_slow_pitch_softball';
const SOURCE_KEY = 'lake-oswego-adult-slow-pitch-softball';
const MAPPING_ID = 'affiliate_mapping_lake_oswego_adult_slow_pitch_softball_v1';
const LIST_URL = 'https://www.ci.oswego.or.us/parksrec/adult-summer-slow-pitch-softball';
const BASE_URL = 'https://www.ci.oswego.or.us/parksrec';
const CURRENT_PROGRAMS_URL = 'https://oswegosoftball.com/current-programs';
const REGISTRATION_URL = 'https://www.oswegosoftball.com/sites/OswegoSoftball/program/110687/Lake-Oswego-Softball';
const LOGO_SOURCE_URL = 'https://www.ci.oswego.or.us/sites/default/files/LOPR-Logo-Color-RGB.png';
const ORG_SPORTS = ['Basketball', 'Softball'];

const softballDescription = 'Lake Oswego Parks & Recreation and Lake Oswego Softball describe this as a recreational adult summer slow-pitch league. Senior teams play Mondays, men\'s upper, lower, and mid divisions play Tuesday through Thursday, and coed teams play Fridays. Men\'s divisions play doubleheaders; coed and senior divisions play single games. The regular season runs seven weeks, followed by double-elimination division tournaments in August.';

const buildSoftballDivision = (
  name: string,
  key: string,
  gender: 'M' | 'C',
  divisionTypeId: string,
  priceCents: number,
  ageCutoffSource = 'City of Lake Oswego adult softball page and Lake Oswego Softball provider page',
) => ({
  name,
  key,
  gender,
  ratingType: 'SKILL' as const,
  divisionTypeId,
  priceCents,
  maxParticipants: 6,
  ageCutoffLabel: 'Adult 18+',
  ageCutoffSource,
});

const softballDivisions = [
  buildSoftballDivision(
    'Senior League',
    'c_skill_senior_age_18plus',
    'C',
    'skill_senior_age_18plus',
    100000,
    'Source labels this as adult Senior League but does not publish a numeric senior age cutoff.',
  ),
  buildSoftballDivision("Men's Upper Level", 'm_skill_upper_age_18plus', 'M', 'skill_upper_age_18plus', 100000),
  buildSoftballDivision("Men's Mid Level", 'm_skill_mid_age_18plus', 'M', 'skill_mid_age_18plus', 100000),
  buildSoftballDivision("Men's Lower Level", 'm_skill_lower_age_18plus', 'M', 'skill_lower_age_18plus', 100000),
  buildSoftballDivision('Coed Upper Level', 'c_skill_upper_age_18plus', 'C', 'skill_upper_age_18plus', 57500),
  buildSoftballDivision('Coed Mid Level', 'c_skill_mid_age_18plus', 'C', 'skill_mid_age_18plus', 57500),
  buildSoftballDivision('Coed Lower Level', 'c_skill_lower_age_18plus', 'C', 'skill_lower_age_18plus', 57500),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Lake Oswego Adult Slow-Pitch Softball League',
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
      title: 'Lake Oswego Adult Slow-Pitch Softball League',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Lake Oswego Parks & Recreation',
      sportName: 'Softball',
      formatLabel: 'Adult slow-pitch softball league',
      city: 'Lake Oswego, OR',
      venueName: 'Lake Oswego softball fields',
      address: 'Lake Oswego, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Annual summer program. Senior League plays Mondays; men\'s upper, lower, and mid divisions play Tuesday through Thursday; coed upper, mid, and lower divisions play Fridays. Men\'s divisions play doubleheaders, while coed and senior divisions play single games.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Annual summer league; 2026 registration closed',
      ageGroup: 'Adult 18+',
      participantOptionsText: 'Team registration through the official Lake Oswego softball site.',
      priceText: 'Team registration cost: $575-$1,000.',
      statusText: '2026 registration is closed. Confirm next season on the official registration site.',
      description: softballDescription,
      divisions: softballDivisions,
      warnings: [
        'Stored as an evergreen/manual program listing because the official 2026 registration window closed May 18, 2026 and the published season already started.',
        'Division prices come from the official Lake Oswego Softball More Info offering table: Senior and Men divisions are $1,000; Coed divisions are $575.',
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
      sports: ORG_SPORTS,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.687027, 45.398621],
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
      sports: ORG_SPORTS,
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
      name: 'Lake Oswego Adult Slow-Pitch Softball',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'City-hosted adult slow-pitch softball source. The 2026 registration is closed, so the active mapping emits one evergreen annual program candidate with source-derived schedule, divisions, six-slot division caps, and team cost range.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'City of Lake Oswego page with Lake Oswego Softball registration provider link',
        currentProgramsUrl: CURRENT_PROGRAMS_URL,
        officialRegistrationUrl: REGISTRATION_URL,
        logoSourceUrl: LOGO_SOURCE_URL,
        provider: 'Lake Oswego Softball / TeamSideline-powered site',
      },
    },
    update: {
      name: 'Lake Oswego Adult Slow-Pitch Softball',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'City-hosted adult slow-pitch softball source. The 2026 registration is closed, so the active mapping emits one evergreen annual program candidate with source-derived schedule, divisions, six-slot division caps, and team cost range.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'City of Lake Oswego page with Lake Oswego Softball registration provider link',
        currentProgramsUrl: CURRENT_PROGRAMS_URL,
        officialRegistrationUrl: REGISTRATION_URL,
        logoSourceUrl: LOGO_SOURCE_URL,
        provider: 'Lake Oswego Softball / TeamSideline-powered site',
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
      notes: 'Manual evergreen mapping for Lake Oswego adult slow-pitch softball with source-derived annual league summary, divisions, six-slot division caps, and offering-table team prices.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual evergreen mapping for Lake Oswego adult slow-pitch softball with source-derived annual league summary, divisions, six-slot division caps, and offering-table team prices.',
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

  console.log(`Lake Oswego softball affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-lake-oswego-softball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
