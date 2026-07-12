/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  parentChildLinks: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sensitiveUserData: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  eventRegistrations: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};
const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { POST as createChild } from '@/app/api/family/children/route';
import { PATCH as updateChild } from '@/app/api/family/children/[childId]/route';

const requestFor = (url: string, body: unknown, method: 'POST' | 'PATCH') => new NextRequest(url, {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('family child date of birth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'parent_1' });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue({ id: 'link_1', parentId: 'parent_1', childId: 'child_1' });
  });

  it('rejects a future date of birth when creating a child', async () => {
    const response = await createChild(requestFor('http://localhost/api/family/children', {
      firstName: 'Casey',
      lastName: 'Child',
      dateOfBirth: '2999-01-01',
    }, 'POST'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('dateOfBirth cannot be in the future');
    expect(prismaMock.userData.create).not.toHaveBeenCalled();
  });

  it('rejects a future date of birth when updating a child', async () => {
    const response = await updateChild(
      requestFor('http://localhost/api/family/children/child_1', {
        firstName: 'Casey',
        lastName: 'Child',
        dateOfBirth: '2999-01-01',
      }, 'PATCH'),
      { params: Promise.resolve({ childId: 'child_1' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('dateOfBirth cannot be in the future');
    expect(prismaMock.userData.update).not.toHaveBeenCalled();
  });
});
