import dotenv from 'dotenv';
import type { AffiliateListingKind, AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

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
const INSPECTED_AT = '2026-07-06';
const DAY = 1440;
const WEEK = 10080;
const MONTH = 43200;

type SourceOrganizationDefinition = {
  id: string;
  logoFileId: string;
  logoSourceUrl: string;
  logoOriginalName: string;
  name: string;
  location: string;
  address?: string | null;
  website: string;
  description: string;
  sports: string[];
  operatesAthleticFacility: boolean;
};

type SourceDefinition = {
  id: string;
  sourceKey: string;
  name: string;
  orgId: string;
  baseUrl: string;
  listUrl: string;
  targetKind: AffiliateListingKind;
  intervalMinutes: number;
  mapping: AffiliateScrapeMapping;
  notes: string;
  metadata: Record<string, unknown>;
};

const orgDefinitions: SourceOrganizationDefinition[] = [
  {
    id: 'affiliate_org_outloud_sports_portland',
    logoFileId: 'affiliate_file_outloud_sports_portland_logo',
    logoSourceUrl: 'https://images.squarespace-cdn.com/content/v1/5a83611e12abd953cf9a7f9b/d3969a58-1618-4af0-be7b-0f362c9dea68/OutLoud+Sports+Logos-3.png?format=1500w',
    logoOriginalName: 'outloud-sports-portland-logo.webp',
    name: 'OutLoud Sports Portland',
    location: 'Portland, OR',
    address: null,
    website: 'https://outloudsports.com/portland',
    description: 'OutLoud Sports Portland runs inclusive adult recreational leagues and social sports programs across the Portland area, including kickball, dodgeball, soccer, football, pickleball, tennis, volleyball, and bowling.',
    sports: ['Kickball', 'Dodgeball', 'Soccer', 'Football', 'Pickleball', 'Tennis', 'Volleyball', 'Bowling'],
    operatesAthleticFacility: false,
  },
  {
    id: 'affiliate_org_east_county_pickleball_courts',
    logoFileId: 'affiliate_file_east_county_pickleball_courts_logo',
    logoSourceUrl: 'https://img1.wsimg.com/isteam/ip/266ea460-5b0d-4258-b178-41f3e7f34ad8/ECPC_LOGO%20WHITE.png/:/rs=w:366,h:225,cg:true,m/cr=w:366,h:225/qt=q:95',
    logoOriginalName: 'east-county-pickleball-courts-logo.png',
    name: 'East County Pickleball Courts',
    location: 'Troutdale, OR',
    address: '27100 SE Stark St, Troutdale, OR 97060',
    website: 'https://eastcountypickleballcourts.com/',
    description: 'East County Pickleball Courts is a dedicated indoor pickleball facility in Troutdale with 12 cushioned courts, open play, round robins, league nights, private events, and court reservations.',
    sports: ['Pickleball'],
    operatesAthleticFacility: true,
  },
  {
    id: 'affiliate_org_the_peoples_courts',
    logoFileId: 'affiliate_file_the_peoples_courts_logo',
    logoSourceUrl: 'https://thepeoplescourts.com/wp-content/uploads/2023/09/web-logo.png',
    logoOriginalName: 'the-peoples-courts-logo.png',
    name: "The People's Courts",
    location: 'Portland, OR',
    address: '2700 NE 82nd Ave, Portland, OR 97220',
    website: 'https://thepeoplescourts.com/',
    description: "The People's Courts is a Portland pickleball and social sports venue with indoor and outdoor court reservations, open play, tournaments, private events, food, drinks, and games.",
    sports: ['Pickleball'],
    operatesAthleticFacility: true,
  },
  {
    id: 'affiliate_org_recs_pickleball',
    logoFileId: 'affiliate_file_recs_pickleball_logo',
    logoSourceUrl: 'https://wearerecs.com/wp-content/uploads/2025/10/cropped-recsAsset-20-scaled-1.png',
    logoOriginalName: 'recs-pickleball-logo.png',
    name: 'RECS Pickleball',
    location: 'Clackamas, OR',
    address: '17015 SE 82nd Dr, Clackamas, OR 97015',
    website: 'https://wearerecs.com/',
    description: 'RECS Pickleball operates indoor pickleball clubs in Clackamas and Tualatin with court reservations, group play, clinics, lessons, mixers, round robins, tournaments, events, and private group rentals.',
    sports: ['Pickleball'],
    operatesAthleticFacility: true,
  },
  {
    id: 'affiliate_org_oregon_badminton_academy',
    logoFileId: 'affiliate_file_oregon_badminton_academy_logo',
    logoSourceUrl: 'https://orbadminton.com/wp-content/uploads/2025/08/orb-logo.png',
    logoOriginalName: 'oregon-badminton-academy-logo.png',
    name: 'Oregon Badminton Academy',
    location: 'Beaverton, OR',
    address: '11150 SW Allen Blvd, Suite 200, Beaverton, OR 97005',
    website: 'https://orbadminton.com/',
    description: 'Oregon Badminton Academy is a Beaverton badminton facility offering court reservations, open play, youth and adult coaching, camps, tournaments, corporate events, and team events.',
    sports: ['Badminton'],
    operatesAthleticFacility: true,
  },
  {
    id: 'affiliate_org_batting_a_thousand',
    logoFileId: 'affiliate_file_batting_a_thousand_logo',
    logoSourceUrl: 'https://batpdx.com/wp-content/uploads/2017/10/Batting-A-Thousand_CV3-1w.jpg',
    logoOriginalName: 'batting-a-thousand-logo.jpg',
    name: 'Batting a Thousand',
    location: 'Portland, OR',
    address: '8829 SE Stark St, Portland, OR 97216',
    website: 'https://batpdx.com/',
    description: "Batting a Thousand is a SE Portland indoor baseball and softball facility with automated batting cages, a turf training tunnel, reservations, walk-in availability when open, and team or group rental options.",
    sports: ['Baseball', 'Softball'],
    operatesAthleticFacility: true,
  },
  {
    id: 'affiliate_org_big_dawg_batting',
    logoFileId: 'affiliate_file_big_dawg_batting_logo',
    logoSourceUrl: 'https://lirp.cdn-website.com/3f2500b9/dms3rep/multi/opt/BigDawgLogo-1920w.png',
    logoOriginalName: 'big-dawg-batting-logo.png',
    name: 'Big Dawg Batting',
    location: 'Damascus, OR',
    address: '26785 SE Sunshine Valley Road, Damascus, OR 97089',
    website: 'https://www.bigdawgbatting.com/',
    description: 'Big Dawg Batting is a Damascus baseball and softball training facility offering batting cage lane rentals, full-facility rentals, private lessons, team workouts, and membership options.',
    sports: ['Baseball', 'Softball'],
    operatesAthleticFacility: true,
  },
];

const literalFields = (title: string, officialActionUrl: string) => ({
  title: { selector: 'body', mode: 'literal' as const, value: title },
  officialActionUrl: { selector: 'body', mode: 'literal' as const, value: officialActionUrl },
});

const manualMapping = (
  kind: AffiliateListingKind,
  listUrl: string,
  title: string,
  officialActionUrl: string,
  manualCandidates: NonNullable<AffiliateScrapeMapping['manualCandidates']>,
): AffiliateScrapeMapping => ({
  kind,
  listUrl,
  itemSelector: 'body',
  fields: literalFields(title, officialActionUrl),
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates,
});

const recsEventMapping: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: 'https://wearerecs.com/events-and-tournaments/',
  itemSelector: '.courtflow-events-card',
  fields: {
    title: { selector: '.courtflow-events-card__title', mode: 'text' },
    officialActionUrl: {
      selector: 'a.courtflow-events-card__link',
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
    },
    sourceUrl: {
      selector: 'body',
      mode: 'literal',
      value: 'https://wearerecs.com/events-and-tournaments/',
    },
    organizerName: {
      selector: 'body',
      mode: 'literal',
      value: 'RECS Pickleball',
    },
    sportName: {
      selector: 'body',
      mode: 'literal',
      value: 'Pickleball',
    },
    formatLabel: { selector: '.courtflow-events-card__badge--type', mode: 'text' },
    city: {
      selector: '.courtflow-events-card__meta-item--location',
      mode: 'text',
      valueMap: {
        Clackamas: 'Clackamas, OR',
        Tualatin: 'Tualatin, OR',
      },
      fallbackValue: 'Clackamas, OR',
    },
    venueName: { selector: '.courtflow-events-card__meta-item--location', mode: 'text' },
    address: {
      selector: '.courtflow-events-card__meta-item--location',
      mode: 'text',
      valueMap: {
        Clackamas: '17015 SE 82nd Dr, Clackamas, OR 97015',
        Tualatin: '8380 SW Nyberg St, Tualatin, OR 97062',
      },
      fallbackValue: '17015 SE 82nd Dr, Clackamas, OR 97015',
    },
    startsAt: {
      selector: '.courtflow-events-card__meta-item--date time',
      mode: 'attribute',
      attribute: 'datetime',
      transform: 'dateTime',
    },
    scheduleText: { selector: '.courtflow-events-card__meta-item--date time', mode: 'text' },
    skillLevel: { selector: '.courtflow-events-card__badges', mode: 'text' },
    participantOptionsText: {
      selector: 'body',
      mode: 'literal',
      value: 'Individual registration through the official RECS/CourtReserve registration link.',
    },
    priceText: {
      selector: '.courtflow-events-card__meta-item--price',
      mode: 'text',
      transform: 'priceText',
    },
    statusText: { selector: 'a.courtflow-events-card__link', mode: 'text' },
    description: {
      selector: 'body',
      mode: 'literal',
      value: 'RECS publishes pickleball events, tournaments, clinics, group play, round robins, social events, and lessons from its public events page. Registration and current availability are handled by the official RECS/CourtReserve link.',
    },
  },
  dedupe: {
    fields: ['officialActionUrl', 'title', 'startsAt'],
  },
};

const sourceDefinitions: SourceDefinition[] = [
  {
    id: 'affiliate_source_outloud_sports_portland_leagues',
    sourceKey: 'outloud-sports-portland-leagues',
    name: 'OutLoud Sports Portland Leagues',
    orgId: 'affiliate_org_outloud_sports_portland',
    baseUrl: 'https://outloudsports.com/portland',
    listUrl: 'https://outloudsports.com/portland',
    targetKind: 'EVENT',
    intervalMinutes: MONTH,
    notes: 'Manual evergreen source. The public Squarespace page describes stable league categories and sends current registration to LeagueApps.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'Squarespace public page with LeagueApps outbound registration',
      robotsAllowed: true,
      officialRegistrationUrl: 'https://outloudportland.leagueapps.com/leagues',
      logoSourceUrl: orgDefinitions[0].logoSourceUrl,
    },
    mapping: manualMapping('EVENT', 'https://outloudsports.com/portland', 'OutLoud Sports Portland Adult Recreational Leagues', 'https://outloudportland.leagueapps.com/leagues', [
      {
        listingKind: 'EVENT',
        title: 'OutLoud Sports Portland Adult Recreational Leagues',
        officialActionUrl: 'https://outloudportland.leagueapps.com/leagues',
        sourceUrl: 'https://outloudsports.com/portland',
        organizerName: 'OutLoud Sports Portland',
        sportName: 'Other',
        formatLabel: 'Adult recreational league',
        city: 'Portland, OR',
        venueName: 'Portland metro area',
        address: 'Portland, OR',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'OutLoud Sports Portland lists current league registration on its official LeagueApps page.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Current league registration',
        participantOptionsText: 'Individual and team league registration on the official OutLoud Sports Portland registration page.',
        statusText: 'Open listings vary by season on LeagueApps.',
        description: 'OutLoud Sports Portland offers inclusive adult recreational sports in the Portland area, including kickball, dodgeball, soccer, football, pickleball, tennis, indoor volleyball, sand volleyball, and bowling. The source page points current league registration to the official LeagueApps league catalog.',
        warnings: [
          'Stored as an evergreen summary because the public source page delegates current dated rows to LeagueApps.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_east_county_pickleball_programs',
    sourceKey: 'east-county-pickleball-programs',
    name: 'East County Pickleball Courts Programs and Rentals',
    orgId: 'affiliate_org_east_county_pickleball_courts',
    baseUrl: 'https://eastcountypickleballcourts.com/',
    listUrl: 'https://eastcountypickleballcourts.com/',
    targetKind: 'RENTAL',
    intervalMinutes: MONTH,
    notes: 'Manual rental/program source. The public page links to Playbypoint for reservation, open-play, round-robin, league-night, and private-event availability.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'GoDaddy public page with Playbypoint outbound booking',
      robotsAllowed: true,
      bookingUrl: 'https://eastcountypickleballcourts.playbypoint.com/',
      logoSourceUrl: orgDefinitions[1].logoSourceUrl,
    },
    mapping: manualMapping('RENTAL', 'https://eastcountypickleballcourts.com/', 'East County Pickleball Courts Reservations', 'https://eastcountypickleballcourts.playbypoint.com/', [
      {
        listingKind: 'RENTAL',
        title: 'East County Pickleball Courts Reservations',
        officialActionUrl: 'https://eastcountypickleballcourts.playbypoint.com/',
        sourceUrl: 'https://eastcountypickleballcourts.com/',
        organizerName: 'East County Pickleball Courts',
        sportName: 'Pickleball',
        formatLabel: 'Indoor pickleball court rental',
        city: 'Troutdale, OR',
        venueName: 'East County Pickleball Courts',
        address: '27100 SE Stark St, Troutdale, OR 97060',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Reserve courts and check availability through the official Playbypoint page.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Court reservations, open play, private events, and organized pickleball programming are handled by the official booking page.',
        statusText: 'Availability is controlled by Playbypoint.',
        description: 'East County Pickleball Courts describes itself as one of Oregon\'s largest dedicated indoor temperature-controlled pickleball facilities, with 12 cushioned indoor courts in a 36,000 square-foot space. The public source page points players to Playbypoint for court reservations and availability.',
      },
      {
        listingKind: 'EVENT',
        title: 'East County Pickleball Courts Open Play, Round Robins, and League Nights',
        officialActionUrl: 'https://eastcountypickleballcourts.playbypoint.com/',
        sourceUrl: 'https://eastcountypickleballcourts.com/',
        organizerName: 'East County Pickleball Courts',
        sportName: 'Pickleball',
        formatLabel: 'Pickleball programs',
        city: 'Troutdale, OR',
        venueName: 'East County Pickleball Courts',
        address: '27100 SE Stark St, Troutdale, OR 97060',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'The source lists open plays, round robins, win-up/lose-down formats, league nights, and private events, with current registration handled on Playbypoint.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Current programs on official calendar',
        participantOptionsText: 'Individual pickleball program registration on the official booking page.',
        statusText: 'Open listings vary on Playbypoint.',
        description: 'East County Pickleball Courts publishes ongoing organized pickleball programming, including open play, round robins, win-up/lose-down sessions, league nights, and private events. Current dates, availability, and registration are controlled by the official Playbypoint page.',
        warnings: [
          'Stored as an evergreen program because no stable, crawlable public dated rows were exposed on the source page.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_the_peoples_courts_programs',
    sourceKey: 'the-peoples-courts-programs',
    name: "The People's Courts Programs and Rentals",
    orgId: 'affiliate_org_the_peoples_courts',
    baseUrl: 'https://thepeoplescourts.com/',
    listUrl: 'https://thepeoplescourts.com/',
    targetKind: 'EVENT',
    intervalMinutes: WEEK,
    notes: 'Manual event/rental source. Public WordPress pages expose source summaries and outbound pickleball tournament, CourtReserve, and Tripleseat links.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'WordPress public pages with CourtReserve, Tripleseat, and PickleballTournaments outbound links',
      robotsAllowed: true,
      courtReserveRobotsDisallowAll: true,
      tournamentUrl: 'https://pickleballtournaments.com/tournaments/2026-the-tpc-summer-tussle-at-the-peoples-courts-by-pig',
      privateEventRequestUrl: 'https://thepeoplescourts.tripleseat.com/party_request/31170',
      logoSourceUrl: orgDefinitions[2].logoSourceUrl,
    },
    mapping: manualMapping('EVENT', 'https://thepeoplescourts.com/', "The People's Courts Pickleball Programs", 'https://thepeoplescourts.com/pickleball-schedule/', [
      {
        listingKind: 'RENTAL',
        title: "The People's Courts Pickleball Reservations",
        officialActionUrl: 'https://thepeoplescourts.com/pickleball-schedule/',
        sourceUrl: 'https://thepeoplescourts.com/pickleball-schedule/',
        organizerName: "The People's Courts",
        sportName: 'Pickleball',
        formatLabel: 'Pickleball court rental',
        city: 'Portland, OR',
        venueName: "The People's Courts",
        address: '2700 NE 82nd Ave, Portland, OR 97220',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'The source says pickleball reservations are available, with current booking controlled by CourtReserve from the public schedule page.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Indoor and outdoor pickleball court reservations and open-play listings are handled by the official booking flow.',
        priceText: '$40-$49/hour for indoor pickleball court reservations; other court and open-play pricing varies by program.',
        statusText: 'Availability is controlled by CourtReserve.',
        description: "The People's Courts accepts pickleball reservations while other games are generally first come, first served. The public rates page lists indoor pickleball court reservations at $40 per hour on weekdays before 5 PM and $49 per hour after 5 PM and on weekends, plus additional open-play and outdoor-court rates.",
      },
      {
        listingKind: 'RENTAL',
        title: "The People's Courts Private Events and Buyouts",
        officialActionUrl: 'https://thepeoplescourts.tripleseat.com/party_request/31170',
        sourceUrl: 'https://thepeoplescourts.com/book-an-event/',
        organizerName: "The People's Courts",
        sportName: 'Pickleball',
        formatLabel: 'Private event rental',
        city: 'Portland, OR',
        venueName: "The People's Courts",
        address: '2700 NE 82nd Ave, Portland, OR 97220',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Private event requests are handled through the official event request form.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Request private-event availability',
        participantOptionsText: 'Private events, buyouts, party packages, kids birthday parties, and group events can be requested through the official form.',
        statusText: 'Contact venue for current availability and pricing.',
        description: "The People's Courts promotes private events, full or partial buyouts, party packages, corporate/group events, kids birthday parties, and tailgate-style events. Current availability and pricing are handled through the official Tripleseat event request form.",
      },
      {
        listingKind: 'EVENT',
        title: "TPC Summer Tussle Pickleball Tournament at The People's Courts",
        officialActionUrl: 'https://pickleballtournaments.com/tournaments/2026-the-tpc-summer-tussle-at-the-peoples-courts-by-pig',
        sourceUrl: 'https://thepeoplescourts.com/',
        organizerName: "The People's Courts",
        sportName: 'Pickleball',
        formatLabel: 'Pickleball tournament',
        city: 'Portland, OR',
        venueName: "The People's Courts",
        address: '2700 NE 82nd Ave, Portland, OR 97220',
        startsAt: '2026-07-24T09:00:00-07:00',
        endsAt: '2026-07-25T23:00:00-07:00',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'July 24-25, 2026. Registration is handled through the official PickleballTournaments page.',
        participantOptionsText: 'Tournament registration on the official PickleballTournaments page.',
        statusText: 'Registration open on official tournament page.',
        description: "The People's Courts public page promotes registration for the July 24-25, 2026 TPC Summer Tussle Pickleball Tournament by PIG. Tournament registration and division details are maintained on the official PickleballTournaments listing.",
      },
      {
        listingKind: 'EVENT',
        title: "The People's Courts Monday Night Open Play",
        officialActionUrl: 'https://thepeoplescourts.com/pickleball-schedule/',
        sourceUrl: 'https://thepeoplescourts.com/pickleball-schedule/',
        organizerName: "The People's Courts",
        sportName: 'Pickleball',
        formatLabel: 'Open play',
        city: 'Portland, OR',
        venueName: "The People's Courts",
        address: '2700 NE 82nd Ave, Portland, OR 97220',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Monday sessions listed at 7:00 PM and 8:30 PM on the public schedule page.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Mondays at 7:00 PM and 8:30 PM',
        maxParticipantsText: 'Max 40 players',
        participantOptionsText: 'Individual open-play registration through the official schedule page.',
        priceText: '$12/person',
        statusText: 'Registration required; no walk-ins for this listed open play.',
        description: "The People's Courts lists Monday Night Open Play as a registered pickleball open-play session with courts divided by skill level. The source page lists a $12/person price, a 40-player max, required registration, and no walk-ins.",
      },
    ]),
  },
  {
    id: 'affiliate_source_recs_pickleball_events',
    sourceKey: 'recs-pickleball-events',
    name: 'RECS Pickleball Events and Tournaments',
    orgId: 'affiliate_org_recs_pickleball',
    baseUrl: 'https://wearerecs.com/',
    listUrl: 'https://wearerecs.com/events-and-tournaments/',
    targetKind: 'EVENT',
    intervalMinutes: DAY,
    notes: 'Generic mapping over public RECS event cards. Booking links remain outbound to CourtReserve; CourtReserve itself is not scraped.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'WordPress public card grid with CourtReserve outbound registration links',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 10,
      bookingRobotsDisallowAll: true,
      knownLimitation: 'The visible card markup does not expose max/current capacity, even though the page embeds event JSON separately.',
      logoSourceUrl: orgDefinitions[3].logoSourceUrl,
    },
    mapping: recsEventMapping,
  },
  {
    id: 'affiliate_source_recs_pickleball_rentals',
    sourceKey: 'recs-pickleball-rentals',
    name: 'RECS Pickleball Rentals',
    orgId: 'affiliate_org_recs_pickleball',
    baseUrl: 'https://wearerecs.com/',
    listUrl: 'https://wearerecs.com/locations/',
    targetKind: 'RENTAL',
    intervalMinutes: MONTH,
    notes: 'Manual rental source for RECS Clackamas and Tualatin court reservations and group-event rental requests.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'WordPress public location and private-event pages with outbound booking flow',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 10,
      bookingRobotsDisallowAll: true,
      bookingUrl: 'https://book.wearerecs.com',
      privateEventUrl: 'https://wearerecs.com/plan-an-event/',
      logoSourceUrl: orgDefinitions[3].logoSourceUrl,
    },
    mapping: manualMapping('RENTAL', 'https://wearerecs.com/locations/', 'RECS Pickleball Court Reservations', 'https://book.wearerecs.com', [
      {
        listingKind: 'RENTAL',
        title: 'RECS Clackamas Pickleball Court Reservations and Group Events',
        officialActionUrl: 'https://book.wearerecs.com',
        sourceUrl: 'https://wearerecs.com/locations/',
        organizerName: 'RECS Pickleball',
        sportName: 'Pickleball',
        formatLabel: 'Indoor pickleball court rental',
        city: 'Clackamas, OR',
        venueName: 'RECS Clackamas',
        address: '17015 SE 82nd Dr, Clackamas, OR 97015',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Book court reservations through the official RECS booking page. Group events and full-building rentals are requested through RECS events.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Court reservations, guided beginner play, organized group play, full-building rental requests, clinics, and private group events.',
        priceText: 'Member court fees are listed at $4/hour on the public FAQ; group and private-event pricing is by request.',
        statusText: 'Availability and current rates are controlled by RECS.',
        description: 'RECS Clackamas offers indoor pickleball court reservations, group play, clinics, mixers, round robins, private lessons, events, tournaments, and group event rentals. The public locations page lists the Clackamas address and directs booking to the official RECS booking flow.',
      },
      {
        listingKind: 'RENTAL',
        title: 'RECS Tualatin Pickleball Court Reservations and Group Events',
        officialActionUrl: 'https://book.wearerecs.com',
        sourceUrl: 'https://wearerecs.com/locations/',
        organizerName: 'RECS Pickleball',
        sportName: 'Pickleball',
        formatLabel: 'Indoor pickleball court rental',
        city: 'Tualatin, OR',
        venueName: 'RECS Tualatin',
        address: '8380 SW Nyberg St, Tualatin, OR 97062',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Book court reservations through the official RECS booking page. Group events and full-building rentals are requested through RECS events.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Court reservations, guided beginner play, organized group play, full-building rental requests, clinics, and private group events.',
        priceText: 'Member court fees are listed at $4/hour on the public FAQ; group and private-event pricing is by request.',
        statusText: 'Availability and current rates are controlled by RECS.',
        description: 'RECS Tualatin offers indoor pickleball court reservations, group play, clinics, mixers, round robins, private lessons, events, tournaments, and group event rentals. The public locations page lists the Tualatin address and directs booking to the official RECS booking flow.',
      },
    ]),
  },
  {
    id: 'affiliate_source_oregon_badminton_academy_programs',
    sourceKey: 'oregon-badminton-academy-programs',
    name: 'Oregon Badminton Academy Programs and Rentals',
    orgId: 'affiliate_org_oregon_badminton_academy',
    baseUrl: 'https://orbadminton.com/',
    listUrl: 'https://orbadminton.com/',
    targetKind: 'RENTAL',
    intervalMinutes: MONTH,
    notes: 'Manual rental/program source. The public site exposes stable booking, coaching, camps, tournament, and event links without reliable current dated event rows.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'WordPress public pages with Planyo outbound booking',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 10,
      planyoBlockedPaths: ['/payment-form.php', '/rental.php'],
      bookingUrl: 'https://www.planyo.com/booking/OBA',
      logoSourceUrl: orgDefinitions[4].logoSourceUrl,
    },
    mapping: manualMapping('RENTAL', 'https://orbadminton.com/', 'Oregon Badminton Academy Court Reservations', 'https://www.planyo.com/booking/OBA', [
      {
        listingKind: 'RENTAL',
        title: 'Oregon Badminton Academy Court Reservations and Open Play',
        officialActionUrl: 'https://www.planyo.com/booking/OBA',
        sourceUrl: 'https://orbadminton.com/',
        organizerName: 'Oregon Badminton Academy',
        sportName: 'Badminton',
        formatLabel: 'Badminton court rental',
        city: 'Beaverton, OR',
        venueName: 'Oregon Badminton Academy',
        address: '11150 SW Allen Blvd, Suite 200, Beaverton, OR 97005',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Reserve courts and open play through the official Oregon Badminton Academy booking flow.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Court booking and open play through the official Planyo booking page.',
        statusText: 'Availability is controlled by the official booking page.',
        description: 'Oregon Badminton Academy promotes badminton court reservations and open play at its Beaverton facility. The public site points booking to the official Planyo reservation flow and lists the academy address, phone, and program categories.',
      },
      {
        listingKind: 'EVENT',
        title: 'Oregon Badminton Academy Coaching Programs and Camps',
        officialActionUrl: 'https://orbadminton.com/memberships/',
        sourceUrl: 'https://orbadminton.com/',
        organizerName: 'Oregon Badminton Academy',
        sportName: 'Badminton',
        formatLabel: 'Badminton coaching and camps',
        city: 'Beaverton, OR',
        venueName: 'Oregon Badminton Academy',
        address: '11150 SW Allen Blvd, Suite 200, Beaverton, OR 97005',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Youth, adult, senior, lesson, and camp schedules are maintained on the official Oregon Badminton Academy program pages.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Current program schedule on official site',
        ageGroup: 'Youth 4-19, Adults 19+, and Seniors',
        participantOptionsText: 'Program registration and lessons are handled on the official academy pages.',
        statusText: 'Current dates vary by program.',
        description: 'Oregon Badminton Academy publishes youth coaching for ages 4-19, adult and senior coaching, private lessons, and camps from its official program pages. Current schedules and registration details remain on the official site.',
        warnings: [
          'Stored as an evergreen program because the public source page does not expose a reliable dated list for all coaching and camp options.',
        ],
      },
      {
        listingKind: 'EVENT',
        title: 'Oregon Badminton Academy Tournaments and Team Events',
        officialActionUrl: 'https://orbadminton.com/tournaments/',
        sourceUrl: 'https://orbadminton.com/',
        organizerName: 'Oregon Badminton Academy',
        sportName: 'Badminton',
        formatLabel: 'Badminton tournaments and events',
        city: 'Beaverton, OR',
        venueName: 'Oregon Badminton Academy',
        address: '11150 SW Allen Blvd, Suite 200, Beaverton, OR 97005',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Tournament, corporate event, and team-event details are maintained on the official academy pages.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Check official page for current events',
        participantOptionsText: 'Tournament and team-event registration or inquiries through the official academy page.',
        statusText: 'Dates are not exposed as a stable public list.',
        description: 'Oregon Badminton Academy promotes tournaments, corporate events, and team events from its official public site. Current event dates and registration details should be confirmed on the official tournament page.',
        warnings: [
          'Do not publish this as a scheduled tournament unless the official page exposes a future date.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_batting_a_thousand_rentals',
    sourceKey: 'batting-a-thousand-rentals',
    name: 'Batting a Thousand Rentals',
    orgId: 'affiliate_org_batting_a_thousand',
    baseUrl: 'https://batpdx.com/',
    listUrl: 'https://batpdx.com/reservations/',
    targetKind: 'RENTAL',
    intervalMinutes: MONTH,
    notes: 'Manual rental source. Public WordPress pages list cage, tunnel, capacity, hours, and address details; booking is outbound to Vagaro.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'WordPress public pages with Vagaro outbound booking',
      robotsAllowed: true,
      bookingRobotsDisallowAll: true,
      bookingUrl: 'https://www.vagaro.com/batjax',
      logoSourceUrl: orgDefinitions[5].logoSourceUrl,
    },
    mapping: manualMapping('RENTAL', 'https://batpdx.com/reservations/', 'Batting a Thousand Cage and Tunnel Reservations', 'https://www.vagaro.com/batjax', [
      {
        listingKind: 'RENTAL',
        title: 'Batting a Thousand Cage and Tunnel Reservations',
        officialActionUrl: 'https://www.vagaro.com/batjax',
        sourceUrl: 'https://batpdx.com/reservations/',
        organizerName: 'Batting a Thousand',
        sportName: 'Baseball',
        formatLabel: 'Batting cage and training tunnel rental',
        city: 'Portland, OR',
        venueName: 'Batting a Thousand',
        address: '8829 SE Stark St, Portland, OR 97216',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Reservations are strongly encouraged and handled through the official Vagaro booking page. The source says book up to 7 days in advance.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Three automated batting cages, front/back training tunnel, full training tunnel, team/group requests, and walk-ins when available.',
        priceText: '$25-$64 for training-tunnel reservations; batting cage reservations are handled on the official booking page.',
        statusText: 'Reservations are strongly encouraged; call first for walk-ins.',
        description: 'Batting a Thousand offers three upgraded automated baseball and softball batting cages plus a 15x80 foot turf training tunnel that can be split into two 15x40 foot sections. The source lists training tunnel prices at $25 per half hour or $40 per hour, and full tunnel use at $40 per half hour or $64 per hour. The reservations page lists capacity limits of 6 people per batting-cage reservation, 4 people inside a front or back training tunnel, and 8 people inside the full tunnel.',
      },
    ]),
  },
  {
    id: 'affiliate_source_big_dawg_batting_rentals',
    sourceKey: 'big-dawg-batting-rentals',
    name: 'Big Dawg Batting Rentals',
    orgId: 'affiliate_org_big_dawg_batting',
    baseUrl: 'https://www.bigdawgbatting.com/',
    listUrl: 'https://www.bigdawgbatting.com/',
    targetKind: 'RENTAL',
    intervalMinutes: MONTH,
    notes: 'Manual rental source. Public page lists lane and full-facility rental prices and links to Upper Hand booking.',
    metadata: {
      inspectedAt: INSPECTED_AT,
      platform: 'Duda public page with Upper Hand outbound booking',
      robotsAllowed: true,
      bookingUrl: 'https://app.upperhand.io/customers/2242-big-dawg-batting/events',
      logoSourceUrl: orgDefinitions[6].logoSourceUrl,
    },
    mapping: manualMapping('RENTAL', 'https://www.bigdawgbatting.com/', 'Big Dawg Batting Lane and Full Facility Rentals', 'https://app.upperhand.io/customers/2242-big-dawg-batting/events', [
      {
        listingKind: 'RENTAL',
        title: 'Big Dawg Batting Lane and Full Facility Rentals',
        officialActionUrl: 'https://app.upperhand.io/customers/2242-big-dawg-batting/events',
        sourceUrl: 'https://www.bigdawgbatting.com/',
        organizerName: 'Big Dawg Batting',
        sportName: 'Baseball',
        formatLabel: 'Batting cage and facility rental',
        city: 'Damascus, OR',
        venueName: 'Big Dawg Batting',
        address: '26785 SE Sunshine Valley Road, Damascus, OR 97089',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Lane rentals and full-facility rentals are handled on the official Upper Hand booking page.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Reserve on official calendar',
        participantOptionsText: 'Batting-cage lane rentals, full-facility rentals, private training, lessons, and team workouts.',
        priceText: '$40/hour per lane; $100/hour full facility rental.',
        statusText: 'Availability is controlled by Upper Hand.',
        description: 'Big Dawg Batting lists baseball and softball lane rentals at $40 per hour and full-facility rentals at $100 per hour. The public page also promotes private training, team workouts, memberships, and lessons, with booking handled through the official Upper Hand page.',
      },
    ]),
  },
];

const sourceByKey = new Map(sourceDefinitions.map((definition) => [definition.sourceKey, definition]));
const orgById = new Map(orgDefinitions.map((definition) => [definition.id, definition]));

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

const downloadLogo = async (org: SourceOrganizationDefinition) => {
  const response = await fetch(org.logoSourceUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'BracketIQ affiliate source setup (+https://bracket-iq.com)',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download logo ${org.logoSourceUrl}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  return { data, contentType };
};

const upsertLogo = async (org: SourceOrganizationDefinition, ownerId: string) => {
  const { data, contentType } = await downloadLogo(org);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: org.logoOriginalName,
    contentType,
    organizationId: org.id,
  });

  await (prisma as any).file.upsert({
    where: { id: org.logoFileId },
    create: {
      id: org.logoFileId,
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: org.logoOriginalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: org.id,
      bucket: stored.bucket ?? null,
      originalName: org.logoOriginalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const resolveCoordinates = async (org: SourceOrganizationDefinition) => {
  if (!org.address) return null;
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: org.id },
    select: { coordinates: true },
  });
  try {
    return await geocodeAddressToCoordinates(org.address) ?? existing?.coordinates ?? null;
  } catch (error) {
    console.warn(`Could not geocode ${org.name}:`, error);
    return existing?.coordinates ?? null;
  }
};

const upsertOrganization = async (org: SourceOrganizationDefinition, ownerId: string) => {
  const existing = await (prisma as any).organizations.findUnique({
    where: { id: org.id },
    select: { sports: true },
  });
  const coordinates = await resolveCoordinates(org);
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...org.sports]));

  await (prisma as any).organizations.upsert({
    where: { id: org.id },
    create: {
      id: org.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: org.name,
      location: org.location,
      address: org.address ?? null,
      description: org.description,
      logoId: org.logoFileId,
      ownerId,
      website: org.website,
      sports,
      status: 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: org.operatesAthleticFacility,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: org.name,
      location: org.location,
      address: org.address ?? null,
      description: org.description,
      logoId: org.logoFileId,
      ownerId,
      website: org.website,
      sports,
      status: 'UNLISTED',
      coordinates,
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
      taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
      operatesAthleticFacility: org.operatesAthleticFacility,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async (source: SourceDefinition) => {
  const mappingId = `${source.id}_mapping_v1`;
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      name: source.name,
      sourceKey: source.sourceKey,
      organizationId: source.orgId,
      baseUrl: source.baseUrl,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: mappingId,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: source.intervalMinutes,
      notes: source.notes,
      metadata: source.metadata,
    },
    update: {
      name: source.name,
      organizationId: source.orgId,
      baseUrl: source.baseUrl,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: mappingId,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: source.intervalMinutes,
      notes: source.notes,
      metadata: source.metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: source.id },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: source.id,
        version: 1,
      },
    },
    create: {
      id: mappingId,
      sourceId: source.id,
      version: 1,
      isActive: true,
      mapping: source.mapping,
      createdByUserId: null,
      notes: `${source.name} mapping created from official public source inspection.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping: source.mapping,
      notes: `${source.name} mapping created from official public source inspection.`,
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: source.id },
    data: { activeMappingId: mappingId },
  });
};

const selectedSourcesFromArgs = () => {
  const requestedKeys = process.argv
    .filter((arg) => arg.startsWith('--source='))
    .flatMap((arg) => arg.slice('--source='.length).split(','))
    .map((key) => key.trim())
    .filter(Boolean);

  if (!requestedKeys.length) return sourceDefinitions;

  const missing = requestedKeys.filter((key) => !sourceByKey.has(key));
  if (missing.length) {
    throw new Error(`Unknown source key(s): ${missing.join(', ')}`);
  }

  return requestedKeys.map((key) => sourceByKey.get(key)!);
};

const logScrapeSummary = (sourceKey: string, result: Awaited<ReturnType<RunAffiliateSourceScrape>>) => {
  const logs = result.run.logs as any;
  console.log(
    `Scrape run ${result.run.id} for ${sourceKey}: ${result.candidates.length} candidate(s) saved `
    + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, `
    + `duplicates ${logs?.duplicateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
  );
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const selectedSources = selectedSourcesFromArgs();
  const selectedOrgIds = new Set(selectedSources.map((source) => source.orgId));
  const selectedOrgs = orgDefinitions.filter((org) => selectedOrgIds.has(org.id));
  const owner = await requireOwner();

  for (const org of selectedOrgs) {
    await upsertLogo(org, owner.id);
    await upsertOrganization(org, owner.id);
    console.log(`Source organization ready: ${org.id}`);
  }

  for (const source of selectedSources) {
    const org = orgById.get(source.orgId);
    if (!org) throw new Error(`Missing organization definition for ${source.orgId}`);
    await upsertSourceAndMapping(source);
    console.log(`Affiliate source ready: ${source.sourceKey}`);
  }

  if (shouldScrape) {
    for (const source of selectedSources) {
      const result = await runAffiliateSourceScrape(source.id);
      logScrapeSummary(source.sourceKey, result);
    }
  } else {
    console.log('Re-run with --scrape to fetch the source pages and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-remaining-p0-affiliate-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
