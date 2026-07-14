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
const ORG_ID = 'affiliate_org_nw_nations_baseball';
const LOGO_FILE_ID = 'affiliate_file_nw_nations_baseball_logo';
const SOURCE_ID = 'affiliate_source_nw_nations_baseball_2026_tournaments';
const SOURCE_KEY = 'nw-nations-baseball-2026-tournaments';
const MAPPING_ID = 'affiliate_source_nw_nations_baseball_2026_tournaments_mapping_v1';
const HOME_URL = 'https://nwyouthbaseball.com/';
const LIST_URL = 'https://nwyouthbaseball.com/nw-nations-2026-tournament-schedule/';
const LOGO_SOURCE_URL = 'https://nwyouthbaseball.com/wp-content/uploads/2023/09/nwn-logo.png';
const ORGANIZER_NAME = 'NW Nations Tournament Baseball';

type FeeRow = {
  label: string;
  divisionTypeId: string;
  priceCents: number;
};

const division = (row: FeeRow) => ({
  name: row.label,
  key: `c_${row.divisionTypeId}`,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId: row.divisionTypeId,
  priceCents: row.priceCents,
  maxParticipants: null,
  ageCutoffLabel: row.label,
  ageCutoffSource: 'NW Nations tournament detail page',
});

const eventCandidate = (input: {
  title: string;
  actionUrl: string;
  sourceUrl: string;
  venueName: string;
  address: string;
  city: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
  divisions: FeeRow[];
}) => ({
  listingKind: 'EVENT' as const,
  title: input.title,
  officialActionUrl: input.actionUrl,
  sourceUrl: input.sourceUrl,
  organizerName: ORGANIZER_NAME,
  sportName: 'Baseball',
  formatLabel: 'Youth baseball tournament',
  city: input.city,
  venueName: input.venueName,
  address: input.address,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `${input.dateDisplayText}. The source lists a 3-game guarantee.`,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: input.dateDisplayText,
  skillLevel: 'Youth tournament baseball',
  ageGroup: input.divisions.map((row) => row.label).join(', '),
  divisionText: input.divisions.map((row) => row.label).join('; '),
  participantOptionsText: 'Team registration',
  priceText: `$${Math.min(...input.divisions.map((row) => row.priceCents)) / 100}-$${Math.max(...input.divisions.map((row) => row.priceCents)) / 100}`,
  statusText: 'Teams must complete the 2026 NW Nations $60 annual team membership before tournament registration.',
  description: `${input.title} is a 2026 NW Nations youth baseball tournament with a 3-game guarantee. Teams must be registered with NW Nations for 2026 and pay the $60 annual team membership before entering the tournament. Entry fees vary by age division; payment can be made by check or credit card, and the source says a processing fee is added to credit-card payments.`,
  divisions: input.divisions.map(division),
});

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'NW Nations 2026 Tournament Schedule',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: LIST_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayText'],
  },
  manualCandidates: [
    eventCandidate({
      title: 'King of the NW',
      actionUrl: 'https://tourneymachine.com/E170295',
      sourceUrl: 'https://nwyouthbaseball.com/king-of-the-nw-26/',
      venueName: 'Harmony Sports Complex and area fields',
      address: 'Vancouver, WA',
      city: 'Vancouver, WA',
      startsAt: '2026-07-10T00:00:00-07:00',
      endsAt: '2026-07-12T23:59:00-07:00',
      dateDisplayText: 'July 10-12, 2026',
      divisions: [
        { label: '16U', divisionTypeId: 'u16', priceCents: 99500 },
        { label: '14U', divisionTypeId: 'u14', priceCents: 92500 },
        { label: '13U', divisionTypeId: 'u13', priceCents: 85000 },
        { label: '12U', divisionTypeId: 'u12', priceCents: 79500 },
        { label: '11U', divisionTypeId: 'u11', priceCents: 79500 },
        { label: '10U', divisionTypeId: 'u10', priceCents: 69500 },
        { label: '9U', divisionTypeId: 'u9', priceCents: 69500 },
      ],
    }),
    eventCandidate({
      title: 'Boys of Summer Classic',
      actionUrl: 'https://tourneymachine.com/E170296',
      sourceUrl: 'https://nwyouthbaseball.com/boys-of-summer-classic-26/',
      venueName: 'Ted Norman WVBR Complex and area fields',
      address: 'Eugene, OR',
      city: 'Eugene, OR',
      startsAt: '2026-07-18T00:00:00-07:00',
      endsAt: '2026-07-19T23:59:00-07:00',
      dateDisplayText: 'July 18-19, 2026',
      divisions: [
        { label: '14U', divisionTypeId: 'u14', priceCents: 92500 },
        { label: '12U', divisionTypeId: 'u12', priceCents: 79500 },
        { label: '11U', divisionTypeId: 'u11', priceCents: 79500 },
        { label: '10U', divisionTypeId: 'u10', priceCents: 69500 },
        { label: '9U', divisionTypeId: 'u9', priceCents: 69500 },
      ],
    }),
    eventCandidate({
      title: 'NWN State Championship',
      actionUrl: 'https://tourneymachine.com/E170297',
      sourceUrl: 'https://nwyouthbaseball.com/nwn-state-championship-finale-26/',
      venueName: 'Harmony Sports Complex and area fields',
      address: 'Vancouver, WA',
      city: 'Vancouver, WA',
      startsAt: '2026-07-25T00:00:00-07:00',
      endsAt: '2026-07-26T23:59:00-07:00',
      dateDisplayText: 'July 25-26, 2026',
      divisions: [
        { label: '16U', divisionTypeId: 'u16', priceCents: 99500 },
        { label: '14U', divisionTypeId: 'u14', priceCents: 92500 },
        { label: '13U', divisionTypeId: 'u13', priceCents: 85000 },
        { label: '12U', divisionTypeId: 'u12', priceCents: 79500 },
        { label: '11U', divisionTypeId: 'u11', priceCents: 79500 },
        { label: '10U', divisionTypeId: 'u10', priceCents: 69500 },
        { label: '9U', divisionTypeId: 'u9', priceCents: 69500 },
      ],
    }),
    eventCandidate({
      title: 'Newport Battle at the Bay',
      actionUrl: 'https://tourneymachine.com/E170298',
      sourceUrl: 'https://nwyouthbaseball.com/newport-battle-at-the-bay-26/',
      venueName: 'Newport, Toledo, and area fields',
      address: 'Newport, OR',
      city: 'Newport, OR',
      startsAt: '2026-08-01T00:00:00-07:00',
      endsAt: '2026-08-02T23:59:00-07:00',
      dateDisplayText: 'August 1-2, 2026',
      divisions: [
        { label: '14U', divisionTypeId: 'u14', priceCents: 99500 },
        { label: '13U', divisionTypeId: 'u13', priceCents: 95000 },
        { label: '12U', divisionTypeId: 'u12', priceCents: 89500 },
        { label: '11U', divisionTypeId: 'u11', priceCents: 89500 },
        { label: '10U', divisionTypeId: 'u10', priceCents: 79500 },
      ],
    }),
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
    originalName: 'nw-nations-baseball-logo.png',
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
      originalName: 'nw-nations-baseball-logo.png',
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
      originalName: 'nw-nations-baseball-logo.png',
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
  const coordinates = await geocodeAddressToCoordinates('Cornelius, OR')
    ?? existing?.coordinates
    ?? null;

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: ORGANIZER_NAME,
      location: 'Cornelius, OR',
      address: 'P.O. Box 36, Cornelius, OR 97113',
      description: 'NW Nations Tournament Baseball hosts youth baseball tournaments across Oregon, Washington, and the Pacific Northwest with team registration, tournament schedules, game times, and tournament policies.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Baseball'],
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
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
      location: 'Cornelius, OR',
      address: 'P.O. Box 36, Cornelius, OR 97113',
      description: 'NW Nations Tournament Baseball hosts youth baseball tournaments across Oregon, Washington, and the Pacific Northwest with team registration, tournament schedules, game times, and tournament policies.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Baseball'],
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
    name: 'NW Nations 2026 Baseball Tournaments',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual future NW Nations tournament candidates from the official 2026 schedule and detail pages.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'nwyouthbaseball.com robots.txt only sets Crawl-delay: 5 for User-agent: * and has no disallow rules.',
      logoSourceUrl: LOGO_SOURCE_URL,
      skippedRows: [
        'Past March-June 2026 events.',
        'NWN Fall League schedule row because the schedule link is not a valid detail page at inspection time.',
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
      notes: 'Manual NW Nations 2026 tournament mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual NW Nations 2026 tournament mapping.',
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
