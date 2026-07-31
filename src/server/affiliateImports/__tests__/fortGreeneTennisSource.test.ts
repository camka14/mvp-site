import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import { FORT_GREENE_TENNIS_EVENTS_URL, FORT_GREENE_TENNIS_MANUAL_CANDIDATES, FORT_GREENE_TENNIS_MAPPING, FORT_GREENE_TENNIS_SOURCE_EVIDENCE } from '../fortGreeneTennisSource';

describe('Fort Greene Tennis Association source', () => {
  it('emits only complete current and future EVENT rows from the allowed listing', () => {
    expect(parseAffiliateScrapeMapping(FORT_GREENE_TENNIS_MAPPING).kind).toBe('EVENT');
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES).toHaveLength(3);
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES.map((candidate) => candidate.title)).toEqual([
      'Singles Tournament 2026',
      'Doubles Tournament 2026',
      'Ladder Tournament 2026',
    ]);
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES.every((candidate) => candidate.listingKind === 'EVENT')).toBe(true);
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ dateDisplayMode: 'ONGOING', dateDisplayText: 'Ongoing Jul 25-Aug 2, 2026' }));
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES.map((candidate) => candidate.startsAt)).toEqual([
      '2026-07-25T08:00:00-04:00',
      '2026-09-19T08:00:00-04:00',
      '2026-10-03T08:00:00-04:00',
    ]);
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES.every((candidate) => candidate.officialActionUrl.startsWith('https://www.fortgreenetennis.org/events/'))).toBe(true);
  });

  it('preserves venue, timezone, stored provenance, and unchecked-page boundaries', () => {
    expect(FORT_GREENE_TENNIS_MANUAL_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({ venueName: 'Fort Greene Tennis Courts', address: '136 Dekalb Ave NY, 11217 United States', timeZone: 'America/New_York' }),
    ]));
    expect(FORT_GREENE_TENNIS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7ac9e2ac-7541-463a-98c1-9144f8df5e18',
      runId: '23be8f6e-13a9-4b72-8152-86dca3cf168f',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(FORT_GREENE_TENNIS_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.fortgreenetennis.org/events', role: 'LISTING', robotsStatus: 'ALLOWED' },
      { url: 'https://www.fortgreenetennis.org/events/2025/singles-tournament-hga8c', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({ url: FORT_GREENE_TENNIS_EVENTS_URL, finalUrl: FORT_GREENE_TENNIS_EVENTS_URL, statusCode: 200, body: '', fetchedAt: FORT_GREENE_TENNIS_SOURCE_EVIDENCE.capturedAt }, FORT_GREENE_TENNIS_MAPPING);
    expect(extracted.map((candidate) => candidate.timeZone)).toEqual(['America/New_York', 'America/New_York', 'America/New_York']);
  });
});
