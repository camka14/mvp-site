import { parseAffiliateScrapeMapping } from '../types';
import { YORK_COLLEGE_MAPPING, YORK_COLLEGE_MANUAL_CANDIDATES, YORK_COLLEGE_SOURCE_EVIDENCE } from '../yorkCollegeAthleticFacilityRentalSource';

describe('York College athletic facility rental source', () => {
  it('emits one ongoing application-only RENTAL', () => {
    expect(parseAffiliateScrapeMapping(YORK_COLLEGE_MAPPING).kind).toBe('RENTAL');
    expect(YORK_COLLEGE_MANUAL_CANDIDATES).toEqual([expect.objectContaining({ listingKind: 'RENTAL', title: 'York College Athletic Facility Rental Application', officialActionUrl: 'https://yorkathletics.com/sb_output.aspx?form=6', dateDisplayMode: 'ONGOING', priceText: null })]);
    expect(YORK_COLLEGE_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('does not publish price')]));
    expect(YORK_COLLEGE_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
  });

  it('preserves stored provenance and official logo evidence', () => {
    expect(YORK_COLLEGE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'ce80b2fb-f4e0-427c-b20b-145ff74e383a', runId: 'b30cad55-8b75-4ae0-a47a-5a9866bd0461', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(YORK_COLLEGE_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 3 }]));
  });
});
