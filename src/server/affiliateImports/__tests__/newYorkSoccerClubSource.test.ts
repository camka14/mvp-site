import { parseAffiliateScrapeMapping } from '../types';
import {
  NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL,
  NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL,
  NEW_YORK_SOCCER_CLUB_LOGO_SOURCE_URL,
  NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES,
  NEW_YORK_SOCCER_CLUB_MAPPING,
  NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE,
} from '../newYorkSoccerClubSource';

describe('New York Soccer Club affiliate source', () => {
  it('emits one ongoing CLUB and two future EVENT candidates from complete stored rows', () => {
    expect(parseAffiliateScrapeMapping(NEW_YORK_SOCCER_CLUB_MAPPING).kind).toBe('EVENT');
    expect(NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ listingKind: 'CLUB', title: 'New York Soccer Club', dateDisplayMode: 'ONGOING' }),
        expect.objectContaining({ listingKind: 'EVENT', title: 'Ball Mastery Youth Development Series', officialActionUrl: NEW_YORK_SOCCER_CLUB_BALL_MASTERY_URL, startsAt: '2026-09-10T17:00:00-04:00' }),
        expect.objectContaining({ listingKind: 'EVENT', title: 'Fall Youth Development', officialActionUrl: NEW_YORK_SOCCER_CLUB_FALL_YOUTH_DEVELOPMENT_URL, venueName: 'Ophir Field, Manhattanville University' }),
      ]),
    );
    expect(NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES).toHaveLength(3);
    expect(NEW_YORK_SOCCER_CLUB_MANUAL_CANDIDATES.some((candidate) => candidate.listingKind === 'TEAM')).toBe(false);
  });

  it('preserves source provenance and the first-party NYSC crest', () => {
    expect(NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE).toEqual(
      expect.objectContaining({
        intakeId: 'f07e3962-0c54-4fcb-9639-015fb7eed892',
        runId: '864f7893-4d83-4bf3-8ad9-4235046c25f9',
        complianceStatus: 'ALLOWED',
        provider: 'SCRAPINGDOG',
      }),
    );
    expect(NEW_YORK_SOCCER_CLUB_LOGO_SOURCE_URL).toContain('3D-LogoNEW-01.svg');
    expect(NEW_YORK_SOCCER_CLUB_SOURCE_EVIDENCE.artifacts.logoCandidates.primary).toBe(
      '601472d1a82f65a3fc84e4325c8e3766fcae77137889c6c502fdb522c9cd6b01',
    );
  });
});
