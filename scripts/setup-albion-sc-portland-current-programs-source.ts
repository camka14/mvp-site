/**
 * ALBION SC Portland current-program source setup.
 *
 * Official source: https://www.albionscportland.org/
 * Owns the current-program source/mapping for the existing public club org.
 * The homepage mixes news-card dates, past tryouts, current registration, and
 * undated tournament promotion. Only source-backed future programs are emitted.
 * Local-only: this script rejects --live and never publishes candidates.
 */
import dotenv from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Readable } from 'node:stream';
import type { AffiliateScrapeMapping, ScrapePageClient } from '../src/server/affiliateImports/types';
import {
  ALBION_SC_PORTLAND_INTAKE_REFRESH_PAGES,
  ALBION_SC_PORTLAND_SOURCE_EVIDENCE,
  selectFutureAlbionCandidates,
} from '../src/server/affiliateImports/albionScPortlandSource';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  throw new Error('This setup script is local-only and does not accept --live.');
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type DeleteAffiliateCandidate = typeof import('../src/server/affiliateImports/service').deleteAffiliateCandidate;
type SyncOrganizationTags = typeof import('../src/server/organizationTags').syncOrganizationTags;
type ManualCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];
type ManualDivision = NonNullable<ManualCandidate['divisions']>[number];

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let deleteAffiliateCandidate: DeleteAffiliateCandidate;
let syncOrganizationTags: SyncOrganizationTags;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape, deleteAffiliateCandidate } = await import('../src/server/affiliateImports/service'));
  ({ syncOrganizationTags } = await import('../src/server/organizationTags'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_albion_sc_portland';
const SOURCE_ID = 'affiliate_source_albion_sc_portland_current_programs';
const SOURCE_KEY = 'albion-sc-portland-current-programs';
const MAPPING_ID = 'affiliate_mapping_albion_sc_portland_current_programs_v1';
const HOME_URL = 'https://www.albionscportland.org/';
const FALL_URL = 'https://www.albionscportland.org/juniors/juniors-program-overview';
const FALL_REGISTRATION_URL = 'https://albionscportland.byga.net/programs/gmztkwtv0j/signup';
const CAMPS_URL = 'https://www.albionscportland.org/juniors/juniors-camps/albion-portland-summer-camps';
const TRYOUTS_URL = 'https://www.albionscportland.org/tryouts/tryout-information';
const DEVELOPMENT_URL = 'https://www.albionscportland.org/programs/albion-development-academy-u9-u10';
const DEVELOPMENT_PATHWAY_URL = 'https://www.albionscportland.org/programs/development-advancement-placement';
const CUP_TEASER_URL = 'https://www.albionscportland.org/aug-16';
const TIGARD_HIGH_ADDRESS = '9000 SW Durham Rd, Tigard, OR 97224';
const LOGO_SOURCE_URL = 'https://www.albionscportland.org/_templates/Home/images/logo.png';
const LOGO_ARTIFACT_ID = '4a997660-bf95-466d-b4d9-dab2dfc14aea';
const LOGO_FILE_ID = 'affiliate_org_oregon_youth_soccer_find_a_club_albion_sc_portland_logo_square_36d5b2846e30';
const LOGO_FILE_NAME = 'albion-sc-portland-logo-square.png';
const LOGO_BACKGROUND = '#1e2635';
const LOGO_SAFE_MARK_SIZE = 780;
const availabilityEndsAtByTitle = {
  'ALBION Juniors Fall 2026 Recreational League': '2026-07-15T23:59:59-07:00',
} as const;

const ageDivision = (
  name: string,
  key: string,
  gender: 'M' | 'F' | 'C',
  divisionTypeId: string,
  priceCents: number,
  ageCutoffLabel: string,
  sourceUrl: string,
): ManualDivision => ({
  name,
  key,
  gender,
  ratingType: 'AGE',
  divisionTypeId,
  priceCents,
  ageCutoffLabel,
  ageCutoffSource: sourceUrl,
});

const fallDivisions: ManualDivision[] = [
  ['Boys Kindergarten-2nd Grade', 'm_age_u8_k_2', 'M', 'u8', 12500, 'Kindergarten-2nd grade'],
  ['Girls Kindergarten-2nd Grade', 'f_age_u8_k_2', 'F', 'u8', 12500, 'Kindergarten-2nd grade'],
  ['Boys 3rd-4th Grade', 'm_age_u10_3_4', 'M', 'u10', 14500, '3rd-4th grade'],
  ['Girls 3rd-4th Grade', 'f_age_u10_3_4', 'F', 'u10', 14500, '3rd-4th grade'],
  ['Boys 5th-8th Grade', 'm_age_u14_5_8', 'M', 'u14', 16500, '5th-8th grade'],
  ['Girls 5th-8th Grade', 'f_age_u14_5_8', 'F', 'u14', 16500, '5th-8th grade'],
  ['High School Coed 9th-10th Grade', 'c_age_u16_9_10', 'C', 'u16', 16500, '9th-10th grade'],
  ['High School Coed 11th-12th Grade', 'c_age_u19_11_12', 'C', 'u19', 16500, '11th-12th grade'],
].map(([name, key, gender, divisionTypeId, priceCents, ageCutoffLabel]) => ageDivision(
  name as string,
  key as string,
  gender as 'M' | 'F' | 'C',
  divisionTypeId as string,
  priceCents as number,
  ageCutoffLabel as string,
  FALL_REGISTRATION_URL,
));

const campCandidate = (params: {
  title: string;
  startsAt: string;
  endsAt: string;
  dateDisplayText: string;
}): ManualCandidate => ({
  listingKind: 'EVENT',
  title: params.title,
  officialActionUrl: CAMPS_URL,
  sourceUrl: CAMPS_URL,
  organizerName: 'ALBION SC Portland',
  sportName: 'Grass Soccer',
  formatLabel: 'Youth soccer camp',
  city: 'Tigard, OR',
  venueName: 'Tigard High School Swim Center Soccer Field',
  address: TIGARD_HIGH_ADDRESS,
  startsAt: params.startsAt,
  endsAt: params.endsAt,
  timeZone: 'America/Los_Angeles',
  scheduleText: `${params.dateDisplayText}, Tuesday-Thursday from 9:00 AM to noon.`,
  dateDisplayMode: 'SCHEDULED',
  dateDisplayText: params.dateDisplayText,
  ageGroup: 'Kindergarten-8th grade',
  divisionText: 'Coed kindergarten-8th grade',
  participantOptionsText: 'Individual camp registration',
  priceText: '$155',
  statusText: 'The source lists the current post-March 15 camp fee as $155.',
  description: 'ALBION SC Portland describes this three-morning recreational camp as foundation-focused soccer training for players in kindergarten through 8th grade. Sessions include skill building, touches on the ball, soccer games, and fundamentals. The current fee after March 15 is $155 per camp.',
  tags: ['Camp'],
  divisions: [ageDivision(
    'Kindergarten-8th Grade',
    'c_age_u14_k_8_camp',
    'C',
    'u14',
    15500,
    'Kindergarten-8th grade',
    CAMPS_URL,
  )],
  warnings: [
    'The camp page prints ZIP code 97062 for Tigard High School; the school district publishes the same 9000 SW Durham Rd address with ZIP code 97224, which is used for geocoding.',
  ],
});

const reviewedCandidates: ManualCandidate[] = [
    {
      listingKind: 'EVENT',
      title: 'ALBION Juniors Fall 2026 Recreational League',
      officialActionUrl: FALL_REGISTRATION_URL,
      sourceUrl: FALL_URL,
      organizerName: 'ALBION SC Portland',
      sportName: 'Grass Soccer',
      formatLabel: 'Fall recreational soccer league',
      city: 'Tigard, OR',
      venueName: 'Tigard-area fields',
      address: 'Tigard, OR',
      startsAt: '2026-08-10T00:00:00-07:00',
      endsAt: '2026-10-31T23:59:00-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Practices begin the week of August 10, games run Saturdays from September 12 through October 31, 2026, and team practice times are assigned after teams are formed.',
      dateDisplayMode: 'SCHEDULED',
      dateDisplayText: 'August 10-October 31, 2026',
      ageGroup: 'Kindergarten-12th grade',
      divisionText: 'Boys and girls kindergarten-8th grade; coed high school divisions',
      participantOptionsText: 'Individual player registration',
      priceText: '$125-$165',
      statusText: 'Registration is open through July 15, 2026.',
      registrationDeadlineText: 'July 15, 2026',
      description: 'ALBION Juniors offers a local Fall 2026 recreational league for kindergarten through high school players. Teams practice in the Tigard area and play Saturday games. Registration costs $125 for kindergarten-2nd grade, $145 for 3rd-4th grade, and $165 for 5th-12th grade. A reusable $75 uniform kit and any $35 late fee are described separately because they are not the base division price.',
      tags: ['League'],
      divisions: fallDivisions,
      warnings: [
        'The source gives a start week but no universal practice time or field; midnight stores the official date boundary without inventing a team schedule.',
        'Program details were rendered and reviewed directly on 2026-07-09; the detail page requires a new AffiliateSourceIntakes capture before future mapping changes.',
      ],
    },
    campCandidate({
      title: 'ALBION Portland Summer Camp - July 14-16, 2026',
      startsAt: '2026-07-14T09:00:00-07:00',
      endsAt: '2026-07-16T12:00:00-07:00',
      dateDisplayText: 'July 14-16, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - July 27-29, 2026',
      startsAt: '2026-07-27T09:00:00-07:00',
      endsAt: '2026-07-29T12:00:00-07:00',
      dateDisplayText: 'July 27-29, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - August 11-13, 2026',
      startsAt: '2026-08-11T09:00:00-07:00',
      endsAt: '2026-08-13T12:00:00-07:00',
      dateDisplayText: 'August 11-13, 2026',
    }),
    campCandidate({
      title: 'ALBION Portland Summer Camp - August 18-20, 2026',
      startsAt: '2026-08-18T09:00:00-07:00',
      endsAt: '2026-08-20T12:00:00-07:00',
      dateDisplayText: 'August 18-20, 2026',
    }),
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'ALBION SC Portland current programs' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: HOME_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'dateDisplayMode'] },
  manualCandidates: selectFutureAlbionCandidates(reviewedCandidates, new Date(), availabilityEndsAtByTitle),
};

const staticPageClient: ScrapePageClient = {
  fetchPage: async ({ url }) => ({
    url,
    finalUrl: url,
    statusCode: 200,
    body: '<html><body></body></html>',
    fetchedAt: new Date().toISOString(),
  }),
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const readExportedLogo = async (): Promise<Buffer | null> => {
  const exportDir = path.resolve(
    'output',
    'affiliate-intakes',
    ALBION_SC_PORTLAND_SOURCE_EVIDENCE.intakeSourceKey,
    ALBION_SC_PORTLAND_SOURCE_EVIDENCE.runId,
  );
  try {
    const files = await readdir(exportDir);
    const logoFile = files.find((file) => file.includes(LOGO_ARTIFACT_ID));
    return logoFile ? await readFile(path.join(exportDir, logoFile)) : null;
  } catch {
    return null;
  }
};

const loadOfficialLogo = async (): Promise<Buffer> => {
  const exported = await readExportedLogo();
  if (exported) return exported;

  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ALBION SC Portland logo: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const normalizeLogo = async (input: Buffer): Promise<Buffer> => {
  const trimmed = await sharp(input, { animated: false })
    .rotate()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const mark = await sharp(trimmed)
    .resize({
      width: LOGO_SAFE_MARK_SIZE,
      height: LOGO_SAFE_MARK_SIZE,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(mark).metadata();
  const width = metadata.width ?? LOGO_SAFE_MARK_SIZE;
  const height = metadata.height ?? LOGO_SAFE_MARK_SIZE;

  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: LOGO_BACKGROUND },
  })
    .composite([{
      input: mark,
      left: Math.round((1024 - width) / 2),
      top: Math.round((1024 - height) / 2),
    }])
    .removeAlpha()
    .png()
    .toBuffer();
};

const upsertLogo = async (ownerId: string): Promise<string> => {
  const data = await normalizeLogo(await loadOfficialLogo());
  const metadata = await sharp(data).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024 || metadata.hasAlpha) {
    throw new Error('ALBION SC Portland logo normalization did not produce an opaque 1024x1024 PNG.');
  }

  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const storage = getStorageProvider();
  const existingFile = await (prisma as any).file.findUnique({
    where: { id: LOGO_FILE_ID },
    select: { path: true, bucket: true },
  });
  let stored: { key: string; sizeBytes: number; bucket?: string } | null = null;
  if (existingFile?.path) {
    try {
      const existing = await storage.getObjectStream({ key: existingFile.path, bucket: existingFile.bucket });
      if ((await streamToBuffer(existing.stream)).equals(data)) {
        stored = { key: existingFile.path, sizeBytes: data.length, bucket: existingFile.bucket ?? undefined };
      }
    } catch {
      // Recreate a missing local object instead of preserving a stale File row.
    }
  }
  if (!stored) {
    stored = await storage.putObject({
      data,
      originalName: LOGO_FILE_NAME,
      contentType: 'image/png',
      organizationId: ORG_ID,
    });
  }

  await (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: LOGO_FILE_NAME,
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
      originalName: LOGO_FILE_NAME,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return LOGO_FILE_ID;
};

const prepareOrganization = async () => {
  const owner = await (prisma as any).authUser.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner?.id) throw new Error(`Owner user ${OWNER_EMAIL} was not found.`);
  const logoId = await upsertLogo(owner.id);

  await (prisma as any).organizations.update({
    where: { id: ORG_ID },
    data: {
      ownerId: owner.id,
      name: 'Albion SC Portland',
      website: HOME_URL,
      location: 'Tigard, OR',
      address: 'Tigard, OR',
      logoId,
      description: 'ALBION SC Portland is a youth soccer club offering competitive teams, academy development programs, juniors programs, camps, clinics, and Portland-area player pathways through the ALBION network.',
      sports: ['Grass Soccer'],
      status: 'LISTED',
      publicPageEnabled: true,
      updatedAt: new Date(),
    },
  });
  const existingAssignments = await (prisma as any).organizationTagAssignments.findMany({
    where: { organizationId: ORG_ID },
    select: { tagNameSnapshot: true },
  });
  await syncOrganizationTags(
    ORG_ID,
    Array.from(new Set([
      ...existingAssignments.map((assignment: { tagNameSnapshot: string }) => assignment.tagNameSnapshot),
      'Event Manager',
      'League Operator',
      'Training Provider',
    ])),
    prisma,
  );
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'ALBION SC Portland Current Programs',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual source-backed mapping for current ALBION Juniors registration and future Portland camps. Detail-page intake refresh is required before changing the reviewed rows.',
    metadata: {
      inspectedAt: '2026-07-19',
      robotsAllowed: true,
      strategy: 'manual-current-programs',
      sourceEvidence: ALBION_SC_PORTLAND_SOURCE_EVIDENCE,
      officialLogoSourceUrl: LOGO_SOURCE_URL,
      officialLogoArtifactId: LOGO_ARTIFACT_ID,
      logoNormalizedFormat: 'opaque-1024-square-png',
      logoBackground: LOGO_BACKGROUND,
      supplementalDirectReview: {
        reviewedAt: '2026-07-09',
        reason: 'The current live intake captures the rendered homepage but not the program detail pages used for the existing future rows.',
        pages: [FALL_URL, FALL_REGISTRATION_URL, CAMPS_URL],
      },
      intakeRefreshRequired: ALBION_SC_PORTLAND_INTAKE_REFRESH_PAGES,
      sourcePages: [HOME_URL, FALL_URL, FALL_REGISTRATION_URL, CAMPS_URL, TRYOUTS_URL, DEVELOPMENT_URL, DEVELOPMENT_PATHWAY_URL, CUP_TEASER_URL],
      venueAddressSourceUrl: 'https://ths.ttsdschools.org/athletics/athletic-directory',
      skippedRows: [
        { url: HOME_URL, reason: 'Current Fall league and future camp rows are handled by this mapping.' },
        { url: FALL_URL, reason: 'The Fall 2026 recreational league is handled by this mapping.' },
        { url: CAMPS_URL, reason: 'All source-listed camps that start after July 9, 2026 are handled by this mapping.' },
        { url: TRYOUTS_URL, reason: 'The 2026-27 tryouts were May 4-14, 2026 and are past.' },
        { url: DEVELOPMENT_URL, reason: 'The published Spring 2026 Development Academy registration is closed and its season dates are past.' },
        { url: DEVELOPMENT_PATHWAY_URL, reason: 'The generic pathway page provides no additional future dated registration row.' },
        { url: CUP_TEASER_URL, reason: 'The Portland showcase teaser provides no event year, exact event date, fee, or registration action and cannot be published as a current tournament.' },
        { label: 'June 29-July 1 Summer Camp', reason: 'The camp dates are past.' },
        { label: 'July 7-9 Summer Camp', reason: 'The camp started before the July 9 review and cannot be added as a new future candidate.' },
        { label: 'July 14-16 Summer Camp', reason: 'The camp ended before the July 19 intake review and is removed from future scrape output.' },
        { label: 'Fall 2026 Recreational League', reason: 'The source-listed July 15 registration deadline passed before the July 19 intake review, so the row is no longer actionable.' },
      ],
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: { id: SOURCE_ID, ...sourcePayload },
    update: sourcePayload,
  });
  await (prisma as any).affiliateScrapeMappings.updateMany({ where: { sourceId: SOURCE_ID }, data: { isActive: false } });
  await (prisma as any).affiliateScrapeMappings.upsert({
    where: { sourceId_version: { sourceId: SOURCE_ID, version: 1 } },
    create: {
      id: MAPPING_ID,
      sourceId: SOURCE_ID,
      version: 1,
      isActive: true,
      mapping,
      createdByUserId: null,
      notes: 'Manually verified ALBION SC Portland current-program mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manually verified ALBION SC Portland current-program mapping.',
      validatedAt: new Date(),
    },
  });
  await (prisma as any).affiliateScrapeSources.update({ where: { id: SOURCE_ID }, data: { activeMappingId: MAPPING_ID } });
};

const deleteInactiveSourceCandidates = async () => {
  const activeTitles = new Set((mapping.manualCandidates ?? []).map((candidate) => candidate.title));
  const existingCandidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'EVENT',
    },
    select: { id: true, title: true },
  });
  for (const candidate of existingCandidates) {
    if (activeTitles.has(candidate.title)) continue;
    await deleteAffiliateCandidate(candidate.id);
    console.log(`Removed inactive ALBION candidate and backing event: ${candidate.title}`);
  }
};

const verifyCurrentEventCoordinates = async () => {
  const activeTitles = (mapping.manualCandidates ?? []).map((candidate) => candidate.title);
  const candidates = await (prisma as any).affiliateImportCandidates.findMany({
    where: {
      sourceId: SOURCE_ID,
      listingKind: 'EVENT',
      title: { in: activeTitles },
    },
    select: { title: true, publishedEventId: true },
  });
  const eventIds = candidates
    .map((candidate: { publishedEventId: string | null }) => candidate.publishedEventId)
    .filter((eventId: string | null): eventId is string => Boolean(eventId));
  const events = eventIds.length
    ? await (prisma as any).events.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, coordinates: true },
    })
    : [];
  const coordinatesByEventId = new Map(events.map((event: { id: string; coordinates: unknown }) => [
    event.id,
    event.coordinates,
  ]));
  const missing = candidates.filter((candidate: { title: string; publishedEventId: string | null }) => {
    const coordinates = candidate.publishedEventId
      ? coordinatesByEventId.get(candidate.publishedEventId)
      : null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return true;
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    return !Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0);
  });
  if (missing.length) {
    throw new Error(
      `ALBION event coordinate verification failed for ${missing.map((candidate: { title: string }) => candidate.title).join(', ')}. `
      + `Configure a server-capable GOOGLE_MAPS_API_KEY and rerun; do not substitute the club's approximate coordinates for ${TIGARD_HIGH_ADDRESS}.`,
    );
  }
};

const main = async () => {
  await loadAppModules();
  await prepareOrganization();
  await upsertSourceAndMapping();
  await deleteInactiveSourceCandidates();
  console.log(`ALBION SC Portland source is ready with ${mapping.manualCandidates?.length ?? 0} candidates.`);
  if (process.argv.includes('--scrape')) {
    const result = await runAffiliateSourceScrape(SOURCE_ID, { client: staticPageClient });
    const logs = result.run.logs as Record<string, unknown> | null;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
    await verifyCurrentEventCoordinates();
  } else {
    console.log('Re-run with --scrape to create or update the candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-albion-sc-portland-current-programs-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
