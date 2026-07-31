import { parseAffiliateScrapeMapping } from '../types';
import { BROOKLYN_FORCE_MANUAL_CANDIDATES, BROOKLYN_FORCE_MAPPING, BROOKLYN_FORCE_SOURCE_EVIDENCE } from '../brooklynForceSoccerClubSource';

describe('Brooklyn Force Soccer affiliate source', () => {
  it('emits one ongoing Brooklyn youth soccer club profile', () => {
    expect(parseAffiliateScrapeMapping(BROOKLYN_FORCE_MAPPING).kind).toBe('CLUB');
    expect(BROOKLYN_FORCE_MANUAL_CANDIDATES).toHaveLength(1);
    expect(BROOKLYN_FORCE_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({
      listingKind: 'CLUB',
      title: 'Brooklyn Force Soccer',
      dateDisplayMode: 'ONGOING',
      city: 'Brooklyn, NY',
    }));
  });

  it('preserves the allowed home capture and withheld detail boundary', () => {
    expect(BROOKLYN_FORCE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({
      intakeId: 'b8d04c99-1cc4-4bc5-a478-357b987e168d',
      runId: '84516571-7fd8-4d57-9ae1-5b4d09995373',
      complianceStatus: 'ALLOWED',
      provider: 'SCRAPINGDOG',
    }));
    expect(BROOKLYN_FORCE_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([
      { kind: 'LOGO_CANDIDATE', count: 4 },
      { kind: 'ROBOTS', count: 1 },
    ]));
  });
});
