import dotenv from 'dotenv';
import sharp from 'sharp';
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
const ORG_ID = 'affiliate_org_soccer_chance_academy';
const LOGO_FILE_ID = 'affiliate_file_soccer_chance_academy_logo';
const SOURCE_ID = 'affiliate_source_oregon_super_cup';
const SOURCE_KEY = 'oregon-super-cup';
const MAPPING_ID = 'affiliate_source_oregon_super_cup_mapping_v1';
const HOME_URL = 'https://soccerchanceacademy.us/';
const LIST_URL = 'https://soccerchanceacademy.us/super-cup/';
const REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=U2lnbnVwLkdCLlYyLTEwNzgtU0NBIC0gVG91cm5hbWVudHMtLTE3Njg0NDYwMjR8ZlZYM2lOQ0hBTW5BY0V3QVVpYXVtZ3pxcGo4YlplcWRVaWVRMlZvYjV3ND0%3D&program_id=1795';
const TEAM_APPLICATION_URL = 'https://playmetrics.com/signup?clubToken=U2lnbnVwLkdCLlYyLTEwNzgtU29jY2VyIENoYW5jZSBBY2FkZW15LS0xNzQyMDcyMTUzfE1Qb3VoelpIR3hBRU9reDczQ0o0UGVrNHQzdENmTnphZC9tTVhVZTBjZ1U9&program_id=1251';
const LOGO_SOURCE_URL = 'https://soccerchanceacademy.us/wp-content/uploads/2026/02/sca-web-logo-new.png';
const ORGANIZER_NAME = 'Soccer Chance Academy Portland';
const ORG_ADDRESS = '1500 SE 96th Ave, Portland, OR 97216';
const PUBLIC_SLUG = 'soccer-chance-academy-portland';
const ORGANIZER_DESCRIPTION = 'Soccer Chance Academy Portland is a youth soccer academy offering player development, academy programs, camps, futsal training, tournaments such as Oregon Super Cup, and soccer education programs for players in the Portland metro area.';
const VENUE_ADDRESS = '3101 S Hillhurst Road, Ridgefield, WA 98642';

const division = (
  name: string,
  divisionTypeId: string,
  priceCents: number | null,
  maxParticipants: number | null,
) => ({
  name,
  key: `c_${divisionTypeId}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  priceCents,
  maxParticipants,
  ageCutoffLabel: `${name} using August 1-July 31 grade-level birth years`,
  ageCutoffSource: 'Oregon Super Cup page',
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Oregon Super Cup',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: REGISTRATION_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayText'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Oregon Super Cup',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: LIST_URL,
      organizerName: ORGANIZER_NAME,
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer tournament',
      city: 'Ridgefield, WA',
      venueName: 'Ridgefield Outdoor Recreation Complex',
      address: VENUE_ADDRESS,
      startsAt: '2026-08-07T00:00:00-07:00',
      endsAt: '2026-08-09T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'August 7-9, 2026 across three tournament days. The source does not list individual game times yet.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 7-9, 2026',
      skillLevel: 'Competitive youth tournament',
      ageGroup: 'U8-U18',
      divisionText: 'U8; U9; U10; U11; U12; U13; U14; U15; U16; U17; U18',
      maxParticipantsText: 'Max roster size is 14 for U9-U10 and 18 for U11-U18. U8 roster cap is not separately specified.',
      participantOptionsText: 'Team registration',
      priceText: '$795-$995',
      registrationDeadlineText: 'July 15, 2026',
      statusText: 'Registration and team application links are hosted on PlayMetrics.',
      description: `The Oregon Super Cup is a competitive youth soccer tournament hosted by Soccer Chance Academy in the Portland metro area, with teams from Oregon, California, Seattle, Canada, and Europe. The source lists three days of 7v7, 9v9, and 11v11 games from August 7-9, a July 15, 2026 registration deadline, and Ridgefield Outdoor Recreation Complex as the tournament location. Registration fees are $795 for U9-U10 7v7, $895 for U11-U12 9v9, and $995 for U13-U18 11v11. U8 is listed in the age groups, but no separate U8 fee is shown. Parking is listed as $20 for the weekend. Team application link: ${TEAM_APPLICATION_URL}`,
      divisions: [
        division('U8', 'u8', null, 14),
        division('U9', 'u9', 79500, 14),
        division('U10', 'u10', 79500, 14),
        division('U11', 'u11', 89500, 18),
        division('U12', 'u12', 89500, 18),
        division('U13', 'u13', 99500, 18),
        division('U14', 'u14', 99500, 18),
        division('U15', 'u15', 99500, 18),
        division('U16', 'u16', 99500, 18),
        division('U17', 'u17', 99500, 18),
        division('U18', 'u18', 99500, 18),
      ],
      warnings: [
        'The public page lists August 7-9th and a July 15, 2026 registration deadline; the event year is mapped to 2026 for review.',
        'U8 appears in age groups but no separate U8 fee is listed.',
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
  const background = '#ffffff';
  const flattened = await sharp(data, { animated: false })
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 8 })
    .png()
    .toBuffer()
    .catch(async () => sharp(data, { animated: false }).rotate().flatten({ background }).png().toBuffer());
  const logo = await sharp(flattened)
    .resize({ width: 860, height: 560, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 860;
  const height = metadata.height ?? 560;
  const square = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background,
    },
  })
    .composite([{
      input: logo,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .png()
    .toBuffer();
  return { data: square, contentType: 'image/png' };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'soccer-chance-academy-logo-square.png',
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
      originalName: 'soccer-chance-academy-logo-square.png',
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
      originalName: 'soccer-chance-academy-logo-square.png',
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
  const coordinates = await geocodeAddressToCoordinates(ORG_ADDRESS)
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
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Soccer Chance Academy Portland programs',
      publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Portland, OR',
      address: ORG_ADDRESS,
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer', 'Indoor Soccer'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Soccer Chance Academy Portland programs',
      publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
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
    name: 'Oregon Super Cup',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual Oregon Super Cup tournament candidate from Soccer Chance Academy public page.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'soccerchanceacademy.us robots.txt disallows /wp-admin/ and allows admin-ajax; the public Super Cup page is allowed.',
      logoSourceUrl: LOGO_SOURCE_URL,
      teamApplicationUrl: TEAM_APPLICATION_URL,
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
      notes: 'Manual Oregon Super Cup tournament mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Oregon Super Cup tournament mapping.',
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

  if (process.argv.includes('--scrape')) {
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
