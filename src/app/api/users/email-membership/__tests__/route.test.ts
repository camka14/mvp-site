/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  sensitiveUserData: {
    findMany: jest.fn(),
  },
  authUser: {
    findMany: jest.fn(),
  },
};

const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST } from '@/app/api/users/email-membership/route';

const jsonRequest = (body: unknown) => new NextRequest('http://localhost/api/users/email-membership', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('POST /api/users/email-membership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'host_1', isAdmin: false });
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([]);
    prismaMock.authUser.findMany.mockResolvedValue([]);
  });

  it('matches normalized emails using sensitive data first and auth email as fallback', async () => {
    prismaMock.sensitiveUserData.findMany.mockResolvedValue([
      { userId: 'user_1', email: ' Official@Example.com ' },
      { userId: 'user_2', email: null },
    ]);
    prismaMock.authUser.findMany.mockResolvedValue([
      { id: 'user_2', email: 'assistant@example.com' },
      { id: 'user_3', email: 'other@example.com' },
    ]);

    const response = await POST(jsonRequest({
      emails: [' official@example.com ', 'assistant@example.com', 'REF@example.com'],
      userIds: ['user_1', 'user_2', 'user_3', ''],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([
      { email: 'official@example.com', userId: 'user_1' },
      { email: 'assistant@example.com', userId: 'user_2' },
    ]);
    expect(prismaMock.sensitiveUserData.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['user_1', 'user_2', 'user_3'] } },
      select: { userId: true, email: true },
    });
    expect(prismaMock.authUser.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user_2', 'user_3'] } },
      select: { id: true, email: true },
    });
  });

  it('returns an empty match list without querying when emails or userIds are empty after normalization', async () => {
    const response = await POST(jsonRequest({
      emails: ['  '],
      userIds: [''],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.matches).toEqual([]);
    expect(prismaMock.sensitiveUserData.findMany).not.toHaveBeenCalled();
    expect(prismaMock.authUser.findMany).not.toHaveBeenCalled();
  });
});

