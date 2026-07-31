import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';
import { parseAffiliateScrapeMapping } from '../types';
import {
  PICKLEBALL_HEAVEN_HOME_URL,
  PICKLEBALL_HEAVEN_MAPPING,
  PICKLEBALL_HEAVEN_SOURCE_EVIDENCE,
  PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT,
} from '../pickleballHeavenSource';

describe('Pickleball Heaven source', () => {
  it('emits the evidence-backed club and rental candidates and withholds dated tournaments', async () => {
    const mapping = parseAffiliateScrapeMapping(PICKLEBALL_HEAVEN_MAPPING);
    const page = await PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT.fetchPage({ url: PICKLEBALL_HEAVEN_HOME_URL });
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.listingKind)).toEqual(['CLUB', 'RENTAL']);
    expect(candidates[0]).toEqual(expect.objectContaining({
      title: 'Pickleball Heaven',
      officialActionUrl: PICKLEBALL_HEAVEN_HOME_URL,
      city: 'Medford, NY',
      address: '645 National Blvd, Medford, NY 11763',
      dateDisplayMode: 'ONGOING',
    }));
    expect(candidates[1]).toEqual(expect.objectContaining({
      title: 'Pickleball Heaven Corporate Events & Private Court Bookings',
      officialActionUrl: 'https://www.thepickleballheaven.com/book-event',
      listingKind: 'RENTAL',
    }));
  });

  it('preserves stored-intake provenance and duplicate-safe extraction', async () => {
    expect(PICKLEBALL_HEAVEN_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '3df41bc8-0582-4bf6-a453-b2499e4aa064',
      runId: '114af377-7c85-4486-ae91-9ecf4b544224',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    const mapping = parseAffiliateScrapeMapping(PICKLEBALL_HEAVEN_MAPPING);
    const first = await PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT.fetchPage({ url: PICKLEBALL_HEAVEN_HOME_URL });
    const second = await PICKLEBALL_HEAVEN_STATIC_PAGE_CLIENT.fetchPage({ url: PICKLEBALL_HEAVEN_HOME_URL });
    expect(JSON.stringify(extractAffiliateCandidatesFromPage(first, mapping)))
      .toBe(JSON.stringify(extractAffiliateCandidatesFromPage(second, mapping)));
  });
});
