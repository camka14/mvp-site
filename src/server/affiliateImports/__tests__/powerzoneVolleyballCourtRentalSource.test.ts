import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  POWERZONE_COURT_RENTAL_URL,
  POWERZONE_MAPPING,
  POWERZONE_SOURCE_EVIDENCE,
  POWERZONE_STATIC_PAGE_CLIENT,
} from '../powerzoneVolleyballCourtRentalSource';

describe('PowerZone Volleyball court rental source', () => {
  it('emits a facility club and ongoing volleyball rental link-out', async () => {
    const mapping = parseAffiliateScrapeMapping(POWERZONE_MAPPING);
    const page = await POWERZONE_STATIC_PAGE_CLIENT.fetchPage({ url: POWERZONE_COURT_RENTAL_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'PowerZone Volleyball',
      city: 'Long Island, NY',
    }));
    expect(candidates[0].rawPayload?.extractedFields?.address).toBeNull();
    expect(candidates[1]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      title: 'PowerZone Volleyball Court Rental',
      dateDisplayMode: 'ONGOING',
      officialActionUrl: 'https://www.powerzonevb.com/site/node/185',
    }));
  });

  it('preserves stored provenance and is duplicate-safe', async () => {
    expect(POWERZONE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7cc44b91-c160-40f9-b939-cc3cfb00a406',
      runId: '413e1a7b-678f-4a2b-bcd9-a4f8669c6832',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(POWERZONE_MAPPING);
    const first = await POWERZONE_STATIC_PAGE_CLIENT.fetchPage({ url: POWERZONE_COURT_RENTAL_URL });
    const second = await POWERZONE_STATIC_PAGE_CLIENT.fetchPage({ url: POWERZONE_COURT_RENTAL_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
