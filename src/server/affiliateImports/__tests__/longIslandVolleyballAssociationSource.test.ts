import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  LONG_ISLAND_VOLLEYBALL_HOME_URL,
  LONG_ISLAND_VOLLEYBALL_MAPPING,
  LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE,
  LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT,
} from '../longIslandVolleyballAssociationSource';

describe('Long Island Volleyball Association source', () => {
  it('emits one ongoing club and withholds unchecked league inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(LONG_ISLAND_VOLLEYBALL_MAPPING);
    const page = await LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: LONG_ISLAND_VOLLEYBALL_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Long Island Volleyball Association',
      sportName: 'Volleyball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(LONG_ISLAND_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '1b19742e-069b-4683-b81b-212061a05d3d',
      runId: 'b0280a90-39d6-4e03-9b4f-5b558a2442bc',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(LONG_ISLAND_VOLLEYBALL_MAPPING);
    const first = await LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: LONG_ISLAND_VOLLEYBALL_HOME_URL });
    const second = await LONG_ISLAND_VOLLEYBALL_STATIC_PAGE_CLIENT.fetchPage({ url: LONG_ISLAND_VOLLEYBALL_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
