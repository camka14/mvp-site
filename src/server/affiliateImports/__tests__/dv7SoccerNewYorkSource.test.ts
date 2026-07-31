import { parseAffiliateScrapeMapping } from '../types';
import { DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL, DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES, DV7_SOCCER_NEW_YORK_MAPPING, DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE } from '../dv7SoccerNewYorkSource';

describe('DV7 Soccer Academy New York source', () => {
  it('emits one ongoing CLUB profile and withholds stale camp and TEAM rows', () => {
    expect(parseAffiliateScrapeMapping(DV7_SOCCER_NEW_YORK_MAPPING).kind).toBe('CLUB');
    expect(DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'DV7 Soccer Academy New York', sportName: 'Soccer', dateDisplayMode: 'ONGOING', city: 'New York, NY' }),
    ]);
    expect(DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('stale EVENT')]));
  });

  it('preserves stored allowed listing provenance and official logo source', () => {
    expect(DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'b5aa4ecb-3ccc-4ed4-8ec4-69f07d7b6100', runId: '4e4a2825-adf0-4df5-b3a3-dde76d8a6b55', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(DV7_SOCCER_NEW_YORK_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://www.dv7soccer.com/dv7_academies/new_york', role: 'LISTING', robotsStatus: 'ALLOWED' }]));
    expect(DV7_SOCCER_NEW_YORK_MANUAL_CANDIDATES[0].logoSourceUrl).toBe(DV7_SOCCER_NEW_YORK_LOGO_SOURCE_URL);
  });
});
