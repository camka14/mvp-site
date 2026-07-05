import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { Event, Match } from '@/types';

import { renderWithMantine } from '../../../../../../../test/utils/renderWithMantine';

import MatchEditModal from '../MatchEditModal';
import { actualMatchTimePayload } from '../MatchEditModal';

describe('actualMatchTimePayload', () => {
  it('maps actual match times to API-safe strings', () => {
    expect(actualMatchTimePayload(
      new Date('2026-04-19T10:05:00.000Z'),
      new Date('2026-04-19T10:55:00.000Z'),
    )).toEqual({
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
  const event = {
    $id: 'event_1',
    eventType: 'LEAGUE',
    usesSets: false,
    autoCreatePointMatchIncidents: true,
    resolvedMatchRules: {
      scoringModel: 'POINTS_ONLY',
      segmentCount: 1,
      segmentLabel: 'Total',
      supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'GOAL',
      pointIncidentRequiresParticipant: false,
    },
  } as Event;

  const match = {
    $id: 'match_1',
    matchId: 1,
    eventId: 'event_1',
    start: '2026-03-01T10:00:00.000Z',
    end: '2026-03-01T11:00:00.000Z',
    team1Id: 'team_a',
    team2Id: 'team_b',
    team1: { $id: 'team_a', name: 'Aces' },
    team2: { $id: 'team_b', name: 'Diggers' },
    team1Points: [0],
    team2Points: [0],
    setResults: [0],
    segments: [{
      id: 'match_1_segment_1',
      eventId: 'event_1',
      matchId: 'match_1',
      sequence: 1,
      status: 'NOT_STARTED',
      scores: { team_a: 0, team_b: 0 },
      winnerEventTeamId: null,
    }],
    incidents: [],
  } as Match;

  it('renders the score and incident operations inline for existing matches', () => {
    const startedMatch = {
      ...match,
      actualStart: '2026-03-01T10:00:00.000Z',
      segments: match.segments?.map((segment) => ({
        ...segment,
        status: 'IN_PROGRESS',
      })),
    } as Match;

    renderWithMantine(
      <MatchEditModal
        opened
        match={startedMatch}
        tournament={event}
        teams={[startedMatch.team1, startedMatch.team2] as NonNullable<Event['teams']>}
        canManageOperations
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByText('Match Operations')).toBeInTheDocument();
    const bracketLinksPanel = screen.getByRole('region', { name: 'Bracket Links' });
    expect(screen.getByRole('region', { name: 'Match Status' })).toBeInTheDocument();
    expect(within(bracketLinksPanel).queryByText('Match Status')).not.toBeInTheDocument();
    expect(screen.getByText('Match Log')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add Incident' }).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Start Match' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish Match' })).not.toBeInTheDocument();
    expect(screen.queryByText(/handled from Match Details/i)).not.toBeInTheDocument();
  });

  it('preserves legacy score arrays when saving an unstarted match', () => {
    const onSave = jest.fn();
    const setRules = {
      scoringModel: 'SETS',
      segmentCount: 3,
      segmentLabel: 'Set',
      setPointTargets: [25, 25, 15],
      supportedIncidentTypes: ['POINT', 'DISCIPLINE', 'NOTE', 'ADMIN'],
      autoCreatePointIncidentType: 'POINT',
      pointIncidentRequiresParticipant: false,
    };
    const unstartedMatch = {
      ...match,
      status: 'SCHEDULED',
      matchRulesSnapshot: setRules,
      resolvedMatchRules: setRules,
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      segments: [{
        id: 'match_1_segment_1',
        eventId: 'event_1',
        matchId: 'match_1',
        sequence: 1,
        status: 'NOT_STARTED',
        scores: { team_a: 3, team_b: 0 },
        winnerEventTeamId: null,
      }],
    } as Match;

    renderWithMantine(
      <MatchEditModal
        opened
        match={unstartedMatch}
        tournament={{
          ...event,
          usesSets: true,
          resolvedMatchRules: setRules,
        } as Event}
        teams={[unstartedMatch.team1, unstartedMatch.team2] as NonNullable<Event['teams']>}
        canManageOperations
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      status: 'SCHEDULED',
      team1Points: [0],
      team2Points: [0],
      setResults: [0],
      winnerEventTeamId: null,
    }));
  });

  it('manages started and segment status from the bracket column in order', async () => {
    const onScoreChange = jest.fn().mockResolvedValue(undefined);
    const onSetComplete = jest.fn().mockResolvedValue(undefined);
    const onSave = jest.fn();
    const periodEvent = {
      ...event,
      resolvedMatchRules: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
        autoCreatePointIncidentType: 'GOAL',
        pointIncidentRequiresParticipant: false,
      },
    } as Event;
    const periodMatch = {
      ...match,
      status: 'SCHEDULED',
      actualStart: '2026-03-01T10:00:00.000Z',
      matchRulesSnapshot: periodEvent.resolvedMatchRules,
      team1Points: [1, 0],
      team2Points: [0, 0],
      setResults: [0, 0],
      segments: [
        {
          id: 'match_1_segment_1',
          eventId: 'event_1',
          matchId: 'match_1',
          sequence: 1,
          status: 'IN_PROGRESS',
          scores: { team_a: 1, team_b: 0 },
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
    } as Match;

    renderWithMantine(
      <MatchEditModal
        opened
        match={periodMatch}
        tournament={periodEvent}
        teams={[periodMatch.team1, periodMatch.team2] as NonNullable<Event['teams']>}
        canManageOperations
        onScoreChange={onScoreChange}
        onSetComplete={onSetComplete}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    const started = screen.getByRole('checkbox', { name: 'Match started' });
    const half1 = screen.getByRole('checkbox', { name: 'Half 1 confirmed' });
    const half2 = screen.getByRole('checkbox', { name: 'Half 2 confirmed' });

    expect(started).toBeChecked();
    expect(half1).toBeEnabled();
    expect(half2).toBeDisabled();

    fireEvent.click(half1);

    await waitFor(() => {
      expect(half1).toBeChecked();
      expect(half2).toBeEnabled();
    });
    expect(onScoreChange).not.toHaveBeenCalled();
    expect(onSetComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      status: 'IN_PROGRESS',
      team1Points: [1, 0],
      team2Points: [0, 0],
      setResults: [1, 0],
      winnerEventTeamId: null,
    }));
    expect(onSave.mock.calls[0][0].segments[0]).toEqual(expect.objectContaining({
      id: 'match_1_segment_1',
      sequence: 1,
      status: 'COMPLETE',
      scores: { team_a: 1, team_b: 0 },
      winnerEventTeamId: 'team_a',
    }));
  });

  it('allows the final segment confirmation to be unchecked before saving', async () => {
    const onSave = jest.fn();
    const periodEvent = {
      ...event,
      resolvedMatchRules: {
        scoringModel: 'PERIODS',
        segmentCount: 2,
        segmentLabel: 'Half',
        supportedIncidentTypes: ['GOAL', 'DISCIPLINE', 'NOTE', 'ADMIN'],
        autoCreatePointIncidentType: 'GOAL',
        pointIncidentRequiresParticipant: false,
      },
    } as Event;
    const completedMatch = {
      ...match,
      status: 'COMPLETE',
      winnerEventTeamId: 'team_a',
      matchRulesSnapshot: periodEvent.resolvedMatchRules,
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

    renderWithMantine(
      <MatchEditModal
        opened
        match={completedMatch}
        tournament={periodEvent}
        teams={[completedMatch.team1, completedMatch.team2] as NonNullable<Event['teams']>}
        canManageOperations
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    const half1 = screen.getByRole('checkbox', { name: 'Half 1 confirmed' });
    const half2 = screen.getByRole('checkbox', { name: 'Half 2 confirmed' });

    expect(half1).toBeChecked();
    expect(half2).toBeChecked();
    expect(half2).toBeEnabled();

    fireEvent.click(half2);

    await waitFor(() => {
      expect(half1).toBeChecked();
      expect(half2).not.toBeChecked();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      status: 'IN_PROGRESS',
      team1Points: [1, 2],
      team2Points: [0, 1],
      setResults: [1, 0],
      winnerEventTeamId: null,
    }));
    expect(onSave.mock.calls[0][0].segments[1]).toEqual(expect.objectContaining({
      id: 'match_1_segment_2',
      sequence: 2,
      status: 'IN_PROGRESS',
      winnerEventTeamId: null,
      endedAt: null,
    }));
  });
});
