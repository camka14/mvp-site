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
  volleyBallTeams: {
    findUnique: jest.fn(),
  },
  eventRegistrations: {
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
  });

  it('rejects team registration when team division type does not match selection', async () => {
    prismaMock.volleyBallTeams.findUnique.mockResolvedValue({
      id: 'team_1',
      division: 'Advanced',
      divisionTypeId: 'advanced',
      sport: 'volleyball',
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
});
