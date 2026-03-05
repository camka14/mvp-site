/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  $transaction: jest.fn(),
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  signedDocuments: {
    findMany: jest.fn(),
  },
  userData: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  refundRequests: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  bills: {
    findMany: jest.fn(),
  },
  billPayments: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const dispatchRequiredEventDocumentsMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({ canManageEvent: (...args: any[]) => canManageEventMock(...args) }));
jest.mock('@/lib/eventConsentDispatch', () => ({
  dispatchRequiredEventDocuments: (...args: any[]) => dispatchRequiredEventDocumentsMock(...args),
}));

import { DELETE, POST } from '@/app/api/events/[eventId]/participants/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const jsonDelete = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    dispatchRequiredEventDocumentsMock.mockResolvedValue({
      sentDocumentIds: [],
      firstDocumentId: null,
      missingChildEmail: false,
      errors: [],
    });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      teamSignup: false,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.divisions.findMany.mockResolvedValue([
      {
        id: 'div_a',
        key: 'c_skill_open',
        name: 'Open A',
        sportId: 'volleyball',
        divisionTypeId: 'open',
        divisionTypeName: 'Open',
        ratingType: 'SKILL',
        gender: 'C',
        ageCutoffDate: null,
        ageCutoffLabel: null,
        ageCutoffSource: null,
        teamIds: [],
        kind: 'LEAGUE',
      },
    ]);
    prismaMock.divisions.update.mockResolvedValue({});
    canManageEventMock.mockResolvedValue(false);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.teams.findFirst.mockResolvedValue(null);
    prismaMock.teams.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.teams.update.mockResolvedValue({});
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
  });

  it('rejects direct user participant joins for team-signup events', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Individual joins for team events must use the free-agent route.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate team registration attempts', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Team is already registered for this event.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('forbids team registration when session user is not the team manager', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'captain_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1', 'user_2'],
      managerId: 'manager_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Only the team manager can register or withdraw this team.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('fills a placeholder slot instead of appending canonical teamId (schedulable events)', async () => {
    const eventRow = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1', 'slot_2'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      singleDivision: true,
      teamSizeLimit: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(eventRow);

    const canonicalTeam = {
      id: 'team_1',
      name: 'Canonical Team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    };
    prismaMock.teams.findUnique
      .mockResolvedValueOnce(canonicalTeam)
      .mockResolvedValueOnce(canonicalTeam);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      { id: 'slot_1', seed: 1, captainId: '', division: 'div_a', parentTeamId: null },
      { id: 'slot_2', seed: 2, captainId: '', division: 'div_a', parentTeamId: null },
    ]);
    prismaMock.teams.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      teamIds: ['slot_1', 'slot_2'],
      waitListIds: [],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValueOnce({
      id: 'event_1__team__slot_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.teams.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'slot_1' }),
        data: expect.objectContaining({
          division: 'div_a',
          parentTeamId: 'team_1',
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1__team__slot_1' },
        create: expect.objectContaining({
          registrantId: 'slot_1',
        }),
      }),
    );
    const updateArgs = prismaMock.events.update.mock.calls[0][0];
    expect(updateArgs.data.teamIds).toBeUndefined();
  });

  it('rejects duplicate team registration attempts based on parentTeamId (schedulable events)', async () => {
    const eventRow = {
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['slot_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: null,
      singleDivision: true,
      teamSizeLimit: 2,
    };
    prismaMock.events.findUnique
      .mockResolvedValueOnce(eventRow)
      .mockResolvedValueOnce(eventRow);

    const canonicalTeam = {
      id: 'team_1',
      name: 'Canonical Team',
      division: 'Open',
      divisionTypeId: 'open',
      divisionTypeName: 'Open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      captainId: 'user_1',
      managerId: 'user_1',
      headCoachId: null,
      coachIds: [],
      pending: [],
      teamSize: 2,
      profileImageId: null,
    };
    prismaMock.teams.findUnique
      .mockResolvedValueOnce(canonicalTeam)
      .mockResolvedValueOnce(canonicalTeam);
    prismaMock.teams.findMany.mockResolvedValueOnce([
      { id: 'slot_1', seed: 1, captainId: 'user_1', division: 'div_a', parentTeamId: 'team_1' },
    ]);

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        teamId: 'team_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Team is already registered for this event.');
    expect(prismaMock.teams.updateMany).not.toHaveBeenCalled();
  });

  it('allows team registration when team division type does not match selection', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Advanced',
      divisionTypeId: 'advanced',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.events.update).toHaveBeenCalled();
  });

  it('allows event manager to move an already-registered team to a different division', async () => {
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      registrationByDivisionType: true,
      divisions: ['div_a', 'div_b'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
      hostId: 'host_1',
      assistantHostIds: ['manager_1'],
      organizationId: null,
      singleDivision: false,
    });
    prismaMock.divisions.findMany
      .mockResolvedValueOnce([
        {
          id: 'div_a',
          key: 'c_skill_open',
          name: 'Open A',
          sportId: 'volleyball',
          divisionTypeId: 'open',
          divisionTypeName: 'Open',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: null,
          ageCutoffLabel: null,
          ageCutoffSource: null,
          teamIds: ['team_1'],
          kind: 'LEAGUE',
        },
        {
          id: 'div_b',
          key: 'c_skill_advanced',
          name: 'Advanced',
          sportId: 'volleyball',
          divisionTypeId: 'advanced',
          divisionTypeName: 'Advanced',
          ratingType: 'SKILL',
          gender: 'C',
          ageCutoffDate: null,
          ageCutoffLabel: null,
          ageCutoffSource: null,
          teamIds: [],
          kind: 'LEAGUE',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'div_a', key: 'c_skill_open', teamIds: ['team_1'], kind: 'LEAGUE' },
        { id: 'div_b', key: 'c_skill_advanced', teamIds: [], kind: 'LEAGUE' },
      ]);
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValueOnce({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_advanced',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          divisionId: 'div_b',
          divisionTypeId: 'advanced',
          divisionTypeKey: 'c_skill_advanced',
        }),
      }),
    );
    expect(prismaMock.divisions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'div_b' },
        data: expect.objectContaining({ teamIds: ['team_1'] }),
      }),
    );
  });

  it('allows team registration when team has no resolvable division type', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: null,
      divisionTypeId: null,
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.error).toBeUndefined();
    expect(prismaMock.events.update).toHaveBeenCalled();
  });

  it('rejects team registration when team sport does not match the event sport', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'soccer',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('does not match the event sport');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('adds team and stores division registration metadata when division type matches', async () => {
    prismaMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValue({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event_1' },
        data: expect.objectContaining({
          teamIds: ['team_1'],
        }),
      }),
    );
    expect(prismaMock.eventRegistrations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          divisionId: 'div_a',
          divisionTypeId: 'open',
          divisionTypeKey: 'c_skill_open',
        }),
      }),
    );
  });

  it('allows team registration and returns warning for under-13 players missing email', async () => {
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      requiredTemplateIds: ['tmpl_req'],
      userIds: [],
      teamIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
      managerId: 'user_1',
    });
    prismaMock.userData.findMany.mockResolvedValueOnce([
      {
        id: 'user_1',
        firstName: 'Adult',
        lastName: 'Player',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      },
      {
        id: 'user_2',
        firstName: 'Kid',
        lastName: 'Player',
        dateOfBirth: new Date('2015-05-20T00:00:00.000Z'),
      },
    ]);
    prismaMock.sensitiveUserData.findMany.mockResolvedValueOnce([
      { userId: 'user_1', email: 'adult@example.test' },
    ]);
    prismaMock.parentChildLinks.findMany.mockResolvedValueOnce([
      { childId: 'user_2' },
    ]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: ['team_1'],
    });
    prismaMock.eventRegistrations.upsert.mockResolvedValueOnce({
      id: 'event_1__team__team_1',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'user_1',
        teamId: 'team_1',
        divisionTypeKey: 'c_skill_open',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.update).toHaveBeenCalled();
    expect(payload.warnings).toEqual([
      expect.stringContaining('Under-13 player Kid Player is missing an email'),
    ]);
  });

  it('creates a guardian approval request when a minor adds self as participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'child_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValueOnce({
      dateOfBirth: new Date('2014-01-01T00:00:00.000Z'),
    });
    prismaMock.eventRegistrations.create.mockResolvedValueOnce({
      id: 'reg_minor_1',
      eventId: 'event_1',
      registrantId: 'child_1',
      parentId: 'parent_1',
      registrantType: 'CHILD',
      status: 'PENDINGCONSENT',
      consentStatus: 'guardian_approval_required',
    });

    const response = await POST(
      jsonPost('http://localhost/api/events/event_1/participants', {
        userId: 'child_1',
      }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requiresParentApproval).toBe(true);
    expect(payload.registration).toEqual(expect.objectContaining({
      registrantId: 'child_1',
      parentId: 'parent_1',
      consentStatus: 'guardian_approval_required',
    }));
  });
});

describe('DELETE /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(false);
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
      requiredTemplateIds: [],
      userIds: ['user_1'],
      teamIds: [],
      waitListIds: ['user_1'],
      freeAgentIds: ['user_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.events.update.mockResolvedValue({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });
    prismaMock.eventRegistrations.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.refundRequests.findFirst.mockResolvedValue(null);
    prismaMock.refundRequests.create.mockResolvedValue({ id: 'refund_1' });
    prismaMock.bills.findMany.mockResolvedValue([]);
    prismaMock.billPayments.findMany.mockResolvedValue([]);
  });

  it('allows a parent to remove a linked child participant', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'parent_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      requiredTemplateIds: [],
      userIds: ['child_1'],
      teamIds: [],
      waitListIds: ['child_1'],
      freeAgentIds: ['child_1'],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce({ id: 'link_1' });
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(prismaMock.parentChildLinks.findFirst).toHaveBeenCalledWith({
      where: {
        parentId: 'parent_1',
        childId: 'child_1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(prismaMock.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userIds: [],
          waitListIds: [],
          freeAgentIds: [],
        }),
      }),
    );
  });

  it('forbids removing an unrelated participant', async () => {
    prismaMock.parentChildLinks.findFirst.mockResolvedValueOnce(null);

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { userId: 'child_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Forbidden');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('forbids removing a team when session user is not the team manager', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'captain_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: ['div_a'],
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      managerId: 'manager_1',
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('Only the team manager can register or withdraw this team.');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('allows event managers to unregister a team and creates a refund request when payments exist', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: [],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      parentTeamId: null,
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([{ id: 'bill_1' }]);
    prismaMock.billPayments.findMany.mockResolvedValueOnce([
      { amountCents: 5000, refundedAmountCents: 0 },
    ]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.event).toEqual(expect.objectContaining({ teamIds: [] }));
    expect(prismaMock.refundRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_1',
          teamId: 'team_1',
          userId: 'host_1',
          hostId: 'host_1',
          organizationId: 'org_1',
          reason: 'team_unregistered_by_host',
          status: 'WAITING',
        }),
      }),
    );
  });

  it('allows event managers to unregister a team without creating a refund request when no payments exist', async () => {
    requireSessionMock.mockResolvedValueOnce({ userId: 'host_1', isAdmin: false });
    canManageEventMock.mockResolvedValueOnce(true);
    prismaMock.events.findUnique.mockResolvedValueOnce({
      id: 'event_1',
      hostId: 'host_1',
      assistantHostIds: [],
      organizationId: 'org_1',
      eventType: 'EVENT',
      teamSignup: true,
      requiredTemplateIds: [],
      userIds: [],
      teamIds: ['team_1'],
      waitListIds: [],
      freeAgentIds: [],
      registrationByDivisionType: true,
      divisions: [],
      singleDivision: true,
      sportId: 'volleyball',
      start: new Date('2026-07-01T12:00:00.000Z'),
      minAge: null,
      maxAge: null,
    });
    prismaMock.teams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['captain_1'],
      captainId: 'captain_1',
      managerId: 'manager_1',
      headCoachId: null,
      parentTeamId: null,
    });
    prismaMock.bills.findMany.mockResolvedValueOnce([]);
    prismaMock.events.update.mockResolvedValueOnce({
      id: 'event_1',
      userIds: [],
      teamIds: [],
      waitListIds: [],
      freeAgentIds: [],
    });

    const response = await DELETE(
      jsonDelete('http://localhost/api/events/event_1/participants', { teamId: 'team_1' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.event).toEqual(expect.objectContaining({ teamIds: [] }));
    expect(prismaMock.refundRequests.create).not.toHaveBeenCalled();
  });
});
