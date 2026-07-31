import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import {
  SOCCER_COLISEUM_MANUAL_CANDIDATES,
  SOCCER_COLISEUM_MAPPING,
  SOCCER_COLISEUM_SCHEDULE_URL,
  SOCCER_COLISEUM_SOURCE_EVIDENCE,
} from '../soccerColiseumSource';
import { parseAffiliateScrapeMapping } from '../types';

describe('Soccer Coliseum source', () => {
  it('emits one profile and withholds the explicitly previous tournament schedule', () => {
    expect(parseAffiliateScrapeMapping(SOCCER_COLISEUM_MAPPING).kind).toBe('CLUB');
    expect(SOCCER_COLISEUM_MANUAL_CANDIDATES).toHaveLength(1);
    expect(SOCCER_COLISEUM_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'The Soccer Coliseum',
      city: 'Teaneck, NJ',
      venueName: 'Teaneck Armory, NJ',
      address: null,
    }));
    expect(SOCCER_COLISEUM_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('previous Winter season'),
    ]));
  });

  it('preserves allowed-schedule provenance and duplicate-safe extraction', () => {
    expect(SOCCER_COLISEUM_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'e53d8d60-ec60-4b7b-a8b4-6a18c05e5670',
      runId: '446e15cf-0277-4a42-9317-96a06c5f627f',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(SOCCER_COLISEUM_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: SOCCER_COLISEUM_SCHEDULE_URL, role: 'LISTING', robotsStatus: 'ALLOWED' },
    ]));
    const extracted = extractAffiliateCandidatesFromPage({
      url: SOCCER_COLISEUM_SCHEDULE_URL,
      finalUrl: SOCCER_COLISEUM_SCHEDULE_URL,
      statusCode: 200,
      body: '',
      fetchedAt: SOCCER_COLISEUM_SOURCE_EVIDENCE.capturedAt,
    }, SOCCER_COLISEUM_MAPPING);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'The Soccer Coliseum' }));
  });
});
