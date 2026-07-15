import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import BroadcastControlRoom from '../BroadcastControlRoom';
import type { MatchPresentationStateV1 } from '@/server/broadcast/types';

const presentationState: MatchPresentationStateV1 = {
  version: 1,
  revision: 3,
  status: 'LIVE',
  event: { id: 'event_1', name: 'Beach Open', logoUrl: null, organizerName: null, organizerLogoUrl: null, venue: null, court: 'Court 1' },
  competition: { sport: 'Beach Volleyball', format: 'Best of 3 sets', roundLabel: null, bestOf: 3, setTargets: [21, 21, 15], winBy: 2 },
  teams: [
    { id: 'team_1', displayName: 'Summit United', shortName: 'Summit', abbreviation: 'SUM', playerNames: [], logoUrl: null, accentColor: '#15558D', foregroundColor: '#FFFFFF', seed: null },
    { id: 'team_2', displayName: 'Harbor Strikers', shortName: 'Harbor', abbreviation: 'HAR', playerNames: [], logoUrl: null, accentColor: '#C4512D', foregroundColor: '#FFFFFF', seed: null },
  ],
  score: { currentSet: 1, points: [18, 16], setsWon: [0, 0], sets: [], servingTeamId: null, timeoutsRemaining: {} },
  clock: { mode: 'STOPPED', startedAt: null, pausedAt: null, elapsedBeforePauseMs: 0 },
  presentation: { scoreboardVisible: true, activeStinger: null, replayState: 'UNAVAILABLE' },
  scoringMode: 'AUTOMATIC',
};

describe('BroadcastControlRoom', () => {
  it('requires confirmation before entering a presentation-only manual override', () => {
    const onCommand = jest.fn().mockResolvedValue(null);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MantineProvider>
        <BroadcastControlRoom state={{ revision: 3, scoringMode: 'AUTOMATIC', presentationState }} onCommand={onCommand} />
      </MantineProvider>,
    );

    expect(screen.getByText('OBS dock unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Apply presentation scores')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enter manual override' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onCommand).toHaveBeenCalledWith({ type: 'ENTER_MANUAL_OVERRIDE', reason: 'Producer correction' });
    confirmSpy.mockRestore();
  });

  it('allows a producer to adjust manual set scores and set counts', () => {
    const onCommand = jest.fn().mockResolvedValue(null);
    const manualState: MatchPresentationStateV1 = {
      ...presentationState,
      score: {
        ...presentationState.score,
        currentSet: 2,
        points: [7, 5],
        setsWon: [1, 0],
        sets: [
          { sequence: 1, team1Points: 21, team2Points: 19, target: 21, complete: true, winnerTeamId: 'team_1' },
          { sequence: 2, team1Points: 7, team2Points: 5, target: 21, complete: false, winnerTeamId: null },
        ],
      },
      scoringMode: 'MANUAL_OVERRIDE',
    };

    const { rerender } = render(
      <MantineProvider>
        <BroadcastControlRoom state={{ revision: 3, scoringMode: 'MANUAL_OVERRIDE', presentationState: manualState }} onCommand={onCommand} />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText('Set 2 Summit United'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Harbor Strikers sets won'), { target: { value: '1' } });
    // Simulate the parent polling the same persisted score with a fresh object.
    rerender(
      <MantineProvider>
        <BroadcastControlRoom state={{ revision: 3, scoringMode: 'MANUAL_OVERRIDE', presentationState: { ...manualState, score: { ...manualState.score } } }} onCommand={onCommand} />
      </MantineProvider>,
    );
    expect(screen.getByLabelText('Set 2 Summit United')).toHaveValue('11');
    expect(screen.getByLabelText('Harbor Strikers sets won')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: 'Apply presentation scores' }));

    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'APPLY_MANUAL_PRESENTATION_CHANGE',
      change: expect.objectContaining({
        score: expect.objectContaining({
          points: [11, 5],
          setsWon: [1, 1],
          sets: expect.arrayContaining([expect.objectContaining({ sequence: 2, team1Points: 11, team2Points: 5 })]),
        }),
      }),
    }));
  });

  it('shows every configured set when an existing manual override only has completed-set rows', () => {
    const onCommand = jest.fn().mockResolvedValue(null);
    const incompleteManualState: MatchPresentationStateV1 = {
      ...presentationState,
      score: {
        ...presentationState.score,
        currentSet: 3,
        points: [0, 0],
        setsWon: [1, 1],
        sets: [
          { sequence: 1, team1Points: 21, team2Points: 15, target: 21, complete: true, winnerTeamId: 'team_1' },
        ],
      },
      scoringMode: 'MANUAL_OVERRIDE',
    };

    render(
      <MantineProvider>
        <BroadcastControlRoom state={{ revision: 3, scoringMode: 'MANUAL_OVERRIDE', presentationState: incompleteManualState }} onCommand={onCommand} />
      </MantineProvider>,
    );

    expect(screen.getByLabelText('Set 1 Summit United')).toHaveValue('21');
    expect(screen.getByLabelText('Set 2 Summit United')).toHaveValue('0');
    expect(screen.getByLabelText('Set 3 Summit United')).toHaveValue('0');

    fireEvent.change(screen.getByLabelText('Set 2 Summit United'), { target: { value: '16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply presentation scores' }));

    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'APPLY_MANUAL_PRESENTATION_CHANGE',
      change: expect.objectContaining({
        score: expect.objectContaining({
          sets: expect.arrayContaining([
            expect.objectContaining({ sequence: 2, team1Points: 16, team2Points: 0, target: 21 }),
            expect.objectContaining({ sequence: 3, team1Points: 0, team2Points: 0, target: 15 }),
          ]),
        }),
      }),
    }));
  });
});
