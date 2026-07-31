import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  HARVEY_HOCKEY_CAMP_MAPPING,
  HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE,
  HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT,
  HARVEY_HOCKEY_CAMP_URL,
} from '../harveyHockeyCampSource';

describe('Harvey hockey camp source', () => {
  it('emits the review-only program and ongoing 2026 event', async () => {
    const mapping = parseAffiliateScrapeMapping(HARVEY_HOCKEY_CAMP_MAPPING);
    const page = await HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: HARVEY_HOCKEY_CAMP_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Colton Orr Harvey Hockey Summer Camp' }));
    expect(candidates[1]).toEqual(expect.objectContaining({
      listingKind: 'EVENT',
      title: 'Colton Orr Harvey Hockey Summer Camp 2026',
      dateDisplayMode: 'ONGOING',
      startsAt: '2026-07-27T08:30:00-04:00',
      priceText: '$800 cash weekly rate; $824 credit-card weekly rate',
    }));
  });

  it('preserves stored provenance and is duplicate-safe', async () => {
    expect(HARVEY_HOCKEY_CAMP_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '36f8beb8-27b8-4a7e-8e9a-e944d3159633',
      runId: 'c3adc29f-c5dc-4453-a6d9-b5c170adf021',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(HARVEY_HOCKEY_CAMP_MAPPING);
    const first = await HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: HARVEY_HOCKEY_CAMP_URL });
    const second = await HARVEY_HOCKEY_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: HARVEY_HOCKEY_CAMP_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
