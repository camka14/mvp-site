import { Sport } from '@/types';
import { resolveDraftSportForScoring } from '../eventDraftSport';

describe('resolveDraftSportForScoring', () => {
  it('prefers the active form sport when ids match', () => {
    const currentFormSport = {
      $id: 'indoor-volleyball',
      name: 'Indoor Volleyball',
      usePointsPerSetWin: true,
    } as Sport;
    const staleCatalogSport = {
      $id: 'indoor-volleyball',
      name: 'Indoor Volleyball',
      usePointsPerSetWin: false,
    } as Sport;

    const resolved = resolveDraftSportForScoring({
      sportId: 'indoor-volleyball',
      sportConfig: currentFormSport,
      sportsById: new Map([['indoor-volleyball', staleCatalogSport]]),
    });

    expect(resolved).toBe(currentFormSport);
    expect(Boolean(resolved?.usePointsPerSetWin)).toBe(true);
  });

  it('falls back to catalog sport when no form sport is present', () => {
    const catalogSport = {
      $id: 'tennis',
      name: 'Tennis',
      usePointsPerSetWin: true,
    } as Sport;

    const resolved = resolveDraftSportForScoring({
      sportId: 'tennis',
      sportConfig: null,
      sportsById: new Map([['tennis', catalogSport]]),
    });

    expect(resolved).toBe(catalogSport);
  });
});
