import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES,
  BIG_LEAGUE_ULTIMATE_MAPPING,
  BIG_LEAGUE_ULTIMATE_REGISTER_URL,
  BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE,
  BIG_LEAGUE_ULTIMATE_URL,
} from '../bigLeagueUltimateFrisbeeSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Big League Ultimate Frisbee source', () => {
  it('emits the current Summer 2026 event and withholds the completed spring row', () => {
    expect(parseAffiliateScrapeMapping(BIG_LEAGUE_ULTIMATE_MAPPING).kind).toBe('EVENT');
    expect(BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES).toHaveLength(1);
    expect(BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'EVENT',
      title: '2026 Summer Westchester Ultimate Frisbee (Tues)',
      startsAt: null,
      endsAt: null,
      dateDisplayMode: 'ONGOING',
      officialActionUrl: BIG_LEAGUE_ULTIMATE_REGISTER_URL,
    }));
    expect(BIG_LEAGUE_ULTIMATE_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('no time, end date, venue, address, or price'),
    ]));
  });

  it('preserves allowed-listing provenance and duplicate-safe extraction', () => {
    expect(BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '8d45b719-ac4f-4603-8841-13f357ddc57e',
      runId: '2a4917da-99b5-40a8-b7c1-2f2454150e12',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: BIG_LEAGUE_ULTIMATE_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: BIG_LEAGUE_ULTIMATE_URL,
      finalUrl: BIG_LEAGUE_ULTIMATE_URL,
      statusCode: 200,
      body: '',
      fetchedAt: BIG_LEAGUE_ULTIMATE_SOURCE_EVIDENCE.capturedAt,
    }, BIG_LEAGUE_ULTIMATE_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'EVENT', title: '2026 Summer Westchester Ultimate Frisbee (Tues)' }));
  });
});
