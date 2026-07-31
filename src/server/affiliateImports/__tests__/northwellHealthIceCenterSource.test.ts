import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NORTHWELL_ICE_CENTER_HOCKEY_URL,
  NORTHWELL_ICE_CENTER_MAPPING,
  NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE,
  NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT,
} from '../northwellHealthIceCenterSource';

describe('Northwell Health Ice Center source', () => {
  it('emits one ongoing club and withholds unchecked program inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(NORTHWELL_ICE_CENTER_MAPPING);
    const page = await NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NORTHWELL_ICE_CENTER_HOCKEY_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Northwell Health Ice Center',
      officialActionUrl: NORTHWELL_ICE_CENTER_HOCKEY_URL,
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves allowed-page provenance and duplicate-safe extraction', async () => {
    expect(NORTHWELL_ICE_CENTER_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '575d4d07-1a6a-47a3-a574-1a2891175f58',
      runId: 'e263e77d-93a1-437d-90a3-78f138c4d5be',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NORTHWELL_ICE_CENTER_MAPPING);
    const first = await NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NORTHWELL_ICE_CENTER_HOCKEY_URL });
    const second = await NORTHWELL_ICE_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NORTHWELL_ICE_CENTER_HOCKEY_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
