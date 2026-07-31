import { parseAffiliateScrapeMapping } from '../types';
import { NEW_YORK_EMPIRE_MAPPING, NEW_YORK_EMPIRE_MANUAL_CANDIDATES, NEW_YORK_EMPIRE_SOURCE_EVIDENCE } from '../newYorkEmpireBaseballSource';

describe('New York Empire Baseball affiliate source', () => {
  it('emits one ongoing CLUB profile with sourced facility context', () => {
    expect(parseAffiliateScrapeMapping(NEW_YORK_EMPIRE_MAPPING).kind).toBe('CLUB');
    expect(NEW_YORK_EMPIRE_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'New York Empire Baseball', city: 'New York, NY', venueName: 'The Arena', dateDisplayMode: 'ONGOING' }),
    ]);
    expect(NEW_YORK_EMPIRE_MANUAL_CANDIDATES[0].address).toContain('251 West 60 Street');
    expect(NEW_YORK_EMPIRE_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('no complete current')]))
    expect(NEW_YORK_EMPIRE_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT')).toBe(false);
    expect(NEW_YORK_EMPIRE_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves stored provenance and logo evidence', () => {
    expect(NEW_YORK_EMPIRE_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '69505e28-d5f6-4ad8-a157-73489b543df6', runId: '1b23cdf3-cb7e-432c-972f-db3f0e008ff1', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(NEW_YORK_EMPIRE_SOURCE_EVIDENCE.artifactKinds).toEqual(expect.arrayContaining([{ kind: 'LOGO_CANDIDATE', count: 4 }]));
  });
});
