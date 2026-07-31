import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  CENTRAL_PARK_TENNIS_CLASSES_URL,
  CENTRAL_PARK_TENNIS_HOME_URL,
  CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES,
  CENTRAL_PARK_TENNIS_MAPPING,
  CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE,
} from '../centralParkTennisCenterSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Central Park Tennis Center source', () => {
  it('emits one ongoing CLUB profile and withholds stale/unchecked event and rental rows', () => {
    expect(parseAffiliateScrapeMapping(CENTRAL_PARK_TENNIS_MAPPING).kind).toBe('CLUB');
    expect(CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({
        listingKind: 'CLUB',
        title: 'Central Park Tennis Center',
        dateDisplayMode: 'ONGOING',
        officialActionUrl: CENTRAL_PARK_TENNIS_CLASSES_URL,
        venueName: 'Central Park Tennis Center',
      }),
    ]);
    expect(CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('past as of 2026-07-31'),
      expect.stringContaining('Seasonal locker rentals are not treated'),
    ]));
  });

  it('preserves allowed-home provenance and current program detail without inventing dates', () => {
    expect(CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '288e2aad-b581-495b-9ce3-d99bce6c3c0d',
      runId: '8de41860-2003-4542-8e4d-3ad61b6b9010',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: CENTRAL_PARK_TENNIS_HOME_URL, role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.centralparktenniscenter.com/pages/future-class-schedule', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    ]));
    expect(CENTRAL_PARK_TENNIS_MANUAL_CANDIDATES[0].scheduleText).toEqual(expect.stringContaining('Adult Mid-Summer 2026 six-week packages'));
    const extracted = extractAffiliateCandidatesFromPage({ url: CENTRAL_PARK_TENNIS_HOME_URL, finalUrl: CENTRAL_PARK_TENNIS_HOME_URL, statusCode: 200, body: '', fetchedAt: CENTRAL_PARK_TENNIS_SOURCE_EVIDENCE.capturedAt }, CENTRAL_PARK_TENNIS_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', officialActionUrl: CENTRAL_PARK_TENNIS_CLASSES_URL, sourceUrl: CENTRAL_PARK_TENNIS_HOME_URL }));
  });
});
