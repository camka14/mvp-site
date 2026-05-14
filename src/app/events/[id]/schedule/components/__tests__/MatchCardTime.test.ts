import { createElement } from 'react';
import { screen } from '@testing-library/react';

import type { Match } from '@/types';
import MatchCard from '../MatchCard';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

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

describe('MatchCard time display', () => {
  it('displays serialized match times as wall-clock times', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({
          start: '2026-03-01T09:00:00.000+05:00',
          end: '2026-03-01T21:00:00.000+05:00',
        }),
      }),
    );

    expect(screen.getByText('09:00 AM')).toBeInTheDocument();
  });
});
