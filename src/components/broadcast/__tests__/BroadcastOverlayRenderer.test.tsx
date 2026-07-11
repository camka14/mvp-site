import { act, render, screen } from '@testing-library/react';
import BroadcastOverlayRenderer from '../BroadcastOverlayRenderer';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '@/server/broadcast/schemas';
import type { MatchPresentationStateV1 } from '@/server/broadcast/types';

const buildState = (): MatchPresentationStateV1 => ({
  version: 1,
  revision: 0,
  status: 'LIVE',
  event: { id: 'event_1', name: 'Beach Open', logoUrl: null, organizerName: null, organizerLogoUrl: null, venue: null, court: null },
  competition: { sport: 'Beach Volleyball', format: 'Best of 3 sets', roundLabel: null, bestOf: 3, setTargets: [21, 21, 15], winBy: 2 },
  teams: [
    { id: 'team_1', displayName: 'Team 1', shortName: 'Team 1', abbreviation: 'T1', playerNames: [], logoUrl: null, accentColor: '#15558D', foregroundColor: '#FFFFFF', seed: null },
    { id: 'team_2', displayName: 'Team 2', shortName: 'Team 2', abbreviation: 'T2', playerNames: [], logoUrl: null, accentColor: '#C4512D', foregroundColor: '#FFFFFF', seed: null },
  ],
  score: { currentSet: 1, points: [0, 0], setsWon: [0, 0], sets: [], servingTeamId: null, timeoutsRemaining: {} },
  clock: { mode: 'STOPPED', startedAt: null, pausedAt: null, elapsedBeforePauseMs: 0 },
  presentation: { scoreboardVisible: true, activeStinger: null, replayState: 'UNAVAILABLE' },
  scoringMode: 'AUTOMATIC',
});

describe('BroadcastOverlayRenderer', () => {
  it('renders a compact, control-free scorebug with stable set columns', () => {
    const state = buildState();
    state.teams[0] = { ...state.teams[0], id: 'team_1', displayName: 'Summit United', shortName: 'Summit United', playerNames: ['Alex Rivera'] };
    state.teams[1] = { ...state.teams[1], id: 'team_2', displayName: 'Harbor Strikers', shortName: 'Harbor Strikers', playerNames: [] };
    state.score = {
      ...state.score,
      currentSet: 2,
      points: [28, 27],
      setsWon: [1, 0],
      servingTeamId: 'team_1',
      sets: [
        { sequence: 1, team1Points: 22, team2Points: 20, target: 21, complete: true, winnerTeamId: 'team_1' },
        { sequence: 2, team1Points: 28, team2Points: 27, target: 21, complete: false, winnerTeamId: null },
      ],
    };

    render(<BroadcastOverlayRenderer config={DEFAULT_BROADCAST_OVERLAY_CONFIG} state={state} />);

    expect(screen.getByTestId('compact-scorebug')).toBeInTheDocument();
    expect(screen.getByText('Summit United')).toBeInTheDocument();
    expect(screen.getByText('Harbor Strikers')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('22–20')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ticks a running elapsed clock locally without writing presentation state', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-11T08:00:00.000Z'));
    const state = buildState();
    state.clock = {
      mode: 'RUNNING',
      startedAt: '2026-07-11T07:58:58.000Z',
      pausedAt: null,
      elapsedBeforePauseMs: 0,
    };
    const config = {
      ...DEFAULT_BROADCAST_OVERLAY_CONFIG,
      display: { ...DEFAULT_BROADCAST_OVERLAY_CONFIG.display, showTimer: true },
    };

    render(<BroadcastOverlayRenderer config={config} state={state} />);
    expect(screen.getByText('01:02')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(1_000); });
    expect(screen.getByText('01:03')).toBeInTheDocument();
    expect(state.clock.elapsedBeforePauseMs).toBe(0);
    jest.useRealTimers();
  });
});
