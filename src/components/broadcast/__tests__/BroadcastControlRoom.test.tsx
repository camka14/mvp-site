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
});
