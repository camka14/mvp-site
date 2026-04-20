/** @jest-environment node */

import { NextRequest } from 'next/server';

const findManyMock = jest.fn();
const createMock = jest.fn();
const prismaMock = {
  organizations: {
    findMany: (...args: any[]) => findManyMock(...args),
    create: (...args: any[]) => createMock(...args),
  },
};

const withLegacyListMock = jest.fn((rows: any[]) => rows.map((row) => ({ ...row, $id: row.id })));
const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/legacyFormat', () => ({
  withLegacyFields: (row: any) => ({ ...row, $id: row.id }),
  withLegacyList: (rows: any[]) => withLegacyListMock(rows),
}));

import { GET as organizationsGet, POST as organizationsPost } from '@/app/api/organizations/route';

describe('/api/organizations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('supports query mode with relevance-ranked results', async () => {
    findManyMock.mockResolvedValue([
      { id: 'org_5', name: 'Community Club', location: 'Indoor soccer district', description: null },
      { id: 'org_4', name: 'Playindoor', location: null, description: null },
      { id: 'org_3', name: 'The Indoor Arena', location: null, description: null },
      { id: 'org_2', name: 'Indoor Soccer Arena', location: null, description: null },
      { id: 'org_1', name: 'Indoor', location: null, description: null },
    ]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?query=indoor&limit=4'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
        take: 40,
      }),
    );
    expect(json.organizations.map((organization: any) => organization.name)).toEqual([
      'Indoor',
      'Indoor Soccer Arena',
      'The Indoor Arena',
      'Playindoor',
    ]);
  });

  it('keeps default list mode when query is absent', async () => {
    findManyMock.mockResolvedValue([]);

    const res = await organizationsGet(new NextRequest('http://localhost/api/organizations?limit=25'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {},
      take: 25,
      orderBy: { name: 'asc' },
    });
    expect(json.organizations).toEqual([]);
  });

  it('ignores client hasStripeAccount values when creating organizations', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    createMock.mockResolvedValue({
      id: 'org_1',
      name: 'New Org',
      ownerId: 'user_1',
      hasStripeAccount: false,
    });

    const response = await organizationsPost(new NextRequest('http://localhost/api/organizations', {
      method: 'POST',
      body: JSON.stringify({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        hasStripeAccount: true,
      }),
      headers: { 'content-type': 'application/json' },
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'org_1',
        name: 'New Org',
        ownerId: 'user_1',
        hasStripeAccount: false,
      }),
    });
    expect(payload.hasStripeAccount).toBe(false);
  });
});
