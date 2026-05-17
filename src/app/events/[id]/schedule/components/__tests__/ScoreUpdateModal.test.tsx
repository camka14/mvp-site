import { useEffect, useState, type ComponentProps } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import type { Event, Match, Team } from '@/types';

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

const buildRules = (overrides: Record<string, unknown> = {}) => ({
  scoringModel: 'PERIODS',
  segmentCount: 2,
  segmentLabel: 'Half',
  supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
  autoCreatePointIncidentType: 'GOAL',
  pointIncidentRequiresParticipant: false,
  ...overrides,
});

const buildSegments = (teamAScore = 0, teamBScore = 0) => [
  {
    id: 'match_1_segment_1',
    eventId: 'event_1',
    matchId: 'match_1',
    sequence: 1,
    status: teamAScore || teamBScore ? 'IN_PROGRESS' : 'NOT_STARTED',
    scores: { team_a: teamAScore, team_b: teamBScore },
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
] as Match['segments'];

const teamWithPlayer = {
  $id: 'team_a',
  name: 'Aces',
  players: [{
    $id: 'player_1',
    firstName: 'Alex',
    lastName: 'Morgan',
    userName: 'alexm',
    fullName: 'Alex Morgan',
  }],
  playerRegistrations: [{
    id: 'registration_1',
    teamId: 'team_a',
    userId: 'player_1',
    status: 'ACTIVE',
    jerseyNumber: '9',
  }],
} as Match['team1'];

const createDeferred = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const advanceDirectScoreDebounce = async () => {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
};

const renderMutableMatchModal = (
  initialMatch: Match,
  props: Omit<ComponentProps<typeof ScoreUpdateModal>, 'match'>,
) => {
  let setCurrentMatch: ((next: Match) => void) | null = null;

  function Wrapper() {
    const [currentMatch, setCurrentMatchState] = useState(initialMatch);
    useEffect(() => {
      setCurrentMatch = setCurrentMatchState;
      return () => {
        if (setCurrentMatch === setCurrentMatchState) {
          setCurrentMatch = null;
        }
      };
    }, [setCurrentMatchState]);
    return <ScoreUpdateModal match={currentMatch} {...props} />;
  }

  const rendered = renderWithMantine(<Wrapper />);

  return {
    ...rendered,
    setMatch: async (next: Match) => {
      await act(async () => {
        setCurrentMatch?.(next);
      });
    },
  };
};

describe('ScoreUpdateModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a single set for timed events and keeps Finish Match available', () => {
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
    expect(screen.getByRole('button', { name: 'Finish Match' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Confirm Set/i })).not.toBeInTheDocument();
  });

  it('truncates long team names in score card headers', () => {
    const longTeamName = 'Test Soccer League Team 5 With An Extra Long Club Name';

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: longTeamName } as Match['team2'],
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByTitle(longTeamName)).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });

  it('uses bracket placeholder labels in the modal header and score cards', () => {
    const previousMatch = buildMatch({
      $id: 'match_60',
      matchId: 60,
      loserNextMatchId: 'match_1',
    });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          matchId: 61,
          previousLeftId: undefined,
          previousRightId: 'match_60',
          previousRightMatch: previousMatch,
          team1: undefined,
          team2: undefined,
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
        team1Placeholder="1st place (Open)"
      />,
    );

    expect(screen.getByText('1st place (Open) vs Loser of match #60')).toBeInTheDocument();
    expect(screen.getAllByText('1st place (Open)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Loser of match #60').length).toBeGreaterThan(0);
  });

  it('writes a single-set winner when finishing a timed match score', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Finish Match' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('match_1', [3], [1], [1]);
    });
  });

  it('finalizes the match when the deciding segment is confirmed and hides the manual finish button', async () => {
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules({ scoringModel: 'PERIODS', segmentCount: 2, segmentLabel: 'Half' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [1, 2],
          team2Points: [0, 1],
          setResults: [1, 0],
          matchRulesSnapshot: rules,
          segments: [
            {
              id: 'match_1_segment_1',
              eventId: 'event_1',
              matchId: 'match_1',
              sequence: 1,
              status: 'COMPLETE',
              scores: { team_a: 1, team_b: 0 },
              winnerEventTeamId: 'team_a',
              endedAt: '2026-04-19T10:20:00.000Z',
            },
            {
              id: 'match_1_segment_2',
              eventId: 'event_1',
              matchId: 'match_1',
              sequence: 2,
              status: 'IN_PROGRESS',
              scores: { team_a: 2, team_b: 1 },
              winnerEventTeamId: null,
            },
          ],
          incidents: [],
        })}
        tournament={buildEvent({
          resolvedMatchRules: rules,
        })}
        canManage
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.queryByRole('button', { name: 'Finish Match' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 2' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0]).toEqual(expect.objectContaining({
      finalize: true,
      time: expect.any(String),
    }));
    expect(onSetComplete.mock.calls[0][0].segmentOperations).toEqual([
      expect.objectContaining({
        id: 'match_1_segment_2',
        sequence: 2,
        status: 'COMPLETE',
        scores: { team_a: 2, team_b: 1 },
        winnerEventTeamId: 'team_a',
        endedAt: expect.any(String),
      }),
    ]);
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

  it('can render inline with match details expanded for the edit modal', () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
        embedded
        defaultShowDetails
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Match Details' })).not.toBeInTheDocument();
    expect(screen.getByText('Match Log')).toBeInTheDocument();
  });

  it('uses an add-incident button with player details when scoring incidents require a player', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules({ pointIncidentRequiresParticipant: true });

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
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: false,
          resolvedMatchRules: rules,
        })}
        participantTeams={[teamWithPlayer as Team]}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Record Incident' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.getAllByLabelText('Log type')[0]).toBeEnabled();
    expect(screen.getAllByLabelText('Player')[0]).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations[0]).toEqual(expect.objectContaining({
      action: 'CREATE',
      eventTeamId: 'team_a',
      eventRegistrationId: 'registration_1',
      participantUserId: 'player_1',
      incidentType: 'GOAL',
      linkedPointDelta: 1,
    }));
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([1, 0]);
  });

  it('keeps participant names when a stale roster snapshot is missing hydrated players', () => {
    const userId = '011831b7-03fc-486e-b475-7112cb931fb7';
    const registration = {
      id: 'registration_uuid',
      teamId: 'team_a',
      userId,
      status: 'ACTIVE',
      jerseyNumber: '12',
    };
    const hydratedMatchTeam = {
      ...teamWithPlayer,
      players: [{
        $id: userId,
        firstName: 'Jordan',
        lastName: 'Lee',
        userName: 'jordanlee',
        fullName: 'Jordan Lee',
      }],
      playerIds: [userId],
      playerRegistrations: [registration],
    } as Team;
    const staleParticipantTeam = {
      ...hydratedMatchTeam,
      players: undefined,
      playerRegistrations: [registration],
    } as Team;

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: hydratedMatchTeam,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent()}
        participantTeams={[staleParticipantTeam]}
        canManage
        onClose={jest.fn()}
        isOpen
        defaultShowDetails
      />,
    );

    expect(screen.getAllByLabelText('Player (optional)')[0]).toHaveValue('Jordan Lee (#12)');
    expect(screen.queryByDisplayValue(userId)).not.toBeInTheDocument();
    expect(screen.queryByText(userId)).not.toBeInTheDocument();
  });

  it('does not expose raw participant ids when a player cannot be hydrated', () => {
    const userId = '011831b7-03fc-486e-b475-7112cb931fb7';
    const registration = {
      id: 'registration_uuid',
      teamId: 'team_a',
      userId,
      status: 'ACTIVE',
      jerseyNumber: '12',
    };
    const teamWithoutPlayers = {
      $id: 'team_a',
      name: 'Aces',
      division: 'Open',
      sport: 'Soccer',
      playerIds: [userId],
      captainId: userId,
      pending: [],
      teamSize: 1,
      currentSize: 1,
      isFull: true,
      avatarUrl: '',
      playerRegistrations: [registration],
    } as Team;

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithoutPlayers,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
        defaultShowDetails
      />,
    );

    expect(screen.getAllByLabelText('Player (optional)')[0]).toHaveValue('Participant (#12)');
    expect(screen.queryByDisplayValue(userId)).not.toBeInTheDocument();
    expect(screen.queryByText(userId)).not.toBeInTheDocument();
  });

  it('uses roster players when the team-level event registration is present', () => {
    const teamLevelRegistration = {
      id: 'event_1__team__team_a',
      teamId: 'team_a',
      userId: 'team_a',
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
    };
    const teamWithTeamRegistration = {
      $id: 'team_a',
      name: 'Aces',
      division: 'Open',
      sport: 'Soccer',
      playerIds: ['player_1', 'player_2'],
      captainId: 'player_1',
      pending: [],
      teamSize: 2,
      currentSize: 2,
      isFull: true,
      avatarUrl: '',
      players: [
        {
          $id: 'player_1',
          firstName: 'Alex',
          lastName: 'Morgan',
          userName: 'alexm',
          fullName: 'Alex Morgan',
        },
        {
          $id: 'player_2',
          firstName: 'Jordan',
          lastName: 'Lee',
          userName: 'jordanlee',
          fullName: 'Jordan Lee',
        },
      ],
      playerRegistrations: [teamLevelRegistration],
    } as Team;

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithTeamRegistration,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
        defaultShowDetails
      />,
    );

    expect(screen.getAllByLabelText('Player (optional)')[0]).toHaveValue('Alex Morgan');
    expect(screen.queryByDisplayValue('Participant')).not.toBeInTheDocument();
  });

  it('honors event-level record-player scoring when a match snapshot is stale', () => {
    const staleMatchRules = buildRules({ pointIncidentRequiresParticipant: false });
    const eventRules = buildRules({ pointIncidentRequiresParticipant: true });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: staleMatchRules,
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: eventRules,
        })}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add Incident' }).length).toBe(2);
  });

  it('uses incident controls when event-level incident scoring is enabled with stale non-player rules', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const staleRules = buildRules({ pointIncidentRequiresParticipant: false });

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
          matchRulesSnapshot: staleRules,
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: staleRules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Record Incident' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Player (optional)')[0]).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations[0]).toEqual(expect.objectContaining({
      action: 'CREATE',
      eventTeamId: 'team_a',
      eventRegistrationId: null,
      participantUserId: null,
      incidentType: 'GOAL',
      linkedPointDelta: 1,
    }));
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([1, 0]);
  });

  it('uses score set writes instead of scoring incidents for non-player scoring', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [1, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(1, 0),
          incidents: [{
            id: 'incident_1',
            eventId: 'event_1',
            matchId: 'match_1',
            segmentId: 'match_1_segment_1',
            eventTeamId: 'team_a',
            incidentType: 'GOAL',
            sequence: 1,
            linkedPointDelta: 1,
          }],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: false,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '-' })[0]);

    expect(onScoreChange).not.toHaveBeenCalled();

    await advanceDirectScoreDebounce();

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].scoreSet).toEqual({
      segmentId: 'match_1_segment_1',
      sequence: 1,
      eventTeamId: 'team_a',
      points: 0,
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations).toBeUndefined();
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([0, 0]);
  });

  it('hides implementation scoring incidents when non-player scoring has persisted points', async () => {
    const rules = buildRules();

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [1, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(1, 0),
          incidents: [{
            id: 'incident_1',
            eventId: 'event_1',
            matchId: 'match_1',
            segmentId: 'match_1_segment_1',
            eventTeamId: 'team_a',
            incidentType: 'GOAL',
            sequence: 1,
            minute: 5,
            linkedPointDelta: 1,
          }],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: false,
          resolvedMatchRules: rules,
        })}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(await screen.findByText('No match details recorded.')).toBeInTheDocument();
    expect(screen.queryByText("Aces | 5'")).not.toBeInTheDocument();
  });

  it('uses score set writes for non-player plus and minus while the modal is open', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();

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
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: false,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    expect(onScoreChange).not.toHaveBeenCalled();

    await advanceDirectScoreDebounce();

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].scoreSet).toEqual({
      segmentId: 'match_1_segment_1',
      sequence: 1,
      eventTeamId: 'team_a',
      points: 3,
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations).toBeUndefined();
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([3, 0]);
  });

  it('uses the match division set count when legacy event-level league rules still say one set', () => {
    const staleRules = buildRules({ scoringModel: 'SETS', segmentCount: 1, segmentLabel: 'Set' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          division: 'division_open',
          team1Points: [0],
          team2Points: [0],
          setResults: [0],
          resolvedMatchRules: staleRules as Match['resolvedMatchRules'],
          segments: [],
          incidents: [],
        })}
        tournament={buildEvent({
          usesSets: true,
          setsPerMatch: 1,
          pointsToVictory: [21],
          leagueConfig: {
            gamesPerOpponent: 1,
            includePlayoffs: false,
            usesSets: true,
            setsPerMatch: 1,
            pointsToVictory: [21],
          },
          resolvedMatchRules: staleRules as Event['resolvedMatchRules'],
          divisionDetails: [{
            id: 'division_open',
            name: 'Open',
            setsPerMatch: 3,
            pointsToVictory: [21, 21, 15],
          }],
        })}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByText(/Best of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set 3' })).toBeInTheDocument();
  });

  it('limits set score increases to the first reachable win-by-two score', () => {
    jest.useFakeTimers();
    const rules = buildRules({ scoringModel: 'SETS', segmentCount: 3, segmentLabel: 'Set' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [20, 0, 0],
          team2Points: [20, 0, 0],
          setResults: [0, 0, 0],
          matchRulesSnapshot: rules,
          segments: [{
            id: 'match_1_segment_1',
            eventId: 'event_1',
            matchId: 'match_1',
            sequence: 1,
            status: 'IN_PROGRESS',
            scores: { team_a: 20, team_b: 20 },
            winnerEventTeamId: null,
          }],
          incidents: [],
        })}
        tournament={buildEvent({
          usesSets: true,
          setsPerMatch: 3,
          pointsToVictory: [21, 21, 15],
          resolvedMatchRules: rules as Event['resolvedMatchRules'],
        })}
        canManage
        onScoreChange={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm Set 1' })).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    expect(screen.getByRole('button', { name: 'Confirm Set 1' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '+' })[0]).toBeEnabled();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    expect(screen.getByRole('button', { name: 'Confirm Set 1' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: '+' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '+' })[1]).toBeDisabled();
  });

  it('does not let officials add points after a set already reached target with a two-point lead', () => {
    const rules = buildRules({ scoringModel: 'SETS', segmentCount: 3, segmentLabel: 'Set' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [21, 0, 0],
          team2Points: [19, 0, 0],
          setResults: [0, 0, 0],
          matchRulesSnapshot: rules,
          segments: [{
            id: 'match_1_segment_1',
            eventId: 'event_1',
            matchId: 'match_1',
            sequence: 1,
            status: 'IN_PROGRESS',
            scores: { team_a: 21, team_b: 19 },
            winnerEventTeamId: null,
          }],
          incidents: [],
        })}
        tournament={buildEvent({
          usesSets: true,
          setsPerMatch: 3,
          pointsToVictory: [21, 21, 15],
          resolvedMatchRules: rules as Event['resolvedMatchRules'],
        })}
        canManage
        onScoreChange={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm Set 1' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: '+' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '+' })[1]).toBeDisabled();
  });

  it('uses legacy score arrays instead of the score endpoint for division-derived segments that are not persisted', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const staleRules = buildRules({ scoringModel: 'SETS', segmentCount: 1, segmentLabel: 'Set' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          division: 'division_open',
          team1Points: [21],
          team2Points: [10],
          setResults: [1],
          resolvedMatchRules: staleRules as Match['resolvedMatchRules'],
          segments: [{
            id: 'match_1_segment_1',
            eventId: 'event_1',
            matchId: 'match_1',
            sequence: 1,
            status: 'COMPLETE',
            scores: { team_a: 21, team_b: 10 },
            winnerEventTeamId: 'team_a',
          }],
          incidents: [],
        })}
        tournament={buildEvent({
          usesSets: true,
          setsPerMatch: 1,
          pointsToVictory: [21],
          leagueConfig: {
            gamesPerOpponent: 1,
            includePlayoffs: false,
            usesSets: true,
            setsPerMatch: 1,
            pointsToVictory: [21],
          },
          resolvedMatchRules: staleRules as Event['resolvedMatchRules'],
          divisionDetails: [{
            id: 'division_open',
            name: 'Open',
            setsPerMatch: 3,
            pointsToVictory: [21, 21, 15],
          }],
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm Set 2' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    await advanceDirectScoreDebounce();

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].scoreSet).toBeUndefined();
    expect(onScoreChange.mock.calls[0][0].segmentOperations).toBeUndefined();
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([21, 1, 0]);
    expect(onScoreChange.mock.calls[0][0].team2Points).toEqual([10, 0, 0]);
  });

  it('confirms a division-derived segment through legacy score arrays when the segment is not persisted', async () => {
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const staleRules = buildRules({ scoringModel: 'SETS', segmentCount: 1, segmentLabel: 'Set' });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          division: 'division_open',
          team1Points: [10, 21],
          team2Points: [21, 10],
          setResults: [2, 0],
          resolvedMatchRules: staleRules as Match['resolvedMatchRules'],
          segments: [{
            id: 'match_1_segment_1',
            eventId: 'event_1',
            matchId: 'match_1',
            sequence: 1,
            status: 'COMPLETE',
            scores: { team_a: 10, team_b: 21 },
            winnerEventTeamId: 'team_b',
          }],
          incidents: [],
        })}
        tournament={buildEvent({
          usesSets: true,
          setsPerMatch: 1,
          pointsToVictory: [21],
          leagueConfig: {
            gamesPerOpponent: 1,
            includePlayoffs: false,
            usesSets: true,
            setsPerMatch: 1,
            pointsToVictory: [21],
          },
          resolvedMatchRules: staleRules as Event['resolvedMatchRules'],
          divisionDetails: [{
            id: 'division_open',
            name: 'Open',
            setsPerMatch: 3,
            pointsToVictory: [21, 21, 15],
          }],
        })}
        canManage
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Set 2' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].segmentOperations).toBeUndefined();
    expect(onSetComplete.mock.calls[0][0].team1Points).toEqual([10, 21, 0]);
    expect(onSetComplete.mock.calls[0][0].team2Points).toEqual([21, 10, 0]);
    expect(onSetComplete.mock.calls[0][0].setResults).toEqual([2, 1, 0]);
  });

  it('keeps locally incremented score visible when stale match props rerender before the debounced sync fires', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();
    const staleMatch = buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
      team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
      team1Points: [0, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      matchRulesSnapshot: rules,
      segments: buildSegments(),
      incidents: [],
    });
    const tournament = buildEvent({
      autoCreatePointMatchIncidents: false,
      resolvedMatchRules: rules,
    });

    const { setMatch } = renderMutableMatchModal(staleMatch, {
      tournament,
      canManage: true,
      onScoreChange,
      onClose: jest.fn(),
      isOpen: true,
    });

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    expect(screen.getAllByText(/^1$/).length).toBeGreaterThan(0);

    await setMatch(buildMatch({
      ...staleMatch,
      team1: staleMatch.team1,
      team2: staleMatch.team2,
      matchRulesSnapshot: rules,
      segments: buildSegments(),
      incidents: [],
    }));

    expect(screen.getAllByText(/^1$/).length).toBeGreaterThan(0);
    expect(onScoreChange).not.toHaveBeenCalled();
  });

  it('keeps a newer local score visible when an older debounced response resolves first', async () => {
    jest.useFakeTimers();
    const firstSync = createDeferred();
    const secondSync = createDeferred();
    const onScoreChange = jest.fn()
      .mockImplementationOnce(() => firstSync.promise)
      .mockImplementationOnce(() => secondSync.promise);
    const rules = buildRules();
    const tournament = buildEvent({
      autoCreatePointMatchIncidents: false,
      resolvedMatchRules: rules,
    });

    const { setMatch } = renderMutableMatchModal(buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
      team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
      team1Points: [0, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      matchRulesSnapshot: rules,
      segments: buildSegments(),
      incidents: [],
    }), {
      tournament,
      canManage: true,
      onScoreChange,
      onClose: jest.fn(),
      isOpen: true,
    });

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    await advanceDirectScoreDebounce();
    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    expect(screen.getAllByText(/^2$/).length).toBeGreaterThan(0);

    firstSync.resolve();
    await act(async () => {
      await firstSync.promise;
    });

    await setMatch(buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
      team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
      team1Points: [1, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      matchRulesSnapshot: rules,
      segments: buildSegments(1, 0),
      incidents: [],
    }));

    expect(screen.getAllByText(/^2$/).length).toBeGreaterThan(0);

    await advanceDirectScoreDebounce();
    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(2);
    });

    secondSync.resolve();
    await act(async () => {
      await secondSync.promise;
    });
  });

  it('cancels a pending debounced score post when confirming the segment', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();

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
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: false,
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });

    await advanceDirectScoreDebounce();

    expect(onScoreChange).not.toHaveBeenCalled();
  });

  it('keeps a failed debounced direct score locally and uses it when confirming the segment', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn().mockRejectedValueOnce(new Error('offline'));
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();
    const tournament = buildEvent({
      autoCreatePointMatchIncidents: false,
      resolvedMatchRules: rules,
    });
    const staleMatch = buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: { $id: 'team_a', name: 'Aces' } as Match['team1'],
      team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
      team1Points: [0, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      matchRulesSnapshot: rules,
      segments: buildSegments(),
      incidents: [],
    });

    const { setMatch } = renderMutableMatchModal(staleMatch, {
      tournament,
      canManage: true,
      onScoreChange,
      onSetComplete,
      onClose: jest.fn(),
      isOpen: true,
    });

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    await advanceDirectScoreDebounce();

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });

    await setMatch(buildMatch({
      ...staleMatch,
      team1: staleMatch.team1,
      team2: staleMatch.team2,
      matchRulesSnapshot: rules,
      segments: buildSegments(),
      incidents: [],
    }));

    expect(screen.getAllByText(/^1$/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].segmentOperations).toEqual([
      expect.objectContaining({
        id: 'match_1_segment_1',
        status: 'COMPLETE',
        scores: { team_a: 1, team_b: 0 },
        winnerEventTeamId: 'team_a',
      }),
    ]);
  });

  it('renders match details with resolved officials and compact scoring incident labels', async () => {
    const rules = buildRules({ pointIncidentRequiresParticipant: true });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          teamOfficialId: 'team_official',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          teamOfficial: { $id: 'team_official', name: 'New test team' } as Match['teamOfficial'],
          team1Points: [1, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(1, 0),
          officialCheckedIn: true,
          officialIds: [{
            positionId: 'referee',
            slotIndex: 0,
            holderType: 'OFFICIAL',
            userId: 'official_user',
            checkedIn: true,
          }],
          incidents: [{
            id: 'incident_1',
            eventId: 'event_1',
            matchId: 'match_1',
            segmentId: 'match_1_segment_1',
            eventTeamId: 'team_a',
            eventRegistrationId: 'registration_1',
            participantUserId: 'player_1',
            incidentType: 'GOAL',
            sequence: 1,
            minute: 12,
            linkedPointDelta: 1,
          }],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
          officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
          officials: [{
            $id: 'official_user',
            firstName: 'Samuel',
            lastName: 'Razumovskiy',
            userName: 'samuel',
            fullName: 'Samuel Razumovskiy',
          }] as Event['officials'],
        })}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(await screen.findByText('Referee: Samuel Razumovskiy (checked in)')).toBeInTheDocument();
    expect(screen.getByText('Team official: New test team (checked in)')).toBeInTheDocument();
    expect(screen.getByText("Aces | Alex Morgan #9 | 12'")).toBeInTheDocument();
    expect(screen.queryByText(/official_user/)).not.toBeInTheDocument();
  });

  it('starts a match with an actual start time without showing the standard status block', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules({ pointIncidentRequiresParticipant: true });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(),
          resultStatus: 'OFFICIAL',
          statusReason: null,
          incidents: [],
        })}
        tournament={buildEvent({
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    expect(screen.queryByText('Lifecycle')).not.toBeInTheDocument();
    expect(screen.queryByText('No status reason')).not.toBeInTheDocument();
    const startMatchButton = await screen.findByRole('button', { name: 'Start Match' });
    const confirmButton = screen.getByRole('button', { name: /Confirm/ });
    expect(
      startMatchButton.compareDocumentPosition(confirmButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(startMatchButton);

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].lifecycle).toEqual(expect.objectContaining({
      status: 'IN_PROGRESS',
      actualStart: expect.any(String),
      actualEnd: null,
    }));
  });

  it('shows actual time edit controls for officials', async () => {
    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: buildRules(),
          segments: buildSegments(),
          actualStart: '2026-04-19T10:00:00.000Z',
          actualEnd: null,
        })}
        tournament={buildEvent()}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Times' }));

    expect(screen.getByLabelText('Actual start')).toBeInTheDocument();
    expect(screen.getByLabelText('Actual end')).toBeInTheDocument();
  });

  it('edits existing match log incidents from match details', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules();

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(),
          incidents: [{
            id: 'incident_note',
            eventId: 'event_1',
            matchId: 'match_1',
            segmentId: 'match_1_segment_1',
            eventTeamId: 'team_a',
            eventRegistrationId: 'registration_1',
            participantUserId: 'player_1',
            incidentType: 'NOTE',
            sequence: 1,
            minute: 4,
            linkedPointDelta: null,
            note: 'Initial note',
          }],
        })}
        tournament={buildEvent({
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Match note' }));
    expect(screen.getByText('Edit Match Log')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minute'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Match Log' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations).toEqual([expect.objectContaining({
      action: 'UPDATE',
      id: 'incident_note',
      segmentId: 'match_1_segment_1',
      eventTeamId: 'team_a',
      eventRegistrationId: 'registration_1',
      participantUserId: 'player_1',
      incidentType: 'NOTE',
      minute: 9,
      linkedPointDelta: null,
      note: 'Updated note',
    })]);
  });

  it('edits player-recorded scoring incidents without duplicating the point', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const rules = buildRules({ pointIncidentRequiresParticipant: true });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [1, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(1, 0),
          incidents: [{
            id: 'incident_goal',
            eventId: 'event_1',
            matchId: 'match_1',
            segmentId: 'match_1_segment_1',
            eventTeamId: 'team_a',
            eventRegistrationId: 'registration_1',
            participantUserId: 'player_1',
            incidentType: 'GOAL',
            sequence: 1,
            minute: 4,
            linkedPointDelta: 1,
          }],
        })}
        tournament={buildEvent({
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Goal' }));
    fireEvent.change(screen.getByLabelText('Minute'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Match Log' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations).toEqual([expect.objectContaining({
      action: 'UPDATE',
      id: 'incident_goal',
      incidentType: 'GOAL',
      linkedPointDelta: 1,
      minute: 6,
    })]);
    expect(onScoreChange.mock.calls[0][0].team1Points).toEqual([1, 0]);
  });

  it('drains a failed scoring incident create before confirming the segment', async () => {
    const onScoreChange = jest.fn().mockRejectedValueOnce(new Error('offline'));
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const rules = {
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: true,
    };

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    const failedIncidentOperation = onScoreChange.mock.calls[0][0].incidentOperations[0];
    expect(failedIncidentOperation).toEqual(expect.objectContaining({
      action: 'CREATE',
      eventTeamId: 'team_a',
      eventRegistrationId: 'registration_1',
      participantUserId: 'player_1',
      incidentType: 'GOAL',
      linkedPointDelta: 1,
    }));
    expect(failedIncidentOperation.id).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(2);
    });
    expect(onScoreChange.mock.calls[1][0].incidentOperations).toEqual([failedIncidentOperation]);

    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].incidentOperations).toBeUndefined();
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
      pointIncidentRequiresParticipant: true,
    };
    const match = buildMatch({
      team1Id: 'team_a',
      team2Id: 'team_b',
      team1: teamWithPlayer,
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    const failedIncidentOperation = onScoreChange.mock.calls[0][0].incidentOperations[0];

    unmount();

    const retryScoreChange = jest.fn().mockResolvedValue(undefined);
    renderWithMantine(
      <ScoreUpdateModal
        match={match}
        tournament={tournament}
        canManage
        onScoreChange={retryScoreChange}
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Half 1' }));

    await waitFor(() => {
      expect(retryScoreChange).toHaveBeenCalledWith(expect.objectContaining({
        incidentOperations: [failedIncidentOperation],
      }));
    });
    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalledTimes(1);
    });
    expect(onSetComplete.mock.calls[0][0].incidentOperations).toBeUndefined();
    expect(onSetComplete.mock.calls[0][0].segmentOperations[0]).toEqual(expect.objectContaining({
      id: 'match_1_segment_1',
      status: 'COMPLETE',
      scores: { team_a: 1, team_b: 0 },
      winnerEventTeamId: 'team_a',
    }));
  });

  it('backs off queued incident action retries and resets after success', async () => {
    jest.useFakeTimers();
    const onScoreChange = jest.fn()
      .mockRejectedValueOnce(new Error('offline once'))
      .mockRejectedValueOnce(new Error('offline twice'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline after reset'))
      .mockResolvedValue(undefined);
    const rules = buildRules({ pointIncidentRequiresParticipant: true });

    renderWithMantine(
      <ScoreUpdateModal
        match={buildMatch({
          team1Id: 'team_a',
          team2Id: 'team_b',
          team1: teamWithPlayer,
          team2: { $id: 'team_b', name: 'Diggers' } as Match['team2'],
          team1Points: [0, 0],
          team2Points: [0, 0],
          setResults: [0, 0],
          matchRulesSnapshot: rules,
          segments: buildSegments(),
          incidents: [],
        })}
        tournament={buildEvent({
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    const queuedOperation = onScoreChange.mock.calls[0][0].incidentOperations[0];

    await act(async () => {
      jest.advanceTimersByTime(2999);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(2);
    expect(onScoreChange.mock.calls[1][0].incidentOperations).toEqual([queuedOperation]);

    await act(async () => {
      jest.advanceTimersByTime(14999);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(3);
    expect(onScoreChange.mock.calls[2][0].incidentOperations).toEqual([queuedOperation]);
    expect(window.localStorage.getItem('bracketiq:pending-match-incidents:event_1:match_1')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Incident' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Incident' }));

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(4);
    });
    const nextQueuedOperation = onScoreChange.mock.calls[3][0].incidentOperations[0];
    expect(nextQueuedOperation.id).not.toEqual(queuedOperation.id);

    await act(async () => {
      jest.advanceTimersByTime(2999);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(4);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(onScoreChange).toHaveBeenCalledTimes(5);
    expect(onScoreChange.mock.calls[4][0].incidentOperations).toEqual([nextQueuedOperation]);
  });
});
