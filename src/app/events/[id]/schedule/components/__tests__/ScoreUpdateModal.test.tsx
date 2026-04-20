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

describe('ScoreUpdateModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    expect(await screen.findByText('Record Incident')).toBeInTheDocument();
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

  it('uses score set writes instead of scoring incidents for non-player scoring', async () => {
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
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '-' })[0]);

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
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
        })}
        canManage
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));

    expect(await screen.findByText('No match details recorded.')).toBeInTheDocument();
    expect(screen.queryByText("Aces | 5'")).not.toBeInTheDocument();
  });

  it('uses score set writes for non-player plus and minus while the modal is open', async () => {
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
          autoCreatePointMatchIncidents: true,
          resolvedMatchRules: rules,
        })}
        canManage
        onScoreChange={onScoreChange}
        onClose={jest.fn()}
        isOpen
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(1);
    });
    expect(onScoreChange.mock.calls[0][0].scoreSet).toEqual({
      segmentId: 'match_1_segment_1',
      sequence: 1,
      eventTeamId: 'team_a',
      points: 1,
    });
    expect(onScoreChange.mock.calls[0][0].incidentOperations).toBeUndefined();

    fireEvent.click(screen.getAllByRole('button', { name: '-' })[0]);

    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalledTimes(2);
    });
    expect(onScoreChange.mock.calls[1][0].scoreSet).toEqual({
      segmentId: 'match_1_segment_1',
      sequence: 1,
      eventTeamId: 'team_a',
      points: 0,
    });
    expect(onScoreChange.mock.calls[1][0].incidentOperations).toBeUndefined();
    expect(onScoreChange.mock.calls[1][0].team1Points).toEqual([0, 0]);
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

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Match Details' }));
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
