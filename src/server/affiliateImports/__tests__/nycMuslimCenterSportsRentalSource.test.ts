import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NYC_MUSLIM_CENTER_BOOKING_URL,
  NYC_MUSLIM_CENTER_MAPPING,
  NYC_MUSLIM_CENTER_SOURCE_EVIDENCE,
  NYC_MUSLIM_CENTER_SPORTS_URL,
  NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT,
} from '../nycMuslimCenterSportsRentalSource';

describe('NYC Muslim Center sports rental source', () => {
  it('emits one ongoing rental link-out without inventing price or address', async () => {
    const mapping = parseAffiliateScrapeMapping(NYC_MUSLIM_CENTER_MAPPING);
    const page = await NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NYC_MUSLIM_CENTER_SPORTS_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      title: 'NYC Muslim Center Sports Rental',
      officialActionUrl: NYC_MUSLIM_CENTER_BOOKING_URL,
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves allowed-page provenance and duplicate-safe extraction', async () => {
    expect(NYC_MUSLIM_CENTER_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'b3201f69-d3ba-4c57-84e5-2da6e0728ed5',
      runId: '5b88e181-0971-49b8-ba61-3556aef4dc58',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NYC_MUSLIM_CENTER_MAPPING);
    const first = await NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NYC_MUSLIM_CENTER_SPORTS_URL });
    const second = await NYC_MUSLIM_CENTER_STATIC_PAGE_CLIENT.fetchPage({ url: NYC_MUSLIM_CENTER_SPORTS_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
