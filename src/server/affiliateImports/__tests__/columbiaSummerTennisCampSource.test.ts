import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL,
  COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING,
  COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE,
  COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT,
} from '../columbiaSummerTennisCampSource';

describe('Columbia Summer Tennis Camp source', () => {
  it('emits an ongoing club and camp event from the stored homepage', async () => {
    const mapping = parseAffiliateScrapeMapping(COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING);
    const page = await COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(expect.objectContaining({ listingKind: 'CLUB', title: 'Columbia Summer Tennis Camp' }));
    expect(candidates[1]).toEqual(expect.objectContaining({
      listingKind: 'EVENT',
      title: '2026 Columbia Summer Tennis Camp',
      dateDisplayMode: 'ONGOING',
      address: '603 W 218th Street, New York, NY 10034',
      priceText: '$250 per day; $1,000 for the full week',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(COLUMBIA_SUMMER_TENNIS_CAMP_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '6f37b1e5-34e4-4583-a807-80badcd4e11f',
      runId: '4d3281db-e6ff-4ad5-b674-2e45e153abac',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(COLUMBIA_SUMMER_TENNIS_CAMP_MAPPING);
    const first = await COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL });
    const second = await COLUMBIA_SUMMER_TENNIS_CAMP_STATIC_PAGE_CLIENT.fetchPage({ url: COLUMBIA_SUMMER_TENNIS_CAMP_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
