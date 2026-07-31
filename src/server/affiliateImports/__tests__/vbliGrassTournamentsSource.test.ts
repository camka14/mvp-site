import { parseAffiliateScrapeMapping } from '../types';
import { VBLI_GRASS_TOURNAMENT_EVENT_CANDIDATES, VBLI_GRASS_TOURNAMENT_MAPPING, VBLI_GRASS_TOURNAMENT_MANUAL_CANDIDATES, VBLI_SOURCE_EVIDENCE } from '../vbliGrassTournamentsSource';

describe('VBLI grass tournament affiliate source', () => {
  it('emits one CLUB and twelve future EVENT candidates from the captured listing', () => {
    expect(parseAffiliateScrapeMapping(VBLI_GRASS_TOURNAMENT_MAPPING).kind).toBe('EVENT');
    expect(VBLI_GRASS_TOURNAMENT_EVENT_CANDIDATES).toHaveLength(12);
    expect(VBLI_GRASS_TOURNAMENT_MANUAL_CANDIDATES.filter((candidate) => candidate.listingKind === 'CLUB')).toHaveLength(1);
    expect(VBLI_GRASS_TOURNAMENT_EVENT_CANDIDATES.every((candidate) => candidate.listingKind === 'EVENT' && candidate.dateDisplayMode === 'SCHEDULED' && candidate.city === 'Lido Beach, NY' && candidate.venueName === 'Nickerson Beach Park')).toBe(true);
  });

  it('preserves stored provenance and allowed robots evidence', () => {
    expect(VBLI_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '71c2e72d-e078-41b6-a8c4-ae5eb2719c33', runId: 'a9470d9c-22e5-4b99-8bd1-7469c95324a3', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(VBLI_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 3 }, { kind: 'ROBOTS', count: 2 }]));
  });
});
