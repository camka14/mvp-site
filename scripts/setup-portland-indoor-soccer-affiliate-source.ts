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
const ORG_ID = 'affiliate_org_portland_indoor_soccer';
const LOGO_FILE_ID = 'affiliate_file_portland_indoor_soccer_logo';
const SOURCE_ID = 'affiliate_source_portland_indoor_soccer_programs';
const SOURCE_KEY = 'portland-indoor-soccer-programs';
const MAPPING_ID = 'affiliate_source_portland_indoor_soccer_programs_mapping_v1';
const HOME_URL = 'https://pdxindoorsoccer.com/';
const TEAMS_URL = 'https://pdxindoorsoccer.com/teams/';
const FAQ_URL = 'https://pdxindoorsoccer.com/faqs/';
const REGISTRATION_FORM_URL = 'https://pdxindoorsoccer.com/wp-content/uploads/2011/05/registration.pdf';
const LOGO_SOURCE_URL = 'https://pdxindoorsoccer.com/wp-content/themes/metric/images/logo.png';
const ADDRESS = '418 SE Main Street, Portland, OR 97214';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Indoor Soccer Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates: [
    {
      listingKind: 'EVENT',
      title: 'Portland Indoor Soccer Adult Indoor Soccer Leagues',
      officialActionUrl: REGISTRATION_FORM_URL,
      sourceUrl: TEAMS_URL,
      organizerName: 'Portland Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Adult indoor soccer league',
      city: 'Portland, OR',
      venueName: 'Portland Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Five league seasons per year: two in fall, plus winter, spring, and summer. Men and women play Sunday-Thursday; multi-gender teams play Friday-Sunday.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Seasonal league registration and waitlist',
      skillLevel: 'Multiple adult divisions',
      ageGroup: 'Adult; multi-gender divisions are 21+',
      divisionText: 'Men; Women; Multi-gender 21+',
      participantOptionsText: 'Team registration or waitlist through the official adult registration form.',
      priceText: '$1,250/team',
      statusText: 'The source says there is currently a waiting list for new men, women, and multi-gender teams.',
      description: 'Portland Indoor Soccer runs five adult indoor soccer seasons per year, with men, women, and multi-gender divisions across multiple skill levels. The teams page says new teams join the waitlist by submitting the adult registration form and deposit, while the FAQ lists the registration fee at $1,250 per team for a 10-game season. Player cards are listed separately at $20 once per year.',
      warnings: [
        'Stored as an evergreen league summary because current public pages do not expose per-season future registration rows.',
        'The teams page and FAQ currently disagree on the waitlist deposit amount; preserve the team fee and leave deposit details in the description.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Portland Indoor Soccer Open Play',
      officialActionUrl: FAQ_URL,
      sourceUrl: FAQ_URL,
      organizerName: 'Portland Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Open play',
      city: 'Portland, OR',
      venueName: 'Portland Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Tuesdays and Fridays from noon to 2:00 PM.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Tuesdays and Fridays, noon-2:00 PM',
      participantOptionsText: 'Walk-up open play at the facility.',
      priceText: '$8',
      statusText: 'Open-play details come from the FAQ page.',
      description: 'Portland Indoor Soccer lists open play every Tuesday and Friday from noon to 2:00 PM. The source lists an $8 walk-up price and a 10-play card for $70.',
    },
    {
      listingKind: 'RENTAL',
      title: 'Portland Indoor Soccer Arena Rental',
      officialActionUrl: HOME_URL,
      sourceUrl: HOME_URL,
      organizerName: 'Portland Indoor Soccer',
      sportName: 'Indoor Soccer',
      formatLabel: 'Indoor soccer arena rental',
      city: 'Portland, OR',
      venueName: 'Portland Indoor Soccer',
      address: ADDRESS,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Call Portland Indoor Soccer to ask about private party and practice availability.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Call for rental availability',
      participantOptionsText: 'Private parties and practices in the 20,000 square-foot indoor soccer arena.',
      statusText: 'Availability depends on the facility schedule.',
      description: 'Portland Indoor Soccer says its 20,000 square-foot arena is available for private parties and practices as schedules permit. The source directs users to call Ryan or Brian at 503-231-6368 for more information.',
      warnings: [
        'Stored as a rental link-out because the source does not publish a crawlable rental availability calendar or rental price.',
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
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/x-icon';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-indoor-soccer-logo.png',
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
      originalName: 'portland-indoor-soccer-logo.png',
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
      originalName: 'portland-indoor-soccer-logo.png',
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
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Indoor Soccer']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Portland Indoor Soccer',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'Portland Indoor Soccer is an indoor soccer facility near the Hawthorne Bridge in Portland with adult leagues, open play, youth soccer programming, and private party or practice rental availability.',
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
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Indoor Soccer',
      location: 'Portland, OR',
      address: ADDRESS,
      description: 'Portland Indoor Soccer is an indoor soccer facility near the Hawthorne Bridge in Portland with adult leagues, open play, youth soccer programming, and private party or practice rental availability.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async () => {
  const sourcePayload = {
    name: 'Portland Indoor Soccer Programs and Rentals',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 43200,
    notes: 'Manual evergreen program/rental source. The public WordPress pages are allowed outside wp-admin and describe stable league, open-play, and rental options without per-season future registration cards.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'WordPress robots.txt disallows /wp-admin/ and allows admin-ajax; public pages used by this source are allowed.',
      youthCampSkipped: 'The summer camp page has ambiguous or stale date wording as of 2026-07-06, so it is not imported as a scheduled candidate until exact future dates are confirmed.',
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
      notes: 'Manual Portland Indoor Soccer evergreen league, open-play, and rental mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Portland Indoor Soccer evergreen league, open-play, and rental mapping.',
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

  console.log(`Portland Indoor Soccer affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-portland-indoor-soccer-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
