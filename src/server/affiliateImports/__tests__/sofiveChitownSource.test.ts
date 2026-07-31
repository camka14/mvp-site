import { parseAffiliateScrapeMapping } from '../types';
import { SOFIVE_CHITOWN_MAPPING, SOFIVE_CHITOWN_MANUAL_CANDIDATES, SOFIVE_CHITOWN_RENTAL_URL, SOFIVE_CHITOWN_SOURCE_EVIDENCE } from '../sofiveChitownSource';

describe('Sofive Chitown affiliate source', () => {
  it('emits one ongoing CLUB and one ongoing RENTAL candidate without teams', () => {
    expect(parseAffiliateScrapeMapping(SOFIVE_CHITOWN_MAPPING).kind).toBe('CLUB');
    expect(SOFIVE_CHITOWN_MANUAL_CANDIDATES).toEqual(expect.arrayContaining([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Sofive Chitown', dateDisplayMode: 'ONGOING' }),
      expect.objectContaining({ listingKind: 'RENTAL', officialActionUrl: SOFIVE_CHITOWN_RENTAL_URL, dateDisplayMode: 'ONGOING' }),
    ]));
    expect(SOFIVE_CHITOWN_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and the official Sofive logo evidence', () => {
    expect(SOFIVE_CHITOWN_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'b04e4b4e-baba-4e48-896c-941419ea8edf', runId: '3f1eaf6b-b060-4758-8601-8987d1293066', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(SOFIVE_CHITOWN_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 5 }, { kind: 'PAGE_MARKDOWN', count: 1 }]));
  });
});
