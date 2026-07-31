import { parseAffiliateScrapeMapping } from '../types';
import { APTC_PICKLEBALL_RENTALS_MAPPING, APTC_RENTAL_CANDIDATES, APTC_SOURCE_EVIDENCE, APTC_WAIVER_URL } from '../aptcnycPickleballRentalsSource';

describe('APTC at Queens College pickleball rentals affiliate source', () => {
  it('emits one ongoing rental with current stored summer rates', () => {
    expect(parseAffiliateScrapeMapping(APTC_PICKLEBALL_RENTALS_MAPPING).kind).toBe('RENTAL');
    expect(APTC_RENTAL_CANDIDATES).toHaveLength(1);
    expect(APTC_RENTAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'RENTAL',
      dateDisplayMode: 'ONGOING',
      priceText: expect.stringContaining('$30/hour'),
      participantOptionsText: expect.stringContaining(APTC_WAIVER_URL),
      venueName: 'APTC at Queens College',
    }));
  });

  it('preserves stored provenance and does not infer unchecked rental pages', () => {
    expect(APTC_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '2f6dba46-0a81-46cb-ab9b-1cb7f36d2d33',
      runId: 'e6b41f48-309c-4483-96c0-2aac422858b6',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(APTC_SOURCE_EVIDENCE.pages.filter((page) => page.robotsStatus === 'UNCHECKED')).toHaveLength(4);
    expect(APTC_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 4 },
      { kind: 'ROBOTS', count: 1 },
    ]));
  });
});
