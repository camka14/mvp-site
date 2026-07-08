/**
 * Makes club-like affiliate organizations discoverable public org pages.
 *
 * Default mode is dry-run against the local DB. Use --apply to write changes and
 * --live to target DATABASE_URL_LIVE.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;

type ClubOrgPublicPage = {
  id: string;
  slug: string;
  name: string;
  location: string;
  website: string;
  description: string;
  publicHeadline: string;
  publicIntroText: string;
};

const clubOrgPages: ClubOrgPublicPage[] = [
  {
    id: 'affiliate_org_portland_city_united',
    slug: 'portland-city-united-soccer-club',
    name: 'Portland City United Soccer Club',
    location: 'Portland, OR',
    website: 'https://www.pcusc.org/',
    description: 'Portland City United Soccer Club is a Portland youth soccer club serving U5-U19 players with teams, academies, camps, leagues, tournaments, ECNL RL and Pre-ECNL RL pathways, financial aid, and training facilities at Buckman Field Complex and Portland Christian High School.',
    publicHeadline: 'Portland City United Soccer Club programs',
    publicIntroText: 'Find PCU teams, academies, camps, tournaments, and current registration opportunities.',
  },
  {
    id: 'affiliate_org_united_pdx',
    slug: 'united-pdx',
    name: 'United PDX',
    location: 'Portland, OR',
    website: 'https://www.unitedpdx.com/',
    description: 'United PDX is a Portland youth soccer club offering U8-U10 Youth Development Academy, U11-U18/19 academy pathways, recreational soccer, camps, college ID opportunities, and year-round player development programs.',
    publicHeadline: 'United PDX programs',
    publicIntroText: 'Find United PDX academy programs, recreational soccer, camps, and registration opportunities.',
  },
  {
    id: 'affiliate_org_eastside_timbers',
    slug: 'eastside-timbers',
    name: 'Eastside Timbers',
    location: 'Portland, OR',
    website: 'https://www.eastsidetimbers.com/',
    description: 'Eastside Timbers is a youth soccer club and program operator serving East Multnomah and Clackamas Counties. The organization runs recreational soccer, competitive programs, camps, training, field rentals, and indoor futsal programs through Oregon Premier Futsal.',
    publicHeadline: 'Eastside Timbers programs',
    publicIntroText: 'Find Eastside Timbers recreation, camps, training, field rentals, and indoor soccer opportunities.',
  },
  {
    id: 'affiliate_org_soccer_chance_academy',
    slug: 'soccer-chance-academy-portland',
    name: 'Soccer Chance Academy Portland',
    location: 'Portland, OR',
    website: 'https://soccerchanceacademy.us/',
    description: 'Soccer Chance Academy Portland is a youth soccer academy offering player development, academy programs, camps, futsal training, tournaments such as Oregon Super Cup, and soccer education programs for players in the Portland metro area.',
    publicHeadline: 'Soccer Chance Academy Portland programs',
    publicIntroText: 'Find Soccer Chance Academy tournaments, camps, academy programs, and registration links.',
  },
  {
    id: 'affiliate_org_oregon_youth_soccer',
    slug: 'oregon-youth-soccer-association',
    name: 'Oregon Youth Soccer Association',
    location: 'Beaverton, OR',
    website: 'https://www.oregonyouthsoccer.org/',
    description: 'Oregon Youth Soccer Association is a statewide youth soccer organization that supports Oregon member clubs, leagues, tournaments, coaching, refereeing, and player programs. Its sanctioned tournament directory lists approved youth soccer competitions hosted around Oregon.',
    publicHeadline: 'Oregon Youth Soccer Association programs',
    publicIntroText: 'Find sanctioned youth soccer tournaments, member-club programs, and official OYSA links.',
  },
  {
    id: 'affiliate_org_portland_youth_soccer_association',
    slug: 'portland-youth-soccer-association',
    name: 'Portland Youth Soccer Association',
    location: 'Portland, OR',
    website: 'https://sports.bluesombrero.com/Default.aspx?tabid=272293',
    description: 'Portland Youth Soccer Association supports Portland-area youth soccer clubs and leagues, including recreational and competitive play, seasonal registration, schedules, field information, coaching resources, and official league administration.',
    publicHeadline: 'Portland Youth Soccer Association programs',
    publicIntroText: 'Find Portland youth soccer league information, registration links, fields, and member-club resources.',
  },
  {
    id: 'affiliate_org_timbers_army_fc',
    slug: 'timbers-army-fc',
    name: 'Timbers Army FC',
    location: 'Portland, OR',
    website: 'https://107ist.org/107ist/community/timbers-army-fc',
    description: 'Timbers Army FC is a 107IST community soccer network for Timbers Army, Riveters, and 107IST members. It supports team managers and players across non-aggressive 7v7, outdoor, indoor, and futsal leagues in the Portland metro area.',
    publicHeadline: 'Timbers Army FC community teams',
    publicIntroText: 'Find Timbers Army FC team information, league participation details, and official community links.',
  },
  {
    id: 'affiliate_org_03_international_badminton',
    slug: '03-international-badminton-club',
    name: '03 International Badminton Club',
    location: 'Beaverton, OR',
    website: 'https://www.03intlbadminton.net/',
    description: '03 International Badminton Club is a Beaverton badminton facility offering court rentals, youth and adult training, summer camps, tournaments, memberships, and team programs.',
    publicHeadline: '03 International Badminton Club programs',
    publicIntroText: 'Find 03 International Badminton court rentals, classes, camps, tournaments, and training links.',
  },
  {
    id: 'affiliate_org_8th_street_athletics',
    slug: '8th-street-athletics',
    name: '8th Street Athletics',
    location: 'Gresham, OR',
    website: 'https://www.8thstreetacademy.org/athletics',
    description: '8th Street Athletics is the athletics program at 8th Street Academy in Gresham, offering youth sports programs and gym rental for volleyball, basketball, and pickleball use.',
    publicHeadline: '8th Street Athletics programs',
    publicIntroText: 'Find 8th Street Athletics youth sports programs, camps, and gym rental links.',
  },
  {
    id: 'affiliate_org_cascade_athletic_clubs_gresham',
    slug: 'cascade-athletic-clubs-gresham',
    name: 'Cascade Athletic Clubs Gresham',
    location: 'Gresham, OR',
    website: 'https://cascadeac.com/gresham/sports-programs/',
    description: 'Cascade Athletic Clubs Gresham is a multi-sport athletic club with basketball, pickleball, racquetball, tennis, swimming, fitness, youth programs, court reservations, and club sports programming.',
    publicHeadline: 'Cascade Athletic Clubs Gresham programs',
    publicIntroText: 'Find Cascade Gresham sports programs, court reservations, youth programs, and club links.',
  },
  {
    id: 'affiliate_org_oregon_badminton_academy',
    slug: 'oregon-badminton-academy',
    name: 'Oregon Badminton Academy',
    location: 'Beaverton, OR',
    website: 'https://orbadminton.com/',
    description: 'Oregon Badminton Academy is a Beaverton badminton facility offering court reservations, open play, youth and adult coaching, camps, tournaments, corporate events, and team events.',
    publicHeadline: 'Oregon Badminton Academy programs',
    publicIntroText: 'Find Oregon Badminton Academy court reservations, open play, coaching, camps, and tournament links.',
  },
  {
    id: 'affiliate_org_recs_pickleball',
    slug: 'recs-pickleball',
    name: 'RECS Pickleball',
    location: 'Clackamas, OR',
    website: 'https://wearerecs.com/',
    description: 'RECS Pickleball operates indoor pickleball clubs in Clackamas and Tualatin with court reservations, group play, clinics, lessons, mixers, round robins, tournaments, events, and private group rentals.',
    publicHeadline: 'RECS Pickleball programs',
    publicIntroText: 'Find RECS Pickleball open play, leagues, lessons, events, tournaments, court reservations, and rentals.',
  },
];

let prisma: PrismaClientInstance | undefined;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
};

const claimSlug = async (desiredSlug: string, orgId: string): Promise<string> => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { publicSlug: desiredSlug },
    select: {
      id: true,
      name: true,
      status: true,
      publicPageEnabled: true,
      website: true,
    },
  });
  if (!existing || existing.id === orgId) {
    return desiredSlug;
  }
  if (existing.publicPageEnabled === true || existing.status === 'LISTED') {
    throw new Error(`Public slug ${desiredSlug} is already owned by active org ${existing.id} (${existing.name}).`);
  }
  console.log(`[reclaim-slug] ${desiredSlug} from disabled org ${existing.id}`);
  if (apply) {
    await (prisma as any).organizations.update({
      where: { id: existing.id },
      data: {
        updatedAt: new Date(),
        publicSlug: null,
        publicPageEnabled: false,
      },
    });
  }
  return desiredSlug;
};

const main = async () => {
  await loadAppModules();

  const rows = await (prisma as any).organizations.findMany({
    where: { id: { in: clubOrgPages.map((org) => org.id) } },
    select: {
      id: true,
      name: true,
      status: true,
      publicSlug: true,
      publicPageEnabled: true,
      website: true,
      description: true,
    },
    orderBy: { name: 'asc' },
  });
  const existingById = new Map<string, Record<string, any>>(
    rows.map((row: any) => [String(row.id), row]),
  );

  let missing = 0;
  let updated = 0;
  for (const org of clubOrgPages) {
    const existing = existingById.get(org.id);
    if (!existing) {
      missing += 1;
      console.warn(`[missing] ${org.id} (${org.name})`);
      continue;
    }

    const slug = await claimSlug(org.slug, org.id);
    const data = {
      updatedAt: new Date(),
      name: org.name,
      location: org.location,
      website: org.website,
      description: org.description,
      status: 'LISTED',
      publicSlug: slug,
      publicPageEnabled: true,
      publicHeadline: org.publicHeadline,
      publicIntroText: org.publicIntroText,
    };

    const needsUpdate = existing.name !== data.name
      || existing.status !== data.status
      || existing.publicSlug !== data.publicSlug
      || existing.publicPageEnabled !== data.publicPageEnabled
      || existing.website !== data.website
      || existing.description !== data.description;

    console.log(`${needsUpdate ? '[update]' : '[ok]'} ${org.name} -> /o/${slug}`);
    if (needsUpdate && apply) {
      await (prisma as any).organizations.update({
        where: { id: org.id },
        data,
      });
      updated += 1;
    }
  }

  console.log(`${apply ? 'Applied' : 'Dry run'} complete: ${updated} updated, ${missing} missing.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
