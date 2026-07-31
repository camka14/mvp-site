import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  CROSS_COURT_PICKLEBALL_HOME_URL,
  CROSS_COURT_PICKLEBALL_MAPPING,
  CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT,
} from '../crossCourtPickleballSource';

describe('Cross Court Pickleball source', () => {
  it('emits one ongoing club and withholds unchecked dated inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(CROSS_COURT_PICKLEBALL_MAPPING);
    const page = await CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: CROSS_COURT_PICKLEBALL_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      listingKind: 'CLUB',
      title: 'Cross Court Pickleball',
      officialActionUrl: CROSS_COURT_PICKLEBALL_HOME_URL,
      dateDisplayMode: 'ONGOING',
    });
  });

  it('keeps the candidate stable across repeated fixture extraction', async () => {
    const mapping = parseAffiliateScrapeMapping(CROSS_COURT_PICKLEBALL_MAPPING);
    const [first, second] = await Promise.all([
      CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: CROSS_COURT_PICKLEBALL_HOME_URL }),
      CROSS_COURT_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: CROSS_COURT_PICKLEBALL_HOME_URL }),
    ]);
    const firstCandidates = extractAffiliateCandidatesFromPage(first, mapping);
    const secondCandidates = extractAffiliateCandidatesFromPage(second, mapping);

    expect(JSON.stringify(firstCandidates)).toBe(JSON.stringify(secondCandidates));
  });
});
