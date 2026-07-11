jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  buildMatchPresentationState,
  createEmptyMatchPresentationState,
} from '../presentation';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '../schemas';

const baseOverlay = {
  draftConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
  publishedConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
};

describe('broadcast match presentation projection', () => {
  it('projects a three-set beach match without leaking minor player names', async () => {
    const client = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event_1',
          name: 'River City Beach Open',
          location: 'Riverside Courts',
          address: null,
          organizerName: 'River City Sports Club',
          imageId: null,
          organizationId: 'org_1',
          sportId: 'Beach Volleyball',
          eventType: 'TOURNAMENT',
          pointsToVictory: [],
          divisionDetails: [{ id: 'event_1__division__open', key: 'open', name: 'Open' }],
          matchRulesOverride: null,
          archivedAt: null,
        }),
      },
      matches: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match_1',
          eventId: 'event_1',
          team1Id: 'team_1',
          team2Id: 'team_2',
          team1Seed: 1,
          team2Seed: 2,
          fieldId: 'field_1',
          status: 'IN_PROGRESS',
          resultStatus: null,
          actualStart: new Date('2026-07-11T05:35:00.000Z'),
          actualEnd: null,
          division: 'event_1__division__open',
          matchRulesSnapshot: { scoringModel: 'SETS', segmentCount: 3, setPointTargets: [21, 21, 15] },
        }),
      },
      matchSegments: {
        findMany: jest.fn().mockResolvedValue([
          { sequence: 1, status: 'COMPLETED', scores: { team_1: 21, team_2: 19 }, winnerEventTeamId: 'team_1' },
          { sequence: 2, status: 'IN_PROGRESS', scores: { team_1: 18, team_2: 17 }, winnerEventTeamId: null },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', name: 'Summit United', profileImageId: null, playerIds: ['adult_1', 'minor_1'] },
          { id: 'team_2', name: 'Harbor Strikers', profileImageId: null, playerIds: ['adult_2'] },
        ]),
      },
      fields: { findUnique: jest.fn().mockResolvedValue({ id: 'field_1', name: 'Court 2', location: 'Riverside Courts' }) },
      organizations: { findUnique: jest.fn().mockResolvedValue({ id: 'org_1', name: 'River City Sports Club', logoId: null }) },
      sports: { findUnique: jest.fn().mockResolvedValue({ id: 'Beach Volleyball', name: 'Beach Volleyball', matchRulesTemplate: {} }) },
      divisions: { findMany: jest.fn().mockResolvedValue([{ id: 'event_1__division__open', key: 'open', name: 'Open', kind: 'LEAGUE', playoffPlacementDivisionIds: [] }]) },
      userData: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'adult_1', firstName: 'Alex', lastName: 'Rivera', userName: 'alex', dateOfBirth: new Date('1999-01-01') },
          { id: 'minor_1', firstName: 'Private', lastName: 'Minor', userName: 'minor', dateOfBirth: new Date('2014-01-01') },
          { id: 'adult_2', firstName: 'Morgan', lastName: 'Lee', userName: 'morgan', dateOfBirth: new Date('1998-01-01') },
        ]),
      },
    };
    const stored = createEmptyMatchPresentationState({ eventId: 'event_1', revision: 4 });

    const projected = await buildMatchPresentationState({
      overlay: baseOverlay,
      state: { revision: 4, scoringMode: 'AUTOMATIC', presentationState: stored, activeMatchId: 'match_1' },
      eventId: 'event_1',
      matchId: 'match_1',
      client,
    });

    expect(projected.competition).toMatchObject({ bestOf: 3, setTargets: [21, 21, 15], winBy: 2 });
    expect(projected.competition.roundLabel).toBe('Open');
    expect(projected.score).toMatchObject({ currentSet: 2, points: [18, 17], setsWon: [1, 0] });
    expect(projected.teams[0].playerNames).toEqual(['Alex Rivera']);
    expect(projected.teams[0].playerNames.join(' ')).not.toContain('Private');
    expect(projected.event).toMatchObject({ name: 'River City Beach Open', court: 'Court 2' });
  });

  it('uses the beach fallback when a legacy match has no resolved set configuration', async () => {
    const client = {
      events: { findUnique: jest.fn().mockResolvedValue({
        id: 'event_1', name: 'Open', location: null, address: null, organizerName: null,
        imageId: null, organizationId: null, sportId: null, eventType: 'TOURNAMENT',
        pointsToVictory: [], divisionDetails: [], matchRulesOverride: null, archivedAt: null,
      }) },
      matches: { findFirst: jest.fn().mockResolvedValue({
        id: 'match_1', eventId: 'event_1', team1Id: 'team_1', team2Id: 'team_2',
        team1Seed: null, team2Seed: null, fieldId: null, status: 'SCHEDULED',
        resultStatus: null, actualStart: null, actualEnd: null, division: null, matchRulesSnapshot: null,
      }) },
      matchSegments: { findMany: jest.fn().mockResolvedValue([]) },
      teams: { findMany: jest.fn().mockResolvedValue([]) },
      fields: { findUnique: jest.fn() },
      organizations: { findUnique: jest.fn() },
      sports: { findUnique: jest.fn() },
      divisions: { findMany: jest.fn().mockResolvedValue([]) },
      userData: { findMany: jest.fn() },
    };

    const projected = await buildMatchPresentationState({
      overlay: baseOverlay,
      state: { revision: 0, scoringMode: 'AUTOMATIC', presentationState: createEmptyMatchPresentationState({ eventId: 'event_1' }) },
      eventId: 'event_1',
      matchId: 'match_1',
      client,
    });

    expect(projected.competition.setTargets).toEqual([21, 21, 15]);
  });
});
