import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  BROOKHAVEN_BASEBALL_MAPPING,
  BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE,
  BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT,
  BROOKHAVEN_BASEBALL_URL,
} from '../brookhavenYouthBaseballSource';

describe('Brookhaven youth baseball source', () => {
  it('emits one historical-aware club summary and withholds stale or yearless event rows', async () => {
    const mapping = parseAffiliateScrapeMapping(BROOKHAVEN_BASEBALL_MAPPING);
    const page = await BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: BROOKHAVEN_BASEBALL_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Town of Brookhaven Youth Baseball Program',
      sportName: 'Baseball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(BROOKHAVEN_BASEBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'b9b64bf7-d500-4b06-aa82-5daee2f30d0e',
      runId: 'f5831d83-9ba8-496f-ab9d-f1877a5608c8',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(BROOKHAVEN_BASEBALL_MAPPING);
    const first = await BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: BROOKHAVEN_BASEBALL_URL });
    const second = await BROOKHAVEN_BASEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: BROOKHAVEN_BASEBALL_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
