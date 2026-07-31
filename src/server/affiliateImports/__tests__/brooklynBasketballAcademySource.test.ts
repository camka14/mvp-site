import { parseAffiliateScrapeMapping } from '../types';
import { BBA_MANUAL_CANDIDATES, BBA_MAPPING, BBA_SOURCE_EVIDENCE } from '../brooklynBasketballAcademySource';

describe('Brooklyn Basketball Academy affiliate source', () => {
  it('emits one ongoing Brooklyn basketball club profile', () => {
    expect(parseAffiliateScrapeMapping(BBA_MAPPING).kind).toBe('CLUB');
    expect(BBA_MANUAL_CANDIDATES).toHaveLength(1);
    expect(BBA_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Brooklyn Basketball Academy (BBA)',
      dateDisplayMode: 'ONGOING',
      city: 'Brooklyn, NY',
    }));
  });

  it('preserves the allowed homepage boundary and unchecked rentals', () => {
    expect(BBA_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '88a16752-1e73-4034-8c3f-9bf8e3b25113',
      runId: '85f8ce8b-0fa7-4d2a-a2ac-d440a8b42c34',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(BBA_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.bkbasketballacademy.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.bkbasketballacademy.com/rentals', role: 'RENTAL', robotsStatus: 'UNCHECKED' },
    ]));
    expect(BBA_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 3 },
      { kind: 'ROBOTS', count: 1 },
    ]));
  });
});
