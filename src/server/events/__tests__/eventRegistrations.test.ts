/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { buildEventParticipantSnapshot } from '@/server/events/eventRegistrations';

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

  it('returns an active weekly team participant for the selected occurrence', async () => {
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
            status: 'ACTIVE',
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

    expect(snapshot.participants.teams).toHaveLength(1);
    expect(snapshot.participants.teams[0].registrantId).toBe('team_1');
    expect(snapshot.teams).toEqual([{ id: 'team_1', name: 'Team One' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('returns an active weekly self participant for the selected occurrence', async () => {
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
            status: 'ACTIVE',
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

    expect(snapshot.participants.users).toHaveLength(1);
    expect(snapshot.participants.users[0].registrantId).toBe('user_1');
    expect(snapshot.users).toEqual([{ id: 'user_1', firstName: 'Sam' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });
});
