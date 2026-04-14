/** @jest-environment node */

import { NextRequest } from 'next/server';

const getTokenFromRequestMock = jest.fn();
const verifySessionTokenMock = jest.fn();
const authUserFindUniqueMock = jest.fn();

jest.mock('@/lib/authServer', () => ({
  getTokenFromRequest: (...args: any[]) => getTokenFromRequestMock(...args),
  verifySessionToken: (...args: any[]) => verifySessionTokenMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    authUser: {
      findUnique: (...args: any[]) => authUserFindUniqueMock(...args),
    },
  },
}));

import { requireSession } from '@/lib/permissions';

describe('requireSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the decoded session and raw token for active users', async () => {
    getTokenFromRequestMock.mockReturnValue('token_1');
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false });
    authUserFindUniqueMock.mockResolvedValue({ disabledAt: null, disabledReason: null });

    const session = await requireSession(new NextRequest('http://localhost/api/secure'));

    expect(session).toEqual({
      userId: 'user_1',
      isAdmin: false,
      rawToken: 'token_1',
    });
    expect(authUserFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { disabledAt: true, disabledReason: true },
    });
  });

  it('rejects suspended users before returning a session', async () => {
    getTokenFromRequestMock.mockReturnValue('token_1');
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false });
    authUserFindUniqueMock.mockResolvedValue({
      disabledAt: new Date('2026-04-14T00:00:00.000Z'),
      disabledReason: 'abuse',
    });

    try {
      await requireSession(new NextRequest('http://localhost/api/secure'));
      throw new Error('Expected suspended user to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(403);
    }
  });
});
