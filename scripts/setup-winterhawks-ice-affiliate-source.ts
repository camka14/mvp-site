import dotenv from 'dotenv';
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
const ORG_ID = 'affiliate_org_winterhawks_ice_adult_hockey';
const LOGO_FILE_ID = 'affiliate_file_winterhawks_ice_adult_hockey_logo';
const SOURCE_ID = 'affiliate_source_winterhawks_ice_adult_hockey';
const SOURCE_KEY = 'winterhawks-ice-adult-hockey';
const MAPPING_ID = 'affiliate_source_winterhawks_ice_adult_hockey_mapping_v1';
const HOME_URL = 'https://wicadulthockey.sportngin.com/';
const SHERWOOD_REGISTRATION_URL = 'https://wicadulthockey.sportngin.com/register/form/297110702';
const BEAVERTON_REGISTRATION_URL = 'https://wicadulthockey.sportngin.com/register/form/412044013';
const LOGO_SOURCE_URL = 'https://cdn2.sportngin.com/attachments/logo_graphic/58bc-208869756/WIClogomain_medium.png';

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: HOME_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Winterhawks ICE Adult Hockey',
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
      title: 'Winterhawks ICE Sherwood Fall Adult Hockey Leagues',
      officialActionUrl: SHERWOOD_REGISTRATION_URL,
      sourceUrl: HOME_URL,
      organizerName: 'Winterhawks ICE Centers',
      sportName: 'Hockey',
      formatLabel: 'Adult hockey league',
      city: 'Sherwood, OR',
      venueName: 'Winterhawks ICE Center - Sherwood',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Fall 2026 Sherwood adult leagues include 35 and Over Draft on Mondays, All Levels Draft on Saturdays, Gold on Thursdays, Silver AA on Sundays, Silver A on Wednesdays, Silver BB on Saturdays, Silver B on Sundays, Silver C on Fridays, and Bronze on Tuesdays.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall 2026 registration; early deadline July 10 at 9:00 PM',
      skillLevel: 'Bronze through Gold plus draft leagues',
      ageGroup: 'Adult; includes 35+ draft',
      divisionText: '35 and Over Draft; All Levels Draft; Gold; Silver AA; Silver A; Silver BB; Silver B; Silver C; Bronze',
      participantOptionsText: 'Player registration through SportsEngine; free agents are welcome and teams can contact the adult hockey director.',
      statusText: 'The source says free agents are welcome and early registration to save $75 expires July 10, 2026 at 9:00 PM.',
      registrationDeadlineText: 'Early registration discount deadline: July 10, 2026 at 9:00 PM',
      description: 'Winterhawks ICE Centers runs adult hockey leagues across Spring, Summer, and Fall seasons. The Fall 2026 Sherwood registration page is linked from the official adult hockey page, and the source lists Sherwood divisions from Bronze beginner league up to Gold plus 35+ and All Levels draft leagues. Free agents are welcome and may be moved to an appropriate league if needed for fit or parity. The public registration welcome page does not expose the base registration price without proceeding through the SportsEngine account flow, so the headline price is left unspecified.',
      divisions: [
        {
          name: '35 and Over Draft',
          key: 'c_age_35plus_draft',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '35plus',
          maxParticipants: null,
          ageCutoffLabel: '35+',
          ageCutoffSource: 'Winterhawks ICE adult hockey page',
        },
        {
          name: 'All Levels Draft',
          key: 'c_skill_all_levels_draft',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'OPEN',
          maxParticipants: null,
        },
        {
          name: 'Gold',
          key: 'c_skill_gold',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'GOLD',
          maxParticipants: null,
        },
        {
          name: 'Silver',
          key: 'c_skill_silver',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'SILVER',
          maxParticipants: null,
        },
        {
          name: 'Bronze',
          key: 'c_skill_bronze',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'BRONZE',
          maxParticipants: null,
        },
      ],
      warnings: [
        'Stored as a no-fixed-date affiliate event because the public source gives Fall 2026 registration links and deadlines but no reliable future season start date.',
        'The public registration welcome page does not expose a base price before SportsEngine login, so price is left unspecified.',
        'SportsEngine user/authentication paths are not scraped.',
      ],
    },
    {
      listingKind: 'EVENT',
      title: 'Winterhawks ICE Beaverton/VMC Fall Adult Hockey Leagues',
      officialActionUrl: BEAVERTON_REGISTRATION_URL,
      sourceUrl: HOME_URL,
      organizerName: 'Winterhawks ICE Centers',
      sportName: 'Hockey',
      formatLabel: 'Adult hockey league',
      city: 'Beaverton, OR',
      venueName: 'Winterhawks ICE Center - Beaverton/VMC',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Fall 2026 Beaverton/VMC adult leagues include Div 2 on Tuesday/Wednesday, Div 3 on Saturday, Div 4 on Friday, 35 and Over Draft on Monday, 50 and Over on Thursday, PUHL Competition on Sunday, PUHL Recreational on Sunday, and PUHL Novice on Wednesday.',
      dateDisplayMode: 'NO_FIXED_DATE',
      dateDisplayText: 'Fall 2026 registration; early deadline July 10 at 9:00 PM',
      skillLevel: 'Div 2-Div 4, age-group draft, and PUHL divisions',
      ageGroup: 'Adult; includes 35+ and 50+ options',
      divisionText: 'Div 2; Div 3; Div 4; 35 and Over Draft; 50 and Over; PUHL Competition; PUHL Recreational; PUHL Novice',
      participantOptionsText: 'Player registration through SportsEngine; free agents are welcome and teams can contact the adult hockey director.',
      statusText: 'The source says free agents are welcome and early registration to save $75 expires July 10, 2026 at 9:00 PM.',
      registrationDeadlineText: 'Early registration discount deadline: July 10, 2026 at 9:00 PM',
      description: 'Winterhawks ICE Centers lists Fall 2026 Beaverton/VMC adult hockey registration with Div 2, Div 3, Div 4, 35 and Over Draft, 50 and Over, and PUHL divisions. Some PUHL Novice games are listed as playing mostly at Veterans Memorial Coliseum. The public page says free agents are welcome and may be moved to an appropriate league if needed for fit or parity. The public registration welcome page does not expose the base registration price without proceeding through the SportsEngine account flow, so the headline price is left unspecified.',
      divisions: [
        {
          name: 'Div 2',
          key: 'c_skill_div_2',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'DIV2',
          maxParticipants: null,
        },
        {
          name: 'Div 3',
          key: 'c_skill_div_3',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'DIV3',
          maxParticipants: null,
        },
        {
          name: 'Div 4',
          key: 'c_skill_div_4',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'DIV4',
          maxParticipants: null,
        },
        {
          name: '35 and Over Draft',
          key: 'c_age_35plus_draft',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '35plus',
          maxParticipants: null,
          ageCutoffLabel: '35+',
          ageCutoffSource: 'Winterhawks ICE adult hockey page',
        },
        {
          name: '50 and Over',
          key: 'c_age_50plus',
          gender: 'C',
          ratingType: 'AGE',
          divisionTypeId: '50plus',
          maxParticipants: null,
          ageCutoffLabel: '50+',
          ageCutoffSource: 'Winterhawks ICE adult hockey page',
        },
        {
          name: 'PUHL',
          key: 'c_skill_puhl',
          gender: 'C',
          ratingType: 'SKILL',
          divisionTypeId: 'PUHL',
          maxParticipants: null,
        },
      ],
      warnings: [
        'Stored as a no-fixed-date affiliate event because the public source gives Fall 2026 registration links and deadlines but no reliable future season start date.',
        'The public registration welcome page does not expose a base price before SportsEngine login, so price is left unspecified.',
        'SportsEngine user/authentication paths are not scraped.',
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
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (ownerId: string) => {
  const { data, contentType } = await downloadLogo();
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'winterhawks-ice-adult-hockey-logo.png',
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
      originalName: 'winterhawks-ice-adult-hockey-logo.png',
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
      originalName: 'winterhawks-ice-adult-hockey-logo.png',
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
    select: { sports: true },
  });
  const sports = Array.from(new Set([...(existing?.sports ?? []), 'Hockey']));

  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Winterhawks ICE Centers Adult Hockey',
      location: 'Sherwood / Beaverton, OR',
      address: null,
      description: 'Winterhawks ICE Centers hosts adult hockey leagues across Sherwood, Beaverton, and Veterans Memorial Coliseum with Spring, Summer, and Fall seasons, skill divisions, age-group draft leagues, and free-agent registration.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: null,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Winterhawks ICE Centers Adult Hockey',
      location: 'Sherwood / Beaverton, OR',
      address: null,
      description: 'Winterhawks ICE Centers hosts adult hockey leagues across Sherwood, Beaverton, and Veterans Memorial Coliseum with Spring, Summer, and Fall seasons, skill divisions, age-group draft leagues, and free-agent registration.',
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports,
      status: 'UNLISTED',
      coordinates: null,
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
    name: 'Winterhawks ICE Adult Hockey',
    sourceKey: SOURCE_KEY,
    organizationId: ORG_ID,
    baseUrl: HOME_URL,
    listUrl: HOME_URL,
    targetKind: 'EVENT',
    status: 'ACTIVE',
    activeMappingId: MAPPING_ID,
    autoScrapeEnabled: false,
    scrapeIntervalMinutes: 10080,
    notes: 'Manual Fall 2026 adult hockey registration source from public SportsEngine pages. Do not scrape user/auth/event-calendar paths.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsNote: 'robots.txt allows normal public pages and disallows /users/, /event/show_day, and deep /event/* calendar paths. Content signals reserve AI training but allow search/reference use.',
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
      notes: 'Manual Winterhawks ICE Fall adult hockey registration mapping.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual Winterhawks ICE Fall adult hockey registration mapping.',
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

  console.log(`Winterhawks ICE affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-winterhawks-ice-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
