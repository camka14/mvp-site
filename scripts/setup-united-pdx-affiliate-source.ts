import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

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
const ORG_ID = 'affiliate_org_united_pdx';
const LOGO_FILE_ID = 'affiliate_file_united_pdx_logo';
const SOURCE_ID = 'affiliate_source_united_pdx_programs';
const SOURCE_KEY = 'united-pdx-programs';
const MAPPING_ID = 'affiliate_source_united_pdx_programs_mapping_v1';
const HOME_URL = 'https://www.unitedpdx.com/';
const CAMPS_URL = 'https://www.unitedpdx.com/camps/';
const ID_CAMP_URL = 'https://www.unitedpdx.com/idcamp/';
const YDA_URL = 'https://www.unitedpdx.com/u8-u10-youth-development-academy/';
const ACADEMY_URL = 'https://www.unitedpdx.com/u11-u19-united-pdx-academy/';
const CAMP_REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0zMjAtMTc2OTcyOTQ1NXwrVHpPaU05RGhmaXJuQXV5dWdSR3hkdGhtMVBIbHBuSVlRRUlFYUJSNXhBPQ==&program_id=79574';
const ID_CAMP_REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0zMjAtMTc4NTY5NDI3MXw3UUdyY29JUnlSYlI3NW11M1o1WnI1czJSMEFERkpmU1pncnI0UnJ2YnFnPQ==&program_id=105144';
const YDA_WEST_REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0zMjAtMTc4MDI1MjUwMXxRaWkrV1c5VmVUMFNQU0Q1eEEyamt0QVNhTDhSY3RMNURObkdaSGxSRjZrPQ==&program_id=95637';
const YDA_EAST_REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0zMjAtMTc4MDI1MjUwMXxRaWkrV1c5VmVUMFNQU0Q1eEEyamt0QVNhTDhSY3RMNURObkdaSGxSRjZrPQ==&program_id=95632';
const LOGO_SOURCE_URL = 'https://www.unitedpdx.com/wp-content/uploads/sites/61/2023/03/MicrosoftTeams-image__27_.png';
const ORGANIZER_NAME = 'United PDX';
const GRANT_ADDRESS = '2245 NE 36th Ave, Portland, OR 97212';
const WEST_HILLS_ADDRESS = '7945 SW Capitol Hill Rd, Portland, OR 97219';

const ageDivision = (name: string, divisionTypeId: string, priceCents: number, maxParticipants: number | null = null) => ({
  name,
  key: `c_${divisionTypeId}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  priceCents,
  maxParticipants,
  ageCutoffLabel: `${name} using the August 1 youth soccer seasonal age cycle`,
  ageCutoffSource: 'United PDX source page',
});

const mapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'United PDX Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode', 'dateDisplayText'],
  },
  manualCandidates: [
    {
      listingKind: 'CLUB',
      title: ORGANIZER_NAME,
      officialActionUrl: HOME_URL,
      sourceUrl: HOME_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer club',
      city: 'Portland, OR',
      venueName: 'United PDX',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'United PDX runs youth soccer academy programs, recreational soccer, camps, and college ID opportunities.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Club programs by season',
      participantOptionsText: 'Youth academy teams, recreational programs, camps, and development programs.',
      description: 'United PDX is a Portland youth soccer club with U8-U10 Youth Development Academy, U11-U18/19 academy pathways, recreational soccer, camps, college ID programming, and PlayMetrics registration links for current programs.',
      warnings: [
        'Publishes as a public organization candidate, not as an evergreen event.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'United PDX College ID Camp',
      officialActionUrl: ID_CAMP_REGISTRATION_URL,
      sourceUrl: ID_CAMP_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'College ID camp',
      city: 'Portland, OR',
      venueName: 'Grant High School Turf Field',
      address: GRANT_ADDRESS,
      startsAt: '2026-07-14T16:00:00-07:00',
      endsAt: '2026-07-15T16:30:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 14-15. Girls train July 14 from 4:00-6:00 PM and July 15 from 11:00 AM-1:00 PM. Boys train July 14 from 7:00-9:00 PM and July 15 from 2:00-4:00 PM, with a post-camp coach Q&A after each block.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 14-15, 2026',
      skillLevel: 'College recruiting showcase',
      ageGroup: 'U16-U19 and JUCO players',
      divisionText: 'Girls U16-U19/JUCO; Boys U16-U19',
      maxParticipantsText: '60 players per gender',
      participantOptionsText: 'Individual registration',
      priceText: '$200-$250',
      statusText: 'Registration open on the official PlayMetrics form.',
      description: 'United PDX describes the College ID Camp as a two-day recruiting showcase at Grant High School where players train under college coaches and attend post-camp coach Q&A sessions. The source says attendance is capped at 60 players per gender. Boys camp is open to U16-U19 players, and girls camp is open to U16-U19 and JUCO players. Early registration before July 11 is $200, and the standard rate on or after July 11 is $250.',
      divisions: [
        {
          name: 'Girls U16-U19/JUCO',
          key: 'f_u19',
          gender: 'F',
          ratingType: 'AGE',
          divisionTypeId: 'u19',
          priceCents: 20000,
          maxParticipants: 60,
          ageCutoffLabel: 'U16-U19 and JUCO girls',
          ageCutoffSource: 'United PDX College ID Camp page',
        },
        {
          name: 'Boys U16-U19',
          key: 'm_u19',
          gender: 'M',
          ratingType: 'AGE',
          divisionTypeId: 'u19',
          priceCents: 20000,
          maxParticipants: 60,
          ageCutoffLabel: 'U16-U19 boys',
          ageCutoffSource: 'United PDX College ID Camp page',
        },
      ],
      warnings: [
        'The source page prints July 14-15 without a year next to the heading; this candidate maps it to the current 2026 registration page for admin review.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'United PDX Summer Camp at Grant HS',
      officialActionUrl: CAMP_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer summer camp',
      city: 'Portland, OR',
      venueName: 'Grant High School Turf Field',
      address: GRANT_ADDRESS,
      startsAt: '2026-07-13T09:00:00-07:00',
      endsAt: '2026-07-17T14:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 13-17, 2026 from 9:00 AM to 2:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 13-17, 2026',
      skillLevel: 'All ability levels',
      ageGroup: 'Ages 6-12',
      divisionText: 'Coed U12',
      participantOptionsText: 'Individual registration',
      priceText: '$350',
      statusText: 'Registration open on the official PlayMetrics form.',
      description: 'United PDX Summer Camp at Grant High School is listed for July 13-17, 2026 from 9:00 AM to 2:00 PM. United PDX says the camps are for soccer players ages 6-12, open to all ability levels, and focus on technical and tactical development in an age-appropriate environment with games and a camp World Cup tournament.',
      divisions: [
        ageDivision('U12', 'u12', 35000),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'United PDX Summer Camp at West Hills Christian',
      officialActionUrl: CAMP_REGISTRATION_URL,
      sourceUrl: CAMPS_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer summer camp',
      city: 'Portland, OR',
      venueName: 'West Hills Christian School',
      address: WEST_HILLS_ADDRESS,
      startsAt: '2026-07-20T09:00:00-07:00',
      endsAt: '2026-07-24T14:00:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'July 20-24, 2026 from 9:00 AM to 2:00 PM.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'July 20-24, 2026',
      skillLevel: 'All ability levels',
      ageGroup: 'Ages 6-12',
      divisionText: 'Coed U12',
      participantOptionsText: 'Individual registration',
      priceText: '$350',
      statusText: 'Registration open on the official PlayMetrics form.',
      description: 'United PDX Summer Camp at West Hills Christian is listed for July 20-24, 2026 from 9:00 AM to 2:00 PM. United PDX says the camps are for soccer players ages 6-12, open to all ability levels, and focus on technical and tactical development in an age-appropriate environment with games and a camp World Cup tournament.',
      divisions: [
        ageDivision('U12', 'u12', 35000),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'United PDX YDA West Summer/Fall Program',
      officialActionUrl: YDA_WEST_REGISTRATION_URL,
      sourceUrl: YDA_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth Development Academy',
      city: 'Portland, OR',
      venueName: 'United PDX West',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: '2026/27 Summer/Fall program with two trainings per week, an 8-game fall season, and summer jamborees with dates to be determined.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: '2026/27 Summer/Fall registration open',
      skillLevel: 'Youth development academy',
      ageGroup: 'U8-U10',
      divisionText: 'U8; U9; U10',
      participantOptionsText: 'Individual player registration',
      priceText: '$875',
      statusText: 'Summer/Fall registration is open on the official PlayMetrics form.',
      description: 'United PDX YDA West is a Youth Development Academy program for U8, U9, and U10 players. The source says the 2026/27 Summer/Fall program fee is $875 and includes two trainings per week, an 8-game fall season, summer jamborees with dates to be determined, and optional summer tournaments for an additional fee.',
      divisions: [
        ageDivision('U8', 'u8', 87500),
        ageDivision('U9', 'u9', 87500),
        ageDivision('U10', 'u10', 87500),
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'United PDX YDA East Summer/Fall Program',
      officialActionUrl: YDA_EAST_REGISTRATION_URL,
      sourceUrl: YDA_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth Development Academy',
      city: 'Portland, OR',
      venueName: 'United PDX East',
      address: 'Portland, OR',
      timeZone: 'America/Los_Angeles',
      scheduleText: '2026/27 Summer/Fall program with two trainings per week, an 8-game fall season, and summer jamborees with dates to be determined.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: '2026/27 Summer/Fall registration open',
      skillLevel: 'Youth development academy',
      ageGroup: 'U8-U10',
      divisionText: 'U8; U9; U10',
      participantOptionsText: 'Individual player registration',
      priceText: '$875',
      statusText: 'Summer/Fall registration is open on the official PlayMetrics form.',
      description: 'United PDX YDA East is a Youth Development Academy program for U8, U9, and U10 players. The source says the 2026/27 Summer/Fall program fee is $875 and includes two trainings per week, an 8-game fall season, summer jamborees with dates to be determined, and optional summer tournaments for an additional fee.',
      divisions: [
        ageDivision('U8', 'u8', 87500),
        ageDivision('U9', 'u9', 87500),
        ageDivision('U10', 'u10', 87500),
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

const downloadLogo = async () => {
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download logo ${LOGO_SOURCE_URL}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'united-pdx-logo.png',
    contentType,
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'united-pdx-logo.png',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'united-pdx-logo.png',
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: ORG_ID },
    select: { coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates('Portland, OR')
    ?? existing?.coordinates
    ?? null;

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'United PDX is a Portland youth soccer club with academy, recreational, camp, college ID, and development programming.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: 'Portland, OR',
      description: 'United PDX is a Portland youth soccer club with academy, recreational, camp, college ID, and development programming.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer'],
      status: 'UNLISTED',
      coordinates,
      operatesAthleticFacility: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'United PDX Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'CLUB',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual United PDX source. Produces a public club candidate plus current YDA, camp, and College ID Camp rows.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'unitedpdx.com robots.txt only disallows the WPForms upload directory and otherwise leaves public pages open.',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedRows: [
        {
          title: 'U11-U18/19 Academy 26/27 Tryout Registration',
          url: ACADEMY_URL,
          reason: 'Tryout registration has no current future tryout dates exposed and should not be turned into an evergreen event.',
        },
        {
          title: 'June 2026 United PDX summer camps',
          url: CAMPS_URL,
          reason: 'June camp dates are already past as of 2026-07-06.',
        },
      ],
      sourcePages: [
        HOME_URL,
        CAMPS_URL,
        ID_CAMP_URL,
        YDA_URL,
        ACADEMY_URL,
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...sourcePayload,
    },
    update: {
      updatedAt: new Date(),
      ...sourcePayload,
    },
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
      notes: 'Manual United PDX club, camp, and program candidates.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual United PDX club, camp, and program candidates.',
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
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  const shouldScrape = process.argv.includes('--scrape');
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    const logs = (result.run as any).logs ?? {};
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved (created ${logs.createdCandidateCount ?? 0}, updated ${logs.updatedCandidateCount ?? 0}, rejected ${logs.rejectedCount ?? 0}).`);
    for (const candidate of result.candidates) {
      console.log(`- ${candidate.listingKind}: ${candidate.title} [${candidate.dateDisplayMode ?? 'SCHEDULED'} ${candidate.dateDisplayText ?? candidate.startsAt ?? 'not specified'}]`);
    }
  } else {
    console.log(`Configured affiliate source ${SOURCE_KEY}. Run with --scrape to create/update candidates.`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma && typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  });
