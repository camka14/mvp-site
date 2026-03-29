/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  sports: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  events: {
    updateMany: jest.fn(),
  },
  divisions: {
    updateMany: jest.fn(),
  },
  teams: {
    updateMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyList: (items: any[]) => items,
}));

import { GET } from '@/app/api/sports/route';

describe('GET /api/sports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.sports.createMany.mockResolvedValue({ count: 0 });
    prismaMock.sports.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.events.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.divisions.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.teams.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.organizations.update.mockResolvedValue({});
    prismaMock.sports.update.mockResolvedValue({});
  });

  it('seeds default sports without generic soccer/volleyball entries', async () => {
    prismaMock.sports.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'Indoor Soccer', name: 'Indoor Soccer' },
        { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.sports.createMany).toHaveBeenCalledTimes(1);
    const createPayload = prismaMock.sports.createMany.mock.calls[0][0];
    const createdNames = Array.isArray(createPayload?.data)
      ? createPayload.data.map((row: any) => row.name)
      : [];
    const basketball = Array.isArray(createPayload?.data)
      ? createPayload.data.find((row: any) => row.id === 'Basketball')
      : null;
    expect(createdNames).not.toContain('Soccer');
    expect(createdNames).not.toContain('Volleyball');
    expect(basketball?.usePointsPerGoalScored).toBe(false);
    expect(basketball?.usePointsPerGoalConceded).toBe(false);
    expect(payload.sports.map((sport: any) => sport.name)).toEqual(
      expect.arrayContaining(['Indoor Soccer', 'Indoor Volleyball']),
    );
  });

  it('remaps legacy references and removes deprecated sports', async () => {
    const seededSports = [
      { id: 'Soccer', name: 'Soccer' },
      { id: 'Volleyball', name: 'Volleyball' },
      { id: 'Indoor Soccer', name: 'Indoor Soccer' },
      { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        { id: 'Indoor Soccer', name: 'Indoor Soccer' },
        { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
      ]);
    prismaMock.organizations.findMany.mockResolvedValueOnce([
      { id: 'org_1', sports: ['Soccer', 'Volleyball', 'Basketball'] },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.events.updateMany).toHaveBeenCalled();
    expect(prismaMock.divisions.updateMany).toHaveBeenCalled();
    expect(prismaMock.teams.updateMany).toHaveBeenCalled();
    expect(prismaMock.organizations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_1' },
        data: { sports: ['Indoor Soccer', 'Indoor Volleyball', 'Basketball'] },
      }),
    );
    expect(prismaMock.sports.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['Soccer', 'Volleyball'] } },
    });
    expect(payload.sports.map((sport: any) => sport.name)).toEqual([
      'Indoor Soccer',
      'Indoor Volleyball',
    ]);
  });

  it('does not overwrite explicit scoring flags from the database', async () => {
    const seededSports = [
      {
        id: 'Basketball',
        name: 'Basketball',
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: true,
        usePointsPerGoalConceded: true,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce(seededSports);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).not.toHaveBeenCalled();
  });

  it('backfills null scoring flags using default sport settings', async () => {
    const seededSports = [
      {
        id: 'Basketball',
        name: 'Basketball',
        usePointsForWin: null,
        usePointsForLoss: null,
        usePointsPerGoalScored: null,
        usePointsPerGoalConceded: null,
      },
    ];
    prismaMock.sports.findMany
      .mockResolvedValueOnce(seededSports)
      .mockResolvedValueOnce([
        {
          ...seededSports[0],
          usePointsForWin: true,
          usePointsForLoss: true,
          usePointsPerGoalScored: false,
          usePointsPerGoalConceded: false,
        },
      ]);

    const response = await GET(new NextRequest('http://localhost/api/sports'));

    expect(response.status).toBe(200);
    expect(prismaMock.sports.update).toHaveBeenCalledWith({
      where: { id: 'Basketball' },
      data: {
        usePointsForWin: true,
        usePointsForLoss: true,
        usePointsPerGoalScored: false,
        usePointsPerGoalConceded: false,
      },
    });
  });
});
