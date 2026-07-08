import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

loadEnv({ path: path.join(process.cwd(), '.env.local'), override: false });

const OWNER_EMAIL = 'samuel.r@razumly.com';
const ORG_ID = 'affiliate_org_portland_youth_soccer_association';
const LOGO_FILE_ID = 'affiliate_file_portland_youth_soccer_association_logo';
const SOURCE_ID = 'affiliate_source_portland_youth_soccer_association_programs';
const SOURCE_KEY = 'portland-youth-soccer-association-programs';
const MAPPING_ID = 'affiliate_mapping_portland_youth_soccer_association_programs_v1';
const BASE_URL = 'https://leagues.bluesombrero.com/';
const HOME_URL = 'https://leagues.bluesombrero.com/Default.aspx?tabid=1558293';
const REGISTRARS_URL = 'https://leagues.bluesombrero.com/Default.aspx?tabid=1711497';
const FALL_SHOOTOUT_URL = 'https://leagues.bluesombrero.com/Default.aspx?tabid=2244874';
const FALL_TEAM_REGISTRATION_URL = 'https://docs.google.com/document/d/1EnXobKDVPREHkaGz4Eh0yN9Jhu90rajKk_uNxTcwhuU/edit?tab=t.oqy6fv6i453i#heading=h.lftbxvkh6ewn';
const LOGO_SOURCE_URL = 'https://leagues.bluesombrero.com/Portals/81086/logo638264953461949679.png';
const PUBLIC_SLUG = 'portland-youth-soccer-association';
const ORGANIZER_DESCRIPTION = 'Portland Youth Soccer Association supports Portland-area youth soccer clubs and leagues, including recreational and competitive play, seasonal registration, schedules, field information, coaching resources, and official league administration.';

const fallLeagueDivisions = [
  { name: 'U7', divisionTypeId: 'u7', priceCents: 22500 },
  { name: 'U8', divisionTypeId: 'u8', priceCents: 27000 },
  { name: 'U9', divisionTypeId: 'u9', priceCents: 39000 },
  { name: 'U10', divisionTypeId: 'u10', priceCents: 39000 },
  { name: 'U11', divisionTypeId: 'u11', priceCents: 45500 },
  { name: 'U12', divisionTypeId: 'u12', priceCents: 45500 },
  { name: 'U13', divisionTypeId: 'u13', priceCents: 52000 },
  { name: 'U14', divisionTypeId: 'u14', priceCents: 52000 },
  { name: 'U15-U19', divisionTypeId: 'u19', priceCents: 58500 },
].map((division) => ({
  ...division,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  ageCutoffLabel: division.name,
  ageCutoffSource: 'PYSA registrar information team formation and fee tables',
  maxParticipants: null,
}));

const springLeagueDivisions = fallLeagueDivisions.map((division) => ({
  ...division,
  ageCutoffSource: 'PYSA registrar information Spring 2027 fee table',
}));

const fallShootoutDivisions = fallLeagueDivisions
  .filter((division) => ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14'].includes(division.name))
  .map((division) => ({
    ...division,
    maxParticipants: null,
    ageCutoffSource: 'PYSA Fall Shootout page and registrar tournament fee table',
  }));

const mapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: REGISTRARS_URL,
  itemSelector: 'body',
  fields: {
    title: {
      selector: 'body',
      mode: 'literal',
      value: 'Portland Youth Soccer Association Programs',
    },
    officialActionUrl: {
      selector: 'body',
      mode: 'literal',
      value: HOME_URL,
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
  manualCandidates: [
    {
      title: 'PYSA Fall 2026 Recreational Soccer League',
      officialActionUrl: FALL_TEAM_REGISTRATION_URL,
      sourceUrl: REGISTRARS_URL,
      organizerName: 'Portland Youth Soccer Association',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth recreational soccer league',
      city: 'Portland, OR',
      venueName: 'Portland parks and fields',
      address: 'Portland, OR',
      startsAt: '2026-09-12T00:00:00-07:00',
      endsAt: '2026-10-31T23:59:59-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Fall 2026 play dates are Sept. 12, 19, 26 and Oct. 3, 10, 17, 24, 31. U10-U14 teams play seven games. U9 teams play six games, and the September 6 U9 jamboree counts as one game.',
      dateDisplayText: 'Fall 2026 play dates: Sept. 12-Oct. 31',
      ageGroup: 'U7-U19',
      participantOptionsText: 'Team registration through PYSA. Clubs form balanced teams and submit team registration by the deadline.',
      priceText: 'Fall team fees range from $225-$585 by age group. U7 $225, U8 $270, U9-U10 $390, U11-U12 $455, U13-U14 $520, and U15-U19 $585. PYSA membership, player, coach, and field fees may also apply.',
      registrationDeadlineText: 'August 1, 2026',
      statusText: 'Fall 2026 team registration is open according to the PYSA home page.',
      description: 'Portland Youth Soccer Association runs recreational youth soccer for Portland-area clubs. PYSA says the fall season uses age-appropriate formats, team formation guidelines, and Saturday play dates across Portland parks and fields. The registrar page publishes roster recommendations by age group, but it does not publish team-slot capacity.',
      divisions: fallLeagueDivisions,
      warnings: [
        'Stored as a manual summary because the public Sports Connect pages publish league dates, fees, and age-group tables across multiple static pages rather than one repeated registration-card list.',
        'PYSA publishes recommended roster maximums by age group, but those are not team-slot capacity and are intentionally not stored as division maxParticipants.',
      ],
    },
    {
      title: 'PYSA Fall Shootout Tournament',
      officialActionUrl: FALL_SHOOTOUT_URL,
      sourceUrl: FALL_SHOOTOUT_URL,
      organizerName: 'Portland Youth Soccer Association',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth soccer tournament',
      city: 'Portland, OR',
      venueName: 'Buckman Field Park or Delta Park',
      address: 'Portland, OR',
      startsAt: '2026-11-07T00:00:00-08:00',
      endsAt: '2026-11-14T23:59:59-08:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Weekend 1 is Saturday, Nov. 7, 2026. Weekend 2 is Saturday, Nov. 14, 2026. PYSA says all teams play three games on turf at Buckman Field Park or Delta Park.',
      dateDisplayText: 'Nov. 7 and Nov. 14, 2026',
      ageGroup: 'U8-U14',
      participantOptionsText: 'Team registration for PYSA recreational teams. Competitive club players are not permitted.',
      priceText: 'Tournament team fees range from $270-$520 by age group. U8 $270, U9-U10 $390, U11-U12 $455, and U13-U14 $520.',
      registrationDeadlineText: 'October 15, 2026',
      statusText: 'Registration and game schedule are listed as coming Fall 2026.',
      description: 'PYSA Fall Shootout is a recreational youth soccer tournament for PYSA teams. PYSA describes it as an extra weekend of games with awards, community building, and three guaranteed turf games.',
      divisions: fallShootoutDivisions,
    },
    {
      title: 'PYSA Spring 2027 Recreational Soccer League',
      officialActionUrl: REGISTRARS_URL,
      sourceUrl: REGISTRARS_URL,
      organizerName: 'Portland Youth Soccer Association',
      sportName: 'Grass Soccer',
      formatLabel: 'Youth recreational soccer league',
      city: 'Portland, OR',
      venueName: 'Portland parks and fields',
      address: 'Portland, OR',
      startsAt: '2027-04-04T00:00:00-07:00',
      endsAt: '2027-05-16T23:59:59-07:00',
      timeZone: 'America/Los_Angeles',
      scheduleText: 'Spring 2027 play dates are Apr. 4, 11, 18, 25 and May 2, 9, 16. PYSA says teams play six games and no practice fields are given.',
      dateDisplayText: 'Spring 2027 play dates: Apr. 4-May 16',
      ageGroup: 'U7-U19',
      participantOptionsText: 'Team registration through PYSA. Clubs form balanced teams and submit team registration by the deadline.',
      priceText: 'Spring team fees range from $225-$585 by age group. U7 $225, U8 $270, U9-U10 $390, U11-U12 $455, U13-U14 $520, and U15-U19 $585. PYSA membership, player, coach, and field fees may also apply.',
      registrationDeadlineText: 'March 1, 2027',
      statusText: 'Spring 2027 dates and deadlines are published on the PYSA registrar information page.',
      description: 'Portland Youth Soccer Association runs spring recreational youth soccer for Portland-area clubs. PYSA says the spring season has six games and no practice-field allocation. The registrar page publishes roster recommendations by age group, but it does not publish team-slot capacity.',
      divisions: springLeagueDivisions,
      warnings: [
        'Stored as a manual summary because the public Sports Connect pages publish league dates, fees, and age-group tables across multiple static pages rather than one repeated registration-card list.',
        'PYSA publishes recommended roster maximums by age group, but those are not team-slot capacity and are intentionally not stored as division maxParticipants.',
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

const upsertLogo = async (ownerId: string) => {
  const response = await fetch(LOGO_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download PYSA logo: ${response.status} ${response.statusText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'portland-youth-soccer-association-logo.png',
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
      originalName: 'portland-youth-soccer-association-logo.png',
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
      originalName: 'portland-youth-soccer-association-logo.png',
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
      name: 'Portland Youth Soccer Association',
      location: 'Portland, OR',
      address: '10940 SW Barnes Rd #322, Portland, OR 97225',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates: [-122.789617, 45.512921],
      productIds: [],
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Portland Youth Soccer Association programs',
      publicIntroText: 'Find Portland youth soccer league information, registration links, fields, and member-club resources.',
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: false,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Portland Youth Soccer Association',
      location: 'Portland, OR',
      address: '10940 SW Barnes Rd #322, Portland, OR 97225',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: HOME_URL,
      sports: ['Grass Soccer'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Portland Youth Soccer Association programs',
      publicIntroText: 'Find Portland youth soccer league information, registration links, fields, and member-club resources.',
      coordinates: [-122.789617, 45.512921],
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
      name: 'Portland Youth Soccer Association Programs',
      sourceKey: SOURCE_KEY,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: REGISTRARS_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual summary mapping for PYSA youth soccer league and Fall Shootout rows. PYSA publishes dates, fees, divisions, roster maximums, and deadlines across static Sports Connect pages rather than repeated registration cards.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'Sports Connect / Blue Sombrero static pages',
        homeUrl: HOME_URL,
        registrarsUrl: REGISTRARS_URL,
        fallShootoutUrl: FALL_SHOOTOUT_URL,
        logoSourceUrl: LOGO_SOURCE_URL,
        robotsAllowed: true,
      },
    },
    update: {
      name: 'Portland Youth Soccer Association Programs',
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: REGISTRARS_URL,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      activeMappingId: MAPPING_ID,
      notes: 'Manual summary mapping for PYSA youth soccer league and Fall Shootout rows. PYSA publishes dates, fees, divisions, roster maximums, and deadlines across static Sports Connect pages rather than repeated registration cards.',
      metadata: {
        inspectedAt: '2026-07-04',
        platform: 'Sports Connect / Blue Sombrero static pages',
        homeUrl: HOME_URL,
        registrarsUrl: REGISTRARS_URL,
        fallShootoutUrl: FALL_SHOOTOUT_URL,
        logoSourceUrl: LOGO_SOURCE_URL,
        robotsAllowed: true,
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
      notes: 'Manual summary mapping for PYSA Fall 2026, Fall Shootout 2026, and Spring 2027 rows with source-derived fees and divisions.',
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping,
      notes: 'Manual summary mapping for PYSA Fall 2026, Fall Shootout 2026, and Spring 2027 rows with source-derived fees and divisions.',
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

  console.log(`PYSA affiliate source ready: ${SOURCE_KEY}`);
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
    console.error('[setup-pysa-affiliate-source] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
