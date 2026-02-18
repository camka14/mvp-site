/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  divisions: {
    findMany: jest.fn(),
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
  volleyBallTeams: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
    findFirst: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/events/[eventId]/participants/route';

const jsonPost = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/events/[eventId]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.events.findUnique.mockResolvedValue({
      id: 'event_1',
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
      },
    ]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ parentId: 'parent_1' });
    prismaMock.eventRegistrations.findFirst.mockResolvedValue(null);
  });

  it('rejects team registration when team division type does not match selection', async () => {
    prismaMock.volleyBallTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Advanced',
      divisionTypeId: 'advanced',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
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
    expect(payload.error).toContain('cannot register');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects team registration when team has no resolvable division type', async () => {
    prismaMock.volleyBallTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: null,
      divisionTypeId: null,
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
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
    expect(payload.error).toContain('must be assigned a division type');
    expect(prismaMock.events.update).not.toHaveBeenCalled();
  });

  it('adds team and stores division registration metadata when division type matches', async () => {
    prismaMock.volleyBallTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
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
    prismaMock.volleyBallTeams.findUnique.mockResolvedValueOnce({
      id: 'team_1',
      division: 'Open',
      divisionTypeId: 'open',
      sport: 'volleyball',
      playerIds: ['user_1', 'user_2'],
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
