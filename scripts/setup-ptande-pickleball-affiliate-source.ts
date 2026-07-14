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
const ORG_ID = 'affiliate_org_portland_tennis_education';
const LOGO_FILE_ID = 'affiliate_file_portland_tennis_education_logo';
const SOURCE_ID = 'affiliate_source_ptande_pickleball';
const SOURCE_KEY = 'ptande-pickleball-programs';
const MAPPING_ID = 'affiliate_source_ptande_pickleball_mapping_v1';
const HOME_URL = 'https://www.ptande.org/';
const LIST_URL = 'https://www.ptande.org/pickleball';
const COURT_RESERVE_URL = 'https://app.courtreserve.com/Online/Portal/Index/9271';
const LOGO_SOURCE_URL = 'https://images.squarespace-cdn.com/content/v1/67e802a418b2066f3f02b41e/8d90bdbb-47f7-40df-bc7d-6eba12133811/__PRIMARY+SUBTEXT-BLUE.png?format=1500w';
const ADDRESS = '7519 N Burlington Ave, Portland, OR 97203';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Tennis & Education Pickleball',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: COURT_RESERVE_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'RENTAL',
      title: 'Portland Tennis & Education Pickleball Court Reservations',
      officialActionUrl: COURT_RESERVE_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Tennis & Education',
      sportName: 'Pickleball',
      formatLabel: 'Pickleball court reservation',
      city: 'Portland, OR',
      venueName: 'Portland Tennis & Education',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'The source says courts can be booked up to 7 days in advance starting at 8:00 AM. Facility hours are Monday-Thursday 8:00 AM-10:00 PM and Friday-Sunday 8:00 AM-9:00 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Book courts through CourtReserve',
      participantOptionsText: 'First-time users should register as a PT&E patron or guest through the official booking system.',
      statusText: 'CourtReserve is the official booking system and is outbound-only because robots.txt disallows scraping.',
      description: 'Portland Tennis & Education directs players to its online booking system to sign up for a court, class, or lesson. The public page says courts can be booked up to 7 days in advance starting at 8:00 AM and asks first-time users to register as a PT&E patron or guest. The facility lists hours as Monday through Thursday 8:00 AM to 10:00 PM and Friday through Sunday 8:00 AM to 9:00 PM. All pickleball programs are offered on a sliding scale, but no single public court price was visible on the source page.',
      warnings: [
        'Stored as a rental link-out because CourtReserve disallows scraping and holds live availability/pricing.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Portland Tennis & Education Adult Pickleball Programs',
      officialActionUrl: COURT_RESERVE_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Tennis & Education',
      sportName: 'Pickleball',
      formatLabel: 'Adult pickleball programs',
      city: 'Portland, OR',
      venueName: 'Portland Tennis & Education',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Adult sessions are booked through CourtReserve; public page lists group lessons, drill clinics, private/small-group instruction, open-play mixers, competitive round robins, custom drill clinics, and daily skill sessions.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Adult pickleball programs by booking availability',
      skillLevel: 'New players through tournament-focused training',
      participantOptionsText: 'Includes group lessons, drill clinics, private or small-group instruction, open-play mixers, 55+ sessions, round robins, daily skill sessions, Queer Pickleball League, and QTBIPOC Pickleball Mixers.',
      statusText: 'The source says programs are offered on a sliding scale; no single public price/range was listed.',
      description: 'Portland Tennis & Education describes adult pickleball as a blend of community, competition, and coaching. Adult offerings include group lessons, drill clinics, private or small-group instruction led by certified coaches, open-play mixers including 55+ sessions, competitive round robins, custom drill clinics, and daily skill sessions. The source also says PT&E hosts the Queer Pickleball League and QTBIPOC Pickleball Mixers for LGBTQIA+ and BIPOC players. Live dates, availability, and prices are handled in CourtReserve.',
      warnings: [
        'Stored as ongoing because the public page describes program types while current dated rows live in CourtReserve.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Portland Tennis & Education Youth Pickleball Programs',
      officialActionUrl: COURT_RESERVE_URL,
      sourceUrl: LIST_URL,
      organizerName: 'Portland Tennis & Education',
      sportName: 'Pickleball',
      formatLabel: 'Youth pickleball programs',
      city: 'Portland, OR',
      venueName: 'Portland Tennis & Education',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Youth pickleball sessions are booked through CourtReserve; the public page lists summer camps, private lessons, and continued development pathways.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Youth pickleball programs by booking availability',
      skillLevel: 'Youth fundamentals through tournament preparation',
      ageGroup: 'Youth',
      participantOptionsText: 'Includes youth summer camps, private lessons, fundamentals, confidence and character development, and tournament preparation pathways.',
      statusText: 'The source says youth programs are offered on a sliding scale; no current public date range or price was listed.',
      description: 'Portland Tennis & Education says youth pickleball programs introduce young players to the sport with a focus on fundamentals, confidence, and character. Through summer camps and private lessons, kids learn paddle control, positioning, court awareness, and team-oriented play. The source says youth players ready to advance can continue into tournament preparation and competitive play opportunities. Current dates, availability, and prices are handled in CourtReserve.',
      warnings: [
        'Stored as no-fixed-date because the public page did not expose current youth session dates or prices.',
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
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
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
    originalName: 'portland-tennis-education-logo.png',
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
      originalName: 'portland-tennis-education-logo.png',
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
      originalName: 'portland-tennis-education-logo.png',
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
    select: { sports: true, coordinates: true },
  });
  const coordinates = await geocodeAddressToCoordinates(ADDRESS)
    ?? existing?.coordinates
    ?? null;
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Pickleball', 'Tennis']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Tennis & Education',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'Portland Tennis & Education is a nonprofit social-impact racquet center in North Portland with pickleball and tennis court access, classes, lessons, youth programs, mixers, leagues, and community programming.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Tennis & Education',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'Portland Tennis & Education is a nonprofit social-impact racquet center in North Portland with pickleball and tennis court access, classes, lessons, youth programs, mixers, leagues, and community programming.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'NONPROFIT',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Portland Tennis & Education Pickleball',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: LIST_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual PT&E pickleball source from the public Squarespace page. CourtReserve is outbound-only because robots.txt disallows scraping.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'ptande.org robots.txt allows /pickleball while disallowing config/search/account/API/static paths. CourtReserve robots.txt disallows /, so CourtReserve is used only as the official action URL.',
      courtReserveUrl: COURT_RESERVE_URL,
      logoSourceUrl: LOGO_SOURCE_URL,
    },
  };

  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      ...sourcePayload,
    },
    update: sourcePayload,
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
      notes: 'Manual Portland Tennis & Education pickleball program and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Portland Tennis & Education pickleball program and rental mapping.',
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

  console.log(`PT&E pickleball affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    const logs = result.run.logs as any;
    console.log(
      `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
      + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
    );
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-ptande-pickleball-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
