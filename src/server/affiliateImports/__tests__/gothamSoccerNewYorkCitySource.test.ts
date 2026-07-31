import { parseAffiliateScrapeMapping } from '../types';
import { GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL, GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING, GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES, GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE } from '../gothamSoccerNewYorkCitySource';

describe('Gotham Soccer New York City affiliate source', () => {
  it('emits one ongoing CLUB candidate and no team rows', () => {
    expect(parseAffiliateScrapeMapping(GOTHAM_SOCCER_NEW_YORK_CITY_MAPPING).kind).toBe('CLUB');
    expect(GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'Gotham Soccer New York City', officialActionUrl: GOTHAM_SOCCER_NEW_YORK_CITY_LIST_URL, dateDisplayMode: 'ONGOING' })]);
    expect(GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('dated event detail')]));
    expect(GOTHAM_SOCCER_NEW_YORK_CITY_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });
  it('preserves stored live provenance', () => {
    expect(GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '09b168d8-7b49-467a-a5c0-bd86a5a623d5', runId: 'ad0cbe2a-cf97-41d4-b09b-1b22c84c9960', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(GOTHAM_SOCCER_NEW_YORK_CITY_SOURCE_EVIDENCE.artifacts.logoCandidate).toMatch(/^[a-f0-9]{64}$/);
  });
});
