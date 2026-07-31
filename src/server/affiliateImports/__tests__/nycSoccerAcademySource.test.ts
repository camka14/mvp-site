import { parseAffiliateScrapeMapping } from '../types';
import { NYCSA_MANUAL_CANDIDATES, NYCSA_MAPPING, NYCSA_SOURCE_EVIDENCE } from '../nycSoccerAcademySource';

describe('NYC Soccer Academy affiliate source', () => {
  it('emits one ongoing New York soccer academy profile', () => {
    expect(parseAffiliateScrapeMapping(NYCSA_MAPPING).kind).toBe('CLUB');
    expect(NYCSA_MANUAL_CANDIDATES).toHaveLength(1);
    expect(NYCSA_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'NYC Soccer Academy',
      dateDisplayMode: 'ONGOING',
      city: 'New York, NY',
    }));
  });

  it('preserves allowed homepage provenance and unchecked camp pages', () => {
    expect(NYCSA_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'ab73ba32-24e1-4c47-a19b-2c7b9381a7ac',
      runId: '022fa65b-fce4-4214-990a-9e4103a2bb15',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(NYCSA_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([
      { url: 'https://www.nycsocceracademy.com/', role: 'HOME', robotsStatus: 'ALLOWED' },
      { url: 'https://www.nycsocceracademy.com/summercamps', role: 'LISTING', robotsStatus: 'UNCHECKED' },
    ]));
  });
});
