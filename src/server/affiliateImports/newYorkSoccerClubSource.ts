import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const NEW_YORK_SOCCER_CLUB_HOME_URL = 'https://newyorksoccerclub.org/';
export const NEW_YORK_SOCCER_CLUB_ABOUT_URL = 'https://newyorksoccerclub.org/about';
export const NEW_YORK_SOCCER_CLUB_FACILITIES_URL = 'https://newyorksoccerclub.org/facilities';
export const NEW_YORK_SOCCER_CLUB_PROGRAMS_URL = 'https://newyorksoccerclub.org/programs';
export const NEW_YORK_SOCCER_CLUB_TRYOUTS_URL = 'https://newyorksoccerclub.org/tryouts';
export const NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL =
  'https://newyorksoccerclub.org/2026/07/27/ball-mastery-youth-development-series';
export const NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL =
  'https://newyorksoccerclub.org/2026/07/27/fall-youth-development';
export const NEW_YORK_SOCCER_CLUB_LOGO_SOURCE_URL =
  'https://newyorksoccerclub.org/wp-content/uploads/2021/09/3D-LogoNEW-01.svg';
export const NEW_YORK_SOCCER_CLUB_ADDRESS = '2900 Purchase St, Purchase NY 10577';
export const NEW_YORK_SOCCER_CLUB_VENUE = 'Ophir Field at Manhattanville College';
export const NEW_YORK_SOCCER_CLUB_TIME_ZONE = 'America/New_York';

export const NEW_YORK_SOCCER_CLUB_ORG_DESCRIPTION =
  'Founded in 2009, New York Soccer Club is a youth and amateur soccer club based in Westchester County, NY, USA. New York Soccer Club is a member of MLS Next and Girls Academy League.';

export const NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE = {
  schemaVersion: 1,
  evidenceSystem: 'AffiliateSourceIntakes',
  environment: 'live',
  intakeId: 'f07e3962-0c54-4fcb-9639-015fb7eed892',
  intakeSourceKey: 'new-york-new-york-metropolitan-area-new-york-soccer-club-newyorksoccerclub-org',
  intakeName: 'New York Soccer Club',
  baseUrl: 'https://newyorksoccerclub.org',
  complianceStatus: 'ALLOWED',
  runId: '864f7893-4d83-4bf3-8ad9-4235046c25f9',
  runStatus: 'SUCCEEDED',
  provider: 'SCRAPINGDOG',
  capturedAt: '2026-07-29T19:48:20.438Z',
  pages: [
    { url: NEW_YORK_SOCCER_CLUB_HOME_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_SOCCER_CLUB_ABOUT_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/category/latest-news', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_SOCCER_CLUB_FACILITIES_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/nysc-news', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/pathway', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/pathway/career-services', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/shop', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/staff', role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL, role: 'DETAIL', robotsStatus: 'ALLOWED' },
    { url: 'https://newyorksoccerclub.org/programs', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    { url: NEW_YORK_SOCCER_CLUB_TRYOUTS_URL, role: 'REGISTRATION', robotsStatus: 'UNCHECKED' },
  ],
  artifacts: {
    discoveredUrls: 'e30d9d4685fcf977448202b78f481ada466d8dbc5f4b2ddef56a4874ac959e71',
    pageBranding: [
      '4d146e0ef04cb6c5dcaeb3754d8913cf0b2dfb18d9711d32a41d6fafc71de059',
      '84db3add8009ae5c3c3d092ed0d7833f6f80c9f3d9e91245a4466baef228fc87',
      '374c82001c601411b6d956c2b971bd916f10db7ff74ee30f4ce730a4b3a46aa9',
    ],
    pageHtml: [
      '76f9e10456ae7cf296655449baef48123696f24d72c780fc44547c52d4298e0e',
      '2ad546129d7eba85551c8e0cc1eead71d1d6810e1589fdbe2850bcde4821fc0e',
      'feecdc1b1ce90bbf5f84132b78196e5db7beb1cae445d5672ee789bd7858cda0',
      '7532f36807d76ac29c4a4cf61f90cc2b8087c7caf05450ecf358fa82ff54ecbe',
      '5173c98fe7c1e3063beaae88fe7a038e7b30080b7b5e35c13afccf8eeb4dfff9',
      '410b5f55931f3bdae689ce4b8f4937ed10997e021754385e62b59a1681a6d028',
      '6269b509a3efef567c602b1af0f8a6cb2fe6b021d8688fe7426f152e3061d88c',
      '21318ecf8991d470e49e604571a8ce00984ea5c8cf6536049a63a8b804f21a9e',
      '22251a00cd5aa620eb67116ba492cd6789d37da9bc316a9dbddaee8ce688d7d8',
      '7b10082615772bd70dc070d132c0bf1e67251b52d1d6a550861bda86b814ef4f',
    ],
    pageImages: [
      '84a2310652b70b4c65d7e37ca41a3724a3525164d81145f0e9010e582551f5ab',
      '299ed5fa256313eb116c0889210a21c44ba7f2fde73a70884e3e17f48d3c6532',
      'ef73211db6a3e2bf435758a63bb618ab692cb93700b12596d366ed1283d13dc8',
      '6c62681a849a1608ecdb2c4415544995bd02d0d32c518a6c4840a87075d650e3',
      'bb98d242f5e78442a4b534d9cfaf87015d47aeb0cfb8177b43cb1cb104f5ad6d',
      'c2da9d369b7c2ba2521f690b976bfe51ec60dfaf64129acd7ddf5c5b3cce3a57',
      '1c089d82536e68340a6613ac9bcb6876a1605ac15778535729d19dec6845a81d',
      '509213b5cab08ec36616eaa8d06b760916dc5c36dd0ab99db2cb9a93ec28d09d',
      '6d3527808757c7ce6873bebd341e997d15f0d4206ff2bf1715d9d6af042c996f',
      '39bb5dfdb7edc02f5cebf3cb0c4b8d64dd139642121000a8f7588d67eff0c285',
    ],
    pageLinks: [
      'e88e29c21062d28c303d85961030c37b29e1eef14cd98f64e7b20696d83b6762',
      '96a245bac2e6c70c6c5de5290eb7e718870aeed0871bcd4eb0b127d809aa66e3',
      '1512cff535a01db8b8ba58aff05094f16f71377c450425be30a01f3ca5b3feec',
      '197ba2d39f43979924ac69287d0eb9f4a67bccad0befc66a518a2b3dd85a0505',
      '00b2ec6c4c0e49ba9d44bc272b7b99a0fcd939d276741eef82d85abe7ab28bfb',
      '4682af272f56d25bdb37f3dc4e3382731af0ae659174f6714f912c7813467d75',
      '410f112dfdef31f76a3fba8803c8a2813ed023190adef83c1e2b06f4d6a1bb43',
      '37d75008d0d020ba2381e005abb0748db230196cdc8c2ffabb35d1b5ea572e48',
      '78d73e835eeaae44bee5e0d3c24c342c9156024425b3c408c183b770639b6790',
      '8198670a83c673b6373e7aad9e206947f9cf872e3277b6708619cf762e241f6f',
    ],
    pageMarkdown: [
      '3330cb27bd19525a18b8d5d76eb8df71fcb86657081d7f4cb3efd2a8ca38526c',
      'd1e3c64a6f54d1af515d5acc550e5379631ad6d5a8749c7f74a96f4a21be1a2f',
      '422283d4f2d2e89fb225693dd297faf24fe7f4670d87b7e45466a789f3b0e97e',
      'c99eb33ba8b30f7630116fd2323775f7b6d116026588049280bca82fa3dc330f',
      '7c14f1e2ae78c26adabdb5c68f54243457a4d46b748778816994bcb717c03e91',
      'c7a214b4ab74445ceccc0a88834709d85eefaab21f4d7ce160867113f6099f64',
      '1ce9c1095d78cb2bc3ecc06eb08d784c1133558cdf16c6d8404df5d5304c6806',
      '09ce808d1461ab334c6d59a74c8883a08fd9ae11be3b4622fa8e8b5e09d64b48',
      'd63f5760f0393ca5e81134d4b07629b387e5d71fe7e71fdb83f3df9e9a655562',
      '3b61047f9732cdfcfde9197fe7a6df2f11519d12e5b54b035f6567e88b6c313d',
    ],
    pageScreenshot: 'fa042d37cfdd97c9fd2ab7b754fd13f3c146ecf7a02c52606225fb2b722e6d86',
    mapRequest: '1bee9e95ba28df374eb1d36c5f1f072b5f0595611a5726fd95834e98a36e0180',
    mapResponse: '5e698757244529479db7dafc0281682aab66d8922519735fa31dfbba3ab457b1',
    robots: 'ff5d0a5f10383520b5ad3154070beec4d70ef5b8181a08f7b7bcc2a0c171c301',
    logoCandidates: {
      primary: '601472d1a82f65a3fc84e4325c8e3766fcae77137889c6c502fdb522c9cd6b01',
      alternate: 'f8d5db591f17a12e2c4dbc314557061e7f0a990bc79bad8c05f24e195f33609f',
      favicon: 'fae33737716a21c6eaee5514021feded3eeafd001db02ed7fef4040a18f2c5c5',
      allianceMark: '047338272e933b12b5b51e9a3cd23627b987fece43eb6917b7aaa55f74fa3587',
    },
  },
} as const;

const organizationCandidate = {
  listingKind: 'CLUB' as const,
  title: 'New York Soccer Club',
  officialActionUrl: NEW_YORK_SOCCER_CLUB_HOME_URL,
  sourceUrl: NEW_YORK_SOCCER_CLUB_ABOUT_URL,
  organizerName: 'New York Soccer Club',
  sportName: 'Soccer',
  formatLabel: 'Youth and amateur soccer club with MLS Next, Girls Academy League, EDP, and NYCFC-affiliate league teams',
  city: 'Purchase, NY',
  venueName: NEW_YORK_SOCCER_CLUB_VENUE,
  address: NEW_YORK_SOCCER_CLUB_ADDRESS,
  dateDisplayMode: 'ONGOING' as const,
  dateDisplayText: 'Youth and amateur soccer club programs',
  scheduleText: 'The stored official pages describe youth and amateur soccer club programs, MLS Next and Girls Academy League membership, EDP and NYCFC-affiliate league teams, and training at NYSC facilities.',
  statusText: 'Review-only club profile; team roster mappings remain out of scope.',
  description: NEW_YORK_SOCCER_CLUB_ORG_DESCRIPTION,
  tags: ['Club', 'Soccer', 'Youth', 'Training'],
  warnings: [
    'No TEAM candidate is created because team mappings are out of scope.',
    'Facility and address details are retained from the official Facilities and About pages; no separate RENTAL candidate is emitted because the stored evidence has no rental booking action.',
  ],
};

const ballMasteryCandidate = {
  listingKind: 'EVENT' as const,
  title: 'Ball Mastery Youth Development Series',
  officialActionUrl: NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
  sourceUrl: NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
  organizerName: 'New York Soccer Club',
  sportName: 'Soccer',
  formatLabel: 'Youth soccer clinic series',
  city: null,
  venueName: null,
  address: null,
  startsAt: '2026-09-10T17:00:00-04:00',
  endsAt: '2026-10-22T18:00:00-04:00',
  timeZone: NEW_YORK_SOCCER_CLUB_TIME_ZONE,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'September 10-October 22, 2026',
  scheduleText: 'The stored detail page lists Thursday sessions on September 10, September 17, September 24, October 8, October 15, and October 22, 2026, from 5:00 PM-6:00 PM. The source calls this a six-week series but does not list October 1.',
  ageGroup: 'Born 2013-2018',
  participantOptionsText: 'Youth players of all skill levels; registration with an NYSC coordinator.',
  statusText: 'Space is limited; the official page directs families to register with an NYSC coordinator.',
  description: 'New York Soccer Club’s Ball Mastery Youth Development Series is a six-session Thursday clinic focused on first touch, close control, change of direction, and confidence 1v1.',
  tags: ['Event', 'Soccer', 'Clinic', 'Youth'],
  warnings: [
    'The stored page lists six Thursday dates while describing a six-week series and does not list October 1; only the six source-stated dates are retained.',
    'The stored event detail does not publish a specific venue or price, so neither is assigned.',
  ],
};

const fallYouthDevelopmentCandidate = {
  listingKind: 'EVENT' as const,
  title: 'Fall Youth Development',
  officialActionUrl: NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  sourceUrl: NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  organizerName: 'New York Soccer Club',
  sportName: 'Soccer',
  formatLabel: 'Youth soccer development program',
  city: 'Purchase, NY',
  venueName: 'Ophir Field, Manhattanville University',
  address: NEW_YORK_SOCCER_CLUB_ADDRESS,
  startsAt: '2026-09-08T16:00:00-04:00',
  endsAt: '2026-10-29T17:00:00-04:00',
  timeZone: NEW_YORK_SOCCER_CLUB_TIME_ZONE,
  dateDisplayMode: 'SCHEDULED' as const,
  dateDisplayText: 'September 8-October 29, 2026',
  scheduleText: 'Tuesdays and Thursdays, September 8-October 29, 2026, from 4:00 PM-5:00 PM.',
  ageGroup: 'Born 2017-2022',
  participantOptionsText: 'Young players born 2017-2022; registration by contacting Alyssa Francese through the official page.',
  statusText: 'The stored official page directs families to contact Alyssa Francese to register.',
  description: 'New York Soccer Club’s Fall Youth Development program introduces players born 2017-2022 to soccer fundamentals over eight weeks of twice-weekly sessions at Ophir Field, Manhattanville University.',
  tags: ['Event', 'Soccer', 'Training', 'Youth'],
  warnings: [
    'The stored page publishes the date range, recurring days, time, age range, venue, and registration contact but no price or capacity.',
  ],
};

export const NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES = [
  organizationCandidate,
  ballMasteryCandidate,
  fallYouthDevelopmentCandidate,
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const NEW_YORK_SOCCER_CLUB_MAPPING: AffiliateScrapeMapping = {
  kind: 'EVENT',
  listUrl: NEW_YORK_SOCCER_CLUB_PROGRAMS_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'New York Soccer Club' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_SOCCER_CLUB_PROGRAMS_URL },
    sourceUrl: { selector: 'body', mode: 'literal', value: NEW_YORK_SOCCER_CLUB_HOME_URL },
    organizerName: { selector: 'body', mode: 'literal', value: 'New York Soccer Club' },
    sportName: { selector: 'body', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: 'body', mode: 'literal', value: 'Youth and amateur soccer club programs' },
    dateDisplayMode: { selector: 'body', mode: 'literal', value: 'SCHEDULED' },
    tagText: { selector: 'body', mode: 'literal', value: 'Club, Soccer, Youth, Training' },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES,
};

const FIXTURE_PATH = path.join(process.cwd(), 'src/server/affiliateImports/fixtures/newYorkSoccerClub.html');

export const NEW_YORK_SOCCER_CLUB_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: '2026-07-29T19:48:20.438Z',
      body: await readFile(FIXTURE_PATH, 'utf8'),
    };
  },
};
