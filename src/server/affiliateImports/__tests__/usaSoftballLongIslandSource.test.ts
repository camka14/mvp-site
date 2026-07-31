import { parseAffiliateScrapeMapping } from '../types';
import { USA_SOFTBALL_LI_MANUAL_CANDIDATES, USA_SOFTBALL_LI_MAPPING, USA_SOFTBALL_LI_SOURCE_EVIDENCE } from '../usaSoftballLongIslandSource';

describe('USA Softball Long Island source', () => {
  it('emits one ongoing CLUB profile and no stale or undated EVENT rows', () => {
    expect(parseAffiliateScrapeMapping(USA_SOFTBALL_LI_MAPPING).kind).toBe('CLUB');
    expect(USA_SOFTBALL_LI_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'USA Softball Long Island', sportName: 'Softball', dateDisplayMode: 'ONGOING', city: 'Long Island, NY' }),
    ]);
    expect(USA_SOFTBALL_LI_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(USA_SOFTBALL_LI_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('historical 2021')]));
  });

  it('preserves stored allowed-home provenance and manual logo disposition', () => {
    expect(USA_SOFTBALL_LI_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '7b096591-9e9b-4b74-9e57-f711f00b767d', runId: '339c488c-233f-401b-8b72-f75c7ead298d', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(USA_SOFTBALL_LI_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://usasoftballli.com/', role: 'HOME', robotsStatus: 'ALLOWED' }]));
    expect(USA_SOFTBALL_LI_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('MANUAL_REVIEW')]));
  });
});
