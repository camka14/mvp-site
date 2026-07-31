import { parseAffiliateScrapeMapping } from '../types';
import { NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES, NYC_IMPACT_VOLLEYBALL_MAPPING, NYC_IMPACT_VOLLEYBALL_REGISTER_URL, NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE } from '../nycImpactVolleyballSource';

describe('NYC Impact Volleyball source', () => {
  it('emits one ongoing CLUB profile and withholds yearless tryout events and teams', () => {
    expect(parseAffiliateScrapeMapping(NYC_IMPACT_VOLLEYBALL_MAPPING).kind).toBe('CLUB');
    expect(NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'NYC Impact Boys Volleyball', sportName: 'Volleyball', officialActionUrl: NYC_IMPACT_VOLLEYBALL_REGISTER_URL, dateDisplayMode: 'ONGOING' }),
    ]);
    expect(NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('source year'), expect.stringContaining('no year is inferred')]));
  });

  it('preserves stored allowed-page provenance and official logo evidence', () => {
    expect(NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '3ce8995e-69d3-414d-a1d4-9ed3a9ea4fe6', runId: 'a1ff2db1-05b3-4c71-abad-042a3cb82897', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(NYC_IMPACT_VOLLEYBALL_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://www.nycimpact.com/boys-tryout', role: 'REGISTRATION', robotsStatus: 'ALLOWED' }]));
    expect(NYC_IMPACT_VOLLEYBALL_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ logoSourceUrl: expect.stringContaining('NYC%20Impact%20Logo.png') }));
  });
});
