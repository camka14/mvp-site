/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
  },
  fields: {
    findMany: jest.fn(),
  },
  timeSlots: {
    findMany: jest.fn(),
  },
  leagueScoringConfigs: {
    findUnique: jest.fn(),
  },
};
const loadEventWithRelationsMock = jest.fn();
const serializeMatchesMock = jest.fn();
const getEventMock = jest.fn();
const getParticipantsMock = jest.fn();
const getTeamComplianceMock = jest.fn();
const getUserComplianceMock = jest.fn();
const getOptionalSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const loadLockedEventStaffSnapshotMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({
  getOptionalSession: (...args: unknown[]) => getOptionalSessionMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
}));
jest.mock('@/server/events/eventStaffReconciliation', () => ({
  loadLockedEventStaffSnapshot: (...args: unknown[]) => loadLockedEventStaffSnapshotMock(...args),
}));
jest.mock('@/server/repositories/events', () => ({
  loadEventWithRelations: (...args: unknown[]) => loadEventWithRelationsMock(...args),
}));
jest.mock('@/server/scheduler/serialize', () => ({
  serializeMatches: (...args: unknown[]) => serializeMatchesMock(...args),
}));
jest.mock('@/app/api/events/[eventId]/route', () => ({
  GET: (...args: unknown[]) => getEventMock(...args),
}));
jest.mock('@/app/api/events/[eventId]/participants/route', () => ({
  GET: (...args: unknown[]) => getParticipantsMock(...args),
}));
jest.mock('@/app/api/events/[eventId]/teams/compliance/route', () => ({
  GET: (...args: unknown[]) => getTeamComplianceMock(...args),
}));
jest.mock('@/app/api/events/[eventId]/users/compliance/route', () => ({
  GET: (...args: unknown[]) => getUserComplianceMock(...args),
}));

import { GET } from '@/app/api/events/[eventId]/detail/route';

const okJson = (payload: unknown) => NextResponse.json(payload, { status: 200 });

const requestFor = (query = '') => new NextRequest(`http://localhost/api/events/event_1/detail${query}`);

describe('GET /api/events/[eventId]/detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEventMock.mockResolvedValue(okJson({
      id: 'event_1',
      name: 'Event One',
      end: null,
      noFixedEndDateTime: true,
      hostId: 'host_1',
      teamSignup: true,
      fieldIds: ['field_2', 'field_1'],
      timeSlotIds: ['slot_1'],
      leagueScoringConfigId: 'league_config_1',
      staffInvites: [{ id: 'invite_1', eventId: 'event_1', type: 'STAFF' }],
      assistantHostIds: [],
      organizationId: null,
    }));
    getParticipantsMock.mockResolvedValue(okJson({
      participants: {
        teamIds: ['team_1'],
        userIds: [],
        waitListIds: [],
        freeAgentIds: [],
        divisions: [],
      },
      registrations: {
        teams: [{ registrationId: 'reg_1', registrantId: 'team_1' }],
        users: [],
        children: [],
        waitlist: [],
        freeAgents: [],
      },
      teams: [{ id: 'team_1', name: 'Team One' }],
      users: [],
      participantCount: 1,
      participantCapacity: 8,
      divisionWarnings: [],
      weeklySelectionRequired: false,
    }));
    getTeamComplianceMock.mockResolvedValue(okJson({
      teams: [{ teamId: 'team_1', teamName: 'Team One' }],
    }));
    getUserComplianceMock.mockResolvedValue(okJson({ users: [] }));
    getOptionalSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    loadLockedEventStaffSnapshotMock.mockResolvedValue({
      revision: 'staff_revision_1',
      staffInvites: [{ id: 'invite_1', eventId: 'event_1', type: 'STAFF' }],
      assistantHostIds: ['assistant_canonical'],
      officialPositions: [{ id: 'position_canonical', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'official_canonical',
        userId: 'official_user_canonical',
        positionIds: ['position_canonical'],
        fieldIds: [],
        isActive: true,
      }],
      officialIds: ['official_user_canonical'],
    });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      state: 'PUBLISHED',
      archivedAt: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
    });
    loadEventWithRelationsMock.mockResolvedValue({
      matches: {
        match_late: { id: 'match_late', start: new Date('2026-01-01T12:00:00.000Z') },
        match_early: { id: 'match_early', start: new Date('2026-01-01T10:00:00.000Z') },
      },
    });
    serializeMatchesMock.mockImplementation((matches: any[]) => (
      matches.map((match) => ({ id: match.id }))
    ));
    prismaMock.fields.findMany.mockResolvedValue([
      { id: 'field_1', fieldNumber: 1 },
      { id: 'field_2', fieldNumber: 2 },
    ]);
    prismaMock.timeSlots.findMany.mockResolvedValue([
      { id: 'slot_1', startDate: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    prismaMock.leagueScoringConfigs.findUnique.mockResolvedValue({
      id: 'league_config_1',
      pointsForWin: 3,
    });
  });

  it('returns event detail content and host management data in one payload', async () => {
    const response = await GET(requestFor('?manage=true'), { params: Promise.resolve({ eventId: 'event_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.event.id).toBe('event_1');
    expect(payload.event.end).toBeNull();
    expect(payload.event.noFixedEndDateTime).toBe(true);
    expect(payload.event).not.toHaveProperty('$id');
    expect(payload.participantSnapshot.participantCount).toBe(1);
    expect(payload.matches).toEqual([{ id: 'match_early' }, { id: 'match_late' }]);
    expect(payload.fields.map((field: any) => field.id)).toEqual(['field_2', 'field_1']);
    expect(payload.timeSlots.map((slot: any) => slot.id)).toEqual(['slot_1']);
    expect(payload.leagueScoringConfig.id).toBe('league_config_1');
    expect(payload.staffInvites).toHaveLength(1);
    expect(payload.staffRevision).toBe('staff_revision_1');
    expect(payload.event).toEqual(expect.objectContaining({
      assistantHostIds: ['assistant_canonical'],
      officialPositions: [{ id: 'position_canonical', name: 'Referee', count: 1, order: 0 }],
      officialIds: ['official_user_canonical'],
    }));
    expect(payload.event.eventOfficials).toEqual([
      expect.objectContaining({ userId: 'official_user_canonical' }),
    ]);
    expect(payload.event.staffInvites).toEqual(payload.staffInvites);
    expect(payload.teamCompliance.teams).toEqual([{ teamId: 'team_1', teamName: 'Team One' }]);
    expect(payload.userCompliance).toBeNull();
    expect(getTeamComplianceMock).toHaveBeenCalledTimes(1);
    expect(getUserComplianceMock).not.toHaveBeenCalled();
  });

  it('omits compliance when manage mode is not requested', async () => {
    const response = await GET(requestFor(), { params: Promise.resolve({ eventId: 'event_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teamCompliance).toBeNull();
    expect(payload.userCompliance).toBeNull();
    expect(payload.staffRevision).toBeNull();
    expect(loadLockedEventStaffSnapshotMock).not.toHaveBeenCalled();
    expect(getTeamComplianceMock).not.toHaveBeenCalled();
    expect(getUserComplianceMock).not.toHaveBeenCalled();
  });

  it('auto-loads management data only when the viewer can manage the event', async () => {
    canManageEventMock.mockResolvedValueOnce(false);

    const response = await GET(requestFor('?manage=auto'), { params: Promise.resolve({ eventId: 'event_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teamCompliance).toBeNull();
    expect(getParticipantsMock).toHaveBeenCalledTimes(1);
    expect(getParticipantsMock.mock.calls[0][0].nextUrl.searchParams.get('manage')).toBeNull();
    expect(getTeamComplianceMock).not.toHaveBeenCalled();
  });

  it.each(['PRIVATE', 'DRAFT', 'UNPUBLISHED', 'TEMPLATE'])(
    'does not disclose schedule relations to an anonymous direct-link viewer of a %s event',
    async (state) => {
      getEventMock.mockResolvedValueOnce(okJson({
        id: 'event_1',
        name: 'Restricted Event',
        state,
        hostId: 'host_1',
        teamSignup: true,
        fieldIds: ['field_2', 'field_1'],
        timeSlotIds: ['slot_1'],
        leagueScoringConfigId: 'league_config_1',
        staffInvites: [],
        assistantHostIds: [],
        organizationId: null,
      }));
      prismaMock.events.findUnique.mockResolvedValueOnce({
        id: 'event_1',
        state,
        archivedAt: null,
        hostId: 'host_1',
        assistantHostIds: [],
        organizationId: null,
      });
      getOptionalSessionMock.mockResolvedValueOnce(null);

      const response = await GET(requestFor(), { params: Promise.resolve({ eventId: 'event_1' }) });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.event.state).toBe(state);
      expect(payload.matches).toEqual([]);
      expect(payload.fields).toEqual([]);
      expect(payload.timeSlots).toEqual([]);
      expect(payload.leagueScoringConfig).toBeNull();
      expect(loadEventWithRelationsMock).not.toHaveBeenCalled();
      expect(prismaMock.fields.findMany).not.toHaveBeenCalled();
      expect(prismaMock.timeSlots.findMany).not.toHaveBeenCalled();
      expect(prismaMock.leagueScoringConfigs.findUnique).not.toHaveBeenCalled();
      expect(serializeMatchesMock).not.toHaveBeenCalled();
    },
  );
});
