import { parseAffiliateScrapeMapping } from '../types';
import { IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES, IMPACT_YOUTH_LEAGUE_NYC_MAPPING, IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL, IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE } from '../impactYouthLeagueNycSource';

describe('Impact Youth League NYC source', () => {
  it('emits one ongoing CLUB profile and withholds stale or unchecked rows', () => {
    expect(parseAffiliateScrapeMapping(IMPACT_YOUTH_LEAGUE_NYC_MAPPING).kind).toBe('CLUB');
    expect(IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Impact Youth League NYC', sportName: 'Basketball', officialActionUrl: IMPACT_YOUTH_LEAGUE_NYC_SCHEDULES_URL, dateDisplayMode: 'ONGOING', city: 'New York, NY' }),
    ]);
    expect(IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('past as of 2026-07-31'), expect.stringContaining('UNCHECKED')]));
  });

  it('preserves stored allowed-home provenance, location, and official logo disposition', () => {
    expect(IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: '62212f5c-38ef-4762-a3a0-3087fa8d56d6', runId: '3deaec93-6e7e-4350-afc4-02b33dc0d25e', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(IMPACT_YOUTH_LEAGUE_NYC_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://www.impactyouthleaguenyc.com/', role: 'HOME', robotsStatus: 'ALLOWED' }]));
    expect(IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ venueName: 'Morningside Basketball Courts', address: 'W 118th Street and Morningside Avenue, New York, NY 10027', logoSourceUrl: expect.stringContaining('Impact%20-%20White%20Logo.jpg') }));
    expect(IMPACT_YOUTH_LEAGUE_NYC_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('normalized locally')]))
  });
});
