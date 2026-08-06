import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  HOUSE_OF_SPORTS_NY_MAPPING,
  HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE,
  HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT,
  HOUSE_OF_SPORTS_NY_TRYOUT_URL,
} from '../houseOfSportsNyVolleyballSource';

describe('House of Sports NY volleyball source', () => {
  it('emits all 22 dated 2026 tryout events from stored registration evidence', async () => {
    const mapping = parseAffiliateScrapeMapping(HOUSE_OF_SPORTS_NY_MAPPING);
    const page = await HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT.fetchPage({ url: HOUSE_OF_SPORTS_NY_TRYOUT_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(22);
    expect(candidates.every((candidate) => candidate.listingKind === 'EVENT')).toBe(true);
    expect(candidates.filter((candidate) => candidate.dateDisplayText === 'August 23, 2026')).toHaveLength(11);
    expect(candidates.filter((candidate) => candidate.dateDisplayText === 'August 30, 2026')).toHaveLength(11);
    expect(candidates[0]).toEqual(expect.objectContaining({
      title: 'House of Sports NY 12U Regional Team Tryout',
      startsAt: '2026-08-23T13:00:00.000Z',
      dateDisplayMode: 'SCHEDULED',
    }));
  });

  it('preserves allowed-page provenance and duplicate-safe extraction', async () => {
    expect(HOUSE_OF_SPORTS_NY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '580c1702-77d0-4bd1-b15a-e41bfce148cd',
      runId: '331f8261-d71b-4bb6-80e3-9665f6cd8664',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(HOUSE_OF_SPORTS_NY_MAPPING);
    const first = await HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT.fetchPage({ url: HOUSE_OF_SPORTS_NY_TRYOUT_URL });
    const second = await HOUSE_OF_SPORTS_NY_STATIC_PAGE_CLIENT.fetchPage({ url: HOUSE_OF_SPORTS_NY_TRYOUT_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
