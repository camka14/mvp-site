import { parseAffiliateScrapeMapping } from '../types';
import { ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES, ESCALADES_BASKETBALL_CLUB_MAPPING, ESCALADES_BASKETBALL_CLUB_REGISTER_URL, ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE } from '../escaladesBasketballClubSource';

describe('Escalades Basketball Club source', () => {
  it('emits one ongoing CLUB profile and withholds stale, unchecked, rental, and team rows', () => {
    expect(parseAffiliateScrapeMapping(ESCALADES_BASKETBALL_CLUB_MAPPING).kind).toBe('CLUB');
    expect(ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES).toEqual([
      expect.objectContaining({ listingKind: 'CLUB', title: 'Escalades Basketball Club', sportName: 'Basketball', officialActionUrl: ESCALADES_BASKETBALL_CLUB_REGISTER_URL, dateDisplayMode: 'ONGOING', city: 'Manhattan, NY' }),
    ]);
    expect(ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'EVENT' || candidate.listingKind === 'RENTAL' || candidate.listingKind === 'TEAM')).toBe(false);
    expect(ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining('past as of 2026-07-31'), expect.stringContaining('apparel-store path'), expect.stringContaining('MANUAL_REVIEW')]));
  });

  it('preserves stored allowed-home provenance and manual logo disposition', () => {
    expect(ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE).toEqual(expect.objectContaining({ intakeId: 'f23e92b4-bf87-477c-b426-4fce36ff1908', runId: 'faa0f1a8-3ce4-4964-85d4-5d0534ec1ade', complianceStatus: 'ALLOWED', provider: 'SCRAPINGDOG' }));
    expect(ESCALADES_BASKETBALL_CLUB_SOURCE_EVIDENCE.pages).toEqual(expect.arrayContaining([{ url: 'https://www.escaladesnyc.org/', role: 'HOME', robotsStatus: 'ALLOWED' }]));
    expect(ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES[0]).toEqual(expect.objectContaining({ address: 'Manhattan, NY 10065' }));
    expect(ESCALADES_BASKETBALL_CLUB_MANUAL_CANDIDATES[0].logoUrl).toBeUndefined();
  });
});
