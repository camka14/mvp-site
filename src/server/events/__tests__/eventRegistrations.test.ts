/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { buildEventDivisionId } from '@/lib/divisionTypes';
import {
  buildEventParticipantSnapshot,
  getEventParticipantIdsForEvent,
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

    expect(snapshot.participants.teamIds).toEqual(['team_1']);
    expect(snapshot.teams).toEqual([{ id: 'team_1', name: 'Team One' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('does not expose started weekly checkout reservations as registered participants', async () => {
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
            eventTeamId: 'team_1',
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

    expect(snapshot.participants.teamIds).toEqual([]);
    expect(snapshot.teams).toEqual([]);
    expect(snapshot.participantCount).toBe(0);
    expect(snapshot.registrations).toBeUndefined();
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

    expect(snapshot.participants.userIds).toEqual(['user_1']);
    expect(snapshot.users).toEqual([{ id: 'user_1', firstName: 'Sam' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('excludes placeholder slot registrations from registered team participants', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        divisions: ['div_a'],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1__team__registered_slot_1',
            eventId: 'event_1',
            registrantId: 'registered_slot_1',
            parentId: 'canonical_team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'registered_slot_1',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
          {
            id: 'event_1__team__placeholder_slot_1',
            eventId: 'event_1',
            registrantId: 'placeholder_slot_1',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'placeholder_slot_1',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'registered_slot_1',
            name: 'Registered Team',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'placeholder_slot_1',
            name: 'Place Holder 1',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual(['registered_slot_1']);
    expect(snapshot.teams).toEqual([
      expect.objectContaining({ id: 'registered_slot_1', name: 'Registered Team' }),
    ]);
    expect(snapshot.participantCount).toBe(1);
  });

  it('uses canonical event division metadata for participant division groups', async () => {
    const openDivisionId = buildEventDivisionId('event_1', 'c_skill_open_age_18plus');
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        divisions: [openDivisionId],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1__team__team_1',
            eventId: 'event_1',
            registrantId: 'team_1',
            parentId: 'canonical_team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'team_1',
            ageAtEvent: null,
            divisionId: openDivisionId,
            divisionTypeId: 'open',
            divisionTypeKey: 'c_skill_open',
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'team_1',
            name: 'Registered Team',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: openDivisionId,
            key: 'c_skill_open_age_18plus',
            kind: 'LEAGUE',
            maxParticipants: 12,
            divisionTypeId: 'skill_open_age_18plus',
          },
        ]),
      },
    } as any);

    expect(snapshot.participants.divisions).toEqual([
      expect.objectContaining({
        divisionId: openDivisionId,
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeKey: 'c_skill_open_age_18plus',
        teamIds: ['team_1'],
      }),
    ]);
  });

  it('returns backend division warnings for overfilled and under-slotted team divisions', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        singleDivision: false,
        divisions: ['div_over', 'div_missing'],
        maxParticipants: 6,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          ...['team_1', 'team_2', 'team_3'].map((teamId, index) => ({
            id: `event_1__team__${teamId}`,
            eventId: 'event_1',
            registrantId: teamId,
            parentId: `canonical_${teamId}`,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: teamId,
            ageAtEvent: null,
            divisionId: 'div_over',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date(`2026-04-01T00:0${index}:00.000Z`),
            updatedAt: new Date(`2026-04-01T00:0${index}:00.000Z`),
          })),
          {
            id: 'event_1__team__team_4',
            eventId: 'event_1',
            registrantId: 'team_4',
            parentId: 'canonical_team_4',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'team_4',
            ageAtEvent: null,
            divisionId: 'div_missing',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:04:00.000Z'),
            updatedAt: new Date('2026-04-01T00:04:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', kind: 'REGISTERED', parentTeamId: 'canonical_team_1', captainId: 'captain_1' },
          { id: 'team_2', kind: 'REGISTERED', parentTeamId: 'canonical_team_2', captainId: 'captain_2' },
          { id: 'team_3', kind: 'REGISTERED', parentTeamId: 'canonical_team_3', captainId: 'captain_3' },
          { id: 'team_4', kind: 'REGISTERED', parentTeamId: 'canonical_team_4', captainId: 'captain_4' },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'div_over',
            key: 'over',
            kind: 'LEAGUE',
            divisionTypeId: null,
            maxParticipants: 2,
            teamIds: ['team_1', 'team_2', 'team_3'],
          },
          {
            id: 'div_missing',
            key: 'missing',
            kind: 'LEAGUE',
            divisionTypeId: null,
            maxParticipants: 4,
            teamIds: ['team_4', 'placeholder_1'],
          },
        ]),
      },
    } as any);

    expect(snapshot.divisionWarnings).toEqual([
      expect.objectContaining({
        divisionId: 'div_over',
        code: 'OVER_CAPACITY',
        filledCount: 3,
        slotCount: 3,
        maxTeams: 2,
      }),
      expect.objectContaining({
        divisionId: 'div_missing',
        code: 'MISSING_PLACEHOLDERS',
        filledCount: 1,
        slotCount: 2,
        maxTeams: 4,
      }),
    ]);
  });

  it('dedupes active team registrations by canonical team identity', async () => {
    const openDivisionId = 'event_1__division__open';
    const mensDivisionId = 'event_1__division__mens';
    const oldRegistration = {
      id: 'event_1__team__old_event_team',
      eventId: 'event_1',
      registrantId: 'old_event_team',
      parentId: 'canonical_team_1',
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      eventTeamId: 'old_event_team',
      sourceTeamRegistrationId: null,
      ageAtEvent: null,
      divisionId: openDivisionId,
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
      jerseyNumber: null,
      position: null,
      isCaptain: false,
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    };
    const freshRegistration = {
      ...oldRegistration,
      id: 'event_1__team__fresh_event_team',
      registrantId: 'fresh_event_team',
      eventTeamId: 'fresh_event_team',
      divisionId: mensDivisionId,
      divisionTypeId: 'mens',
      divisionTypeKey: 'mens',
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    };

    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        singleDivision: false,
        divisions: [openDivisionId, mensDivisionId],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([oldRegistration, freshRegistration]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'old_event_team',
            name: 'Sea Glass Smash',
            kind: 'REGISTERED',
            parentTeamId: 'canonical_team_1',
            captainId: 'captain_1',
          },
          {
            id: 'fresh_event_team',
            name: 'Sea Glass Smash',
            kind: 'REGISTERED',
            parentTeamId: 'canonical_team_1',
            captainId: 'captain_1',
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: openDivisionId,
            key: 'open',
            kind: 'LEAGUE',
            divisionTypeId: 'open',
            maxParticipants: 12,
            teamIds: ['old_event_team'],
          },
          {
            id: mensDivisionId,
            key: 'mens',
            kind: 'LEAGUE',
            divisionTypeId: 'mens',
            maxParticipants: 12,
            teamIds: ['fresh_event_team'],
          },
        ]),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual(['fresh_event_team']);
    expect(snapshot.participants.divisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        divisionId: openDivisionId,
        teamIds: [],
      }),
      expect.objectContaining({
        divisionId: mensDivisionId,
        teamIds: ['fresh_event_team'],
      }),
    ]));
    expect(snapshot.teams.map((team) => team.id)).toEqual(['fresh_event_team']);
    expect(snapshot.participantCount).toBe(1);
  });
});

describe('getEventParticipantIdsForEvent', () => {
  it('excludes active placeholder slot registrations from derived team ids', async () => {
    const ids = await getEventParticipantIdsForEvent('event_1', {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event_1',
            registrantId: 'team_1',
            eventTeamId: 'team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            id: 'event_1__team__team_1',
          },
          {
            eventId: 'event_1',
            registrantId: 'slot_1',
            eventTeamId: 'slot_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            id: 'event_1__team__slot_1',
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'team_1',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'slot_1',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
        ]),
      },
    } as any);

    expect(ids.teamIds).toEqual(['team_1']);
  });

  it('derives ids for the selected weekly occurrence when occurrence context is provided', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        eventTeamId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        id: 'weekly_parent__self__user_1__slot_1__2026-08-05',
      },
    ]);

    const ids = await getEventParticipantIdsForEvent('weekly_parent', {
      eventRegistrations: {
        findMany,
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any, {
      slotId: 'slot_1',
      occurrenceDate: '2026-08-05',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['weekly_parent'] },
        status: { in: ['PENDING', 'ACTIVE', 'BLOCKED'] },
        slotId: 'slot_1',
        occurrenceDate: '2026-08-05',
      }),
    }));
    expect(ids.userIds).toEqual(['user_1']);
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
          {
            registrantId: 'slot_2',
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

    expect(activeTeamIds).toEqual(['slot_1']);
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
