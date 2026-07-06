import dotenv from 'dotenv';
import { prisma } from '../src/lib/prisma';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type ScheduleConfig = {
  sourceKey: string;
  intervalMinutes: number;
  reason: string;
};

const DAY = 1440;
const WEEK = 10080;
const MONTH = 43200;

const schedules: ScheduleConfig[] = [
  {
    sourceKey: '8th-street-athletics-programs',
    intervalMinutes: WEEK,
    reason: 'Youth camp/program listings and gym rental details discovered from official 8th Street pages and Playpass link-outs.',
  },
  {
    sourceKey: 'portland-basketball-pick-to-play',
    intervalMinutes: DAY,
    reason: 'High-change pickup/open-gym inventory with per-card spots and prices.',
  },
  {
    sourceKey: 'portland-ultimate-events',
    intervalMinutes: DAY,
    reason: 'Actionable event catalog with registrations, waitlists, prices, and capacity.',
  },
  {
    sourceKey: 'rose-city-volleyball-signups',
    intervalMinutes: DAY,
    reason: 'High-change signup cards for open gym/team-play sessions with roster spots.',
  },
  {
    sourceKey: 'eastside-opf-community-programs',
    intervalMinutes: WEEK,
    reason: 'Program page with dated classes and outbound registration links.',
  },
  {
    sourceKey: 'eastside-opf-indoor-camps',
    intervalMinutes: WEEK,
    reason: 'Dated camp sessions that can open, close, or change during camp season.',
  },
  {
    sourceKey: 'eastside-opf-programs',
    intervalMinutes: WEEK,
    reason: 'Program page with a mix of dated and ongoing OPF signups.',
  },
  {
    sourceKey: 'eastside-timbers-edge',
    intervalMinutes: WEEK,
    reason: 'Dated seasonal training program.',
  },
  {
    sourceKey: 'eastside-timbers-recreation',
    intervalMinutes: WEEK,
    reason: 'Seasonal recreation program page with registration links.',
  },
  {
    sourceKey: 'eastside-timbers-summer-camps',
    intervalMinutes: WEEK,
    reason: 'Seasonal camp page with dated sessions.',
  },
  {
    sourceKey: 'lake-oswego-adult-basketball',
    intervalMinutes: WEEK,
    reason: 'City-hosted league page with active season registration links.',
  },
  {
    sourceKey: 'hoopsource-basketball-portland-events',
    intervalMinutes: WEEK,
    reason: 'Seasonal Portland-area basketball tournament and league rows with future deadlines and Exposure registration links.',
  },
  {
    sourceKey: 'nuws-fall-2026-registration',
    intervalMinutes: WEEK,
    reason: 'Seasonal league registration page that may update registration details.',
  },
  {
    sourceKey: 'nwibl-adult-baseball-registration',
    intervalMinutes: WEEK,
    reason: 'Seasonal team-payment and new-player registration pages.',
  },
  {
    sourceKey: 'oregon-youth-soccer-sanctioned-tournaments',
    intervalMinutes: WEEK,
    reason: 'Tournament directory where linked events can be added or removed.',
  },
  {
    sourceKey: 'portland-softball-current-programs',
    intervalMinutes: WEEK,
    reason: 'Current-program listing with leagues and tournaments.',
  },
  {
    sourceKey: 'portland-youth-soccer-association-programs',
    intervalMinutes: WEEK,
    reason: 'Seasonal league and tournament program pages.',
  },
  {
    sourceKey: 'rose-city-futsal-adult-leagues',
    intervalMinutes: WEEK,
    reason: 'Registration catalog where future league rows appear seasonally.',
  },
  {
    sourceKey: 'rose-city-futsal-community-teams',
    intervalMinutes: WEEK,
    reason: 'Registration catalog where community-team rows appear seasonally.',
  },
  {
    sourceKey: 'sfva-volleyball-tournaments',
    intervalMinutes: WEEK,
    reason: 'Tournament listing page with a small changing event calendar.',
  },
  {
    sourceKey: 'cascade-athletic-clubs-gresham-sports-programs',
    intervalMinutes: MONTH,
    reason: 'Mostly evergreen sports-program summaries and outbound registration links.',
  },
  {
    sourceKey: 'city-gresham-sports-field-rentals',
    intervalMinutes: MONTH,
    reason: 'Municipal field-rental inventory changes slowly.',
  },
  {
    sourceKey: 'eastside-timbers-field-rentals',
    intervalMinutes: MONTH,
    reason: 'Facility-rental overview with application link; not real-time availability.',
  },
  {
    sourceKey: 'gpsd-adult-soccer-seasons',
    intervalMinutes: MONTH,
    reason: 'Evergreen seasonal league summaries from mostly static pages.',
  },
  {
    sourceKey: 'gresham-barlow-school-district-facility-rentals',
    intervalMinutes: MONTH,
    reason: 'District facility-use page and fee schedule without public real-time availability.',
  },
  {
    sourceKey: 'lake-oswego-adult-slow-pitch-softball',
    intervalMinutes: MONTH,
    reason: 'Annual evergreen program summary for a closed/current season.',
  },
  {
    sourceKey: 'rose-city-futsal-court-rentals',
    intervalMinutes: MONTH,
    reason: 'Rental overview/link-out source without public real-time availability.',
  },
  {
    sourceKey: 'troutdale-indoor-sports-programs',
    intervalMinutes: MONTH,
    reason: 'Manual evergreen program/rental summary from stable source pages.',
  },
  {
    sourceKey: 'ymca-cw-volleyball-programs',
    intervalMinutes: MONTH,
    reason: 'No-fixed-date YMCA volleyball program summaries; Daxko registration remains outbound-only.',
  },
  {
    sourceKey: 'the-courts-at-clear-creek-rentals',
    intervalMinutes: MONTH,
    reason: 'Static court and event rental overview with official Secure Booker link-out.',
  },
  {
    sourceKey: 'outloud-sports-portland-leagues',
    intervalMinutes: MONTH,
    reason: 'Evergreen adult recreational league summary with current registration delegated to LeagueApps.',
  },
  {
    sourceKey: 'east-county-pickleball-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen pickleball rental/program summary with current availability delegated to Playbypoint.',
  },
  {
    sourceKey: 'the-peoples-courts-programs',
    intervalMinutes: WEEK,
    reason: 'Public program/rental pages plus a dated tournament link that can change seasonally.',
  },
  {
    sourceKey: 'recs-pickleball-events',
    intervalMinutes: DAY,
    reason: 'High-change public RECS event card inventory with prices and registration links.',
  },
  {
    sourceKey: 'recs-pickleball-rentals',
    intervalMinutes: MONTH,
    reason: 'Static location/rental overview with official RECS booking link-out.',
  },
  {
    sourceKey: 'reynolds-school-district-facility-rentals',
    intervalMinutes: MONTH,
    reason: 'District facility-use application and fee schedule without public real-time availability.',
  },
  {
    sourceKey: 'oregon-badminton-academy-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen badminton rental/program summary with current availability delegated to Planyo and official program pages.',
  },
  {
    sourceKey: 'batting-a-thousand-rentals',
    intervalMinutes: MONTH,
    reason: 'Static batting cage and tunnel rental overview with official Vagaro link-out.',
  },
  {
    sourceKey: 'big-dawg-batting-rentals',
    intervalMinutes: MONTH,
    reason: 'Static batting lane and full-facility rental overview with official Upper Hand link-out.',
  },
  {
    sourceKey: 'the-plex-pdx-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen adult indoor-soccer league and field-rental summaries from static public pages.',
  },
  {
    sourceKey: 'portland-parks-athletic-field-rentals',
    intervalMinutes: MONTH,
    reason: 'Municipal athletic-field permitting page without real-time field availability.',
  },
  {
    sourceKey: 'portland-public-schools-facility-rentals',
    intervalMinutes: MONTH,
    reason: 'Districtwide Facilitron rental page; calendar/search availability paths are disallowed.',
  },
  {
    sourceKey: 'portland-indoor-soccer-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen indoor soccer league, open-play, and arena-rental summary from stable public WordPress pages.',
  },
  {
    sourceKey: 'mjcc-sportsplex-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen MJCC indoor soccer league and Sportsplex rental summary from stable public Finalsite pages.',
  },
  {
    sourceKey: 'tualatin-indoor-soccer-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen Tualatin indoor soccer league, youth class, and field-rental summary from public Webflow pages.',
  },
  {
    sourceKey: 'winterhawks-ice-adult-hockey',
    intervalMinutes: WEEK,
    reason: 'Seasonal SportsEngine adult hockey registration links and deadlines for Sherwood and Beaverton/VMC leagues.',
  },
  {
    sourceKey: 'mountain-view-ice-arena-programs',
    intervalMinutes: WEEK,
    reason: 'Seasonal hockey program pages plus ongoing stick-and-puck/drop-in sessions and private-rink rental link-outs.',
  },
  {
    sourceKey: 'salmon-creek-indoor-programs',
    intervalMinutes: WEEK,
    reason: 'Seasonal indoor soccer league, class, drop-in, field-rental, and party-rental pages.',
  },
  {
    sourceKey: 'jumbos-pickleball-portland-programs',
    intervalMinutes: MONTH,
    reason: 'Evergreen pickleball program, court-reservation, and private-event summaries with current availability delegated to Playbypoint.',
  },
  {
    sourceKey: 'portland-tennis-center-court-rentals',
    intervalMinutes: MONTH,
    reason: 'Static municipal tennis-court reservation link-out with live availability delegated to ActiveNet.',
  },
  {
    sourceKey: 'ptande-pickleball-programs',
    intervalMinutes: MONTH,
    reason: 'Static nonprofit pickleball program and court-rental summary with live booking delegated to CourtReserve.',
  },
  {
    sourceKey: '03-international-badminton-programs',
    intervalMinutes: WEEK,
    reason: 'Seasonal badminton classes, camps, tournaments, and court-rental pages with mixed current and completed rows.',
  },
  {
    sourceKey: 'dbat-pdx-west-programs',
    intervalMinutes: WEEK,
    reason: 'Baseball/softball camps, classes, lessons, HitTrax leagues, cage rentals, and team-rental details can change seasonally.',
  },
  {
    sourceKey: 'pcc-athletic-facility-rentals',
    intervalMinutes: MONTH,
    reason: 'Static PCC athletic facility rental categories with live requests handled through the official inquiry form.',
  },
  {
    sourceKey: 'montavilla-community-center-rentals',
    intervalMinutes: MONTH,
    reason: 'Static Portland Parks community-center rental page with phone-based availability and reservations.',
  },
  {
    sourceKey: 'portland-city-united-programs',
    intervalMinutes: WEEK,
    reason: 'Club profile plus seasonal soccer tournament, camp, and academy rows from PCU public pages.',
  },
  {
    sourceKey: 'united-pdx-programs',
    intervalMinutes: WEEK,
    reason: 'Club profile plus seasonal YDA, camp, and College ID Camp rows from United PDX public pages.',
  },
  {
    sourceKey: 'oregon-super-cup',
    intervalMinutes: WEEK,
    reason: 'Specific youth soccer tournament page with registration deadline, fees, and age-group details.',
  },
  {
    sourceKey: 'nw-nations-baseball-2026-tournaments',
    intervalMinutes: WEEK,
    reason: 'Regional youth baseball tournament schedule with future rows and division-level team fees.',
  },
];

const main = async () => {
  const rows = [];
  for (const schedule of schedules) {
    const row = await (prisma as any).affiliateScrapeSources.updateMany({
      where: { sourceKey: schedule.sourceKey },
      data: {
        autoScrapeEnabled: true,
        scrapeIntervalMinutes: schedule.intervalMinutes,
      },
    });
    rows.push({
      sourceKey: schedule.sourceKey,
      intervalMinutes: schedule.intervalMinutes,
      updated: row.count,
      reason: schedule.reason,
    });
  }
  console.table(rows);
  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error('[configure-affiliate-scrape-schedules] failed', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
