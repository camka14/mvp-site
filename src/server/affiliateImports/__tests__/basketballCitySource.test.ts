import { parseAffiliateScrapeMapping } from '../types';
import { BASKETBALL_CITY_MANUAL_CANDIDATES, BASKETBALL_CITY_MAPPING, BASKETBALL_CITY_SOURCE_EVIDENCE } from '../basketballCitySource';

describe('Basketball City affiliate source', () => {
  it('emits ongoing club and court-rental review candidates', () => {
    expect(parseAffiliateScrapeMapping(BASKETBALL_CITY_MAPPING).kind).toBe('CLUB');
    expect(BASKETBALL_CITY_MANUAL_CANDIDATES).toHaveLength(2);
    expect(BASKETBALL_CITY_MANUAL_CANDIDATES.map((candidate) => candidate.listingKind)).toEqual(['CLUB', 'RENTAL']);
    expect(BASKETBALL_CITY_MANUAL_CANDIDATES[1]).toEqual(expect.objectContaining({
      title: 'Basketball City Court Rentals',
      dateDisplayMode: 'ONGOING',
      officialActionUrl: 'https://basketballcity.com/court-rentals/',
    }));
  });

  it('preserves allowed homepage and youth-listing provenance', () => {
    expect(BASKETBALL_CITY_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: '7d996d03-f138-476c-a4c1-cdebae35eb9c',
      runId: '5a1e01d2-e2e9-4d14-8f42-fca712338ae4',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(BASKETBALL_CITY_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://basketballcity.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://basketballcity.com/youth-league/youth-development-program', role: 'LISTING', robotsStatus: 'ALLOWED' },
    ]));
  });
});
