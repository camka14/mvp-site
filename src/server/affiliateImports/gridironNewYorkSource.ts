import type { AffiliateScrapeMapping, ScrapePageClient } from './types';

export const GRIDIRON_NEW_YORK_URL = 'https://gridironfb.com/pages/gridiron-new-york';
export const GRIDIRON_NEW_YORK_REGISTRATION_URL = 'https://portal.gridironfb.com/';
export const GRIDIRON_NEW_YORK_TERMS_URL = 'https://gridironfb.com/policies/terms-of-service';
export const GRIDIRON_NEW_YORK_ADDRESS = 'Macombs Dam Park, E 157th St & W 161st St, Bronx, NY 10451';
export const GRIDIRON_NEW_YORK_LOGO_URL =
  'https://gridironfb.com/cdn/shop/files/Gridiron_Logos_-_Print_-_Icon_-_Transparent_-_Dk_Charcoal.png?v=1742497267&width=4846';
export const GRIDIRON_NEW_YORK_DESCRIPTION =
  'Gridiron New York offers youth 5v5 flag football and 7v7 football programs in New York. Its public program page covers seasonal league play and tournaments for youth athletes, with official registration through the Gridiron portal.';

export const GRIDIRON_NEW_YORK_MANUAL_CANDIDATES = [
  {
    listingKind: 'CLUB' as const,
    title: 'Gridiron New York',
    officialActionUrl: GRIDIRON_NEW_YORK_REGISTRATION_URL,
    sourceUrl: GRIDIRON_NEW_YORK_URL,
    organizerName: 'Gridiron Football',
    sportName: 'Football',
    formatLabel: 'Youth 5v5 flag and 7v7 football',
    city: 'Bronx, NY',
    venueName: 'Macombs Dam Park',
    address: GRIDIRON_NEW_YORK_ADDRESS,
    skillLevel: 'Recreational and competitive',
    ageGroup: 'Youth 4U-17U',
    divisionText: 'Current New York programs list 11U, 13U, 15U, and 17U divisions',
    tags: ['Club', 'League', 'Tournament', 'Youth', 'Flag Football'],
    dateDisplayMode: 'ONGOING' as const,
    dateDisplayText: 'Seasonal youth football programs',
    scheduleText:
      'The official New York page lists seasonal 5v5 and 7v7 programs. Follow the official registration portal for current availability and registration state.',
    participantOptionsText:
      'The source supports individual player registration and full or partial team registration, depending on the program.',
    statusText: 'Summer and fall league registration is advertised as open on the captured public page.',
    description: GRIDIRON_NEW_YORK_DESCRIPTION,
    warnings: [
      'The captured Bronx 5v5 season lists September 26-November 21 but does not state a year, so it is not published as a scheduled event.',
      'The captured Boogie Down 7v7 Tournament lists July 19 without a year, so it is withheld rather than assigned an inferred date.',
      'The captured Elite 7s Indoor Tournament lists January 3 without a year, so it is withheld rather than assigned an inferred date.',
      'Program prices are retained in source review notes and are not assigned to this club candidate because they vary by program, timing, and player/team registration.',
      'The normal local Google geocoding path returned no coordinates for the official Macombs Dam Park address; the address is retained and coordinates are not fabricated.',
    ],
  },
] satisfies NonNullable<AffiliateScrapeMapping['manualCandidates']>;

export const GRIDIRON_NEW_YORK_MAPPING: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: GRIDIRON_NEW_YORK_URL,
  itemSelector: 'body',
  fields: {
    title: { selector: 'body', mode: 'literal', value: 'Gridiron New York' },
    officialActionUrl: { selector: 'body', mode: 'literal', value: GRIDIRON_NEW_YORK_REGISTRATION_URL },
  },
  dedupe: { fields: ['officialActionUrl', 'title', 'startsAt'] },
  manualCandidates: GRIDIRON_NEW_YORK_MANUAL_CANDIDATES,
};

export const GRIDIRON_NEW_YORK_STATIC_PAGE_CLIENT: ScrapePageClient = {
  async fetchPage(params) {
    return {
      url: params.url,
      finalUrl: params.url,
      statusCode: 200,
      fetchedAt: new Date().toISOString(),
      body: '<!doctype html><html><body><main>Gridiron New York reviewed public source.</main></body></html>',
    };
  },
};
