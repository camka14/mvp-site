import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

loadEnv({ path: path.join(process.cwd(), '.env.local'), override: false });

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_oregon_youth_soccer';
const LOGO_FILE_ID = 'affiliate_file_oregon_youth_soccer_logo';
const SOURCE_ID = 'affiliate_source_oregon_youth_soccer_sanctioned_tournaments';
const SOURCE_KEY = 'oregon-youth-soccer-sanctioned-tournaments';
const MAPPING_ID = 'affiliate_mapping_oregon_youth_soccer_sanctioned_tournaments_v1';
const BASE_URL = 'https://www.oregonyouthsoccer.org/';
const LIST_URL = 'https://www.oregonyouthsoccer.org/sanctioned-tournaments/';
const LOGO_SOURCE_URL = 'https://www.oregonyouthsoccer.org/wp-content/uploads/sites/279/2024/03/OYSA-Main-Shield-LOGO2.png';
const PUBLIC_SLUG = 'oregon-youth-soccer-association';
const ORGANIZER_DESCRIPTION = 'Oregon Youth Soccer Association is a statewide youth soccer organization that supports Oregon member clubs, leagues, tournaments, coaching, refereeing, and player programs. Its sanctioned tournament directory lists approved youth soccer competitions hosted around Oregon.';
const TOURNAMENT_DATE_REGEX = '((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[A-Za-z]*\\.?\\s+\\d{1,2}.*?\\b20\\d{2}\\b)';
const TITLE_BEFORE_DATE_REGEX = '^(?:20\\d{2}\\s+)?(.+?)\\s+(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec))';
const HOST_BEFORE_TITLE_REGEX = '^(.+?)\\s+[–-]\\s+';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: '.entry-content p:has(a[href])',
  itemTextIncludes: ['20'],
  fields: {
    title: {
      selector: 'a[href]',
      mode: 'text',
      regex: TITLE_BEFORE_DATE_REGEX,
      required: true,
    },
    organizerName: {
      selector: ':scope',
      mode: 'text',
      regex: HOST_BEFORE_TITLE_REGEX,
    },
    officialActionUrl: {
      selector: 'a[href]',
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
      required: true,
    },
    sourceUrl: {
      selector: ':scope',
      mode: 'literal',
      value: LIST_URL,
    },
    sportName: {
      selector: ':scope',
      mode: 'literal',
      value: 'Grass Soccer',
    },
    formatLabel: {
      selector: ':scope',
      mode: 'literal',
      value: 'Youth soccer tournament',
    },
    city: {
      selector: ':scope',
      mode: 'literal',
      value: 'Oregon',
    },
    startsAt: {
      selector: 'a[href]',
      mode: 'text',
      regex: TOURNAMENT_DATE_REGEX,
      transform: 'dateTime',
      required: true,
    },
    endsAt: {
      selector: 'a[href]',
      mode: 'text',
      regex: TOURNAMENT_DATE_REGEX,
      transform: 'dateRangeEnd',
    },
    ageGroup: {
      selector: ':scope',
      mode: 'literal',
      value: 'Youth',
    },
    participantOptionsText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Team registration through the host tournament site; see the host site for prices and divisions.',
    },
    priceText: {
      selector: ':scope',
      mode: 'literal',
      value: 'Price not specified by OYSA; see the host tournament site.',
    },
    statusText: {
      selector: ':scope',
      mode: 'literal',
      value: 'See host tournament site for current registration status.',
    },
    description: {
      selector: ':scope',
      mode: 'literal',
      value: 'Oregon Youth Soccer publishes this sanctioned tournament directory so families, coaches, and teams can find approved youth soccer competitions. Each imported listing links to the host tournament site for registration, divisions, fees, venues, and current availability.',
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
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
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download OYSA logo: ${response.status} ${response.statusText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'oregon-youth-soccer-logo.png',
    contentType,
    organizationId: ORG_ID,
  });

  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'oregon-youth-soccer-logo.png',
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
      originalName: 'oregon-youth-soccer-logo.png',
      mimeType: contentType,
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
      name: 'Oregon Youth Soccer Association',
      location: 'Beaverton, OR',
      address: 'Beaverton, OR',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.8037, 45.4871],
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Oregon Youth Soccer Association programs',
      publicIntroText: 'Find sanctioned youth soccer tournaments, member-club programs, and official OYSA links.',
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Oregon Youth Soccer Association',
      location: 'Beaverton, OR',
      address: 'Beaverton, OR',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Oregon Youth Soccer Association programs',
      publicIntroText: 'Find sanctioned youth soccer tournaments, member-club programs, and official OYSA links.',
      coordinates: [-122.8037, 45.4871],
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
      name: 'Oregon Youth Soccer Sanctioned Tournaments',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Selector mapping for OYSA sanctioned youth soccer tournament links. The source is a statewide directory; individual candidate rows link out to host tournament sites for registration, fees, venues, and final division details.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'SportsEngine/WordPress page with linked sanctioned tournament list',
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
      },
    },
    update: {
      name: 'Oregon Youth Soccer Sanctioned Tournaments',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Selector mapping for OYSA sanctioned youth soccer tournament links. The source is a statewide directory; individual candidate rows link out to host tournament sites for registration, fees, venues, and final division details.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'SportsEngine/WordPress page with linked sanctioned tournament list',
        robotsAllowed: true,
        logoSourceUrl: LOGO_SOURCE_URL,
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
      notes: 'Active selector mapping for OYSA sanctioned tournament anchors with source-derived tournament dates.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Active selector mapping for OYSA sanctioned tournament anchors with source-derived tournament dates.',
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: SOURCE_ID },
    data: { activeMappingId: MAPPING_ID },
  });
};

const main = async () => {
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);
  await upsertSourceAndMapping();

  console.log(`Oregon Youth Soccer affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const { runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service');
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-oregon-youth-soccer-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
