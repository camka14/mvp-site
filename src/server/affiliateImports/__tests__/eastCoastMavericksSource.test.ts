import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  EAST_COAST_MAVERICKS_MAPPING,
  EAST_COAST_MAVERICKS_MANUAL_CANDIDATES,
  EAST_COAST_MAVERICKS_SOURCE_EVIDENCE,
  EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT,
  EAST_COAST_MAVERICKS_HOME_URL,
} from '../eastCoastMavericksSource';

describe('East Coast Mavericks source', () => {
  it('emits a club and an ongoing current clinic while withholding yearless dates', async () => {
    const mapping = parseAffiliateScrapeMapping(EAST_COAST_MAVERICKS_MAPPING);
    const page = await EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT.fetchPage({ url: EAST_COAST_MAVERICKS_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Mavericks Baseball' }),
      expect.objectContaining({ listingKind: 'EVENT', title: 'Mavericks Summer Baseball Clinic 2026 - Session 4', dateDisplayMode: 'ONGOING' }),
    ]));
    expect(EAST_COAST_MAVERICKS_MANUAL_CANDIDATES[1].warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('August 10-14 Mini Mavericks dates omit a year'),
    ]));
  });

  it('preserves allowed-homepage provenance and duplicate-safe extraction', async () => {
    expect(EAST_COAST_MAVERICKS_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'ad68fca3-adff-4930-a3bb-3245cb64319f',
      runId: 'eb1a6da9-afb3-4696-8102-a55d80e6c54b',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(EAST_COAST_MAVERICKS_MAPPING);
    const first = await EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT.fetchPage({ url: EAST_COAST_MAVERICKS_HOME_URL });
    const second = await EAST_COAST_MAVERICKS_STATIC_PAGE_CLIENT.fetchPage({ url: EAST_COAST_MAVERICKS_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
