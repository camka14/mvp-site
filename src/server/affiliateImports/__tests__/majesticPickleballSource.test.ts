import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  MAJESTIC_PICKLEBALL_HOME_URL,
  MAJESTIC_PICKLEBALL_MAPPING,
  MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE,
  MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT,
} from '../majesticPickleballSource';

describe('Majestic Pickleball source', () => {
  it('emits one ongoing club and withholds unchecked lesson and event inventory', async () => {
    const mapping = parseAffiliateScrapeMapping(MAJESTIC_PICKLEBALL_MAPPING);
    const page = await MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: MAJESTIC_PICKLEBALL_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Majestic Pickleball',
      officialActionUrl: MAJESTIC_PICKLEBALL_HOME_URL,
      sportName: 'Pickleball',
      dateDisplayMode: 'ONGOING',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(MAJESTIC_PICKLEBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '27d6fcba-6ed8-4775-a8e4-0d2479810505',
      runId: '7b3cfe42-f28f-4f18-89ab-911a3f5656a2',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(MAJESTIC_PICKLEBALL_MAPPING);
    const first = await MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: MAJESTIC_PICKLEBALL_HOME_URL });
    const second = await MAJESTIC_PICKLEBALL_STATIC_PAGE_CLIENT.fetchPage({ url: MAJESTIC_PICKLEBALL_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
