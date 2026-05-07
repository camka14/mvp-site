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
  it('keeps schedule card names, scores, and field available for adaptive CSS priority', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({
          team1: { $id: 'team_1', name: 'Beach volley with camka' } as Match['team1'],
          team2: { $id: 'team_2', name: 'Pine Valley Power' } as Match['team2'],
          team1Points: [21],
          team2Points: [17],
          setResults: [1],
        }),
        fieldLabel: 'Court 2',
        layout: 'horizontal',
        hideTimeBadge: true,
      }),
    );

    expect(screen.getByText('Match #1').closest('div.relative')).toHaveClass('match-card--adaptive');
    expect(screen.getByText('Beach volley with camka')).toBeInTheDocument();
    expect(screen.getByText('Pine Valley Power')).toBeInTheDocument();
    expect(screen.getByText('Beach volley with camka').closest('.match-card__team-slot')).toHaveClass('match-card__team-slot--longer-name');
    expect(screen.getByText('Pine Valley Power').closest('.match-card__team-slot')).toHaveClass('match-card__team-slot--shorter-name');
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Court 2')).toBeInTheDocument();
  });

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

  it('can hide the division badge for single-division schedule displays', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({ division: { name: 'CoEd Open' } as Match['division'] }),
        showDivisionBadge: false,
      }),
    );

    expect(screen.queryByText(/Division:/i)).not.toBeInTheDocument();
  });

  it('highlights the division badge when the match is in the viewer division', () => {
    renderWithMantine(
      createElement(MatchCard, {
        match: buildMatch({ division: { name: 'CoEd Open' } as Match['division'] }),
        highlightDivisionBadge: true,
      }),
    );

    expect(screen.getByText('Division: CoEd Open')).toHaveClass('bg-green-50', 'text-green-700', 'border-green-200');
  });
});
