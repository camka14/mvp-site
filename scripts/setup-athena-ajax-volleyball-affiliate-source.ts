/**
 * Athena Volleyball Academy / Ajax Volleyball Academy affiliate source setup.
 *
 * Owns public club org `affiliate_org_athena_ajax_volleyball`, source
 * `affiliate_source_athena_ajax_volleyball`, and mapping
 * `affiliate_mapping_athena_ajax_volleyball_v1`.
 *
 * Official URLs:
 * - Home: https://athenavb.net/
 * - Portland camps/training: https://athenavb.net/club/athenavbpdxtraining
 *
 * Creates/repairs the public club org, official AthenaVB/AjaxVB crest logo,
 * source row, and current future Portland training candidates from public
 * Sprocket Sports page-builder/program APIs. Safe for local or live DB; use
 * `--live` for live and `--scrape` to create/update discovered candidates.
 */
import dotenv from 'dotenv';
import path from 'path';
import sharp from 'sharp';
import type {
  AffiliateScrapeMapping,
  ScrapePageClient,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
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
const ORG_ID = 'affiliate_org_athena_ajax_volleyball';
const LOGO_FILE_ID = 'affiliate_file_athena_ajax_volleyball_logo';
const SOURCE_ID = 'affiliate_source_athena_ajax_volleyball';
const SOURCE_KEY = 'athena-ajax-volleyball';
const MAPPING_ID = 'affiliate_mapping_athena_ajax_volleyball_v1';
const BASE_URL = 'https://athenavb.net/';
const LIST_URL = 'https://athenavb.net/club/athenavbpdxtraining';
const PAGE_API_URL = 'https://athenavb.net/api/public/page-builder/page-by-url/full?customURL=athenavbpdxtraining';
const PROGRAM_API_BASE_URL = 'https://athenavb.net/api/public/content/programs/all';
const LOGO_SOURCE_URL =
  'https://ssprodst.blob.core.windows.net/logos/249/21f66242-3807-4837-9428-af9ae8d79a12-04-17-2026-06-31-56-161.png';
const PUBLIC_SLUG = 'athena-ajax-volleyball';
const VENUE_NAME = 'Olympus Sports Center';
const VENUE_ADDRESS = '3085 NE Brookwood Pkwy, Hillsboro, OR 97124';
const ORG_DESCRIPTION =
  'Athena Volleyball Academy and Ajax Volleyball Academy operate junior volleyball club, academy, camp, training, and tournament programs from Olympus Sports Center in Hillsboro, Oregon.';

type OpenRegistrationsContent = {
  programID?: number[];
  registrationID?: number[];
};

type AthenaProgramRow = {
  programID: number;
  programName: string;
  registrationID: number;
  registrationName: string;
  programStartDate: string;
  programEndDate: string;
  startTime: string | null;
  endTime: string | null;
  practiceFacilityName: string | null;
  gender: string | null;
  registrationGradesLabel: string | null;
  registrationAgeClassesLabel: string | null;
  price: number | null;
  dayOfWeekLabel: string | null;
  clubUrl: string | null;
  linkURL: string | null;
};

const staticManualPageClient: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>AthenaVB/AjaxVB manual source snapshot.</main></body></html>',
    };
  },
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

const findOpenRegistrationsContent = (value: unknown): OpenRegistrationsContent | null => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOpenRegistrationsContent(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const openRegistrationsContent = record.openRegistrationsContent;
  if (openRegistrationsContent && typeof openRegistrationsContent === 'object') {
    return openRegistrationsContent as OpenRegistrationsContent;
  }

  for (const item of Object.values(record)) {
    const found = findOpenRegistrationsContent(item);
    if (found) return found;
  }
  return null;
};

const createProgramsUrl = (content: OpenRegistrationsContent): string => {
  const params = new URLSearchParams();
  (content.programID ?? []).forEach((programId) => params.append('programID', String(programId)));
  (content.registrationID ?? []).forEach((registrationId) => params.append('rID', String(registrationId)));
  if (!params.toString()) {
    throw new Error('AthenaVB page did not expose program or registration ids.');
  }
  return `${PROGRAM_API_BASE_URL}?${params.toString()}`;
};

const parseDatePart = (value: string): string => value.slice(0, 10);

const parseTimePart = (value: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/T(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : null;
};

const createLocalTimestamp = (dateValue: string, timeValue: string | null): string => (
  `${parseDatePart(dateValue)}T${timeValue ?? '00:00:00'}-07:00`
);

const formatMoney = (value: number | null): string | null => (
  typeof value === 'number' ? `$${value.toFixed(2)}` : null
);

const createDivision = (row: AthenaProgramRow) => {
  const gradeLabel = row.registrationGradesLabel?.trim() || row.registrationAgeClassesLabel?.trim() || 'Youth';
  const gender = row.gender?.toLowerCase() === 'female' ? 'F' : 'C';
  return {
    name: gradeLabel,
    key: `${gender.toLowerCase()}_${gradeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'youth'}`,
    gender: gender as 'F' | 'C',
    ratingType: 'AGE' as const,
    divisionTypeId: 'youth',
    priceCents: typeof row.price === 'number' ? Math.round(row.price * 100) : null,
    maxParticipants: null,
    ageCutoffLabel: gradeLabel,
    ageCutoffSource: 'AthenaVB/AjaxVB public Portland training table inspected 2026-07-09.',
  };
};

const createTags = (row: AthenaProgramRow): string[] => {
  const title = `${row.programName} ${row.registrationName}`.toLowerCase();
  if (title.includes('open gym')) return ['Open Play'];
  if (title.includes('tournament') || title.includes('quads')) return ['Tournament'];
  if (title.includes('clinic')) return ['Clinic'];
  return ['Camp'];
};

const createFormatLabel = (row: AthenaProgramRow): string => {
  const tags = createTags(row);
  if (tags.includes('Open Play')) return 'Youth volleyball open gym';
  if (tags.includes('Tournament')) return 'Youth volleyball tournament';
  if (tags.includes('Clinic')) return 'Youth volleyball clinic';
  return 'Youth volleyball camp';
};

const createManualCandidates = async () => {
  const page = await fetchJson<unknown>(PAGE_API_URL);
  const openRegistrationsContent = findOpenRegistrationsContent(page);
  if (!openRegistrationsContent) {
    throw new Error('AthenaVB Portland training page did not expose open registration content.');
  }

  const programsUrl = createProgramsUrl(openRegistrationsContent);
  const rows = await fetchJson<AthenaProgramRow[]>(programsUrl);
  const now = new Date();
  const skippedPastRows: string[] = [];
  const futureRows = rows
    .filter((row) => {
      const startsAt = new Date(createLocalTimestamp(row.programStartDate, parseTimePart(row.startTime)));
      if (startsAt.getTime() <= now.getTime()) {
        skippedPastRows.push(`${row.registrationName} (${parseDatePart(row.programStartDate)})`);
        return false;
      }
      return true;
    })
    .sort((a, b) => (
      new Date(createLocalTimestamp(a.programStartDate, parseTimePart(a.startTime))).getTime()
      - new Date(createLocalTimestamp(b.programStartDate, parseTimePart(b.startTime))).getTime()
    ));

  const clubCandidate = {
    listingKind: 'CLUB' as const,
    title: 'AthenaVB and AjaxVB',
    officialActionUrl: BASE_URL,
    sourceUrl: BASE_URL,
    organizerName: 'Athena Volleyball Academy / Ajax Volleyball Academy',
    sportName: 'Indoor Volleyball',
    formatLabel: 'Junior volleyball club and academy',
    city: 'Hillsboro, OR',
    venueName: VENUE_NAME,
    address: VENUE_ADDRESS,
    tags: ['Club'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Club and academy programs by season',
    scheduleText: 'AthenaVB and AjaxVB publish current club, academy, camp, training, tournament, and tryout programs on their official website.',
    participantOptionsText: 'Use the official AthenaVB/AjaxVB website for team, academy, camp, and training registration.',
    description: ORG_DESCRIPTION,
    logoUrl: LOGO_SOURCE_URL,
    logoSourceUrl: LOGO_SOURCE_URL,
    logoOriginalName: 'athena-ajax-crests.png',
  };

  const eventCandidates = futureRows.map((row) => {
    const startTime = parseTimePart(row.startTime);
    const endTime = parseTimePart(row.endTime);
    const startsAt = createLocalTimestamp(row.programStartDate, startTime);
    const endsAt = createLocalTimestamp(row.programEndDate, endTime ?? startTime);
    const gradeLabel = row.registrationGradesLabel?.trim() || row.registrationAgeClassesLabel?.trim() || null;
    const priceText = formatMoney(row.price);
    const tags = createTags(row);
    const actionUrl = row.clubUrl || row.linkURL || LIST_URL;
    const scheduleText = [
      `${parseDatePart(row.programStartDate)}${parseDatePart(row.programEndDate) !== parseDatePart(row.programStartDate) ? ` - ${parseDatePart(row.programEndDate)}` : ''}`,
      startTime && endTime ? `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}` : null,
      row.dayOfWeekLabel ? `Days: ${row.dayOfWeekLabel}` : null,
    ].filter(Boolean).join('. ');

    return {
      listingKind: 'EVENT' as const,
      title: row.registrationName,
      officialActionUrl: actionUrl,
      sourceUrl: LIST_URL,
      organizerName: 'Athena Volleyball Academy / Ajax Volleyball Academy',
      sportName: 'Indoor Volleyball',
      formatLabel: createFormatLabel(row),
      city: 'Hillsboro, OR',
      venueName: row.practiceFacilityName || VENUE_NAME,
      address: VENUE_ADDRESS,
      startsAt,
      endsAt,
      timeZone: 'America/Los_Angeles',
      scheduleText,
      dateDisplayMode: 'SCHEDULED' as const,
      ageGroup: gradeLabel,
      divisionText: gradeLabel,
      participantOptionsText: 'Individual registration through AthenaVB/AjaxVB Sprocket Sports.',
      priceText,
      statusText: 'Public registration row listed on the AthenaVB/AjaxVB Portland camps page.',
      description: [
        `AthenaVB/AjaxVB lists ${row.registrationName} under ${row.programName} at ${row.practiceFacilityName || VENUE_NAME}.`,
        gradeLabel ? `The public row lists grades ${gradeLabel}.` : null,
        row.gender ? `Gender: ${row.gender}.` : null,
        priceText ? `Price: ${priceText}.` : null,
      ].filter(Boolean).join(' '),
      tags,
      divisions: [createDivision(row)],
    };
  });

  return {
    manualCandidates: [clubCandidate, ...eventCandidates],
    skippedPastRows,
    programsUrl,
  };
};

const buildMapping = (manualCandidates: AffiliateScrapeMapping['manualCandidates']): AffiliateScrapeMapping => ({
  kind: 'CLUB',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'AthenaVB and AjaxVB',
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
  manualCandidates,
});

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

const normalizeLogo = async (input: Buffer) => {
  const logo = await sharp(input, { animated: false })
    .rotate()
    .trim({ threshold: 4 })
    .resize({ width: 930, height: 650, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: '#050505',
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download AthenaVB/AjaxVB logo: ${response.status} ${response.statusText}`);
  }

  const data = await normalizeLogo(Buffer.from(await response.arrayBuffer()));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'athena-ajax-volleyball-logo-square.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'athena-ajax-volleyball-logo-square.png',
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
      originalName: 'athena-ajax-volleyball-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates(VENUE_ADDRESS);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'AthenaVB and AjaxVB',
      location: 'Hillsboro, OR',
      address: VENUE_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'AthenaVB and AjaxVB club volleyball programs',
      publicIntroText: 'Review AthenaVB and AjaxVB club, academy, camp, training, tournament, and tryout programs from the official website.',
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'AthenaVB and AjaxVB',
      location: 'Hillsboro, OR',
      address: VENUE_ADDRESS,
      description: ORG_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Indoor Volleyball'],
      status: 'LISTED',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'AthenaVB and AjaxVB club volleyball programs',
      publicIntroText: 'Review AthenaVB and AjaxVB club, academy, camp, training, tournament, and tryout programs from the official website.',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async (
  mapping: AffiliateScrapeMapping,
  programsUrl: string,
  skippedPastRows: string[],
) => {
  const sourceNotes =
    'Public AthenaVB/AjaxVB club and Portland training source. Setup rebuilds manual candidates from public Sprocket page-builder/program APIs and skips rows whose start time is not in the future.';

  const metadata = {
    inspectedAt: '2026-07-09',
    robotsAllowed: true,
    robotsNote:
      'athenavb.net robots.txt disallows private account/admin/player/registration paths, but allows public club pages and public APIs used by the rendered page.',
    logoSourceUrl: LOGO_SOURCE_URL,
    pageApiUrl: PAGE_API_URL,
    programsApiUrl: programsUrl,
    skippedPastRows,
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      name: 'AthenaVB and AjaxVB',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata,
    },
    update: {
      name: 'AthenaVB and AjaxVB',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: 10080,
      notes: sourceNotes,
      metadata,
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
      mapping,
      createdByUserId: null,
      notes:
        'Manual AthenaVB/AjaxVB public club and Portland training mapping generated from current public program rows, with source-provided dates, prices, grades, venue, registration URLs, and tags.',
      validatedAt: new Date(),
    },
    update: {
      version: 1,
      isActive: true,
      mapping,
      notes:
        'Manual AthenaVB/AjaxVB public club and Portland training mapping generated from current public program rows, with source-provided dates, prices, grades, venue, registration URLs, and tags.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const relinkClubCandidateToSourceOrganization = async () => {
  const duplicateRows = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'AthenaVB and AjaxVB',
      publishedOrganizationId: { not: null },
    },
    select: { publishedOrganizationId: true },
  });
  const duplicateOrgIds = Array.from(new Set(
    duplicateRows
      .map((row: { publishedOrganizationId: string | null }) => row.publishedOrganizationId)
      .filter((id: string | null): id is string => Boolean(id) && id !== ORG_ID),
  ));

  await (prisma as any).affiliateImportCandidates.updateMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'CLUB',
      title: 'AthenaVB and AjaxVB',
    },
    data: {
      publishedOrganizationId: ORG_ID,
      updatedAt: new Date(),
    },
  });

  if (duplicateOrgIds.length > 0) {
    await (prisma as any).organizations.deleteMany({
      where: {
        id: { in: duplicateOrgIds },
        name: 'AthenaVB and AjaxVB',
        website: BASE_URL,
      },
    });
  }
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const { manualCandidates, programsUrl, skippedPastRows } = await createManualCandidates();
  const mapping = buildMapping(manualCandidates);

  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping(mapping, programsUrl, skippedPastRows);

  console.log(`AthenaVB/AjaxVB affiliate source ready: ${SOURCE_KEY}`);
  console.log(`${manualCandidates.length} manual candidate(s) configured (${skippedPastRows.length} past-start row(s) skipped).`);

  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticManualPageClient });
    await relinkClubCandidateToSourceOrganization();
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to create/update discovered candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-athena-ajax-volleyball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
