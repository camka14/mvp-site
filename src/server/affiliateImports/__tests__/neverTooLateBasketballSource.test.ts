import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NEVER_TOO_LATE_HOME_URL,
  NEVER_TOO_LATE_MAPPING,
  NEVER_TOO_LATE_SOURCE_EVIDENCE,
  NEVER_TOO_LATE_STATIC_PAGE_CLIENT,
} from '../neverTooLateBasketballSource';

describe('Never Too Late Basketball source', () => {
  it('emits the club and two future camp events while excluding the finished Portland row', async () => {
    const mapping = parseAffiliateScrapeMapping(NEVER_TOO_LATE_MAPPING);
    const page = await NEVER_TOO_LATE_STATIC_PAGE_CLIENT.fetchPage({ url: NEVER_TOO_LATE_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.listingKind)).toEqual(['CLUB', 'EVENT', 'EVENT']);
    expect(candidates[0]).toEqual(expect.objectContaining({ title: 'Never Too Late Basketball', city: 'New York City, NY' }));
    expect(candidates.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Never Too Late Basketball Weekend Camp — Santa Barbara, CA (Fall)', dateDisplayMode: 'SCHEDULED', priceText: '$695.00' }),
      expect.objectContaining({ title: 'Never Too Late Basketball Weekend Camp — North Adams, MA (Berkshires)', dateDisplayMode: 'SCHEDULED', priceText: '$695.00' }),
    ]));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(NEVER_TOO_LATE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '45a5d9c2-181b-47ed-bbef-9ace27b85fe8',
      runId: '161a28fb-ecde-4b53-996e-f58b20d289b9',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NEVER_TOO_LATE_MAPPING);
    const first = await NEVER_TOO_LATE_STATIC_PAGE_CLIENT.fetchPage({ url: NEVER_TOO_LATE_HOME_URL });
    const second = await NEVER_TOO_LATE_STATIC_PAGE_CLIENT.fetchPage({ url: NEVER_TOO_LATE_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
