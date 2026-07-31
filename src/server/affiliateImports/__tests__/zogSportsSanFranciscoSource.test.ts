import { parseAffiliateScrapeMapping } from '../types';
import { ZOG_SPORTS_SF_MAPPING, ZOG_SPORTS_SF_MANUAL_CANDIDATES, ZOG_SPORTS_SF_SOURCE_EVIDENCE } from '../zogSportsSanFranciscoSource';

describe('ZogSports San Francisco affiliate source', () => {
  it('emits one ongoing adult flag-football CLUB and withholds incomplete rows', () => {
    expect(parseAffiliateScrapeMapping(ZOG_SPORTS_SF_MAPPING).kind).toBe('CLUB');
    expect(ZOG_SPORTS_SF_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'ZogSports San Francisco & East Bay', city: 'San Francisco Bay Area', dateDisplayMode: 'ONGOING' })]);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(ZOG_SPORTS_SF_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'e11c9e83-df4a-4c30-a0af-25b8d5284327', runId: '632dec96-334f-44f0-a4a6-ffd4299d134b', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(ZOG_SPORTS_SF_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 6 }]));
  });
});
