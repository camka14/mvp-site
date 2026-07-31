import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  ISLAND_FASTPITCH_HOME_URL,
  ISLAND_FASTPITCH_MAPPING,
  ISLAND_FASTPITCH_SOURCE_EVIDENCE,
  ISLAND_FASTPITCH_STATIC_PAGE_CLIENT,
} from '../islandFastpitchSource';

describe('Island Fastpitch source', () => {
  it('emits one ongoing club and withholds unchecked event inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(ISLAND_FASTPITCH_MAPPING);
    const page = await ISLAND_FASTPITCH_STATIC_PAGE_CLIENT.fetchPage({ url: ISLAND_FASTPITCH_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Island Fastpitch',
      officialActionUrl: ISLAND_FASTPITCH_HOME_URL,
      sportName: 'Softball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(ISLAND_FASTPITCH_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '2ce484c8-7d54-4e9c-adde-dd98013a5188',
      runId: 'cfdb3d9b-a9df-4677-b9ba-10477396e61b',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(ISLAND_FASTPITCH_MAPPING);
    const first = await ISLAND_FASTPITCH_STATIC_PAGE_CLIENT.fetchPage({ url: ISLAND_FASTPITCH_HOME_URL });
    const second = await ISLAND_FASTPITCH_STATIC_PAGE_CLIENT.fetchPage({ url: ISLAND_FASTPITCH_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
