/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const createMock = jest.fn();

const prismaMock = {
  teams: {
    findMany: (...args: any[]) => findManyMock(...args),
    create: (...args: any[]) => createMock(...args),
  },
};

const requireSessionMock = jest.fn();
const syncTeamChatByTeamIdMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })),
}));
jest.mock('@/server/teamChatSync', () => ({
  syncTeamChatByTeamId: (...args: any[]) => syncTeamChatByTeamIdMock(...args),
}));

import { GET, POST } from '@/app/api/teams/route';

const postJson = (body: unknown) => new NextRequest('http://localhost/api/teams', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('/api/teams route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    syncTeamChatByTeamIdMock.mockResolvedValue(undefined);
  });

  it('filters by player OR manager when both query params are supplied', async () => {
    findManyMock.mockResolvedValue([]);

    const response = await GET(new NextRequest('http://localhost/api/teams?playerId=user_1&managerId=user_1&limit=25'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { playerIds: { has: 'user_1' } },
          { managerId: 'user_1' },
        ],
      },
      take: 25,
      orderBy: { name: 'asc' },
    }));
  });

  it('can include child teams when explicitly requested', async () => {
    findManyMock.mockResolvedValue([]);

    const response = await GET(
      new NextRequest('http://localhost/api/teams?playerId=user_1&managerId=user_1&includeChildTeams=true&limit=25'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.teams).toEqual([]);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { playerIds: { has: 'user_1' } },
          { managerId: 'user_1' },
        ],
      },
      take: 25,
      orderBy: { name: 'asc' },
    }));
  });

  it('creates a manager-only team when addSelfAsPlayer is false', async () => {
    createMock.mockResolvedValue({
      id: 'team_1',
      name: 'Managed Team',
      division: 'Open',
      sport: 'Indoor Volleyball',
      playerIds: ['user_2'],
      captainId: '',
      managerId: 'user_1',
      coachIds: [],
      pending: [],
      teamSize: 6,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await POST(postJson({
      id: 'team_1',
      name: 'Managed Team',
      addSelfAsPlayer: false,
      playerIds: ['user_2'],
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.captainId).toBe('');
    expect(payload.managerId).toBe('user_1');

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'team_1',
        name: 'Managed Team',
        captainId: '',
        managerId: 'user_1',
        playerIds: ['user_2'],
      }),
    }));
  });

  it('rejects requests with blank team names', async () => {
    const response = await POST(postJson({
      id: 'team_2',
      name: '   ',
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects requests without team names', async () => {
    const response = await POST(postJson({
      id: 'team_3',
      teamSize: 6,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Invalid input');
    expect(createMock).not.toHaveBeenCalled();
  });
});

