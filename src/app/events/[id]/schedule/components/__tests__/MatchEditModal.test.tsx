import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { Event, Match, ResolvedMatchRules, Team, UserData } from '@/types';

import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

import MatchEditModal, { actualMatchTimePayload } from '../MatchEditModal';

describe('actualMatchTimePayload', () => {
  it('maps actual match times to API-safe strings', () => {
    expect(actualMatchTimePayload(new Date('2026-04-19T10:05:00.000Z'), new Date('2026-04-19T10:55:00.000Z'))).toEqual({
      actualStart: '2026-04-19T10:05:00.000Z',
      actualEnd: '2026-04-19T10:55:00.000Z',
    });
  });

  it('keeps cleared actual match times as null', () => {
    expect(actualMatchTimePayload(null, null)).toEqual({
      actualStart: null,
      actualEnd: null,
    });
  });
});

describe('MatchEditModal', () => {
  const teams = [
    { $id: 'team_a', name: 'Aces' },
    { $id: 'team_b', name: 'Diggers' },
    { $id: 'team_c', name: 'Harbor Strikers' },
  ] as Team[];

  const pointsOnlyRules = {
    scoringModel: 'POINTS_ONLY',
    segmentCount: 1,
    segmentLabel: 'Total',
    supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
    autoCreatePointIncidentType: 'GOAL',
    pointIncidentRequiresParticipant: false,
  } as ResolvedMatchRules;

  const event = {
    $id: 'event_1',
    eventType: 'LEAGUE',
    usesSets: false,
    resolvedMatchRules: pointsOnlyRules,
  } as Event;

  const match = {
    $id: 'match_1',
    matchId: 1,
    eventId: 'event_1',
    start: '2026-03-01T10:00:00.000Z',
    end: '2026-03-01T11:00:00.000Z',
    team1Id: 'team_a',
    team2Id: 'team_b',
    team1: teams[0],
    team2: teams[1],
    team1Points: [0],
    team2Points: [0],
    setResults: [0],
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
    ],
    incidents: [],
  } as Match;

  const renderModal = ({
    targetMatch = match,
    targetEvent = event,
    onSave = jest.fn(),
    ...props
  }: {
    targetMatch?: Match;
    targetEvent?: Event;
    onSave?: jest.Mock;
    [key: string]: unknown;
  } = {}) => {
    renderWithMantine(
      <MatchEditModal
        opened
        match={targetMatch}
        tournament={targetEvent}
        teams={teams}
        canManageOperations
        onClose={jest.fn()}
        onSave={onSave}
        {...props}
      />,
    );
    return { onSave };
  };

  it('renders one host draft form and a read-only preview without official operations', () => {
    renderModal({
      targetMatch: {
        ...match,
        status: 'IN_PROGRESS',
        actualStart: '2026-03-01T10:00:00.000Z',
        segments: match.segments?.map((segment) => ({
          ...segment,
          status: 'IN_PROGRESS',
        })),
      } as Match,
    });

    expect(screen.getByText('Admin edit')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Match setup and schedule' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Official Assignments' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rules and bracket' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Match State' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Match details preview' })).toBeInTheDocument();
    expect(screen.getByLabelText('Match Aces score')).toBeInTheDocument();
    expect(screen.queryByText('Match Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('Match Log')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Incident' })).not.toBeInTheDocument();
  });

  it('saves the direct score values shown for a scheduled match', () => {
    const onSave = jest.fn();
    const setRules = {
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      setPointTargets: [25, 25, 15],
      supportedIncidentTypes: ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'POINT',
      pointIncidentRequiresParticipant: false,
    } as ResolvedMatchRules;
    const scheduledMatch = {
      ...match,
      status: 'SCHEDULED',
      matchRulesSnapshot: setRules,
      resolvedMatchRules: setRules,
      segments: [
        {
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'NOT_STARTED',
          scores: { team_a: 3, team_b: 0 },
          winnerEventTeamId: null,
        },
      ],
    } as Match;

    renderModal({
      targetMatch: scheduledMatch,
      targetEvent: {
        ...event,
        usesSets: true,
        resolvedMatchRules: setRules,
      } as Event,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        status: 'SCHEDULED',
        team1Points: [3, 0, 0],
        team2Points: [0, 0, 0],
        setResults: [0, 0, 0],
        winnerEventTeamId: null,
      }),
    );
  });

  it('renders and saves one numeric score-limit input per configured set', async () => {
    const onSave = jest.fn();
    const setRules = {
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      setPointTargets: [21, 21, 15],
    } as ResolvedMatchRules;

    renderModal({
      targetMatch: {
        ...match,
        matchRulesSnapshot: setRules,
        resolvedMatchRules: setRules,
      } as Match,
      targetEvent: {
        ...event,
        usesSets: true,
        resolvedMatchRules: setRules,
      } as Event,
      onSave,
    });

    const rulesPanel = screen.getByRole('region', { name: 'Rules and bracket' });
    expect(within(rulesPanel).getAllByLabelText(/Set \d+ score limit/)).toHaveLength(3);
    expect(screen.getByLabelText('Set 1 score limit')).toHaveValue('21');
    expect(screen.getByLabelText('Set 2 score limit')).toHaveValue('21');
    expect(screen.getByLabelText('Set 3 score limit')).toHaveValue('15');

    fireEvent.change(screen.getByLabelText('Set count'), { target: { value: '4' } });

    await waitFor(() => {
      expect(within(rulesPanel).getAllByLabelText(/Set \d+ score limit/)).toHaveLength(4);
    });
    fireEvent.change(screen.getByLabelText('Set 4 score limit'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave.mock.calls[0][0].matchRulesSnapshot).toEqual(
      expect.objectContaining({
        segmentCount: 4,
        setPointTargets: [21, 21, 15, 11],
      }),
    );
  });

  it('keeps a loser-bracket match to its configured single set when stale rows remain', () => {
    const onSave = jest.fn();
    const loserMatch = {
      ...match,
      losersBracket: true,
      status: 'IN_PROGRESS',
      actualStart: '2026-03-01T10:00:00.000Z',
      team1Points: [0, 0, 0],
      team2Points: [0, 0, 0],
      setResults: [0, 0, 0],
      resolvedMatchRules: {
        scoringModel: 'SETS',
        segmentCount: 3,
        segmentLabel: 'Set',
        setPointTargets: [21, 21, 15],
      },
      segments: [1, 2, 3].map((sequence) => ({
        id: `match_1_segment_${sequence}`,
        eventId: 'event_1',
        matchId: 'match_1',
        sequence,
        status: sequence === 1 ? 'IN_PROGRESS' : 'NOT_STARTED',
        scores: { team_a: 0, team_b: 0 },
        winnerEventTeamId: null,
      })),
    } as Match;

    renderModal({
      targetMatch: loserMatch,
      targetEvent: {
        ...event,
        usesSets: true,
        winnerSetCount: 3,
        loserSetCount: 1,
      } as Event,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave.mock.calls[0][0].segments).toHaveLength(1);
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        team1Points: [0],
        team2Points: [0],
        setResults: [0],
      }),
    );
  });

  it('unlocks the next set from the local confirmation without saving or closing', async () => {
    const onSave = jest.fn();
    const setRules = {
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      setPointTargets: [25, 25, 15],
    } as ResolvedMatchRules;
    const setMatch = {
      ...match,
      status: 'IN_PROGRESS',
      actualStart: '2026-03-01T10:00:00.000Z',
      matchRulesSnapshot: setRules,
      resolvedMatchRules: setRules,
      team1Points: [25, 0, 0],
      team2Points: [20, 0, 0],
      setResults: [0, 0, 0],
      segments: [
        {
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'IN_PROGRESS',
          scores: { team_a: 25, team_b: 20 },
          winnerEventTeamId: null,
        },
        ...[2, 3].map((sequence) => ({
          id: `match_1_segment_${sequence}`,
          eventId: 'event_1',
          matchId: 'match_1',
          sequence,
          status: 'NOT_STARTED' as const,
          scores: { team_a: 0, team_b: 0 },
          winnerEventTeamId: null,
        })),
      ],
    } as Match;

    renderModal({
      targetMatch: setMatch,
      targetEvent: {
        ...event,
        usesSets: true,
        resolvedMatchRules: setRules,
      } as Event,
      onSave,
    });

    const set1 = screen.getByRole('checkbox', { name: 'Set 1 confirmed' });
    const set2 = screen.getByRole('checkbox', { name: 'Set 2 confirmed' });
    expect(set1).toBeEnabled();
    expect(set2).toBeDisabled();

    fireEvent.click(set1);

    await waitFor(() => {
      expect(set1).toBeChecked();
      expect(set2).toBeEnabled();
    });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave.mock.calls[0][0].segments[0]).toEqual(
      expect.objectContaining({
        status: 'COMPLETE',
        winnerEventTeamId: 'team_a',
      }),
    );
  });

  it('edits a score directly and keeps it when the host saves the draft', () => {
    const onSave = jest.fn();
    renderModal({
      targetMatch: {
        ...match,
        status: 'IN_PROGRESS',
        actualStart: '2026-03-01T10:00:00.000Z',
        segments: match.segments?.map((segment) => ({
          ...segment,
          status: 'IN_PROGRESS',
        })),
      } as Match,
      onSave,
    });

    fireEvent.change(screen.getByLabelText('Match Aces score'), {
      target: { value: '4' },
    });
    expect(screen.getByLabelText('Match Aces score')).toHaveValue('4');

    const preview = screen.getByRole('region', {
      name: 'Match details preview',
    });
    expect(within(preview).getByText('4 — 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        team1Points: [4],
        team2Points: [0],
        setResults: [0],
      }),
    );
    expect(onSave.mock.calls[0][0].segments[0]).toEqual(
      expect.objectContaining({
        scores: { team_a: 4, team_b: 0 },
        status: 'IN_PROGRESS',
      }),
    );
  });

  it('clears the edited segment and later completion states when a completed score changes', async () => {
    const halfRules = {
      scoringModel: 'PERIODS',
      segmentCount: 2,
      segmentLabel: 'Half',
    } as ResolvedMatchRules;
    const completedMatch = {
      ...match,
      status: 'COMPLETE',
      winnerEventTeamId: 'team_a',
      matchRulesSnapshot: halfRules,
      resolvedMatchRules: halfRules,
      team1Points: [1, 2],
      team2Points: [0, 1],
      setResults: [1, 1],
      segments: [
        {
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'COMPLETE',
          scores: { team_a: 1, team_b: 0 },
          winnerEventTeamId: 'team_a',
        },
        {
          id: 'match_1_segment_2',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 2,
          status: 'COMPLETE',
          scores: { team_a: 2, team_b: 1 },
          winnerEventTeamId: 'team_a',
        },
      ],
    } as Match;

    renderModal({
      targetMatch: completedMatch,
      targetEvent: { ...event, resolvedMatchRules: halfRules } as Event,
    });

    fireEvent.change(screen.getByLabelText('Half 1 Aces score'), {
      target: { value: '3' },
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Half 1 complete' })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Half 2 complete' })).not.toBeChecked();
    });
  });

  it.each([
    ['SETS', 'Set', 3, 'Set count', 'Set 3 Aces score'],
    ['PERIODS', 'Half', 2, 'Half count', 'Half 2 Aces score'],
    ['PERIODS', 'Quarter', 4, 'Quarter count', 'Quarter 4 Aces score'],
    ['INNINGS', 'Inning', 9, 'Inning count', 'Inning 9 Aces score'],
  ])(
    'uses the configured %s segment label %s throughout the form',
    (scoringModel, segmentLabel, segmentCount, countLabel, lastScoreLabel) => {
      const rules = {
        scoringModel,
        segmentLabel,
        segmentCount,
      } as ResolvedMatchRules;
      renderModal({
        targetMatch: {
          ...match,
          matchRulesSnapshot: rules,
          resolvedMatchRules: rules,
        } as Match,
        targetEvent: {
          ...event,
          usesSets: scoringModel === 'SETS',
          resolvedMatchRules: rules,
        } as Event,
      });

      expect(screen.getByLabelText(countLabel)).toHaveValue(String(segmentCount));
      expect(screen.getByLabelText(lastScoreLabel)).toBeInTheDocument();
    },
  );

  it('changes the per-match segment count and numeric segment length', async () => {
    const onSave = jest.fn();
    const quarterRules = {
      scoringModel: 'PERIODS',
      segmentCount: 4,
      segmentLabel: 'Quarter',
      timekeeping: {
        timerMode: 'COUNT_UP',
        segmentDurationMinutes: 10,
        segmentDurationMinutesBySequence: [],
        canUseAddedTime: false,
        addedTimeEnabled: false,
        stopAtRegulationEnd: true,
      },
    } as ResolvedMatchRules;

    renderModal({
      targetMatch: {
        ...match,
        matchRulesSnapshot: quarterRules,
        resolvedMatchRules: quarterRules,
      } as Match,
      targetEvent: { ...event, resolvedMatchRules: quarterRules } as Event,
      onSave,
    });

    const durationInput = screen.getByLabelText('Segment length (min)');
    expect(durationInput).toHaveValue('10');
    expect(durationInput.parentElement?.querySelectorAll('button')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Quarter count'), {
      target: { value: '5' },
    });
    fireEvent.change(durationInput, { target: { value: '12' } });

    await waitFor(() => {
      expect(screen.getByLabelText('Quarter 5 Aces score')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave.mock.calls[0][0].segments).toHaveLength(5);
    expect(onSave.mock.calls[0][0].matchRulesSnapshot).toEqual(
      expect.objectContaining({
        segmentCount: 5,
        segmentLabel: 'Quarter',
        timekeeping: expect.objectContaining({
          segmentDurationMinutes: 12,
          segmentDurationMinutesBySequence: [],
        }),
      }),
    );
  });

  it('edits the officiating team and check-in states beside each assignment', () => {
    const onSave = jest.fn();
    const officialUser = {
      $id: 'user_ref',
      firstName: 'Jordan',
      lastName: 'Lee',
      userName: 'jordan.lee',
    } as UserData;
    const assignedMatch = {
      ...match,
      teamOfficialId: 'team_c',
      teamOfficial: teams[2],
      officialCheckedIn: false,
      officialIds: [
        {
          positionId: 'referee',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: 'user_ref',
          eventOfficialId: 'event_official_ref',
          checkedIn: false,
        },
      ],
    } as Match;

    renderModal({
      targetMatch: assignedMatch,
      onSave,
      doTeamsOfficiate: true,
      officials: [officialUser],
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1 }],
      eventOfficials: [
        {
          id: 'event_official_ref',
          userId: 'user_ref',
          positionIds: ['referee'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });

    expect(screen.getAllByLabelText('Officiating team')[0]).toHaveValue('Harbor Strikers');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Officiating team checked in' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Referee checked in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        teamOfficialId: 'team_c',
        officialCheckedIn: true,
        officialIds: [
          expect.objectContaining({
            positionId: 'referee',
            userId: 'user_ref',
            checkedIn: true,
          }),
        ],
      }),
    );
  });
});
