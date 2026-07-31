import { parseAffiliateScrapeMapping } from '../types';
import { NYC_PARKS_PICKLEBALL_MAPPING, NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES, NYC_PARKS_PICKLEBALL_SOURCE_EVIDENCE } from '../nycParksPickleballCourtsSource';

describe('NYC Parks pickleball courts source', () => {
  it('emits one ongoing citywide RENTAL summary and withholds unrelated pages', () => {
    expect(parseAffiliateScrapeMapping(NYC_PARKS_PICKLEBALL_MAPPING).kind).toBe('RENTAL');
    expect(NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'RENTAL', title: 'NYC Parks Pickleball Courts', city: 'New York, NY', dateDisplayMode: 'ONGOING', priceText: null })]);
    expect(NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('MANUAL_REVIEW')]));
    expect(NYC_PARKS_PICKLEBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
  });

  it('preserves stored provenance and logo review disposition', () => {
    expect(NYC_PARKS_PICKLEBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '99e778e5-9edc-4831-a00d-045be59315f3', runId: '51e2e7c7-49b0-4072-b4aa-ad90db40e91e', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(NYC_PARKS_PICKLEBALL_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]));
  });
});
