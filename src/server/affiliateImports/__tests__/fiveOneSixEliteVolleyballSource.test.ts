import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  FIVE_ONE_SIX_ELITE_HOME_URL,
  FIVE_ONE_SIX_ELITE_MAPPING,
  FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE,
  FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT,
} from '../fiveOneSixEliteVolleyballSource';

describe('516 Elite Volleyball source', () => {
  it('emits one ongoing club and withholds unchecked team and program inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(FIVE_ONE_SIX_ELITE_MAPPING);
    const page = await FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT.fetchPage({ url: FIVE_ONE_SIX_ELITE_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: '516 Elite Volleyball',
      officialActionUrl: FIVE_ONE_SIX_ELITE_HOME_URL,
      sportName: 'Volleyball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(FIVE_ONE_SIX_ELITE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'f7e99805-40b3-4be1-9de5-c7ff5579c004',
      runId: 'c2f32c8b-b7e5-4e78-b45c-ff4f903d7e08',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(FIVE_ONE_SIX_ELITE_MAPPING);
    const first = await FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT.fetchPage({ url: FIVE_ONE_SIX_ELITE_HOME_URL });
    const second = await FIVE_ONE_SIX_ELITE_STATIC_PAGE_CLIENT.fetchPage({ url: FIVE_ONE_SIX_ELITE_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
