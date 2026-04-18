import { fireEvent, screen, waitFor } from '@testing-library/react';

import type { Event, Match } from '@/types';

import ScoreUpdateModal from '../ScoreUpdateModal';
import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event_1',
  eventType: 'LEAGUE',
  sport: {
    usePointsForDraw: false,
  } as Event['sport'],
  usesSets: false,
  winnerSetCount: 3,
  loserSetCount: 3,
  winnerBracketPointsToVictory: [21, 21, 15],
  loserBracketPointsToVictory: [21, 21, 15],
  ...overrides,
} as Event);

const buildMatch = (overrides: Partial<Match> = {}): Match => ({
  $id: 'match_1',
  matchId: 1,
  start: '2026-03-01T10:00:00.000Z',
  end: '2026-03-01T11:00:00.000Z',
  team1Points: [0, 0, 0],
  team2Points: [0, 0, 0],
  setResults: [0, 0, 0],
  losersBracket: false,
  previousLeftId: 'previous_match',
  ...overrides,
} as Match);

describe('ScoreUpdateModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses a single set for timed events and keeps Save Match available', () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch()}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByText(/Best of 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Match' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Confirm Set/i })).not.toBeInTheDocument();
  });

  it('writes a single-set winner when saving a timed match score', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Points: [3, 0, 0],
          team2Points: [1, 0, 0],
          setResults: [0, 0, 0],
        })}
        tournament={buildEvent()}
        canManage
        onSubmit={onSubmit}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Match' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('match_1', [3], [1], [1]);
    });
  });

  it('shows a field location toggle and expands the embedded map', () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          field: {
            $id: 'field_1',
            name: 'Court 1',
            location: '123 Demo St',
            lat: 45.5,
            long: -122.6,
          } as Match['field'],
        })}
        tournament={buildEvent({
          location: 'Fallback Event Location',
          coordinates: [45.4, -122.7],
        } as Partial<Event>)}
        canManage={false}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByRole('button', { name: 'View Field Location' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Field Location' }));
    expect(screen.getByTitle('Match field location preview')).toBeInTheDocument();
  });

  it('resends a failed scoring incident create when confirming the segment', async () => {
    const onScoreChange = jest.fn().mockRejectedValueOnce(new Error('offline'));
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = {
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: false,
    };

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: [
            {
              id: 'match_1_segment_1',
              eventId: 'event_1',
              matchId: 'match_1',
              sequence: 1,
              status: 'NOT_STARTED',
              scores: { team_a: 0, team_b: 0 },
              winnerEventTeamId: null,
            },
            {
              id: 'match_1_segment_2',
              eventId: 'event_1',
              matchId: 'match_1',
              sequence: 2,
              status: 'NOT_STARTED',
              scores: { team_a: 0, team_b: 0 },
              winnerEventTeamId: null,
            },
          ],
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Point' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    const failedIncidentOperation = onScoreChange.mock.calls[0][0].incidentOperations[0];
    expect(failedIncidentOperation).toEqual(expect.objectContaining({
      action: 'CREATE',
      eventTeamId: 'team_a',
      incidentType: 'GOAL',
      linkedPointDelta: 1,
    }));
    expect(failedIncidentOperation.id).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].incidentOperations).toEqual([failedIncidentOperation]);
    expect(onSetComplete.mock.calls[0][0].segmentOperations[0]).toEqual(expect.objectContaining({
      id: 'match_1_segment_1',
      status: 'COMPLETE',
      scores: { team_a: 1, team_b: 0 },
      winnerEventTeamId: 'team_a',
    }));
  });

  it('keeps failed scoring incident creates available after closing and reopening the modal', async () => {
    const onScoreChange = jest.fn().mockRejectedValueOnce(new Error('offline'));
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = {
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: false,
    };
    const match = buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
      team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
      team1Points: [0, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      matchRulesSnapshot: rules,
      segments: [
        {
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'NOT_STARTED',
          scores: { team_a: 0, team_b: 0 },
          winnerEventTeamId: null,
        },
        {
          id: 'match_1_segment_2',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 2,
          status: 'NOT_STARTED',
          scores: { team_a: 0, team_b: 0 },
          winnerEventTeamId: null,
        },
      ],
      incidents: [],
    });
    const tournament = buildEvent({
      autoCreatePointMatchIncidents: true,
      resolvedMatchRules: rules,
    });

    const { unmount } = renderWithMantine(
      <ScoreUpdateModal
        match={match}
        tournament={tournament}
        canManage
        onScoreChange={onScoreChange}
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Point' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    const failedIncidentOperation = onScoreChange.mock.calls[0][0].incidentOperations[0];

    unmount();

    renderWithMantine(
      <ScoreUpdateModal
        match={match}
        tournament={tournament}
        canManage
        onScoreChange={jest.fn()}
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].incidentOperations).toEqual([failedIncidentOperation]);
    expect(onSetComplete.mock.calls[0][0].segmentOperations[0]).toEqual(expect.objectContaining({
      id: 'match_1_segment_1',
      status: 'COMPLETE',
      scores: { team_a: 1, team_b: 0 },
      winnerEventTeamId: 'team_a',
    }));
  });
});
