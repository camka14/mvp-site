import { parseAffiliateScrapeMapping } from '../types';
import { CUNNINGHAM_MANUAL_CANDIDATES, CUNNINGHAM_MAPPING, CUNNINGHAM_SOURCE_EVIDENCE } from '../cunninghamTennisSource';

describe('Cunningham Tennis affiliate source', () => {
  it('emits ongoing club and court-booking review candidates', () => {
    expect(parseAffiliateScrapeMapping(CUNNINGHAM_MAPPING).kind).toBe('CLUB');
    expect(CUNNINGHAM_MANUAL_CANDIDATES).toHaveLength(2);
    expect(CUNNINGHAM_MANUAL_CANDIDATES.map((candidate) => candidate.listingKind)).toEqual(['CLUB', 'RENTAL']);
    expect(CUNNINGHAM_MANUAL_CANDIDATES[1]).toEqual(expect.objectContaining({
      title: 'Cunningham Tennis Court Booking',
      dateDisplayMode: 'ONGOING',
      officialActionUrl: 'https://www.catchcorner.com/facility-page/embedded/rental/1253',
    }));
  });

  it('preserves allowed homepage provenance and unchecked detail boundary', () => {
    expect(CUNNINGHAM_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '161bfdb1-d6b8-4195-b7e5-329d9d70e8cb',
      runId: 'b626a65c-6199-4481-a89d-d18e296df108',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(CUNNINGHAM_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://cunninghamtennis.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://cunninghamtennis.com/book-court-online', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    ]));
  });
});
