import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
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
const ORG_ID = 'affiliate_org_eastside_timbers';
const LOGO_FILE_ID = 'affiliate_file_eastside_timbers_logo';
const LOGO_PATH = 'affiliate_org_eastside_timbers-eastside-timbers-logo-upscaled.png';
const BASE_URL = 'https://www.eastsidetimbers.com/';
const PUBLIC_SLUG = 'eastside-timbers';
const ORGANIZER_DESCRIPTION = 'Eastside Timbers is a youth soccer club and program operator serving East Multnomah and Clackamas Counties. The organization runs recreational soccer, competitive programs, camps, training, field rentals, and indoor futsal programs through Oregon Premier Futsal.';

const PLAYMETRICS_RECREATION_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NjMwMTAwOHxyZFZFWWpSbkl6eS8ySHhEdmNuYTZuR0tZM2p4MWFMaFhmRlhhYm5tVUljPQ==&program_id=108422';
const PLAYMETRICS_EDGE_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NjQxMTg0MnxJeVNPcS91VndVOTZMaElLKy85YjM0RUtMVXZveUxybTRMVFd4cmpOYVVrPQ==&program_id=109854';
const PLAYMETRICS_COMPETITIVE_CAMP_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NTk2NTA4NnwxYUt2SmdYNDVDRFc5d0FTbFIwSmVvRkI2ak9sSE5hUnhVeW93KzZEWW5VPQ==&program_id=109041';
const PLAYMETRICS_SOCCER_CAMP_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NjE0MTQ5NHxpMURMd2dqV1ZRTmI1bXFPUFNOK1M2YVBFaXY4aUVMSXRnMEQyUTlSMDZVPQ==&program_id=109254';
const PLAYMETRICS_MULTI_SPORT_CAMP_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NjE0MTQ5NHxpMURMd2dqV1ZRTmI1bXFPUFNOK1M2YVBFaXY4aUVMSXRnMEQyUTlSMDZVPQ==&program_id=109277';
const PLAYMETRICS_TINY_TIMBERS_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NTI4MjYwM3xPUWxkY01CbGNkZFkrOHhWcE9CdERkYzVGa2kwUFRjR2R2aWhlakZsR0o4PQ==&program_id=107820';
const PLAYMETRICS_ETA_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4ODEyMjYwNXxjMWhHWHVxREpFcHorUHN0ZE9LNnRZZlZYc2dDY2ZrOXpxaEVKR0hadE84PQ==&program_id=111894';
const PLAYMETRICS_SYS_URL = 'https://playmetrics.com/signup?clubToken=TG9naW4tQ2x1Yi52MS01MDEtMTc4NDUwMjc0OHxnYXRYWExzVlI4cUk2VVRvL01WcDdqNnNMUnpPeklxeHpIR0p0VGl4dTBzPQ==&program_id=106059';
const HTG_1V1_CAMP_URL = 'https://register.htgsports.net/default.aspx?id=14420';
const OPF_UPPER_HAND_EVENTS_URL = 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events';
const FIELD_RENTAL_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeQcs5mOJpUYCwmvIxJYFf-hazu8voOwT21lKRutqSWgPHJbg/viewform?usp=sharing&ouid=111673949761894432386';

type SourceDefinition = {
  id: string;
  sourceKey: string;
  name: string;
  listUrl: string;
  targetKind: 'EVENT' | 'RENTAL';
  mapping: AffiliateScrapeMapping;
  notes: string;
};

const literalFields = {
  title: { selector: 'body', mode: 'literal' as const, value: 'Manual Eastside source' },
  officialActionUrl: { selector: 'body', mode: 'literal' as const, value: BASE_URL },
};

const baseEventCandidate = {
  organizerName: 'Eastside Timbers',
  sportName: 'Grass Soccer',
  city: 'Portland, OR',
  timeZone: 'America/Los_Angeles',
} as const;

const eastsideComplex = {
  venueName: 'Eastside Timbers Sports Complex',
  address: '4710 SE 174th Ave, Portland, OR 97236',
} as const;

const opfVenue = {
  venueName: 'Oregon Premier Futsal',
  address: '12402 SE Jennifer St, Unit 190, Clackamas, OR 97015',
  city: 'Clackamas, OR',
  sportName: 'Indoor Soccer',
} as const;

const buildMapping = (
  kind: 'EVENT' | 'RENTAL',
  listUrl: string,
  manualCandidates: AffiliateScrapeMapping['manualCandidates'],
): AffiliateScrapeMapping => ({
  kind,
  listUrl,
  itemSelector: 'body',
  fields: literalFields,
  dedupe: {
    fields: ['officialActionUrl', 'title', 'dateDisplayMode'],
  },
  manualCandidates,
});

const sourceDefinitions: SourceDefinition[] = [
  {
    id: 'affiliate_source_eastside_timbers_field_rentals',
    sourceKey: 'eastside-timbers-field-rentals',
    name: 'Eastside Timbers Field Rentals',
    listUrl: `${BASE_URL}fieldrentals`,
    targetKind: 'RENTAL',
    notes: 'Evergreen rental/facility source for Eastside Timbers Sports Complex turf field rentals. The source page links to a Google Forms rental application instead of exposing live availability.',
    mapping: buildMapping('RENTAL', `${BASE_URL}fieldrentals`, [
      {
        listingKind: 'RENTAL',
        title: 'Eastside Timbers Sports Complex Turf Field Rentals',
        officialActionUrl: FIELD_RENTAL_FORM_URL,
        sourceUrl: `${BASE_URL}fieldrentals`,
        organizerName: 'Eastside Timbers',
        sportName: 'Soccer',
        formatLabel: 'Field rental',
        city: 'Portland, OR',
        venueName: 'Eastside Timbers Sports Complex',
        address: '4710 SE 174th Ave, Portland, OR 97236',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Field rental requests are handled through the official Eastside Timbers field rental application.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Request availability',
        statusText: 'Availability is confirmed by Eastside Timbers after submitting the rental application.',
        description: 'Eastside Timbers rents three turf fields at the Eastside Timbers Sports Complex for tournaments, leagues, and trainings. The complex includes lighting, parking, a warm-up area, and on-site portable restrooms. Fields 1 and 2 are listed as 72 feet by 115 feet, Field 3 as 72 feet by 120 feet, and Fields 2 and 3 are also lined for smaller-sided fields.',
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_timbers_recreation',
    sourceKey: 'eastside-timbers-recreation',
    name: 'Eastside Timbers Recreation',
    listUrl: `${BASE_URL}recreation`,
    targetKind: 'EVENT',
    notes: 'Evergreen youth recreational soccer source. The page exposes fall registration details and links to PlayMetrics for signup.',
    mapping: buildMapping('EVENT', `${BASE_URL}recreation`, [
      {
        ...baseEventCandidate,
        title: 'Eastside Timbers Fall Recreational Soccer',
        officialActionUrl: PLAYMETRICS_RECREATION_URL,
        sourceUrl: `${BASE_URL}recreation`,
        formatLabel: 'Youth recreational soccer league',
        venueName: 'Gresham, Happy Valley, Sandy, and Eastside Timbers field locations',
        address: '4710 SE 174th Ave, Portland, OR 97236',
        scheduleText: 'Fall recreational soccer includes weekly training sessions and eight Saturday games. Exact practice and game times are set after registration closes and teams are formed.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Fall 2026 registration',
        ageGroup: 'Pre-K through high school',
        participantOptionsText: 'Youth player registration',
        priceText: 'PreK-2nd Grade / U8 & Under: $130; 3rd Grade-High School / U9 and older: $145. Uniforms are purchased separately.',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Eastside Timbers Recreation is a community-based, non-competitive outdoor soccer program serving East Multnomah and Clackamas Counties. The program offers playing opportunities from Pre-K through high school, with field locations around Gresham, Happy Valley, Sandy, Troutdale, Clackamas, and Portland.',
        divisions: [
          {
            name: 'PreK-2nd Grade / U8 & Under',
            key: 'c_age_u8',
            gender: 'C',
            ratingType: 'AGE',
            divisionTypeId: 'u8',
            priceCents: 13000,
            ageCutoffLabel: 'U8 and under',
            ageCutoffSource: 'Source page registration fee table',
          },
          {
            name: '3rd Grade-High School / U9+',
            key: 'c_age_u9',
            gender: 'C',
            ratingType: 'AGE',
            divisionTypeId: 'u9',
            priceCents: 14500,
            ageCutoffLabel: 'U9 and older',
            ageCutoffSource: 'Source page registration fee table',
          },
        ],
      },
      {
        ...baseEventCandidate,
        title: 'Eastside Tiny Timbers Summer Classes',
        officialActionUrl: PLAYMETRICS_TINY_TIMBERS_URL,
        sourceUrl: `${BASE_URL}tinytimbers`,
        formatLabel: 'Youth soccer class',
        city: 'Gresham, OR',
        venueName: 'East Hill Church',
        address: '701 N Main Ave, Gresham, OR 97030',
        scheduleText: 'Summer classes are listed on Saturdays from June 20 through August 1, with no class July 4. Age groups meet at 10:00-10:45 AM for 2/3 year olds and 11:00-11:45 AM for 4/5 year olds.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Current summer classes',
        ageGroup: 'Ages 2-5',
        participantOptionsText: 'Youth player registration',
        priceText: '$120 with jersey; $100 without a jersey. The class is prorated weekly for late joins.',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Eastside Tiny Timbers introduces young players to soccer through six sessions focused on basic soccer skills, motor skills, balance, coordination, confidence, colors, shapes, and foundational movement concepts.',
        warnings: [
          'The source page lists a summer series that already started on June 20, 2026. Imported as an ongoing class because the page says late joins are prorated weekly.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_timbers_summer_camps',
    sourceKey: 'eastside-timbers-summer-camps',
    name: 'Eastside Timbers Summer Camps',
    listUrl: `${BASE_URL}etcamps`,
    targetKind: 'EVENT',
    notes: 'Manual summary mapping for future-dated Eastside Timbers camp rows on the official camps page. Dedicated The Edge and indoor camp sources avoid duplicate imports.',
    mapping: buildMapping('EVENT', `${BASE_URL}etcamps`, [
      {
        ...baseEventCandidate,
        ...eastsideComplex,
        title: 'Competitive Striker & Goalkeeper Camp',
        officialActionUrl: PLAYMETRICS_COMPETITIVE_CAMP_URL,
        sourceUrl: `${BASE_URL}etcamps`,
        formatLabel: 'Soccer camp',
        startsAt: '2026-08-24T10:00:00-07:00',
        endsAt: '2026-08-26T13:00:00-07:00',
        scheduleText: 'August 24-26, 2026, 10:00 AM-1:00 PM daily.',
        ageGroup: 'Ages 8-14',
        participantOptionsText: 'Player registration',
        priceText: '$180',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Three days dedicated to strikers and goalkeepers, with sessions built around real game situations for finishing, goalkeeping, and role-specific development. Eastside Timbers describes the camp as open to all competitive players regardless of club affiliation.',
      },
      {
        ...baseEventCandidate,
        ...eastsideComplex,
        title: '1V1 Formula Camp',
        officialActionUrl: HTG_1V1_CAMP_URL,
        sourceUrl: `${BASE_URL}etcamps`,
        formatLabel: 'Soccer camp',
        startsAt: '2026-08-11T10:00:00-07:00',
        endsAt: '2026-08-12T12:00:00-07:00',
        scheduleText: 'Tuesday and Wednesday, August 11-12, 2026, 10:00 AM-12:00 PM.',
        ageGroup: 'U8-U14',
        participantOptionsText: 'Player registration',
        priceText: '$130',
        statusText: 'Registration is handled through the official HTG Sports registration link.',
        description: 'The 1V1 Formula camp is a fast-moving soccer training camp focused on constant 1v1 efforts to goal, coordination, agility, body control, changing direction, time and space, opponents, balance, and goal-scoring techniques at speed.',
      },
      {
        ...baseEventCandidate,
        title: 'Soccer Camp at Happy Valley Park',
        officialActionUrl: PLAYMETRICS_SOCCER_CAMP_URL,
        sourceUrl: `${BASE_URL}etcamps`,
        formatLabel: 'Soccer camp',
        city: 'Happy Valley, OR',
        venueName: 'Happy Valley Park',
        address: 'Happy Valley Park, Happy Valley, OR',
        startsAt: '2026-07-13T10:00:00-07:00',
        endsAt: '2026-07-16T13:00:00-07:00',
        scheduleText: 'July 13-16, 2026, 10:00 AM-1:00 PM.',
        ageGroup: 'Ages 8-14',
        participantOptionsText: 'Player registration',
        priceText: '$180',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Four mornings of soccer skill challenges, shooting games, mini tournaments, and fast-paced small-sided matches designed to maximize touches, confidence, and fun.',
      },
      {
        ...baseEventCandidate,
        sportName: 'Other',
        title: 'Fun Multi-Sport Camp at Happy Valley Park',
        officialActionUrl: PLAYMETRICS_MULTI_SPORT_CAMP_URL,
        sourceUrl: `${BASE_URL}etcamps`,
        formatLabel: 'Multi-sport camp',
        city: 'Happy Valley, OR',
        venueName: 'Happy Valley Park',
        address: 'Happy Valley Park, Happy Valley, OR',
        startsAt: '2026-08-03T09:00:00-07:00',
        endsAt: '2026-08-06T13:00:00-07:00',
        scheduleText: 'August 3-6, 2026, 9:00 AM-1:00 PM daily.',
        ageGroup: 'Ages 6-12',
        participantOptionsText: 'Player registration',
        priceText: '$240',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Four mornings of tag games, relays, races, team challenges, and friendly competition for kids grouped by age. Eastside Timbers describes the camp as open to all skill levels with no sport specialty required.',
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_timbers_edge',
    sourceKey: 'eastside-timbers-edge',
    name: 'Eastside Timbers The Edge',
    listUrl: `${BASE_URL}edge`,
    targetKind: 'EVENT',
    notes: 'Dedicated source for The EDGE Summer Turf Series so it is not duplicated from the broader camps page.',
    mapping: buildMapping('EVENT', `${BASE_URL}edge`, [
      {
        ...baseEventCandidate,
        ...eastsideComplex,
        title: 'The EDGE: Summer Turf Series',
        officialActionUrl: PLAYMETRICS_EDGE_URL,
        sourceUrl: `${BASE_URL}edge`,
        formatLabel: 'Soccer training block',
        startsAt: '2026-08-04T17:00:00-07:00',
        endsAt: '2026-08-25T18:15:00-07:00',
        scheduleText: 'Tuesdays, August 4-25, 2026, 5:00-6:15 PM.',
        ageGroup: 'Ages 8-14',
        participantOptionsText: 'Player registration',
        priceText: '$80',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'The EDGE Summer Turf Series is a four-session soccer training block for players who want extra touches, more repetitions, and a competitive environment before the fall season. Sessions focus on small-sided games, game-realistic activities, decision-making, confidence, creativity, soccer IQ, dribbling, passing, shooting, and attacking play.',
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_opf_indoor_camps',
    sourceKey: 'eastside-opf-indoor-camps',
    name: 'Eastside Indoor Camps at OPF',
    listUrl: `${BASE_URL}indoorcamps`,
    targetKind: 'EVENT',
    notes: 'Dated indoor camp source for Oregon Premier Futsal all-sports and crafts camps. Upper Hand links are used as the action URLs.',
    mapping: buildMapping('EVENT', `${BASE_URL}indoorcamps`, [
      {
        ...baseEventCandidate,
        ...opfVenue,
        sportName: 'Other',
        title: 'All-Sports & Crafts Camp: Ages 5-8',
        officialActionUrl: 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events/196365-summer-all-sports-and-crafts-camp-ages-5-8',
        sourceUrl: `${BASE_URL}indoorcamps`,
        formatLabel: 'Multi-sport camp',
        startsAt: '2026-07-06T09:00:00-07:00',
        endsAt: '2026-07-10T12:00:00-07:00',
        scheduleText: 'July 6-10, 2026, 9:00 AM-12:00 PM daily.',
        ageGroup: 'Ages 5-8',
        participantOptionsText: 'Player registration',
        priceText: '$100',
        statusText: 'Registration is handled on Upper Hand.',
        description: 'Five mornings of sports, games, and creative crafts at Oregon Premier Futsal, including soccer, basketball, kickball, relay races, team challenges, ping pong, and craft projects. The listed price includes snack and craft supplies.',
      },
      {
        ...baseEventCandidate,
        ...opfVenue,
        sportName: 'Other',
        title: 'All-Sports & Crafts Camp: Ages 9-12 Session 1',
        officialActionUrl: 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events/196375-summer-all-sports-and-crafts-camp-ages-9-12',
        sourceUrl: `${BASE_URL}indoorcamps`,
        formatLabel: 'Multi-sport camp',
        startsAt: '2026-07-13T09:00:00-07:00',
        endsAt: '2026-07-17T12:00:00-07:00',
        scheduleText: 'July 13-17, 2026, 9:00 AM-12:00 PM daily.',
        ageGroup: 'Ages 9-12',
        participantOptionsText: 'Player registration',
        priceText: '$100',
        statusText: 'Registration is handled on Upper Hand.',
        description: 'Five mornings of sports, games, and creative crafts at Oregon Premier Futsal, including soccer, basketball, kickball, relay races, team challenges, ping pong, and craft projects. The listed price includes snack and craft supplies.',
      },
      {
        ...baseEventCandidate,
        ...opfVenue,
        sportName: 'Other',
        title: 'All-Sports & Crafts Camp: Ages 9-12 Session 2',
        officialActionUrl: 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events/196384-summer-all-sports-and-crafts-camp-ages-9-12',
        sourceUrl: `${BASE_URL}indoorcamps`,
        formatLabel: 'Multi-sport camp',
        startsAt: '2026-07-27T09:00:00-07:00',
        endsAt: '2026-07-31T12:00:00-07:00',
        scheduleText: 'July 27-31, 2026, 9:00 AM-12:00 PM daily.',
        ageGroup: 'Ages 9-12',
        participantOptionsText: 'Player registration',
        priceText: '$100',
        statusText: 'Registration is handled on Upper Hand.',
        description: 'Five mornings of sports, games, and creative crafts at Oregon Premier Futsal, including soccer, basketball, kickball, relay races, team challenges, ping pong, and craft projects. The listed price includes snack and craft supplies.',
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_opf_programs',
    sourceKey: 'eastside-opf-programs',
    name: 'Oregon Premier Futsal Programs',
    listUrl: `${BASE_URL}opfprograms`,
    targetKind: 'EVENT',
    notes: 'OPF futsal program source. Future session rows use source dates; open-play rows use ongoing/no-fixed-date display.',
    mapping: buildMapping('EVENT', `${BASE_URL}opfprograms`, [
      {
        ...baseEventCandidate,
        ...opfVenue,
        title: 'Eastside Technical Academy at Oregon Premier Futsal',
        officialActionUrl: PLAYMETRICS_ETA_URL,
        sourceUrl: `${BASE_URL}opfprograms`,
        formatLabel: 'Weekly soccer training',
        startsAt: '2026-07-13T18:00:00-07:00',
        endsAt: '2026-09-28T19:00:00-07:00',
        scheduleText: 'Mondays, July 13-September 28, 2026, 6:00-7:00 PM. No class July 20 or September 7.',
        ageGroup: 'Ages 8-18 (U8 through high school)',
        maxParticipantsText: '12 players',
        participantOptionsText: 'Player registration',
        priceText: '$150 for 10 lessons',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Eastside Technical Academy is a weekly indoor training session at Oregon Premier Futsal focused on individual technical work, foot skills, first touch, ball striking technique, speed training, technical development, game intelligence, and confidence.',
      },
      {
        ...baseEventCandidate,
        ...opfVenue,
        title: 'Sharpen Your Skills Indoor Technical Training',
        officialActionUrl: PLAYMETRICS_SYS_URL,
        sourceUrl: `${BASE_URL}opfprograms`,
        formatLabel: 'Weekly soccer class',
        startsAt: '2026-07-13T17:00:00-07:00',
        endsAt: '2026-09-28T18:00:00-07:00',
        scheduleText: 'Mondays, July 13-September 28, 2026, 5:00-6:00 PM. No class July 20 or September 7.',
        ageGroup: 'Ages 6-12',
        participantOptionsText: 'Player registration',
        priceText: '$140',
        statusText: 'Registration is handled on PlayMetrics.',
        description: 'Sharpen Your Skills classes combine futsal with foundational soccer skills through small groups, game-based high-energy sessions, progressive skill building, dribbling, passing, finishing, and extra touches on the ball.',
      },
      {
        ...baseEventCandidate,
        ...opfVenue,
        title: 'Drop In & Play Futsal: Ages 8-16',
        officialActionUrl: OPF_UPPER_HAND_EVENTS_URL,
        sourceUrl: `${BASE_URL}opfprograms`,
        formatLabel: 'Open play futsal',
        scheduleText: 'Fridays, 6:00-9:00 PM.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Friday open play',
        ageGroup: 'Ages 8-16',
        maxParticipantsText: '40 players',
        participantOptionsText: 'Player registration',
        priceText: '$12 per player',
        statusText: 'Register online to secure a spot. Walk-ins may be turned away if full.',
        description: 'A relaxed futsal open play night for ages 8-16 at Oregon Premier Futsal. Eastside Timbers describes it as a creativity-first session where players can try new things, play with friends, and move freely on the court.',
      },
      {
        ...baseEventCandidate,
        ...opfVenue,
        title: 'Adult Drop In & Play Futsal',
        officialActionUrl: OPF_UPPER_HAND_EVENTS_URL,
        sourceUrl: `${BASE_URL}opfprograms`,
        formatLabel: 'Adult open play futsal',
        scheduleText: 'Monday nights, 7:30-9:00 PM.',
        dateDisplayMode: 'ONGOING',
        dateDisplayText: 'Monday adult open play',
        ageGroup: 'Adults 18+',
        participantOptionsText: 'Player registration',
        priceText: '$10 per person',
        statusText: 'Check the official OPF registration page for current availability.',
        description: 'Adult open play futsal at Oregon Premier Futsal for players who want touches, pickup-style play, and a game without committing to a league. The source page says all skill levels are welcome.',
      },
    ]),
  },
  {
    id: 'affiliate_source_eastside_opf_community_programs',
    sourceKey: 'eastside-opf-community-programs',
    name: 'Oregon Premier Futsal Community Programs',
    listUrl: `${BASE_URL}opfcommunity`,
    targetKind: 'EVENT',
    notes: 'Community program source for OPF. Past World Cup watch parties are intentionally not imported.',
    mapping: buildMapping('EVENT', `${BASE_URL}opfcommunity`, [
      {
        ...opfVenue,
        organizerName: 'Eastside Timbers',
        sportName: 'Other',
        title: 'Qi-Gong Classes at Oregon Premier Futsal',
        officialActionUrl: 'https://app.upperhand.io/customers/2207-eastside-timbers-dba-oregon-premier-futsal/events/196283-qi-gong',
        sourceUrl: `${BASE_URL}opfcommunity`,
        formatLabel: 'Fitness class',
        startsAt: '2026-08-11T09:00:00-07:00',
        endsAt: '2026-09-29T09:45:00-07:00',
        scheduleText: 'Tuesdays and Thursdays, 9:00-9:45 AM, August 11-September 29, 2026.',
        ageGroup: 'Adults of all ages',
        participantOptionsText: 'Class registration',
        priceText: 'Drop-in: $28 per class; Monthly: $200 for 8 classes',
        statusText: 'Registration is handled on Upper Hand.',
        description: 'Qi-Gong classes at Oregon Premier Futsal are described as a gentle mind-body practice combining movement, breath control, and focused intention for balance, flexibility, coordination, stress reduction, mindfulness, and low-impact movement.',
      },
    ]),
  },
];

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
  const logoAbsolutePath = path.join(process.cwd(), 'uploads', LOGO_PATH);
  const data = await fs.readFile(logoAbsolutePath);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: 'eastside-timbers-logo-upscaled.png',
    contentType: 'image/png',
    organizationId: ORG_ID,
  });
  return (prisma as any).file.upsert({
    where: { id: LOGO_FILE_ID },
    create: {
      id: LOGO_FILE_ID,
      uploaderId: ownerId,
      organizationId: ORG_ID,
      bucket: stored.bucket ?? null,
      originalName: 'eastside-timbers-logo-upscaled.png',
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
      originalName: 'eastside-timbers-logo-upscaled.png',
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string) => {
  const coordinates = await geocodeAddressToCoordinates('4710 SE 174th Ave, Portland, OR 97236')
    ?? [-122.4839, 45.4887];
  await (prisma as any).organizations.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'Eastside Timbers',
      location: 'Portland, OR',
      address: '4710 SE 174th Ave, Portland, OR 97236',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer', 'Indoor Soccer', 'Other'],
      status: 'LISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicWidgetsEnabled: false,
      publicHeadline: 'Eastside Timbers programs',
      publicIntroText: 'Find Eastside Timbers recreation, camps, training, field rentals, and indoor soccer opportunities.',
      taxOrganizationType: 'NONPROFIT_ORGANIZATION',
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: 'Eastside Timbers',
      location: 'Portland, OR',
      address: '4710 SE 174th Ave, Portland, OR 97236',
      description: ORGANIZER_DESCRIPTION,
      logoId: LOGO_FILE_ID,
      ownerId,
      website: BASE_URL,
      sports: ['Grass Soccer', 'Indoor Soccer', 'Other'],
      status: 'LISTED',
      publicSlug: PUBLIC_SLUG,
      publicPageEnabled: true,
      publicHeadline: 'Eastside Timbers programs',
      publicIntroText: 'Find Eastside Timbers recreation, camps, training, field rentals, and indoor soccer opportunities.',
      coordinates,
      operatesAthleticFacility: true,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async (source: SourceDefinition) => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      name: source.name,
      sourceKey: source.sourceKey,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: `${source.id}_mapping_v1`,
      notes: source.notes,
      metadata: {
        inspectedAt: '2026-07-08',
        platform: 'SportsEngine',
        logoSourceUrl: 'https://cdn4.sportngin.com/attachments/logo_graphic/ed6b-217372808/logo_small.png',
        sourcePages: [
          `${BASE_URL}programs`,
          `${BASE_URL}tryouts`,
          `${BASE_URL}recreation`,
          `${BASE_URL}etcamps`,
          `${BASE_URL}edge`,
          `${BASE_URL}tinytimbers`,
          `${BASE_URL}indoorcamps`,
          `${BASE_URL}opfprograms`,
          `${BASE_URL}opfcommunity`,
          `${BASE_URL}fieldrentals`,
        ],
        skippedRows: [
          {
            title: 'Eastside Timbers Supplemental Tryouts',
            url: `${BASE_URL}tryouts`,
            reason: 'Supplemental tryout dates are May 19-20, 2026, which are past as of 2026-07-08. Tryouts should not become evergreen events.',
          },
        ],
      },
    },
    update: {
      name: source.name,
      organizationId: ORG_ID,
      baseUrl: BASE_URL,
      listUrl: source.listUrl,
      targetKind: source.targetKind,
      status: 'ACTIVE',
      activeMappingId: `${source.id}_mapping_v1`,
      notes: source.notes,
      metadata: {
        inspectedAt: '2026-07-08',
        platform: 'SportsEngine',
        logoSourceUrl: 'https://cdn4.sportngin.com/attachments/logo_graphic/ed6b-217372808/logo_small.png',
        sourcePages: [
          `${BASE_URL}programs`,
          `${BASE_URL}tryouts`,
          `${BASE_URL}recreation`,
          `${BASE_URL}etcamps`,
          `${BASE_URL}edge`,
          `${BASE_URL}tinytimbers`,
          `${BASE_URL}indoorcamps`,
          `${BASE_URL}opfprograms`,
          `${BASE_URL}opfcommunity`,
          `${BASE_URL}fieldrentals`,
        ],
        skippedRows: [
          {
            title: 'Eastside Timbers Supplemental Tryouts',
            url: `${BASE_URL}tryouts`,
            reason: 'Supplemental tryout dates are May 19-20, 2026, which are past as of 2026-07-08. Tryouts should not become evergreen events.',
          },
        ],
      },
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
      id: `${source.id}_mapping_v1`,
      sourceId: source.id,
      version: 1,
      isActive: true,
      mapping: source.mapping,
      createdByUserId: null,
      notes: `${source.name} manual summary mapping created from official Eastside Timbers page inspection.`,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping: source.mapping,
      notes: `${source.name} manual summary mapping created from official Eastside Timbers page inspection.`,
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: source.id },
    data: { activeMappingId: `${source.id}_mapping_v1` },
  });
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  await upsertLogo(owner.id);
  await upsertOrganization(owner.id);

  for (const source of sourceDefinitions) {
    await upsertSourceAndMapping(source);
    console.log(`Eastside affiliate source ready: ${source.sourceKey}`);
  }

  if (shouldScrape) {
    for (const source of sourceDefinitions) {
      const result = await runAffiliateSourceScrape(source.id);
      console.log(`Scrape run ${result.run.id} for ${source.sourceKey}: ${result.candidates.length} candidate(s) saved.`);
    }
  } else {
    console.log('Re-run with --scrape to fetch the source pages and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-eastside-timbers-affiliate-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
