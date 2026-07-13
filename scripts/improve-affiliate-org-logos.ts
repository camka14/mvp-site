import crypto from 'crypto';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const fillMissingDirectoryTextLogos = process.argv.includes('--fill-missing-directory-text-logos');
const orgArg = process.argv.find((arg) => arg.startsWith('--org='));
const orgFilter = orgArg ? orgArg.split('=').slice(1).join('=').toLowerCase() : '';
const normalizeFilterText = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const normalizedOrgFilter = normalizeFilterText(orgFilter);

if (useLive) {
  const liveUrl = process.env.DATABASE_URL_LIVE;
  if (!liveUrl) {
    throw new Error('DATABASE_URL_LIVE is missing.');
  }
  process.env.DATABASE_URL = liveUrl;
  process.env.STORAGE_PROVIDER = 'spaces';
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

type PrismaClientInstance = typeof import('../src/lib/prisma').prisma;
type StorageProviderInstance = ReturnType<typeof import('../src/lib/storageProvider').getStorageProvider>;

type LogoDefinition = {
  orgId: string;
  sourceUrl?: string;
  sourceFileId?: string;
  useExistingLogo?: boolean;
  sourceLabel: string;
  originalName: string;
  background: string;
  fallbackInitials?: string;
  targetBox?: LogoTargetBox;
  backgroundStyle?: 'flat' | 'glow';
  sourceCrop?: 'center-square';
  textLogo?: {
    lines: string[];
    color: string;
    weight?: number;
  };
};

const OWNER_EMAIL = 'samuel.r@razumly.com';
const SIZE = 1024;

const definitions: LogoDefinition[] = [
  {
    orgId: '412836ee-2bcb-4b89-a9b8-d8e8a8ad17a6',
    sourceLabel: 'CARRILLO local organization text mark; no official website or source logo available in local DB',
    originalName: 'carrillo-local-org-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 900 },
    textLogo: { lines: ['CARRILLO'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'C',
  },
  {
    orgId: 'a148bd3a-ecda-4905-8830-44b862dc672c',
    sourceLabel: 'Razumly local facility text mark; official site currently exposes only an under-construction page',
    originalName: 'razumly-facility-local-org-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 900 },
    textLogo: { lines: ['Razumly', 'Facility'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'RF',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_abc_apollo_vbc',
    sourceLabel: 'ABC Apollo official site header text mark; no clean standalone logo asset found',
    originalName: 'abc-apollo-vbc-logo-square.png',
    background: '#2f1438',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    textLogo: { lines: ['ABC Apollo', 'Volleyball Club'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'ABC',
  },
  {
    orgId: 'affiliate_org_03_international_badminton',
    sourceUrl: 'https://static1.squarespace.com/static/5af29b55620b85c15c132b97/t/68a7cea06babfb25e0ba778f/1755827872692/64891aa44c574793a913741724f6b3b4.jpg?format=1500w',
    sourceLabel: '03 International Badminton official site logo',
    originalName: '03-international-badminton-logo-square.png',
    background: '#073a34',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: '03',
  },
  {
    orgId: 'affiliate_org_big_dawg_batting',
    sourceUrl: 'https://lirp.cdn-website.com/3f2500b9/dms3rep/multi/opt/BigDawgLogo-1920w.png',
    sourceLabel: 'Big Dawg Batting official site logo',
    originalName: 'big-dawg-batting-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'BDB',
  },
  {
    orgId: 'affiliate_org_dbat_pdx_west',
    sourceUrl: 'https://lirp.cdn-website.com/41fc25d3/dms3rep/multi/opt/D-BAT+Logo-1920w.png',
    sourceLabel: 'D-BAT PDX West official site logo',
    originalName: 'dbat-pdx-west-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'DBAT',
  },
  {
    orgId: 'affiliate_org_east_county_pickleball_courts',
    sourceUrl: 'https://img1.wsimg.com/isteam/ip/266ea460-5b0d-4258-b178-41f3e7f34ad8/ECPC_LOGO%20WHITE.png/:/rs=w:366,h:225,cg:true,m/cr=w:366,h:225/qt=q:95',
    sourceLabel: 'East County Pickleball Courts official site logo',
    originalName: 'east-county-pickleball-courts-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'ECPC',
  },
  {
    orgId: 'affiliate_org_gresham_barlow_school_district',
    sourceUrl: 'https://resources.finalsite.net/images/v1705939077/districtgreshamk12orus/y5ahllyz9elhkph7saoq/GBSD_LOGO.png',
    sourceLabel: 'Gresham-Barlow School District official site logo',
    originalName: 'gresham-barlow-school-district-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 760 },
    fallbackInitials: 'GBSD',
  },
  {
    orgId: 'affiliate_org_jumbos_pickleball_portland',
    sourceUrl: 'https://static.wixstatic.com/media/0960cf_724554d136a24f4999a1a99fdac2c7cf~mv2.png',
    sourceLabel: "Jumbo's Pickleball official site logo",
    originalName: 'jumbos-pickleball-portland-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 760 },
    fallbackInitials: 'JP',
  },
  {
    orgId: 'affiliate_org_lake_oswego_parks_recreation',
    sourceUrl: 'https://www.ci.oswego.or.us/sites/default/files/LOPR-Logo-Color-RGB.png',
    sourceLabel: 'Lake Oswego Parks & Recreation official logo',
    originalName: 'lake-oswego-parks-recreation-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'LOPR',
  },
  {
    orgId: 'affiliate_org_metro_pdx_soccer',
    sourceUrl: 'https://metropdxsoccer.com/img/logo.jpg',
    sourceLabel: 'Metro PDX Soccer official site logo',
    originalName: 'metro-pdx-soccer-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'MPS',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_metro_vb_academy',
    sourceUrl: 'https://www.metrovolleyball.club/images/metro-logo-pink.jpg',
    sourceLabel: 'Metro VB Academy official site header logo; skipped generic JVA member badge candidate',
    originalName: 'metro-vb-academy-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'MVA',
  },
  {
    orgId: 'affiliate_org_mjcc_sportsplex',
    sourceUrl: 'https://www.oregonjcc.org/uploaded/themes/MJCC_2015_default/images/mjcc_logo.png',
    sourceLabel: 'MJCC official site logo',
    originalName: 'mjcc-sportsplex-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'MJCC',
  },
  {
    orgId: 'affiliate_org_mountain_view_ice_arena',
    sourceUrl: 'https://img1.wsimg.com/isteam/ip/75b748b1-ce3b-440b-9e06-62c3b307696c/MVIA%20logo%20resize%207.15.jpg',
    sourceLabel: 'Mountain View Ice Arena official site logo',
    originalName: 'mountain-view-ice-arena-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'MVIA',
  },
  {
    orgId: 'affiliate_org_nw_nations_baseball',
    sourceUrl: 'https://nwyouthbaseball.com/wp-content/uploads/2023/09/nwn-logo.png',
    sourceLabel: 'NW Nations official site logo',
    originalName: 'nw-nations-baseball-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 720 },
    fallbackInitials: 'NWN',
  },
  {
    orgId: 'affiliate_org_nwibl',
    sourceUrl: 'https://cdn-app.teamlinkt.com/media/association_data/35370/site_data/images/1.png?v=1771910044',
    sourceLabel: 'NWIBL official TeamLinkt logo',
    originalName: 'nwibl-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'NWIBL',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_adventist_vbc',
    sourceLabel: 'Adventist VBC official site header text mark; no clean standalone logo asset found',
    originalName: 'adventist-vbc-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    textLogo: { lines: ['Adventist', 'Volleyball Club'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'AVC',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_blues_vbc',
    sourceUrl: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/3TX4HKNOZt/s-600-294/4d2ae2-d8d74daaaf6846e790717ede5d9850demv2.png',
    sourceLabel: 'Blues VBC official TopScore/UltimateCentral header logo',
    originalName: 'blues-vbc-logo-square.png',
    background: '#253a92',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'BLU',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_a_g_i_l_e_vbc',
    sourceUrl: 'https://graph.facebook.com/agilesheridan/picture?type=large',
    sourceLabel: 'A.G.I.L.E. VBC official Facebook profile logo',
    originalName: 'agile-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'AG',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_axiom_vbc',
    sourceUrl: 'https://graph.facebook.com/AxiomVolleyballClub/picture?type=large',
    sourceLabel: 'Axiom VBC official Facebook profile logo; official website currently times out',
    originalName: 'axiom-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 760 },
    fallbackInitials: 'AX',
  },
  {
    orgId: 'affiliate_org_oregon_youth_soccer_find_a_club_coast_to_coast_futbol_academy',
    sourceUrl: 'https://img1.wsimg.com/isteam/ip/77e1581f-7e03-4361-8899-82d4a55b24d6/Coast%20to%20Coast%20Logo%20Designs%20%281%29.jpg',
    sourceLabel: 'Coast to Coast Futbol Academy official site logo',
    originalName: 'coast-to-coast-futbol-academy-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'C2C',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_eastern_oregon_vbc',
    sourceUrl: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/mFmBvc1GaJ/s-700-574/image-removebg-preview-35.png',
    sourceLabel: 'Eastern Oregon VBC official UltimateCentral header logo',
    originalName: 'eastern-oregon-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 760 },
    fallbackInitials: 'EOV',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_gorge_juniors_vbc',
    sourceUrl: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/N8khBKiVJp/s-900-900/7f378d575fb051253936777f60e27e1b-removebg-preview-1.png',
    sourceLabel: 'Gorge Juniors Volleyball Club official UltimateCentral header logo',
    originalName: 'gorge-juniors-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'GJV',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_lower_columbia_elite_vbc',
    sourceUrl: 'https://graph.facebook.com/lowercolumbiaelitevb/picture?type=large',
    sourceLabel: 'Lower Columbia Elite VBC official Facebook profile logo; official website DNS currently fails',
    originalName: 'lower-columbia-elite-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'LCE',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_pirate_vbc',
    sourceUrl: 'https://graph.facebook.com/PirateVbc/picture?type=large',
    sourceLabel: 'Pirate VBC official Facebook profile logo',
    originalName: 'pirate-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'PVBC',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_rose_city_vbc',
    sourceUrl: 'https://graph.facebook.com/rosecityvb/picture?type=large',
    sourceLabel: 'Rose City VBC official Facebook profile logo',
    originalName: 'rose-city-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'RCV',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_south_coast_vbc',
    sourceUrl: 'https://graph.facebook.com/SCVCvolleyball/picture?type=large',
    sourceLabel: 'South Coast VBC official Facebook profile logo',
    originalName: 'south-coast-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'SCV',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_tillamook_vbc',
    sourceUrl: 'https://graph.facebook.com/tillamookvolleyballclub/picture?type=large',
    sourceLabel: 'Tillamook VBC official Facebook profile logo',
    originalName: 'tillamook-vbc-logo-square.png',
    background: '#111111',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'TVC',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_wildcats_vbc',
    sourceUrl: 'https://graph.facebook.com/wildcatsvbc/picture?type=large',
    sourceLabel: 'Wildcats VBC official Facebook profile logo',
    originalName: 'wildcats-vbc-logo-square.png',
    background: '#0f1d4a',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'WVC',
  },
  {
    orgId: 'affiliate_org_oregon_youth_soccer_find_a_club_north_marion_youth_athletics',
    sourceUrl: 'https://static.wixstatic.com/media/1a2359_ea471f8d509d462f98f019151b9894d9~mv2_d_2956_1853_s_2.png',
    sourceLabel: 'North Marion Youth Athletics official site icon mark',
    originalName: 'north-marion-youth-athletics-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 620 },
    fallbackInitials: 'NMYA',
  },
  {
    orgId: 'affiliate_org_oregon_youth_soccer_find_a_club_rainier_clatskanie_youth_soccer_association',
    sourceLabel: 'Rainier Clatskanie Youth Soccer Club official SportsAffinity masthead text mark; no clean standalone logo asset found',
    originalName: 'rainier-clatskanie-youth-soccer-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    textLogo: { lines: ['Rainier', 'Clatskanie', 'Youth Soccer'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'RCY',
  },
  {
    orgId: 'affiliate_org_northwest_united_womens_soccer',
    sourceUrl: 'https://cdn1.sportngin.com/attachments/touch_icon_graphic/a451-146209654/nuws_icon_size_192.png',
    sourceLabel: "Northwest United Women's Soccer official site logo",
    originalName: 'northwest-united-womens-soccer-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'NUWS',
  },
  {
    orgId: 'affiliate_org_oregon_badminton_academy',
    sourceUrl: 'https://orbadminton.com/wp-content/uploads/2025/08/orb-logo.png',
    sourceLabel: 'Oregon Badminton Academy official site logo',
    originalName: 'oregon-badminton-academy-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'OBA',
  },
  {
    orgId: 'affiliate_org_outloud_sports_portland',
    sourceUrl: 'https://images.squarespace-cdn.com/content/v1/5a83611e12abd953cf9a7f9b/d3969a58-1618-4af0-be7b-0f362c9dea68/OutLoud+Sports+Logos-3.png?format=1500w',
    sourceLabel: 'OutLoud Sports official site logo',
    originalName: 'outloud-sports-portland-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'OLS',
  },
  {
    orgId: 'affiliate_org_portland_city_united',
    sourceUrl: 'https://static.wixstatic.com/media/7e16f0_e383eeea2a8040d1b5f0a30d70f31968~mv2.png',
    sourceLabel: 'Portland City United official site logo',
    originalName: 'portland-city-united-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'PCU',
  },
  {
    orgId: 'affiliate_org_portland_coed_soccer',
    sourceUrl: 'https://portlandcoedsoccer.com/wp-content/uploads/2019/05/Portland-Coed-Logo.jpg',
    sourceLabel: 'Portland Co-ed Soccer official site logo',
    originalName: 'portland-coed-soccer-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    sourceCrop: 'center-square',
    targetBox: { width: 900, height: 900 },
    fallbackInitials: 'PCS',
  },
  {
    orgId: 'affiliate_org_portland_public_schools',
    sourceUrl: 'https://d2rzw8waxoxhv2.cloudfront.net/logos/pps97227/1718744628969-510-281.jpg',
    sourceLabel: 'Portland Public Schools official Facilitron logo',
    originalName: 'portland-public-schools-logo-square.png',
    background: '#1f4f75',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'PPS',
  },
  {
    orgId: 'affiliate_org_portland_tennis_education',
    sourceUrl: 'https://images.squarespace-cdn.com/content/v1/67e802a418b2066f3f02b41e/8d90bdbb-47f7-40df-bc7d-6eba12133811/__PRIMARY+SUBTEXT-BLUE.png?format=1500w',
    sourceLabel: 'Portland Tennis & Education official site logo',
    originalName: 'portland-tennis-education-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'PT&E',
  },
  {
    orgId: 'affiliate_org_recs_pickleball',
    sourceUrl: 'https://wearerecs.com/wp-content/uploads/2025/10/cropped-recsAsset-20-scaled-1.png',
    sourceLabel: 'RECS Pickleball official site logo',
    originalName: 'recs-pickleball-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'RECS',
  },
  {
    orgId: 'affiliate_org_salmon_creek_indoor',
    sourceUrl: 'https://www.scsoccerarena.com/uploads/1/2/3/8/123880230/salmon-creek-indoor.png',
    sourceLabel: 'Salmon Creek Indoor official site logo',
    originalName: 'salmon-creek-indoor-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'SCI',
  },
  {
    orgId: 'affiliate_org_soccer_chance_academy',
    sourceUrl: 'https://soccerchanceacademy.us/wp-content/uploads/2026/02/sca-web-logo-new.png',
    sourceLabel: 'Soccer Chance Academy official site logo',
    originalName: 'soccer-chance-academy-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'SCA',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_spiketown_vbc',
    sourceLabel: 'Spiketown official site header text mark; no clean standalone logo asset found',
    originalName: 'spiketown-vbc-logo-square.png',
    background: '#1f5f9f',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    textLogo: { lines: ['Spiketown', 'Volleyball Club'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'SVBC',
  },
  {
    orgId: 'affiliate_org_the_courts_at_clear_creek',
    sourceUrl: 'https://a9skwjxw27dk-u6814.pressidiumcdn.com/wp-content/uploads/2017/06/COURTS-Color.png',
    sourceLabel: 'The Courts at Clear Creek official site logo',
    originalName: 'the-courts-at-clear-creek-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'TCC',
  },
  {
    orgId: 'affiliate_org_the_peoples_courts',
    sourceUrl: 'https://thepeoplescourts.com/wp-content/uploads/2023/09/web-logo.png',
    sourceLabel: "The People's Courts official site logo",
    originalName: 'the-peoples-courts-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'TPC',
  },
  {
    orgId: 'affiliate_org_the_plex_pdx',
    sourceUrl: 'https://images.squarespace-cdn.com/content/v1/5a6a4dacbff20056810d674a/1525285099767-APSSEHCC60GVBOQ1VEC6/Plex_logo.png?format=1500w',
    sourceLabel: 'The Plex official site logo',
    originalName: 'the-plex-pdx-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'PLEX',
  },
  {
    orgId: 'affiliate_org_timbers_army_fc',
    sourceUrl: 'https://107ist.org/resources/Pictures/TA%20Crests%20Black%20Border%20Tight%20Crop.png',
    sourceLabel: 'Timbers Army FC official crest',
    originalName: 'timbers-army-fc-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'TAFC',
  },
  {
    orgId: 'affiliate_org_tualatin_indoor_soccer',
    sourceLabel: 'Tualatin Indoor Soccer text mark; no clean public logo asset found on official site',
    originalName: 'tualatin-indoor-soccer-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    textLogo: { lines: ['Tualatin', 'Indoor Soccer'], color: '#ffffff', weight: 800 },
    fallbackInitials: 'TIS',
  },
  {
    orgId: 'affiliate_org_united_pdx',
    sourceUrl: 'https://www.unitedpdx.com/wp-content/uploads/sites/61/2023/03/MicrosoftTeams-image__27_.png',
    sourceLabel: 'United PDX official site logo',
    originalName: 'united-pdx-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'UP',
  },
  {
    orgId: 'affiliate_org_ceva_club_directory_vancouver_vbc',
    sourceUrl: 'https://vancouvervolleyballclub.teamsnapsites.com/wp-content/uploads/sites/3662/2024/08/cropped-Vancouver_Volleyball_Club_medium-192x192.jpg',
    sourceLabel: 'Vancouver Volleyball Club official site icon mark',
    originalName: 'vancouver-vbc-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'VVC',
  },
  {
    orgId: 'affiliate_org_winterhawks_ice_adult_hockey',
    sourceUrl: 'https://cdn2.sportngin.com/attachments/logo_graphic/58bc-208869756/WIClogomain_medium.png',
    sourceLabel: 'Winterhawks ICE official site logo',
    originalName: 'winterhawks-ice-adult-hockey-logo-square.png',
    background: '#211d1e',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'WIC',
  },
  {
    orgId: 'affiliate_org_city_of_gresham',
    sourceUrl: 'https://www.greshamoregon.gov/img/gresham-logo.png',
    sourceLabel: 'City of Gresham official homepage logo',
    originalName: 'city-of-gresham-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 720 },
    fallbackInitials: 'COG',
  },
  {
    orgId: 'affiliate_org_eastside_timbers',
    sourceFileId: 'affiliate_file_eastside_timbers_logo',
    sourceLabel: 'Original Eastside Timbers crest normalized onto a full opaque square',
    originalName: 'eastside-timbers-logo-square.png',
    background: '#f2f3f4',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'ET',
  },
  {
    orgId: 'affiliate_org_portland_basketball',
    sourceFileId: 'affiliate_file_portland_basketball_logo',
    sourceLabel: 'Original Portland Basketball logo file normalized onto an opaque square',
    originalName: 'portland-basketball-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'PB',
  },
  {
    orgId: 'affiliate_org_portland_metro_softball_association',
    sourceUrl: 'https://d2jqoimos5um40.cloudfront.net/site_1071/2e682c.png',
    sourceLabel: 'Portland Metro Softball Association official site banner logo',
    originalName: 'portland-metro-softball-association-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    sourceCrop: 'center-square',
    targetBox: { width: 900, height: 900 },
    fallbackInitials: 'PMSA',
  },
  {
    orgId: 'affiliate_org_rose_city_volleyball',
    sourceFileId: 'affiliate_file_rose_city_volleyball_logo',
    sourceLabel: 'Original Rose City Volleyball logo file flattened onto an opaque square',
    originalName: 'rose-city-volleyball-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'RCV',
  },
  {
    orgId: 'affiliate_org_sfva_volleyball',
    sourceUrl: 'https://static.wixstatic.com/media/ce7f3a_269bcb79826f4dfbb6f9e1c14b054d20~mv2.png',
    sourceLabel: 'SFVA official Wix logo normalized onto a full opaque square',
    originalName: 'sfva-volleyball-logo-square.png',
    background: '#f4f5f6',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'SFVA',
  },
  {
    orgId: 'affiliate_org_troutdale_indoor_sports',
    sourceLabel: 'Troutdale Indoor Sports text mark based on official site branding',
    originalName: 'troutdale-indoor-sports-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 900 },
    textLogo: { lines: ['Troutdale', 'Indoor Sports'], color: '#14803c', weight: 800 },
    fallbackInitials: 'TIS',
  },
  {
    orgId: 'affiliate_org_8th_street_athletics',
    sourceUrl: 'https://images.squarespace-cdn.com/content/v1/60d270456ef0d67691794d22/1625610311164-5IH7E6N7G294CFF7ESTL/8th-logo-white.png?format=1500w',
    sourceLabel: '8th Street Academy official header logo',
    originalName: '8th-street-athletics-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: '8SA',
  },
  {
    orgId: 'affiliate_org_batting_a_thousand',
    sourceUrl: 'https://batpdx.com/wp-content/uploads/2017/10/Batting-A-Thousand_CV3-1w.jpg',
    sourceLabel: 'Batting a Thousand official site logo',
    originalName: 'batting-a-thousand-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 920, height: 680 },
    fallbackInitials: 'BAT',
  },
  {
    orgId: 'affiliate_org_cascade_athletic_clubs_gresham',
    sourceUrl: 'https://cascadeac.com/wp-content/uploads/2024/04/CascadeAC_New_Logo_White_WEB-1024x319.png',
    sourceLabel: 'Cascade Athletic Clubs official white logo',
    originalName: 'cascade-athletic-clubs-gresham-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 920, height: 700 },
    fallbackInitials: 'CAC',
  },
  {
    orgId: 'affiliate_org_greater_portland_soccer_district',
    sourceUrl: 'https://www.gpsdsoccer.com/_templates/_design_files/logo.png',
    sourceLabel: 'GPSD official site logo',
    originalName: 'gpsd-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 920, height: 700 },
    fallbackInitials: 'GPSD',
  },
  {
    orgId: 'affiliate_org_hoopsource_basketball',
    sourceUrl: 'https://hoopsourcebasketball.com/wp-content/uploads/2023/08/cropped-hoopsource-icon-270x270.png',
    sourceLabel: 'HoopSource official icon logo',
    originalName: 'hoopsource-basketball-logo-square.png',
    background: '#211d1e',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 900 },
    fallbackInitials: 'HS',
  },
  {
    orgId: 'affiliate_org_oregon_youth_soccer',
    sourceUrl: 'https://www.oregonyouthsoccer.org/wp-content/uploads/sites/279/2024/03/OYSA-Main-Shield-LOGO2.png',
    sourceLabel: 'Oregon Youth Soccer official shield logo',
    originalName: 'oregon-youth-soccer-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'OYSA',
  },
  {
    orgId: 'affiliate_org_oregon_youth_soccer_find_a_club_oregon_surf',
    sourceUrl: 'https://oregonsurf.org/wp-content/uploads/2024/03/Oregon-Surf-Logo_3D-shield-black-outline.png',
    sourceLabel: 'Oregon Surf official club shield; skipped Friendship Cup event logo candidate',
    originalName: 'oregon-surf-logo-square.png',
    background: '#ffffff',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'OS',
  },
  {
    orgId: 'affiliate_org_portland_community_college',
    sourceUrl: 'https://www.pcc.edu/_source/homepage/images/logo-trademark.svg',
    sourceLabel: 'PCC official homepage trademark logo',
    originalName: 'portland-community-college-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 920, height: 700 },
    fallbackInitials: 'PCC',
  },
  {
    orgId: 'affiliate_org_portland_indoor_soccer',
    sourceUrl: 'https://pdxindoorsoccer.com/wp-content/themes/metric/images/logo.png',
    sourceLabel: 'Portland Indoor Soccer official theme header logo',
    originalName: 'portland-indoor-soccer-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    sourceCrop: 'center-square',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'PIS',
  },
  {
    orgId: 'affiliate_org_portland_parks_recreation',
    sourceUrl: 'https://www.portland.gov/themes/custom/cloudy/images/brand/seal-logo.png',
    sourceLabel: 'Portland.gov official seal logo',
    originalName: 'portland-parks-recreation-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'PPR',
  },
  {
    orgId: 'affiliate_org_portland_ultimate',
    sourceUrl: 'https://d36m266ykvepgv.cloudfront.net/uploads/media/Foq2VqcXxG/s-368-80/website-header-2.png',
    sourceLabel: 'Portland Ultimate official header logo',
    originalName: 'portland-ultimate-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 920, height: 700 },
    fallbackInitials: 'PU',
  },
  {
    orgId: 'affiliate_org_portland_youth_soccer_association',
    sourceUrl: 'https://leagues.bluesombrero.com/Portals/81086/logo638264953461949679.png',
    sourceLabel: 'PYSA official Sports Connect logo',
    originalName: 'portland-youth-soccer-association-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 860, height: 860 },
    fallbackInitials: 'PYSA',
  },
  {
    orgId: 'affiliate_org_reynolds_school_district',
    sourceUrl: 'https://www.reynolds.k12.or.us/sites/all/themes/aha_compass/logo.png',
    sourceLabel: 'Reynolds School District official site logo',
    originalName: 'reynolds-school-district-logo-square.png',
    background: '#172033',
    backgroundStyle: 'flat',
    targetBox: { width: 900, height: 700 },
    fallbackInitials: 'RSD',
  },
  {
    orgId: 'affiliate_org_ymca_columbia_willamette',
    sourceUrl: 'https://www.ymcacw.org/themes/custom/ymca_cw/images/logo.svg',
    sourceLabel: 'YMCA Columbia-Willamette official logo',
    originalName: 'ymca-columbia-willamette-logo-square.png',
    background: '#ffffff',
    fallbackInitials: 'YMCA',
  },
];

const duplicateLogoSources = [
  {
    orgId: 'affiliate_org_portland_city_united_programs_portland_city_united_soccer_club',
    sourceOrgId: 'affiliate_org_portland_city_united',
  },
  {
    orgId: 'affiliate_org_united_pdx_programs_united_pdx',
    sourceOrgId: 'affiliate_org_united_pdx',
  },
];

let prisma: PrismaClientInstance | undefined;
let storage: StorageProviderInstance | undefined;
const updatedOrgIds = new Set<string>();

type LogoTargetBox = {
  width: number;
  height: number;
};

const getLogoTargetBox = (width: number, height: number): LogoTargetBox => {
  if (!width || !height) {
    return { width: 840, height: 840 };
  }

  const aspectRatio = width / height;
  if (aspectRatio >= 2.4) {
    return { width: 680, height: 500 };
  }
  if (aspectRatio >= 1.5) {
    return { width: 720, height: 560 };
  }
  if (aspectRatio <= 0.55) {
    return { width: 500, height: 760 };
  }
  if (aspectRatio <= 0.8) {
    return { width: 560, height: 760 };
  }
  return { width: 760, height: 760 };
};

const escapeSvgText = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
);

const slugify = (value: string): string => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
);

const splitTextLogoLines = (value: string): string[] => {
  const words = value
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\bVBC\b/gi, 'Volleyball Club')
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1] ?? '';
    if (!last || `${last} ${word}`.length > 18) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${last} ${word}`;
    }
  }
  return lines.slice(0, 4);
};

const buildTextLogo = (definition: LogoDefinition): Buffer | null => {
  if (!definition.textLogo) return null;
  const lineCount = definition.textLogo.lines.length;
  const fontSize = lineCount > 2 ? 120 : 150;
  const lineHeight = fontSize * 1.16;
  const totalHeight = lineHeight * lineCount;
  const firstY = 512 - (totalHeight / 2) + (fontSize * 0.75);
  const text = definition.textLogo.lines.map((line, index) => `
    <text x="512" y="${firstY + index * lineHeight}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${fontSize}"
      font-weight="${definition.textLogo?.weight ?? 800}"
      fill="${definition.textLogo?.color ?? '#172033'}"
      letter-spacing="0">${escapeSvgText(line)}</text>
  `).join('');

  return Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" fill="${definition.background}"/>
      ${text}
    </svg>
  `);
};

const loadAppModules = async () => {
  ({ prisma } = await import('../src/lib/prisma'));
  const { getStorageProvider } = await import('../src/lib/storageProvider');
  storage = getStorageProvider();
};

const downloadSource = async (definition: LogoDefinition): Promise<Buffer | null> => {
  const textLogo = buildTextLogo(definition);
  if (textLogo) return textLogo;
  const sourceFileId = definition.sourceFileId ?? null;
  if (definition.useExistingLogo || sourceFileId) {
    const org = await (prisma as any).organizations.findUnique({
      where: { id: definition.orgId },
      select: { logoId: true },
    });
    const logoId = sourceFileId ?? org?.logoId;
    if (!logoId) return null;
    const file = await (prisma as any).file.findUnique({
      where: { id: logoId },
      select: { path: true, bucket: true },
    });
    if (!file) return null;
    const result = await storage!.getObjectStream({ key: file.path, bucket: file.bucket });
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (!definition.sourceUrl) return null;
  const response = await fetch(definition.sourceUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${definition.sourceUrl}: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const normalizeLogo = async (definition: LogoDefinition): Promise<Buffer> => {
  const source = await downloadSource(definition);
  if (!source) {
    throw new Error(`No source logo object was available for ${definition.orgId}.`);
  }
  const base = await sharp(source, { animated: false })
    .rotate()
    .png()
    .toBuffer();
  const sourceForTrim = definition.sourceCrop === 'center-square'
    ? await sharp(base)
      .resize({ width: 1024, height: 1024, fit: 'cover', position: 'center' })
      .png()
      .toBuffer()
    : base;
  const trimmed = await sharp(sourceForTrim, { animated: false })
    .trim({ threshold: 12 })
    .flatten({ background: definition.background })
    .trim({ background: definition.background, threshold: 12 })
    .png()
    .toBuffer()
    .catch(async () => sharp(sourceForTrim, { animated: false }).flatten({ background: definition.background }).png().toBuffer());
  const trimmedMetadata = await sharp(trimmed).metadata();
  const targetBox = definition.targetBox ?? getLogoTargetBox(trimmedMetadata.width ?? 0, trimmedMetadata.height ?? 0);
  const logo = await sharp(trimmed)
    .resize({
      width: targetBox.width,
      height: targetBox.height,
      fit: 'inside',
      withoutEnlargement: false,
      background: definition.background,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  const logoWidth = metadata.width ?? 760;
  const logoHeight = metadata.height ?? 760;
  const decorativeOverlays = definition.backgroundStyle !== 'flat' && definition.background === '#172033'
    ? [
        {
          input: Buffer.from(`
            <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="glow" cx="50%" cy="30%" r="72%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
                  <stop offset="58%" stop-color="#ffffff" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.03"/>
                  <stop offset="100%" stop-color="#0f172a" stop-opacity="0.22"/>
                </linearGradient>
              </defs>
              <rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>
              <rect width="${SIZE}" height="${SIZE}" fill="url(#vignette)"/>
            </svg>
          `),
          gravity: 'center' as const,
        },
      ]
    : [];
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: definition.background,
    },
  })
    .composite([
      ...decorativeOverlays,
      {
        input: logo,
        top: Math.round((SIZE - logoHeight) / 2),
        left: Math.round((SIZE - logoWidth) / 2),
      },
    ])
    .png()
    .toBuffer();
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

const updateLogo = async (ownerId: string, definition: LogoDefinition) => {
  const org = await (prisma as any).organizations.findUnique({
    where: { id: definition.orgId },
    select: { id: true, name: true, logoId: true },
  });
  if (!org) {
    console.warn(`Skipping missing org ${definition.orgId}`);
    return;
  }
  if (!force && definition.useExistingLogo && org.logoId) {
    const currentFile = await (prisma as any).file.findUnique({
      where: { id: org.logoId },
      select: { originalName: true, path: true, bucket: true },
    });
    if (currentFile?.originalName === definition.originalName) {
      const head = await storage!.headObject({ key: currentFile.path, bucket: currentFile.bucket })
        .catch(() => ({ exists: false }));
      if (head.exists) {
        console.log(`${dryRun ? '[dry-run] ' : ''}${org.name}: ${org.logoId} already normalized (${definition.sourceLabel})`);
        updatedOrgIds.add(definition.orgId);
        return;
      }
    }
  }
  const image = await normalizeLogo(definition);
  const fileId = `${definition.orgId}_logo_square_${crypto.createHash('sha1').update(image).digest('hex').slice(0, 12)}`;
  console.log(`${dryRun ? '[dry-run] ' : ''}${org.name}: ${org.logoId ?? 'no logo'} -> ${fileId} (${definition.sourceLabel})`);
  if (dryRun) {
    updatedOrgIds.add(definition.orgId);
    return;
  }
  const stored = await storage!.putObject({
    data: image,
    originalName: definition.originalName,
    contentType: 'image/png',
    organizationId: definition.orgId,
  });
  await (prisma as any).file.upsert({
    where: { id: fileId },
    create: {
      id: fileId,
      uploaderId: ownerId,
      organizationId: definition.orgId,
      bucket: stored.bucket ?? null,
      originalName: definition.originalName,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      uploaderId: ownerId,
      organizationId: definition.orgId,
      bucket: stored.bucket ?? null,
      originalName: definition.originalName,
      mimeType: 'image/png',
      sizeBytes: stored.sizeBytes,
      path: stored.key,
      updatedAt: new Date(),
    },
  });
  await (prisma as any).organizations.update({
    where: { id: definition.orgId },
    data: {
      logoId: fileId,
      updatedAt: new Date(),
    },
  });
  updatedOrgIds.add(definition.orgId);
};

const copyDuplicateLogo = async (orgId: string, sourceOrgId: string) => {
  const sourceOrg = await (prisma as any).organizations.findUnique({
    where: { id: sourceOrgId },
    select: { logoId: true, name: true },
  });
  const org = await (prisma as any).organizations.findUnique({
    where: { id: orgId },
    select: { logoId: true, name: true },
  });
  if (!org || !sourceOrg?.logoId) return;
  console.log(`${dryRun ? '[dry-run] ' : ''}${org.name}: ${org.logoId ?? 'no logo'} -> ${sourceOrg.logoId} (copied from ${sourceOrg.name})`);
  if (dryRun) return;
  await (prisma as any).organizations.update({
    where: { id: orgId },
    data: {
      logoId: sourceOrg.logoId,
      updatedAt: new Date(),
    },
  });
};

const fillMissingCevaDirectoryTextLogos = async (ownerId: string) => {
  if (!fillMissingDirectoryTextLogos) return;
  const orgs = await (prisma as any).organizations.findMany({
    where: {
      id: { startsWith: 'affiliate_org_ceva_club_directory_' },
      OR: [
        { logoId: null },
        { logoId: '' },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  for (const org of orgs as Array<{ id: string; name: string }>) {
    if (
      orgFilter
      && !org.id.toLowerCase().includes(orgFilter)
      && !org.name.toLowerCase().includes(orgFilter)
      && !normalizeFilterText(org.id).includes(normalizedOrgFilter)
      && !normalizeFilterText(org.name).includes(normalizedOrgFilter)
    ) {
      continue;
    }
    await updateLogo(ownerId, {
      orgId: org.id,
      sourceLabel: `${org.name} CEVA directory text mark; no official site/social logo found in current audit`,
      originalName: `${slugify(org.name)}-ceva-directory-logo-square.png`,
      background: '#172033',
      backgroundStyle: 'flat',
      targetBox: { width: 900, height: 900 },
      textLogo: { lines: splitTextLogoLines(org.name), color: '#ffffff', weight: 800 },
      fallbackInitials: org.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 4).toUpperCase(),
    });
  }
};

const repairMissingLogoObjects = async () => {
  const orgs = await (prisma as any).organizations.findMany({
    where: {
      id: orgFilter
        ? { contains: orgFilter }
        : { startsWith: 'affiliate_org_' },
    },
    select: { id: true, name: true, logoId: true },
    orderBy: { name: 'asc' },
  });
  const logoIds = orgs
    .map((org: { logoId: string | null }) => org.logoId)
    .filter((id: string | null): id is string => Boolean(id));
  const files = await (prisma as any).file.findMany({
    where: { id: { in: logoIds } },
    select: { id: true, path: true, bucket: true },
  });
  const fileById = new Map<string, { id: string; path: string; bucket: string | null }>(
    files.map((file: { id: string; path: string; bucket: string | null }) => [file.id, file]),
  );

  for (const org of orgs as Array<{ id: string; name: string; logoId: string | null }>) {
    if (updatedOrgIds.has(org.id)) continue;
    let needsRepair = !org.logoId;
    const file = org.logoId ? fileById.get(org.logoId) : null;
    if (!needsRepair && !file) {
      needsRepair = true;
    }
    if (!needsRepair && file) {
      const head = await storage!.headObject({ key: file.path, bucket: file.bucket }).catch(() => ({ exists: false }));
      needsRepair = !head.exists;
    }
    if (!needsRepair) continue;
    console.warn([
      'Missing affiliate org logo still needs manual source lookup',
      org.name,
      org.id,
      org.logoId ?? 'no logoId',
    ].join(' | '));
  }
};

const main = async () => {
  await loadAppModules();
  const owner = await requireOwner();
  const selectedDefinitions = definitions.filter((definition) => (
    !orgFilter
    || definition.orgId.toLowerCase().includes(orgFilter)
    || definition.originalName.toLowerCase().includes(orgFilter)
    || normalizeFilterText(definition.orgId).includes(normalizedOrgFilter)
    || normalizeFilterText(definition.originalName).includes(normalizedOrgFilter)
  ));
  for (const definition of selectedDefinitions) {
    await updateLogo(owner.id, definition);
  }
  const selectedDuplicateSources = duplicateLogoSources.filter((row) => (
    !orgFilter
    || row.orgId.toLowerCase().includes(orgFilter)
    || row.sourceOrgId.toLowerCase().includes(orgFilter)
  ));
  for (const row of selectedDuplicateSources) {
    await copyDuplicateLogo(row.orgId, row.sourceOrgId);
  }
  await fillMissingCevaDirectoryTextLogos(owner.id);
  await repairMissingLogoObjects();
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
