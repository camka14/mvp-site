import { parseAffiliateScrapeMapping } from '../types';
import { FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING, FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES, FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE, FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL } from '../foxSoccerAcademyNewYorkSource';

describe('Fox Soccer Academy New York affiliate source', () => {
  it('emits one ongoing CLUB candidate and withholds ambiguous tryout dates', () => {
    expect(parseAffiliateScrapeMapping(FOX_SOCCER_ACADEMY_NEW_YORK_MAPPING).kind).toBe('CLUB');
    expect(FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'CLUB', title: 'Fox Soccer Academy New York', officialActionUrl: FOX_SOCCER_ACADEMY_NEW_YORK_TRYOUTS_URL, dateDisplayMode: 'ONGOING' })]);
    expect(FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('no source-provided year')]));
    expect(FOX_SOCCER_ACADEMY_NEW_YORK_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });
  it('preserves stored source provenance', () => {
    expect(FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '756a60fa-98d0-4420-8325-70a10a85aa93', runId: '0c286431-9533-410b-9029-59fe46ff6331', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(FOX_SOCCER_ACADEMY_NEW_YORK_SOURCE_EVIDENCE.artifacts.logoCandidate).toMatch(/^[a-f0-9]{64}$/);
  });
});
