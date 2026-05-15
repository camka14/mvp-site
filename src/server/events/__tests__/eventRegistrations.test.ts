/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { buildEventDivisionId } from '@/lib/divisionTypes';
import {
  buildEventParticipantSnapshot,
  syncDivisionTeamMembershipFromRegistrations,
} from '@/server/events/eventRegistrations';

describe('buildEventParticipantSnapshot', () => {
  const weeklySlot = {
    id: 'slot_1',
    divisions: ['div_a'],
    daysOfWeek: [1],
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  };

  const divisions = [
    {
      id: 'div_a',
      key: 'div_a',
      kind: 'LEAGUE',
      maxParticipants: 12,
    },
  ];

  it('returns a registered weekly team participant for the selected occurrence', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        teamSignup: true,
        timeSlotIds: ['slot_1'],
        divisions: ['div_a'],
        maxParticipants: 12,
      },
      occurrence: {
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'weekly_parent__team__team_1__slot_1__2026-04-14',
            eventId: 'weekly_parent',
            registrantId: 'team_1',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'STARTED',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-04-14',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', name: 'Team One' },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue(weeklySlot),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual(['team_1']);
    expect(snapshot.teams).toEqual([{ id: 'team_1', name: 'Team One' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('returns a registered weekly self participant for the selected occurrence', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        teamSignup: false,
        timeSlotIds: ['slot_1'],
        divisions: ['div_a'],
        maxParticipants: 12,
      },
      occurrence: {
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'weekly_parent__self__user_1__slot_1__2026-04-14',
            eventId: 'weekly_parent',
            registrantId: 'user_1',
            parentId: null,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: 'STARTED',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-04-14',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user_1', firstName: 'Sam' },
        ]),
      },
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue(weeklySlot),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.userIds).toEqual(['user_1']);
    expect(snapshot.users).toEqual([{ id: 'user_1', firstName: 'Sam' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });
});

describe('syncDivisionTeamMembershipFromRegistrations', () => {
  it('uses the exact selected division when split divisions share a type token', async () => {
    const firstDivisionId = buildEventDivisionId('event_1', 'c_skill_open');
    const secondDivisionId = buildEventDivisionId('event_1_2', 'c_skill_open');
    const updateMock = jest.fn().mockResolvedValue({});

    const activeTeamIds = await syncDivisionTeamMembershipFromRegistrations({
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      singleDivision: false,
      divisions: [firstDivisionId, secondDivisionId],
    }, {
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: firstDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['stale_team_1'],
          },
          {
            id: secondDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['stale_team_2'],
          },
        ]),
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'event_team_1',
            divisionId: secondDivisionId,
          },
        ]),
      },
    } as any);

    expect(activeTeamIds).toEqual(['event_team_1']);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: firstDivisionId },
      data: expect.objectContaining({
        teamIds: [],
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: secondDivisionId },
      data: expect.objectContaining({
        teamIds: ['event_team_1'],
      }),
    }));
  });

  it('preserves placeholder slots when syncing registered team assignments', async () => {
    const firstDivisionId = buildEventDivisionId('event_1', 'c_skill_open');
    const secondDivisionId = buildEventDivisionId('event_1', 'c_skill_advanced');
    const updateMock = jest.fn().mockResolvedValue({});

    await syncDivisionTeamMembershipFromRegistrations({
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      singleDivision: false,
      divisions: [firstDivisionId, secondDivisionId],
    }, {
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: firstDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['slot_1', 'slot_2', 'stale_event_team'],
          },
          {
            id: secondDivisionId,
            key: 'c_skill_advanced',
            kind: 'LEAGUE',
            teamIds: ['slot_3'],
          },
        ]),
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'slot_1',
            divisionId: firstDivisionId,
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slot_1',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'slot_2',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
          {
            id: 'slot_3',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
          {
            id: 'stale_event_team',
            kind: 'REGISTERED',
            captainId: 'captain_2',
            parentTeamId: 'canonical_team_2',
          },
        ]),
      },
    } as any);

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: firstDivisionId },
      data: expect.objectContaining({
        teamIds: ['slot_1', 'slot_2'],
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: secondDivisionId },
      data: expect.objectContaining({
        teamIds: ['slot_3'],
      }),
    }));
  });
});
