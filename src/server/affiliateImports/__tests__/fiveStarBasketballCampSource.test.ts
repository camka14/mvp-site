import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  FIVE_STAR_BASKETBALL_CAMP_AOG_URL,
  FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES,
  FIVE_STAR_BASKETBALL_CAMP_MAPPING,
  FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES,
  FIVE_STAR_BASKETBALL_CAMP_NBPA_URL,
  FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE,
} from '../fiveStarBasketballCampSource';

describe('Five-Star Basketball Camp source', () => {
  it('emits one organization profile and two future EVENT rows from the allowed homepage summary', () => {
    expect(parseAffiliateScrapeMapping(FIVE_STAR_BASKETBALL_CAMP_MAPPING).kind).toBe('EVENT');
    expect(FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES).toHaveLength(3);
    expect(FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Five-Star Basketball Camp', dateDisplayMode: 'ONGOING' }));
    expect(FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES.map((candidate) => candidate.title)).toEqual([
      'Five-Star Basketball Camp x AOG High Academic Showcase',
      'NBPA x Five-Star Summer Basketball Camp',
    ]);
    expect(FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES.map((candidate) => candidate.startsAt)).toEqual([
      '2026-08-18T00:00:00-04:00',
      '2026-08-24T00:00:00-04:00',
    ]);
    expect(FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES.map((candidate) => candidate.officialActionUrl)).toEqual([
      FIVE_STAR_BASKETBALL_CAMP_AOG_URL,
      FIVE_STAR_BASKETBALL_CAMP_NBPA_URL,
    ]);
    expect(FIVE_STAR_BASKETBALL_CAMP_MANUAL_CANDIDATES.every((candidate) => candidate.listingKind !== 'TEAM')).toBe(true);
  });

  it('preserves stored provenance, official logo source, locations, and date-only boundary warning', () => {
    expect(FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7a60c22d-04bf-401e-a64f-83aaaa32483c',
      runId: 'b3784110-38ee-4089-b543-992e23ad2ab7',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.fivestarbasketball.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.fivestarbasketball.com/post/nbpa-x-five-star-basketball-camp-nyc-2023', role: 'DETAIL', robotsStatus: 'UNCHECKED' },
    ]));
    expect(FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({ venueName: 'Major Owens Center', address: '1561 Bedford Ave, Brooklyn, NY 11225', timeZone: 'America/New_York' }),
      expect.objectContaining({ venueName: 'Basketball City Pier 36', address: 'Basketball City Pier 36, New York City, NY' }),
    ]));
    expect(FIVE_STAR_BASKETBALL_CAMP_EVENT_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('date-boundary')]));
    const extracted = extractAffiliateCandidatesFromPage({ url: 'https://www.fivestarbasketball.com/', finalUrl: 'https://www.fivestarbasketball.com/', statusCode: 200, body: '', fetchedAt: FIVE_STAR_BASKETBALL_CAMP_SOURCE_EVIDENCE.capturedAt }, FIVE_STAR_BASKETBALL_CAMP_MAPPING);
    expect(extracted).toHaveLength(3);
    expect(extracted.map((candidate) => candidate.officialActionUrl)).toEqual([
      'https://www.fivestarbasketball.com/',
      FIVE_STAR_BASKETBALL_CAMP_AOG_URL,
      FIVE_STAR_BASKETBALL_CAMP_NBPA_URL,
    ]);
  });
});
