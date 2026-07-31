import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEAAU_NEW_YORK_CITY_URL = 'https://www.neaauvolleyball.org/new-york-city';
export const NEAAU_NEW_YORK_CITY_REGISTRATION_URL = 'https://sportwrench.com/event/27257';
export const NEAAU_NEW_YORK_CITY_VENUE_URL = 'https://www.javitscenter.com/';

export const NEAAU_NEW_YORK_CITY_EVENT_DESCRIPTION =
  'NEAAU Volleyball presents a 2027 New York City club volleyball event at Javits on the Hudson with girls 12-18 and boys 14-18 divisions, a seven-game guarantee, and team registration through SportWrench.';

export const NEAAU_NEW_YORK_CITY_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: '3b625c45-24d2-44e0-9fcf-f95c2b5d8b35',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-city-neaauvolleyball-org',
  intakeName: 'New York City',
  baseUrl: 'https://www.neaauvolleyball.org',
  complianceStatus: 'ALLOWED',
  runId: '7811f4f1-3dcb-4055-9ded-2c01b78c3d9b',
  runStatus: 'PARTIAL',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:17:43.453Z',
  pages: [
    { url: NEAAU_NEW_YORK_CITY_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    { url: 'https://www.neaauvolleyball.org/', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    pageBranding: '53528ecb7e1136c497c8cf6002ba32060598dce898fb2b30f0ea8884922ebfc5',
    pageHtml: '1e8d405fabec1200d756338c1b96342f7a45390a1a209f6379a0777a83091077',
    pageImages: 'f80d6dbb70b95e3d8ff7be07042116767e5b60e931fa2aa792dcb89a5fed3a1f',
    pageLinks: 'beff9e68c08737d1bfcf4035e307148e5b609cff70752959b8026a41e6a6d7d6',
    pageMarkdown: 'bb67b3670d9726dc2d82bc78a89662d3ff73fd48553c0c490f634e7c4b36ccd9',
    robots: 'a4b990cecd876d29f75da02412e46ab96760af94a6dbaf9f675d5b71b3a479af',
    logoCandidates: [
      '78371f40f73cfd1306a967d01e70449560536e6a3bbedbe3a78d201eee72fac4',
      '30ecb55821b6901e1cd228a4b59a6f640c079e679848272af56c5021dc5aa216',
      'd0145f2e2f49396aa3fa0fc15b526f455e04983042b2d53002a76d9a708aeb45',
    ],
  },
} as const;

export const NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES = [
  {
    listingKind: 'EVENT' as const,
    title: 'New York City',
    officialActionUrl: NEAAU_NEW_YORK_CITY_REGISTRATION_URL,
    sourceUrl: NEAAU_NEW_YORK_CITY_URL,
    organizerName: 'NEAAU Volleyball',
    sportName: 'Volleyball',
    formatLabel: 'AAU Open Series club volleyball event',
    city: 'New York City, NY',
    venueName: 'Javits on the Hudson (The Javits Center)',
    address: null,
    startsAt: '2027-03-12T00:00:00-05:00',
    endsAt: '2027-03-14T23:59:00-04:00',
    timeZone: 'America/New_York',
    scheduleText: 'March 12-14, 2027. The stored page publishes the three event dates but does not list individual game times.',
    dateDisplayMode: 'SCHEDULED' as const,
    dateDisplayText: 'March 12-14, 2027',
    ageGroup: 'Girls 12-18; Boys 14-18',
    participantOptionsText: 'Club volleyball teams; seven-game guarantee',
    priceText: '$995 per team',
    statusText: 'Registration opens September 1, 2026 at 12:00 PM ET on SportWrench.',
    description: NEAAU_NEW_YORK_CITY_EVENT_DESCRIPTION,
    tags: ['Event', 'Volleyball', 'Tournament', 'Youth'],
    warnings: [
      'The source publishes event dates and venue but no individual game times; midnight and end-of-day timestamps represent the displayed date range only.',
      'The stored logo candidates are NYC Tourism, SportsEngine, and AAU marks, not a supportable NEAAU organization mark; logo disposition is MANUAL_REVIEW.',
      'No TEAM candidate is created because team mappings are out of scope.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEAAU_NEW_YORK_CITY_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NEAAU_NEW_YORK_CITY_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York City' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEAAU_NEW_YORK_CITY_REGISTRATION_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEAAU_NEW_YORK_CITY_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'NEAAU Volleyball' },
    sportName: { selector: 'body', mode: 'literal', value: 'Volleyball' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'AAU Open Series club volleyball event' },
    city: { selector: 'body', mode: 'literal', value: 'New York City, NY' },
    venueName: { selector: 'body', mode: 'literal', value: 'Javits on the Hudson (The Javits Center)' },
    startsAt: { selector: 'body', mode: 'literal', value: '2027-03-12T00:00:00-05:00' },
    endsAt: { selector: 'body', mode: 'literal', value: '2027-03-14T23:59:00-04:00' },
    scheduleText: { selector: 'body', mode: 'literal', value: 'March 12-14, 2027. The stored page publishes the three event dates but does not list individual game times.' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    dateDisplayText: { selector: 'body', mode: 'literal', value: 'March 12-14, 2027' },
    ageGroup: { selector: 'body', mode: 'literal', value: 'Girls 12-18; Boys 14-18' },
    participantOptionsText: { selector: 'body', mode: 'literal', value: 'Club volleyball teams; seven-game guarantee' },
    priceText: { selector: 'body', mode: 'literal', value: '$995 per team' },
    statusText: { selector: 'body', mode: 'literal', value: 'Registration opens September 1, 2026 at 12:00 PM ET on SportWrench.' },
    description: { selector: 'body', mode: 'literal', value: NEAAU_NEW_YORK_CITY_EVENT_DESCRIPTION },
    tagText: { selector: 'body', mode: 'literal', value: 'Event, Volleyball, Tournament, Youth' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: NEAAU_NEW_YORK_CITY_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/neaauNewYorkCity.html');

export const NEAAU_NEW_YORK_CITY_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:17:43.453Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
