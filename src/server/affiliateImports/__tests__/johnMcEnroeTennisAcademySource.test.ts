import { parseAffiliateScrapeMapping } from '../types';
import { JMTA_MANUAL_CANDIDATES, JMTA_MAPPING, JMTA_SOURCE_EVIDENCE } from '../johnMcEnroeTennisAcademySource';

describe('John McEnroe Tennis Academy affiliate source', () => {
  it('emits one ongoing JMTA club profile', () => {
    expect(parseAffiliateScrapeMapping(JMTA_MAPPING).kind).toBe('CLUB');
    expect(JMTA_MANUAL_CANDIDATES).toHaveLength(1);
    expect(JMTA_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'John McEnroe Tennis Academy (JMTA)',
      dateDisplayMode: 'ONGOING',
      city: 'New York, NY',
    }));
  });

  it('preserves allowed homepage provenance and unchecked camp boundary', () => {
    expect(JMTA_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '150c930c-ce11-4413-80f3-52e8137a3204',
      runId: '23385d65-e76d-4630-8eb7-902ff9088f99',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(JMTA_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.johnmcenroetennisacademy.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.johnmcenroetennisacademy.com/explore/jmtacamp', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    ]));
  });
});
