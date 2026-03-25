import { createElement } from 'react';
import { screen } from '@testing-library/react';

import type { Match } from '@/types';

import MatchCard, { resolveDivisionLabel } from '../MatchCard';
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

describe('resolveDivisionLabel', () => {
  it('returns explicit division names from hydrated objects', () => {
    const label = resolveDivisionLabel({ name: '  Premier  ' } as any);
    expect(label).toBe('Premier');
  });

  it('infers a display label when division is a string identifier', () => {
    const label = resolveDivisionLabel('open');
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('open');
  });

  it('infers a display label when division object has only an id', () => {
    const label = resolveDivisionLabel({ id: 'rec' } as any);
    expect(label).not.toBe('TBD');
    expect(label.toLowerCase()).toContain('rec');
  });

  it('returns TBD for empty/unsupported values', () => {
    expect(resolveDivisionLabel(undefined)).toBe('TBD');
    expect(resolveDivisionLabel(null)).toBe('TBD');
    expect(resolveDivisionLabel('   ')).toBe('TBD');
  });
});

describe('MatchCard conflict rendering', () => {
  it('shows a red border and no inline conflict message when match has a field-time conflict', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch(),
        hasConflict: true,
      }),
    );

    expect(screen.queryByText(/there is a conflict/i)).not.toBeInTheDocument();
    expect(screen.getByText('Match #1').closest('div.relative')).toHaveClass('border-red-400');
  });

  it('labels winner and loser separately when the same prior match feeds both slots', () => {
    const sourceMatch = buildMatch({
      $id: 'match_63',
      matchId: 63,
      winnerNextMatchId: 'match_65',
      loserNextMatchId: 'match_65',
    });

    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({
          $id: 'match_65',
          matchId: 65,
          previousLeftMatch: sourceMatch,
          previousRightMatch: sourceMatch,
        }),
      }),
    );

    expect(screen.getByText('Winner of match #63')).toBeInTheDocument();
    expect(screen.getByText('Loser of match #63')).toBeInTheDocument();
  });

  it('derives the missing opposite slot label when one previous link is absent but source feeds both winner and loser', () => {
    const sourceMatch = buildMatch({
      $id: 'match_63',
      matchId: 63,
      winnerNextMatchId: 'match_65',
      loserNextMatchId: 'match_65',
    });

    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({
          $id: 'match_65',
          matchId: 65,
          previousLeftMatch: sourceMatch,
          previousRightMatch: undefined,
        }),
      }),
    );

    expect(screen.getByText('Winner of match #63')).toBeInTheDocument();
    expect(screen.getByText('Loser of match #63')).toBeInTheDocument();
  });

  it('hides event official names when showEventOfficialNames is false but still shows team officials', () => {
    renderWithMantine(
      createElement(MatchCard, {
        showEventOfficialNames: false,
        match: buildMatch({
          officialIds: [
            {
              positionId: 'position_1',
              slotIndex: 0,
              holderType: 'OFFICIAL',
              userId: 'official_user_1',
            },
          ],
          teamOfficial: {
            $id: 'team_official_1',
            name: 'Ref Team',
          } as Match['teamOfficial'],
        }),
      }),
    );

    expect(screen.queryByText(/^Officials:/i)).not.toBeInTheDocument();
    expect(screen.getByText('Ref Team')).toBeInTheDocument();
  });
});
