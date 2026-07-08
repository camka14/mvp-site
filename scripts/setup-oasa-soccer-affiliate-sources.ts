import dotenv from 'dotenv';
import type { AffiliateScrapeMapping } from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type RunAffiliateSourceScrape = typeof import('../src/server/affiliateImports/service').runAffiliateSourceScrape;
type GeocodeAddressToCoordinates = typeof import('../src/server/geocoding').geocodeAddressToCoordinates;

type ListingKind = 'EVENT' | 'TEAM';

type SourceDefinition = {
  id: string;
  sourceKey: string;
  name: string;
  baseUrl: string;
  listUrl: string;
  targetKind: ListingKind;
  organizationId: string;
  scrapeIntervalMinutes: number;
  notes: string;
  metadata: Record<string, unknown>;
  mappingId: string;
  mappingVersion: number;
  mappingNotes: string;
  mapping: AffiliateScrapeMapping;
};

type SourceOrganizationDefinition = {
  id: string;
  name: string;
  location: string;
  address: string | null;
  description: string;
  website: string;
  sports: string[];
  taxOrganizationType: string;
  operatesAthleticFacility: boolean;
  publicSlug?: string;
  publicHeadline?: string;
  publicIntroText?: string;
  logo?: {
    id: string;
    url: string;
    originalName: string;
    contentType?: string;
  };
};

let prisma: PrismaClientInstance;
let runAffiliateSourceScrape: RunAffiliateSourceScrape;
let geocodeAddressToCoordinates: GeocodeAddressToCoordinates;

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  ({ runAffiliateSourceScrape } = await import('../src/server/affiliateImports/service'));
  ({ geocodeAddressToCoordinates } = await import('../src/server/geocoding'));
};

const OWNER_EMAIL = 'samuel.r@razumly.com';

const PORTLAND_COED_HOME_URL = 'https://portlandcoedsoccer.com/';
const PORTLAND_COED_FORMS_URL = 'https://portlandcoedsoccer.com/sample-page/';
const PORTLAND_COED_REGISTRATION_PDF_URL = 'https://portlandcoedsoccer.com/wp-content/uploads/2026/02/2026-Co-ed-Registration.pdf';
const PORTLAND_COED_RULES_URL = 'https://portlandcoedsoccer.com/rules-requirements/';
const TIMBERS_ARMY_FC_URL = 'https://107ist.org/107ist/community/timbers-army-fc';
const TIMBERS_ARMY_FC_JOIN_URL = 'https://107ist.org/107ist/community/timbers-army-fc/why-join-timbers-army-fc';
const LAKE_OSWEGO_SOCCER_URL = 'https://www.ci.oswego.or.us/parksrec/coed-soccer-spring-summer-fall-leagues';
const LAKE_OSWEGO_SOCCER_GUIDE_URL = 'https://www.ci.oswego.or.us/sites/default/files/fileattachments/SP26_Adult%20Soccer%20Online%20Quick%20Guide_1.pdf';
const LAKE_OSWEGO_ACTIVITY_SEARCH_URL = 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search?onlineSiteId=0&locale=en-US&activity_select_param=2&activity_keyword=adult%20soccer&viewMode=list';
const LAKE_OSWEGO_SUMMER_MIXED_18_URL = 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26643?onlineSiteId=0&locale=en-US&from_original_cui=true';
const LAKE_OSWEGO_FALL_MIXED_18_URL = 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26790?onlineSiteId=0&locale=en-US&from_original_cui=true';
const LAKE_OSWEGO_FALL_MIXED_35_URL = 'https://anc.apm.activecommunities.com/lakeoswegoparks/activity/search/detail/26791?onlineSiteId=0&locale=en-US&from_original_cui=true';
const METRO_PDX_URL = 'https://metropdxsoccer.com/';
const METRO_PDX_REGISTRATION_URL = 'https://metropdxsoccer.com/#registration';

const literalFields = (title: string, officialActionUrl: string) => ({
  title: { selector: 'body', mode: 'literal' as const, value: title },
  officialActionUrl: { selector: 'body', mode: 'literal' as const, value: officialActionUrl },
});

const buildMapping = (
  kind: ListingKind,
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

const adultCoedDivision = (
  name: string,
  key: string,
  divisionTypeId: string,
  ageCutoffLabel: string,
  ageCutoffSource: string,
  maxParticipants?: number,
) => ({
  name,
  key,
  gender: 'C' as const,
  ratingType: 'AGE' as const,
  divisionTypeId,
  maxParticipants,
  ageCutoffLabel,
  ageCutoffSource,
});

const metroDivision = (name: string, key: string, gender: 'M' | 'F' | 'C') => ({
  name,
  key,
  gender,
  ratingType: 'AGE' as const,
  divisionTypeId: '18plus',
  ageCutoffLabel: 'Adult; valid OASA player card required',
  ageCutoffSource: 'Metro PDX public winter league page',
});

const sourceOrganizations: SourceOrganizationDefinition[] = [
  {
    id: 'affiliate_org_portland_coed_soccer',
    name: 'Portland Co-ed Soccer',
    location: 'Clackamas, OR',
    address: '10117 SE Sunnyside Road, Suite F309, Clackamas, OR 97015',
    description: 'Portland Co-ed Soccer runs a long-standing adult outdoor coed soccer league in the Portland metro area, with Monday-night play, OASA player-card requirements, annual team registration, schedules, rules, fields, and new-player/free-agent forms.',
    website: PORTLAND_COED_HOME_URL,
    sports: ['Grass Soccer'],
    taxOrganizationType: 'NONPROFIT_ORGANIZATION',
    operatesAthleticFacility: false,
    logo: {
      id: 'affiliate_file_portland_coed_soccer_logo',
      url: 'https://portlandcoedsoccer.com/wp-content/uploads/2019/05/Portland-Coed-Logo.jpg',
      originalName: 'portland-coed-soccer-logo.jpg',
      contentType: 'image/jpeg',
    },
  },
  {
    id: 'affiliate_org_timbers_army_fc',
    name: 'Timbers Army FC',
    location: 'Portland, OR',
    address: 'Portland, OR',
    description: 'Timbers Army FC is a 107IST community soccer network for Timbers Army, Riveters, and 107IST members. It supports team managers and players across non-aggressive 7v7, outdoor, indoor, and futsal leagues in the Portland metro area.',
    website: TIMBERS_ARMY_FC_URL,
    sports: ['Grass Soccer', 'Indoor Soccer'],
    taxOrganizationType: 'NONPROFIT_ORGANIZATION',
    operatesAthleticFacility: false,
    publicSlug: 'timbers-army-fc',
    publicHeadline: 'Timbers Army FC community teams',
    publicIntroText: 'Find Timbers Army FC team information, league participation details, and official community links.',
    logo: {
      id: 'affiliate_file_timbers_army_fc_logo',
      url: 'https://107ist.org/resources/Pictures/TA%20Crests%20Black%20Border%20Tight%20Crop.png',
      originalName: 'timbers-army-fc-crest.png',
      contentType: 'image/png',
    },
  },
  {
    id: 'affiliate_org_metro_pdx_soccer',
    name: 'Metro PDX Soccer',
    location: 'Milwaukie, OR',
    address: '11999 SE Fuller Road, Milwaukie, OR 97222',
    description: 'Metro PDX Soccer describes a winter 7v7 outdoor soccer league in the Portland metro area with men, women, and coed divisions, team registration, OASA player-card requirements, and games at La Salle Catholic College Preparatory.',
    website: METRO_PDX_URL,
    sports: ['Grass Soccer'],
    taxOrganizationType: 'INDIVIDUAL_OR_CLUB',
    operatesAthleticFacility: false,
    logo: {
      id: 'affiliate_file_metro_pdx_soccer_logo',
      url: 'https://metropdxsoccer.com/img/logo.jpg',
      originalName: 'metro-pdx-soccer-logo.jpg',
      contentType: 'image/jpeg',
    },
  },
  {
    id: 'affiliate_org_lake_oswego_parks_recreation',
    name: 'Lake Oswego Parks & Recreation',
    location: 'Lake Oswego, OR',
    address: '17525 Stafford Rd, Lake Oswego, OR 97034',
    description: 'Lake Oswego Parks & Recreation operates city recreation programs, adult sports leagues, drop-in sports, park facilities, and registration through the City of Lake Oswego and LOPR/ActiveCommunities systems.',
    website: 'https://www.ci.oswego.or.us/parksrec',
    sports: ['Basketball', 'Softball', 'Grass Soccer'],
    taxOrganizationType: 'GOVERNMENT_ENTITY',
    operatesAthleticFacility: true,
    logo: {
      id: 'affiliate_file_lake_oswego_parks_recreation_logo',
      url: 'https://www.ci.oswego.or.us/sites/default/files/LOPR-Logo-Color-RGB.png',
      originalName: 'lake-oswego-parks-rec-logo.png',
      contentType: 'image/png',
    },
  },
];

const sourceDefinitions: SourceDefinition[] = [
  {
    id: 'affiliate_source_portland_coed_soccer_league',
    sourceKey: 'portland-coed-soccer-league',
    name: 'Portland Co-ed Soccer League',
    baseUrl: PORTLAND_COED_HOME_URL,
    listUrl: PORTLAND_COED_HOME_URL,
    targetKind: 'EVENT',
    organizationId: 'affiliate_org_portland_coed_soccer',
    scrapeIntervalMinutes: 43200,
    notes: 'Manual evergreen source. Portland Co-ed publishes annual registration PDFs, rules, schedules, and posts rather than repeated future event cards; the current 2026 season is already underway, so the mapping emits one annual league candidate.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      formsUrl: PORTLAND_COED_FORMS_URL,
      registrationPdfUrl: PORTLAND_COED_REGISTRATION_PDF_URL,
      rulesUrl: PORTLAND_COED_RULES_URL,
      logoSourceUrl: 'https://portlandcoedsoccer.com/wp-content/uploads/2019/05/Portland-Coed-Logo.jpg',
    },
    mappingId: 'affiliate_mapping_portland_coed_soccer_league_v1',
    mappingVersion: 1,
    mappingNotes: 'Manual evergreen mapping for Portland Co-ed annual adult outdoor soccer registration with source-derived 2026 team fees, 23+ age rule, and current waitlist status.',
    mapping: buildMapping('EVENT', PORTLAND_COED_HOME_URL, 'Portland Co-ed Soccer League', PORTLAND_COED_FORMS_URL, [
      {
        title: 'Portland Co-ed Soccer League',
        officialActionUrl: PORTLAND_COED_FORMS_URL,
        sourceUrl: PORTLAND_COED_HOME_URL,
        organizerName: 'Portland Co-ed Soccer',
        sportName: 'Grass Soccer',
        formatLabel: 'Adult coed outdoor soccer league',
        city: 'Portland metro, OR',
        venueName: 'Portland metro fields',
        address: 'Portland, OR',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'Annual Monday-night outdoor season. The 2026 registration form describes a 10-game season starting May 4, 2026, with no games on Memorial Day and final games expected July 27 or August 3 depending on field availability.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Annual Monday-night season; 2026 season underway',
        ageGroup: 'Adult 23+',
        participantOptionsText: 'Team registration, with new-player and free-agent forms available on the official site.',
        priceText: '$700 - $1,515 per team; $100 deposit; additional $250 bond may apply.',
        statusText: 'The 2026 registration form says teams are on the waitlist. Confirm current registration on the official Forms and Documents page.',
        registrationDeadlineText: '2026 deposit postmark deadline was March 2; balance and registration form were due March 22.',
        description: 'Portland Co-ed Soccer is an adult coed outdoor soccer league in the Portland metro area. The official 2026 registration form describes a Monday-night 10-game season, OASA player-card requirements, a full team roster requirement, team fees based on returning/new team status and whether a team supplies its own field, and a current waitlist for teams. The official rules page says players must be 23 years of age or older before the game they participate in.',
        divisions: [
          adultCoedDivision(
            'Coed 23+',
            'c_age_23plus',
            '23plus',
            'Adult 23+',
            'Portland Co-ed Soccer 2026 rules page',
          ),
        ],
        warnings: [
          'Stored as an evergreen/manual annual league listing because the current 2026 season already started and the source does not expose future per-game registration cards.',
          'Team fee details come from the 2026 registration PDF: new/returning team and own-field pricing varies from $700 to $1,515, with a $100 deposit and possible $250 bond.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_lake_oswego_adult_soccer',
    sourceKey: 'lake-oswego-adult-soccer',
    name: 'Lake Oswego Adult Soccer',
    baseUrl: 'https://www.ci.oswego.or.us/parksrec',
    listUrl: LAKE_OSWEGO_SOCCER_URL,
    targetKind: 'EVENT',
    organizationId: 'affiliate_org_lake_oswego_parks_recreation',
    scrapeIntervalMinutes: 10080,
    notes: 'Manual source for the City of Lake Oswego adult soccer page. The city page exposes current 2026 summer/fall rows and official ActiveCommunities detail links; prices were not public on the city page or quick guide at inspection time.',
    metadata: {
      inspectedAt: '2026-07-06',
      platform: 'City of Lake Oswego page with ActiveCommunities registration links',
      quickGuideUrl: LAKE_OSWEGO_SOCCER_GUIDE_URL,
      activitySearchUrl: LAKE_OSWEGO_ACTIVITY_SEARCH_URL,
      hazeliaFieldAddressSource: 'https://www.ci.oswego.or.us/parksrec/hazelia-field-luscher-farm',
      eastWalugaAddressSource: 'https://www.ci.oswego.or.us/parksrec/waluga-park-east',
      logoSourceUrl: 'https://www.ci.oswego.or.us/sites/default/files/LOPR-Logo-Color-RGB.png',
    },
    mappingId: 'affiliate_mapping_lake_oswego_adult_soccer_v1',
    mappingVersion: 1,
    mappingNotes: 'Manual mapping for Lake Oswego 2026 adult soccer rows with official ActiveCommunities links, season dates, venues, age divisions, and roster caps from the city quick guide.',
    mapping: buildMapping('EVENT', LAKE_OSWEGO_SOCCER_URL, 'Lake Oswego Adult Soccer', LAKE_OSWEGO_ACTIVITY_SEARCH_URL, [
      {
        title: 'Lake Oswego Summer Mixed 18+ Adult Soccer League',
        officialActionUrl: LAKE_OSWEGO_SUMMER_MIXED_18_URL,
        sourceUrl: LAKE_OSWEGO_SOCCER_URL,
        organizerName: 'Lake Oswego Parks & Recreation',
        sportName: 'Grass Soccer',
        formatLabel: 'Adult soccer league',
        city: 'Lake Oswego, OR',
        venueName: 'Hazelia Field at Luscher Farm',
        address: '17800 Stafford Rd, Lake Oswego, OR 97034',
        startsAt: '2026-07-12T16:00:00-07:00',
        endsAt: '2026-08-30T22:00:00-07:00',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'July 12-August 30, 2026. Six games per team on Sundays from 4-10 PM at Hazelia Field, with officials provided.',
        ageGroup: 'Adult 18+',
        participantOptionsText: 'Team registration flow: managers create a team in an LOPR account; players complete their own payment through LOparks.org using the team name and password.',
        statusText: 'Source says team/player registration is open; team manager registration deadline was June 24. Confirm current player registration on the official ActiveCommunities page.',
        description: 'Lake Oswego Parks & Recreation lists a Summer 2026 Mixed 18+ 7v7 adult soccer league affiliated with OASA. The city page says teams play six Sunday games at Hazelia Field, officials are provided, players must be at least 18 and not currently enrolled in high school, and managers create teams before players complete the team-linked payment flow.',
        divisions: [
          adultCoedDivision(
            'Mixed 18+ (7v7)',
            'c_age_18plus_7v7',
            '18plus',
            'Adult 18+',
            'City of Lake Oswego adult soccer page and quick guide',
            25,
          ),
        ],
        warnings: [
          'No public price was found on the city page or quick guide during inspection; leave price unspecified until the official detail page exposes it clearly.',
          'The team registration deadline has passed, but the source still labels team/player registration open.',
        ],
      },
      {
        title: 'Lake Oswego Fall Mixed 18+ Adult Soccer League',
        officialActionUrl: LAKE_OSWEGO_FALL_MIXED_18_URL,
        sourceUrl: LAKE_OSWEGO_SOCCER_URL,
        organizerName: 'Lake Oswego Parks & Recreation',
        sportName: 'Grass Soccer',
        formatLabel: 'Adult soccer league',
        city: 'Lake Oswego, OR',
        venueName: 'Waluga Park - East',
        address: '15505 Quarry Rd, Lake Oswego, OR 97035',
        startsAt: '2026-09-20T14:00:00-07:00',
        endsAt: '2026-11-22T22:00:00-08:00',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'September 20-November 22, 2026. Eight games per team on Sundays from 2-10 PM, with officials provided.',
        dateDisplayText: 'Fall registration opens August 1, 2026',
        ageGroup: 'Adult 18+',
        participantOptionsText: 'Team registration flow: managers create a team in an LOPR account; players complete their own payment through LOparks.org using the team name and password.',
        statusText: 'Team/player registration opens August 1, 2026 on the official Lake Oswego Parks & Recreation registration system.',
        registrationDeadlineText: 'Team registration closes Wednesday, September 2, 2026.',
        description: 'Lake Oswego Parks & Recreation lists a Fall 2026 Mixed 18+ 7v7 adult soccer league affiliated with OASA. The city page says the fall season runs Sundays from September 20 through November 22, team managers choose a recreational or competitive level when creating a team, players complete their own payment through the team setup, and all players must be at least 18 and not currently enrolled in high school.',
        divisions: [
          adultCoedDivision(
            'Mixed 18+ (7v7)',
            'c_age_18plus_7v7',
            '18plus',
            'Adult 18+',
            'City of Lake Oswego adult soccer page and quick guide',
            25,
          ),
        ],
        warnings: [
          'No public price was found on the city page or quick guide during inspection; leave price unspecified until the official detail page exposes it clearly.',
        ],
      },
      {
        title: 'Lake Oswego Fall Mixed 35+ Adult Soccer League',
        officialActionUrl: LAKE_OSWEGO_FALL_MIXED_35_URL,
        sourceUrl: LAKE_OSWEGO_SOCCER_URL,
        organizerName: 'Lake Oswego Parks & Recreation',
        sportName: 'Grass Soccer',
        formatLabel: 'Adult soccer league',
        city: 'Lake Oswego, OR',
        venueName: 'Hazelia Field at Luscher Farm',
        address: '17800 Stafford Rd, Lake Oswego, OR 97034',
        startsAt: '2026-09-20T14:00:00-07:00',
        endsAt: '2026-11-22T22:00:00-08:00',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'September 20-November 22, 2026. Eight games per team on Sundays from 2-10 PM, with officials provided.',
        dateDisplayText: 'Fall registration opens August 1, 2026',
        ageGroup: 'Adult 35+',
        participantOptionsText: 'Team registration flow: managers create a team in an LOPR account; players complete their own payment through LOparks.org using the team name and password.',
        statusText: 'Team/player registration opens August 1, 2026 on the official Lake Oswego Parks & Recreation registration system.',
        registrationDeadlineText: 'Team registration closes Wednesday, September 2, 2026.',
        description: 'Lake Oswego Parks & Recreation lists a Fall 2026 Mixed 35+ 11v11 adult soccer league affiliated with OASA. The quick guide describes eight Sunday games at Hazelia Field, 45-minute halves, a maximum roster of 25, and a mixed roster rule with at least five female players on the field. The quick guide notes Mixed 35+ may include up to four female players aged 30-34.',
        divisions: [
          adultCoedDivision(
            'Mixed 35+ (11v11)',
            'c_age_35plus_11v11',
            '35plus',
            'Adult 35+',
            'City of Lake Oswego adult soccer page and quick guide',
            25,
          ),
        ],
        warnings: [
          'No public price was found on the city page or quick guide during inspection; leave price unspecified until the official detail page exposes it clearly.',
          'The quick guide allows up to four female players aged 30-34 in the Mixed 35+ division; the primary division age remains 35+.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_timbers_army_fc_community_teams',
    sourceKey: 'timbers-army-fc-community-teams',
    name: 'Timbers Army FC Community Teams',
    baseUrl: 'https://107ist.org/',
    listUrl: TIMBERS_ARMY_FC_URL,
    targetKind: 'TEAM',
    organizationId: 'affiliate_org_timbers_army_fc',
    scrapeIntervalMinutes: 43200,
    notes: 'Manual team/community source. The public 107IST page describes Timbers Army FC as a team network and directs prospective players/teams to contact TAFC rather than listing dated events.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      robotsCrawlDelaySeconds: 10,
      joinInfoUrl: TIMBERS_ARMY_FC_JOIN_URL,
      logoSourceUrl: 'https://107ist.org/resources/Pictures/TA%20Crests%20Black%20Border%20Tight%20Crop.png',
    },
    mappingId: 'affiliate_mapping_timbers_army_fc_community_teams_v1',
    mappingVersion: 1,
    mappingNotes: 'Manual TEAM mapping for Timbers Army FC community soccer teams, preserving 107IST/TAFC contact and join info as the outbound URL.',
    mapping: buildMapping('TEAM', TIMBERS_ARMY_FC_URL, 'Timbers Army FC Community Soccer Teams', TIMBERS_ARMY_FC_JOIN_URL, [
      {
        listingKind: 'TEAM',
        title: 'Timbers Army FC Community Soccer Teams',
        officialActionUrl: TIMBERS_ARMY_FC_JOIN_URL,
        sourceUrl: TIMBERS_ARMY_FC_URL,
        organizerName: 'Timbers Army FC',
        sportName: 'Grass Soccer',
        formatLabel: 'Community soccer teams',
        city: 'Portland metro, OR',
        venueName: 'Portland metro area',
        address: 'Portland, OR',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Ongoing team/community contact',
        ageGroup: 'Adult community teams',
        divisionText: 'Community Teams',
        participantOptionsText: 'Players and existing teams contact TAFC@107ist.org through the official 107IST page to ask about joining the Timbers Army FC setup.',
        statusText: 'Contact Timbers Army FC through the official 107IST page for current team availability.',
        description: 'Timbers Army FC is a network of official Timbers Army teams for Timbers, Thorns, and 107IST supporters. The public page says TAFC supports team managers and players, runs a non-aggressive 7v7 coed league, and has teams across outdoor, indoor, and futsal leagues in the Portland metro area.',
        warnings: [
          'Classified as a TEAM source instead of an event because the source page describes team/community participation and contact flow, not dated event registration rows.',
        ],
      },
    ]),
  },
  {
    id: 'affiliate_source_metro_pdx_soccer_league',
    sourceKey: 'metro-pdx-soccer-league',
    name: 'Metro PDX Soccer League',
    baseUrl: METRO_PDX_URL,
    listUrl: METRO_PDX_URL,
    targetKind: 'EVENT',
    organizationId: 'affiliate_org_metro_pdx_soccer',
    scrapeIntervalMinutes: 43200,
    notes: 'Manual evergreen source. The current public Metro PDX page is stale and still shows Winter 2021 dates, so imports emit one review-only winter 7v7 program candidate rather than a dated event.',
    metadata: {
      inspectedAt: '2026-07-06',
      robotsAllowed: true,
      latestPublicSeason: 'Winter 2021',
      logoSourceUrl: 'https://metropdxsoccer.com/img/logo.jpg',
    },
    mappingId: 'affiliate_mapping_metro_pdx_soccer_league_v1',
    mappingVersion: 1,
    mappingNotes: 'Manual evergreen mapping for Metro PDX winter 7v7 soccer using stale source data with explicit warning and official site link.',
    mapping: buildMapping('EVENT', METRO_PDX_URL, 'Metro PDX Soccer League', METRO_PDX_REGISTRATION_URL, [
      {
        title: 'Metro PDX Winter 7v7 Soccer League',
        officialActionUrl: METRO_PDX_REGISTRATION_URL,
        sourceUrl: METRO_PDX_URL,
        organizerName: 'Metro PDX Soccer',
        sportName: 'Grass Soccer',
        formatLabel: 'Winter 7v7 soccer league',
        city: 'Milwaukie, OR',
        venueName: 'La Salle Catholic College Preparatory',
        address: '11999 SE Fuller Road, Milwaukie, OR 97222',
        timeZone: 'America/Los_Angeles',
        scheduleText: 'The latest public Metro PDX page describes a winter 7v7 outdoor soccer league with games on Saturdays and Sundays from 9 AM-4 PM at La Salle Catholic College Preparatory.',
        dateDisplayMode: 'NO_FIXED_DATE',
        dateDisplayText: 'Winter 7v7 season; current public dates need confirmation',
        ageGroup: 'Adult',
        participantOptionsText: 'Team registration; valid OASA player cards are required.',
        priceText: '$500 per team in the latest public source copy; confirm current fee.',
        statusText: 'Latest public page still shows Winter 2021 details. Confirm current registration before publishing.',
        description: 'Metro PDX Soccer describes a winter 7v7 outdoor soccer league in the Portland metro area. The source page says each team plays seven games at La Salle Catholic College Preparatory, games are on Saturdays and Sundays from 9 AM-4 PM, valid OASA player cards are required, and the listed team fee in the latest public copy is $500.',
        divisions: [
          metroDivision("Men's 7v7", 'm_age_18plus_7v7', 'M'),
          metroDivision("Women's 7v7", 'f_age_18plus_7v7', 'F'),
          metroDivision('Coed 7v7', 'c_age_18plus_7v7', 'C'),
        ],
        warnings: [
          'The source is stale: it still shows Winter 2021 registration and schedule copy. Keep as a review-only evergreen program candidate until current season details are confirmed.',
        ],
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

const downloadLogo = async (definition: NonNullable<SourceOrganizationDefinition['logo']>) => {
  const response = await fetch(definition.url);
  if (!response.ok) {
    throw new Error(`Failed to download logo ${definition.url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
    || definition.contentType
    || 'application/octet-stream';
  return { data, contentType };
};

const upsertLogo = async (
  ownerId: string,
  organizationId: string,
  definition: NonNullable<SourceOrganizationDefinition['logo']>,
) => {
  const { data, contentType } = await downloadLogo(definition);
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  const stored = await getStorageProvider().putObject({
    data,
    originalName: definition.originalName,
    contentType,
    organizationId,
  });

  await (prisma as any).file.upsert({
    where: { id: definition.id },
    create: {
      id: definition.id,
      uploaderId: ownerId,
      organizationId,
      bucket: stored.bucket ?? null,
      originalName: definition.originalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId,
      bucket: stored.bucket ?? null,
      originalName: definition.originalName,
      mimeType: contentType,
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
};

const upsertOrganization = async (ownerId: string, definition: SourceOrganizationDefinition) => {
  if (definition.logo) {
    await upsertLogo(ownerId, definition.id, definition.logo);
  }

  const existing = await (prisma as any).organizations.findUnique({
    where: { id: definition.id },
    select: { sports: true, coordinates: true },
  });
  const sports = Array.from(new Set([...(existing?.sports ?? []), ...definition.sports]));
  const coordinates = await geocodeAddressToCoordinates(definition.address ?? definition.location)
    ?? existing?.coordinates
    ?? null;

  const publicPageEnabled = Boolean(definition.publicSlug);

  await (prisma as any).organizations.upsert({
    where: { id: definition.id },
    create: {
      id: definition.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: definition.name,
      location: definition.location,
      address: definition.address,
      description: definition.description,
      logoId: definition.logo?.id ?? null,
      ownerId,
      website: definition.website,
      sports,
      status: publicPageEnabled ? 'LISTED' : 'UNLISTED',
      hasStripeAccount: false,
      verificationStatus: 'UNVERIFIED',
      verificationReviewStatus: 'NONE',
      coordinates,
      productIds: [],
      publicSlug: definition.publicSlug ?? null,
      publicPageEnabled,
      publicWidgetsEnabled: false,
      publicHeadline: definition.publicHeadline ?? `${definition.name} on BracketIQ`,
      publicIntroText: definition.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.',
      taxOrganizationType: definition.taxOrganizationType,
      operatesAthleticFacility: definition.operatesAthleticFacility,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
    update: {
      updatedAt: new Date(),
      name: definition.name,
      location: definition.location,
      address: definition.address,
      description: definition.description,
      logoId: definition.logo?.id ?? null,
      ownerId,
      website: definition.website,
      sports,
      status: publicPageEnabled ? 'LISTED' : 'UNLISTED',
      publicSlug: definition.publicSlug ?? null,
      publicPageEnabled,
      publicHeadline: definition.publicHeadline ?? `${definition.name} on BracketIQ`,
      publicIntroText: definition.publicIntroText ?? 'Find upcoming events, teams, rentals, and products.',
      coordinates,
      operatesAthleticFacility: definition.operatesAthleticFacility,
      taxOrganizationType: definition.taxOrganizationType,
      defaultEventTaxHandling: 'ORGANIZER_COLLECTS',
      defaultRentalTaxHandling: 'ORGANIZER_COLLECTS',
    },
  });
};

const upsertSourceAndMapping = async (definition: SourceDefinition) => {
  await (prisma as any).affiliateScrapeSources.upsert({
    where: { id: definition.id },
    create: {
      id: definition.id,
      name: definition.name,
      sourceKey: definition.sourceKey,
      organizationId: definition.organizationId,
      baseUrl: definition.baseUrl,
      listUrl: definition.listUrl,
      targetKind: definition.targetKind,
      status: 'ACTIVE',
      activeMappingId: definition.mappingId,
      autoScrapeEnabled: false,
      scrapeIntervalMinutes: definition.scrapeIntervalMinutes,
      notes: definition.notes,
      metadata: definition.metadata,
    },
    update: {
      name: definition.name,
      organizationId: definition.organizationId,
      baseUrl: definition.baseUrl,
      listUrl: definition.listUrl,
      targetKind: definition.targetKind,
      status: 'ACTIVE',
      activeMappingId: definition.mappingId,
      scrapeIntervalMinutes: definition.scrapeIntervalMinutes,
      notes: definition.notes,
      metadata: definition.metadata,
    },
  });

  await (prisma as any).affiliateScrapeMappings.updateMany({
    where: { sourceId: definition.id },
    data: { isActive: false },
  });

  await (prisma as any).affiliateScrapeMappings.upsert({
    where: {
      sourceId_version: {
        sourceId: definition.id,
        version: definition.mappingVersion,
      },
    },
    create: {
      id: definition.mappingId,
      sourceId: definition.id,
      version: definition.mappingVersion,
      isActive: true,
      mapping: definition.mapping,
      createdByUserId: null,
      notes: definition.mappingNotes,
      validatedAt: new Date(),
    },
    update: {
      isActive: true,
      mapping: definition.mapping,
      notes: definition.mappingNotes,
      validatedAt: new Date(),
    },
  });

  await (prisma as any).affiliateScrapeSources.update({
    where: { id: definition.id },
    data: { activeMappingId: definition.mappingId },
  });
};

const filterRequestedSources = () => {
  const sourceArg = process.argv.find((value) => value.startsWith('--source='));
  if (!sourceArg) return sourceDefinitions;

  const requestedKeys = new Set(
    sourceArg
      .slice('--source='.length)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return sourceDefinitions.filter((definition) => requestedKeys.has(definition.sourceKey));
};

const main = async () => {
  await loadAppModules();
  const shouldScrape = process.argv.includes('--scrape');
  const owner = await requireOwner();
  const selectedSources = filterRequestedSources();
  const selectedOrganizationIds = new Set(selectedSources.map((source) => source.organizationId));

  for (const organization of sourceOrganizations) {
    if (selectedOrganizationIds.has(organization.id)) {
      await upsertOrganization(owner.id, organization);
      console.log(`Organization ready: ${organization.id}`);
    }
  }

  for (const definition of selectedSources) {
    await upsertSourceAndMapping(definition);
    console.log(`Source ready: ${definition.sourceKey}`);

    if (shouldScrape) {
      const result = await runAffiliateSourceScrape(definition.id);
      const logs = result.run.logs as any;
      console.log(
        `Scrape run ${result.run.id}: ${result.candidates.length} candidate(s) saved `
        + `(created ${logs?.createdCandidateCount ?? 'n/a'}, updated ${logs?.updatedCandidateCount ?? 'n/a'}, rejected ${logs?.rejectedCount ?? 'n/a'}).`,
      );
    }
  }

  if (!shouldScrape) {
    console.log('Re-run with --scrape to fetch source pages and create/update candidates.');
  }
};

main()
  .catch((error) => {
    console.error('[setup-oasa-soccer-affiliate-sources] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
