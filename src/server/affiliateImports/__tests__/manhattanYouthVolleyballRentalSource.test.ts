import { parseAffiliateScrapeMapping } from '../types';
import { MANHATTAN_YOUTH_MAPPING, MANHATTAN_YOUTH_MANUAL_CANDIDATES, MANHATTAN_YOUTH_SOURCE_EVIDENCE } from '../manhattanYouthVolleyballRentalSource';

describe('Manhattan Youth volleyball rental source', () => {
  it('emits one priced ongoing RENTAL and withholds past/unchecked events', () => {
    expect(parseAffiliateScrapeMapping(MANHATTAN_YOUTH_MAPPING).kind).toBe('RENTAL');
    expect(MANHATTAN_YOUTH_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'RENTAL', title: 'Manhattan Youth Pier 25 Beach Volleyball Court Rentals', venueName: 'Pier 25', priceText: '$100 per hour', dateDisplayMode: 'ONGOING' })]);
    expect(MANHATTAN_YOUTH_MANUAL_CANDIDATES[0].participantOptionsText).toContain('12 people');
    expect(MANHATTAN_YOUTH_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('past as of 2026-07-31')]));
    expect(MANHATTAN_YOUTH_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(MANHATTAN_YOUTH_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '08f131dc-6fd8-4bc3-a60f-264761d6b7ca', runId: '0d69f2c4-9dd6-4847-a313-1ee97cef4432', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(MANHATTAN_YOUTH_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]));
  });
});
