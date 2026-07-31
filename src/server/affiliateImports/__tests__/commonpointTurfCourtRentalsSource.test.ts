import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  COMMONPOINT_SOURCE_EVIDENCE,
  COMMONPOINT_STATIC_PAGE_CLIENT,
  COMMONPOINT_TURF_COURT_RENTALS_MAPPING,
  COMMONPOINT_TURF_COURT_RENTALS_URL,
} from '../commonpointTurfCourtRentalsSource';

describe('Commonpoint turf and court rentals source', () => {
  it('emits a facility club and rental link-out from the stored listing', async () => {
    const mapping = parseAffiliateScrapeMapping(COMMONPOINT_TURF_COURT_RENTALS_MAPPING);
    const page = await COMMONPOINT_STATIC_PAGE_CLIENT.fetchPage({ url: COMMONPOINT_TURF_COURT_RENTALS_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Commonpoint Tennis and Athletic Center',
      address: '79-20 Winchester Boulevard, Queens Village, NY 11427',
    }));
    expect(candidates[1]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      title: 'Commonpoint Turf and Court Rentals',
      officialActionUrl: 'https://www.catchcorner.com/organization-page/embedded/rental/commonpoint-queens---alley-pond/Soccer',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored provenance and produces duplicate-safe output', async () => {
    expect(COMMONPOINT_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'cd74b2f7-cec2-4aff-b26e-de2d249904fd',
      runId: 'a98d6e90-498b-4b63-ab8f-e1edf473e9ef',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(COMMONPOINT_TURF_COURT_RENTALS_MAPPING);
    const first = await COMMONPOINT_STATIC_PAGE_CLIENT.fetchPage({ url: COMMONPOINT_TURF_COURT_RENTALS_URL });
    const second = await COMMONPOINT_STATIC_PAGE_CLIENT.fetchPage({ url: COMMONPOINT_TURF_COURT_RENTALS_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
