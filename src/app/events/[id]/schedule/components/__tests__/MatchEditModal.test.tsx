import { screen } from '@testing-library/react';

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
    renderWithMantine(
      <MatchEditModal
        opened
        match={match}
        tournament={event}
        teams={[match.team1, match.team2] as NonNullable<Event['teams']>}
        canManageOperations
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByText('Match Operations')).toBeInTheDocument();
    expect(screen.getByText('Match Log')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add Incident' }).length).toBe(2);
    expect(screen.queryByText(/handled from Match Details/i)).not.toBeInTheDocument();
  });
});
