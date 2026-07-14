/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { loadEventWithRelations } from '@/server/repositories/events';

const officialIds = [
  'official_parent',
  'official_direct',
  'official_roster',
  'official_registration',
  'official_pending_registration',
  'official_staff',
  'official_unrelated',
];

const eventTeamRows = [
  {
    id: 'event_team_1',
    eventId: 'event_1',
    kind: 'REGISTERED',
    parentTeamId: 'canonical_team_1',
    playerIds: ['official_roster'],
    captainId: 'captain_1',
    managerId: 'manager_1',
    headCoachId: null,
    coachIds: [],
    division: 'open',
    name: 'Event Team One',
  },
  {
    id: 'event_team_2',
    eventId: 'event_1',
    kind: 'REGISTERED',
    parentTeamId: null,
    playerIds: [],
    captainId: 'captain_2',
    managerId: 'manager_2',
    headCoachId: null,
    coachIds: [],
    division: 'open',
    name: 'Legacy Direct Team',
  },
];

const createClient = () => ({
  events: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'event_1',
      name: 'Official Membership Event',
      start: new Date('2026-07-14T16:00:00.000Z'),
      end: new Date('2026-07-14T20:00:00.000Z'),
      eventType: 'TOURNAMENT',
      state: 'PUBLISHED',
      fieldIds: ['field_1'],
      timeSlotIds: [],
      officialIds: [],
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      waitListIds: [],
      freeAgentIds: [],
      requiredTemplateIds: [],
      organizationId: null,
      sportId: null,
      teamSignup: true,
      singleDivision: true,
      doubleElimination: false,
      usesSets: false,
      setDurationMinutes: 0,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfigId: null,
    }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  divisions: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  fields: {
    findMany: jest.fn().mockResolvedValue([{
      id: 'field_1',
      organizationId: null,
      divisions: ['open'],
      name: 'Court 1',
    }]),
  },
  teams: {
    findMany: jest.fn().mockResolvedValue(eventTeamRows),
  },
  canonicalTeams: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  timeSlots: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  eventOfficials: {
    findMany: jest.fn().mockResolvedValue(officialIds.map((userId, index) => ({
      id: `event_official_${index + 1}`,
      eventId: 'event_1',
      userId,
      positionIds: ['referee'],
      fieldIds: [],
      isActive: true,
      createdAt: new Date(`2026-07-14T15:0${index}:00.000Z`),
    }))),
  },
  userData: {
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      const ids = where?.id?.in ?? [];
      return Promise.resolve(ids.map((id: string) => ({
        id,
        firstName: id,
        lastName: 'Official',
        userName: id,
        teamIds: id === 'official_unrelated' ? ['event_team_1'] : ['contradictory_legacy_team'],
      })));
    }),
  },
  teamRegistrations: {
    findMany: jest.fn().mockResolvedValue([
      { userId: 'official_parent', teamId: 'canonical_team_1' },
      { userId: 'official_direct', teamId: 'event_team_2' },
    ]),
  },
  teamStaffAssignments: {
    findMany: jest.fn().mockResolvedValue([
      { userId: 'official_parent', teamId: 'canonical_team_1' },
    ]),
  },
  eventRegistrations: {
    findMany: jest.fn().mockImplementation(({ where }: any) => {
      if (Array.isArray(where?.eventId?.in)) {
        return Promise.resolve(eventTeamRows.map((team, index) => ({
          id: `team_registration_${index + 1}`,
          eventId: 'event_1',
          registrantId: team.id,
          eventTeamId: team.id,
          registrantType: 'TEAM',
          rosterRole: 'PARTICIPANT',
          status: 'ACTIVE',
          createdAt: new Date(`2026-07-14T14:0${index}:00.000Z`),
        })));
      }
      return Promise.resolve([
        {
          id: 'player_registration_1',
          eventId: 'event_1',
          eventTeamId: 'event_team_1',
          registrantId: 'official_registration',
          registrantType: 'SELF',
          rosterRole: 'PARTICIPANT',
          status: 'ACTIVE',
          jerseyNumber: null,
          position: null,
          isCaptain: false,
        },
        {
          id: 'player_registration_pending',
          eventId: 'event_1',
          eventTeamId: 'event_team_1',
          registrantId: 'official_pending_registration',
          registrantType: 'SELF',
          rosterRole: 'PARTICIPANT',
          status: 'PENDING',
          jerseyNumber: null,
          position: null,
          isCaptain: false,
        },
      ]);
    }),
  },
  eventTeamStaffAssignments: {
    findMany: jest.fn().mockResolvedValue([{
      eventTeamId: 'event_team_1',
      userId: 'official_staff',
      status: 'ACTIVE',
    }]),
  },
  matches: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  leagueScoringConfigs: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
});

describe('loadEventWithRelations official event-team memberships', () => {
  it('derives only current event-team IDs from normalized and event-specific sources', async () => {
    const client = createClient();

    const loaded = await loadEventWithRelations('event_1', client as any);
    const teamIdsByOfficialId = Object.fromEntries(
      loaded.officials.map((official) => [official.id, official.teamIds]),
    );

    expect(teamIdsByOfficialId).toEqual({
      official_parent: ['event_team_1'],
      official_direct: ['event_team_2'],
      official_roster: ['event_team_1'],
      official_registration: ['event_team_1'],
      official_pending_registration: [],
      official_staff: ['event_team_1'],
      official_unrelated: [],
    });
    expect(client.teamRegistrations.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: officialIds },
        status: 'ACTIVE',
      },
      select: { userId: true, teamId: true },
    });
    expect(client.teamStaffAssignments.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: officialIds },
        status: 'ACTIVE',
      },
      select: { userId: true, teamId: true },
    });
    expect(client.eventTeamStaffAssignments.findMany).toHaveBeenCalledWith({
      where: {
        eventTeamId: { in: ['event_team_1', 'event_team_2'] },
        status: 'ACTIVE',
      },
      select: { eventTeamId: true, userId: true },
    });
    expect(client.eventRegistrations.findMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event_1',
        eventTeamId: { in: ['event_team_1', 'event_team_2'] },
        rosterRole: 'PARTICIPANT',
        status: { in: ['ACTIVE', 'PENDING', 'STARTED'] },
      },
      select: {
        id: true,
        eventTeamId: true,
        registrantId: true,
        status: true,
        jerseyNumber: true,
        position: true,
        isCaptain: true,
      },
    });
  });
});
