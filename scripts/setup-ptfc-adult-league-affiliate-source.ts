/**
 * PTFC Adult League affiliate source setup.
 *
 * Owns private source organization `affiliate_org_ptfc_adult_league`, source
 * `affiliate_source_ptfc_adult_league`, and mapping
 * `affiliate_mapping_ptfc_adult_league_v1`.
 * Official URLs:
 * - League page: https://www.timbers.com/camps/adult-league
 * - Registration: PlayMetrics signup linked from the league page
 * - Rules PDF: Summer 2026 PTFC Adult League Overview
 *
 * Creates/repairs the private source org, official Timbers crest logo, scrape
 * source, and manual ongoing league candidate mapping. Safe for local or live
 * DB; use `--live` for live and `--scrape` to create/update candidates.
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import sharp from 'sharp';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
const ORG_ID = 'affiliate_org_ptfc_adult_league';
const SOURCE_ID = 'affiliate_source_ptfc_adult_league';
const SOURCE_KEY = 'ptfc-adult-league';
const MAPPING_ID = 'affiliate_mapping_ptfc_adult_league_v1';
const BASE_URL = 'https://www.timbers.com/';
const LIST_URL = 'https://www.timbers.com/camps/adult-league';
const REGISTRATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS0yMTA0LTE3NzU5MjgyMTR8RCtMMkYzc2JrL3RvN1cyL2xzNURkWVRXbGxtTmZIVGJISU9mRmtxdWxtMD0=';
const RULES_URL = 'https://images.mlssoccer.com/image/upload/v1774485859/assets/por/Camps/Summer_2026_PTFC_Adult_League_Overview_livtt2.pdf';
const LOGO_SOURCE_URL = 'https://images.mlssoccer.com/image/upload/assets/logos/POR.svg';
const VENUE_GEOCODE_INPUT = 'Providence Park, Portland, OR';

const leagueDescription = 'Portland Timbers runs a Summer 2026 adult 7v7 soccer league at Providence Park for players ages 18 and older. The official league page lists Men’s matches on Monday nights, Women’s matches on Tuesday nights, and Coed matches on Thursday nights between June and August. The overview says each team plays eight matches with a championship game at the end of the season, kickoff windows are 6:00-10:00 PM, and registration is individual through PlayMetrics. The public page lists registration at $150 per player or $1,800 per team.';

const divisions = [
  {
    name: "Men's League",
    key: 'm_age_18plus',
    gender: 'M' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '18plus',
    priceCents: 15000,
    ageCutoffLabel: '18+',
    ageCutoffSource: 'PTFC Adult League page and Summer 2026 rules overview.',
  },
  {
    name: "Women's League",
    key: 'f_age_18plus',
    gender: 'F' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '18plus',
    priceCents: 15000,
    ageCutoffLabel: '18+',
    ageCutoffSource: 'PTFC Adult League page and Summer 2026 rules overview.',
  },
  {
    name: 'Coed League',
    key: 'c_age_18plus',
    gender: 'C' as const,
    ratingType: 'AGE' as const,
    divisionTypeId: '18plus',
    priceCents: 15000,
    ageCutoffLabel: '18+',
    ageCutoffSource: 'PTFC Adult League page and Summer 2026 rules overview.',
  },
];

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: LIST_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'PTFC Adult Soccer Summer League',
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
      title: 'PTFC Adult Soccer Summer League',
      officialActionUrl: REGISTRATION_URL,
      sourceUrl: LIST_URL,
      tags: ['League'],
      organizerName: 'Portland Timbers / PTFC',
      sportName: 'Grass Soccer',
      formatLabel: 'Adult 7v7 soccer league',
      city: 'Portland, OR',
      venueName: 'Providence Park',
      address: VENUE_GEOCODE_INPUT,
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Summer 2026 adult league at Providence Park. Men play Monday nights, Women play Tuesday nights, and Coed plays Thursday nights, with occasional reschedules. The overview lists match kickoff windows between 6:00 PM and 10:00 PM and remaining July/August match dates.',
      dateDisplayMode: 'ONGOING',
      dateDisplayText: 'Summer 2026 league through August',
      ageGroup: 'Adult 18+',
      participantOptionsText: 'Individual registration with team code or free-agent option.',
      priceText: '$150 per player',
      statusText: 'Summer 2026 league registration and schedules are published on the official PTFC page.',
      description: leagueDescription,
      divisions,
      warnings: [
        'Stored as an ongoing/manual league candidate because the season started in June 2026 and the public page should not be converted into a past fixed-start event.',
        'The official page lists $150 per player and $1,800 per team; the candidate divisions use the player price so public cards show a compact price.',
        `Rules and match-date details were inspected from ${RULES_URL}.`,
      ],
    },
  ],
};

const normalizeLogo = async (source: Buffer): Promise<Buffer> => {
  const background = '#ffffff';
  const base = await sharp(source, { animated: false }).rotate().png().toBuffer();
  const logo = await sharp(base)
    .trim({ threshold: 8 })
    .resize({ width: 820, height: 820, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const width = metadata.width ?? 820;
  const height = metadata.height ?? 820;
  return sharp({
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
};

const fetchLogo = async (): Promise<Buffer> => {
  const response = await fetch(LOGO_SOURCE_URL, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ source setup; contact samuel.r@razumly.com',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch PTFC logo: HTTP ${response.status}`);
  }
  return normalizeLogo(Buffer.from(await response.arrayBuffer()));
};

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

const upsertLogo = async (ownerId: string) => {
  const data = await fetchLogo();
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);
  const fileId = `${ORG_ID}_logo_square_${hash}`;
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'ptfc-adult-league-logo-square.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  await (prisma as any).file.upsert({
    where: { id: fileId },
    create: {
      id: fileId,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'ptfc-adult-league-logo-square.png',
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
      originalName: 'ptfc-adult-league-logo-square.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  return fileId;
};

const upsertOrganization = async (ownerId: string, logoId: string) => {
  const coordinates = await geocodeAddressToCoordinates(VENUE_GEOCODE_INPUT);
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'PTFC Adult League',
      location: 'Providence Park, Portland, OR',
      address: VENUE_GEOCODE_INPUT,
      description: 'PTFC runs adult soccer league programming at Providence Park, including the Summer 2026 Adult League with men’s, women’s, and coed 7v7 divisions.',
      logoId,
      ownerId,
      website: LIST_URL,
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
      name: 'PTFC Adult League',
      location: 'Providence Park, Portland, OR',
      address: VENUE_GEOCODE_INPUT,
      description: 'PTFC runs adult soccer league programming at Providence Park, including the Summer 2026 Adult League with men’s, women’s, and coed 7v7 divisions.',
      logoId,
      ownerId,
      website: LIST_URL,
      sports: ['Grass Soccer'],
      status: 'UNLISTED',
      coordinates,
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
      name: 'PTFC Adult Soccer Summer League',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual ongoing source for the PTFC Adult Soccer Summer League. The season started in June 2026, so imports emit an ongoing league candidate rather than a fixed past start date.',
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'timbers.com robots.txt allows /camps/adult-league and disallows internal asset/service paths that were not used.',
        logoSourceUrl: LOGO_SOURCE_URL,
        registrationUrl: REGISTRATION_URL,
        rulesUrl: RULES_URL,
      },
    },
    update: {
      name: 'PTFC Adult Soccer Summer League',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: LIST_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual ongoing source for the PTFC Adult Soccer Summer League. The season started in June 2026, so imports emit an ongoing league candidate rather than a fixed past start date.',
      metadata: {
        inspectedAt: '2026-07-09',
        robotsAllowed: true,
        robotsNote: 'timbers.com robots.txt allows /camps/adult-league and disallows internal asset/service paths that were not used.',
        logoSourceUrl: LOGO_SOURCE_URL,
        registrationUrl: REGISTRATION_URL,
        rulesUrl: RULES_URL,
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
      notes: 'Manual ongoing mapping for PTFC Adult Soccer Summer League with men, women, and coed 18+ divisions and compact player pricing.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual ongoing mapping for PTFC Adult Soccer Summer League with men, women, and coed 18+ divisions and compact player pricing.',
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
  const logoId = await upsertLogo(owner.id);
  await upsertOrganization(owner.id, logoId);
  await upsertSourceAndMapping();

  console.log(`PTFC Adult League affiliate source ready: ${SOURCE_KEY}`);
  if (shouldScrape) {
    const result = await runAffiliateSourceScrape(SOURCE_ID);
    console.log(`Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved.`);
  } else {
    console.log('Re-run with --scrape to fetch the source page and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-ptfc-adult-league-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
