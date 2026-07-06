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
    sourceKey: 'the-courts-at-clear-creek-rentals',
    intervalMinutes: MONTH,
    reason: 'Static court and event rental overview with official Secure Booker link-out.',
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
