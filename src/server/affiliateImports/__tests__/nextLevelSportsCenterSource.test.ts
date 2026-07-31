import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  NEXT_LEVEL_HOME_URL,
  NEXT_LEVEL_MAPPING,
  NEXT_LEVEL_SOURCE_EVIDENCE,
  NEXT_LEVEL_STATIC_PAGE_CLIENT,
} from '../nextLevelSportsCenterSource';

describe('Next Level Sports Center source', () => {
  it('emits a facility club and an ongoing court-rental link-out', async () => {
    const mapping = parseAffiliateScrapeMapping(NEXT_LEVEL_MAPPING);
    const page = await NEXT_LEVEL_STATIC_PAGE_CLIENT.fetchPage({ url: NEXT_LEVEL_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Next Level Sports Center',
      address: '156 Railroad Street, Huntington NY',
    }));
    expect(candidates[1]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      title: 'Next Level Sports Center Indoor Basketball Court Rentals',
      dateDisplayMode: 'ONGOING',
      officialActionUrl: 'https://nextlevelsportscenter.com/court-rentals-next-level-sports-center',
    }));
  });

  it('preserves stored provenance and is duplicate-safe', async () => {
    expect(NEXT_LEVEL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '1477c856-b37c-48bb-ac1e-c8cd42ba4ca6',
      runId: '378d3b66-da72-4f5c-b5a7-c06c4618db41',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(NEXT_LEVEL_MAPPING);
    const first = await NEXT_LEVEL_STATIC_PAGE_CLIENT.fetchPage({ url: NEXT_LEVEL_HOME_URL });
    const second = await NEXT_LEVEL_STATIC_PAGE_CLIENT.fetchPage({ url: NEXT_LEVEL_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
