import type { Match } from '@/types';

import { shouldDisplayMatchDivisionBadges } from '../matchDivisionDisplay';

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  team1Points: [],
  team2Points: [],
  setResults: [],
  ...overrides,
});

describe('shouldDisplayMatchDivisionBadges', () => {
  it('hides division badges when displayed matches only use one division', () => {
    expect(
      shouldDisplayMatchDivisionBadges([
        buildMatch({ $id: 'match_1', division: { name: 'CoEd Open' } as Match['division'] }),
        buildMatch({ $id: 'match_2', division: { name: 'CoEd Open' } as Match['division'] }),
      ]),
    ).toBe(false);
  });

  it('shows division badges when displayed matches span multiple divisions', () => {
    expect(
      shouldDisplayMatchDivisionBadges([
        buildMatch({ $id: 'match_1', division: { name: 'CoEd Open' } as Match['division'] }),
        buildMatch({ $id: 'match_2', division: { name: 'Advanced' } as Match['division'] }),
      ]),
    ).toBe(true);
  });

  it('ignores matches without a usable division label', () => {
    expect(
      shouldDisplayMatchDivisionBadges([
        buildMatch({ $id: 'match_1' }),
        buildMatch({ $id: 'match_2', division: '   ' }),
      ]),
    ).toBe(false);
  });
});
