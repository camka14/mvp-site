import { parseAffiliateScrapeMapping } from '../types';
import { ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES, ARTISTIC_SPORTS_COMPLEX_MAPPING, ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE } from '../artisticSportsComplexBasketballRentalsSource';

describe('Artistic Sports Complex basketball rentals affiliate source', () => {
  it('emits five ongoing basketball RENTAL candidates with exact stored rates', () => {
    expect(parseAffiliateScrapeMapping(ARTISTIC_SPORTS_COMPLEX_MAPPING).kind).toBe('RENTAL');
    expect(ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES).toHaveLength(5);
    expect(ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES.every((candidate) => candidate.listingKind === 'RENTAL' && candidate.dateDisplayMode === 'ONGOING' && candidate.city === 'Glendale, NY')).toBe(true);
    expect(ARTISTIC_SPORTS_COMPLEX_MANUAL_CANDIDATES.map((candidate) => candidate.priceText)).toEqual(expect.arrayContaining(['$220 per hour (credit card fee and tax included)', '$130 per hour (credit card fee and tax included)', '$20 per person per hour (based on availability)', '$20 per person for all-day play']));
  });

  it('preserves stored rental provenance and allowed policy', () => {
    expect(ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '549892ee-bb1e-4c7e-9736-22ce8881e3e5', runId: 'c7f051bb-9976-46aa-b716-6a7b4ef8e8e6', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(ARTISTIC_SPORTS_COMPLEX_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.not.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: expect.anything() }]));
  });
});
