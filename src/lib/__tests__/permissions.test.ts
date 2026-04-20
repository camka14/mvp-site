/** @jest-environment node */

import { NextRequest } from 'next/server';

const getTokenFromRequestMock = jest.fn();
const verifySessionTokenMock = jest.fn();
const authUserFindUniqueMock = jest.fn();
const isSessionTokenCurrentMock = jest.fn();

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

jest.mock('@/server/authSessions', () => ({
  isSessionTokenCurrent: (...args: any[]) => isSessionTokenCurrentMock(...args),
}));

import { requireSession } from '@/lib/permissions';

describe('requireSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isSessionTokenCurrentMock.mockReturnValue(true);
  });

  it('returns the decoded session and raw token for active users', async () => {
    getTokenFromRequestMock.mockReturnValue('token_1');
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 2 });
    authUserFindUniqueMock.mockResolvedValue({ disabledAt: null, disabledReason: null, sessionVersion: 2 });

    const session = await requireSession(new NextRequest('http://localhost/api/secure'));

    expect(session).toEqual({
      userId: 'user_1',
      isAdmin: false,
      sessionVersion: 2,
      rawToken: 'token_1',
    });
    expect(authUserFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { disabledAt: true, disabledReason: true, sessionVersion: true },
    });
    expect(isSessionTokenCurrentMock).toHaveBeenCalledWith({ userId: 'user_1', isAdmin: false, sessionVersion: 2 }, 2);
  });

  it('rejects suspended users before returning a session', async () => {
    getTokenFromRequestMock.mockReturnValue('token_1');
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 1 });
    authUserFindUniqueMock.mockResolvedValue({
      disabledAt: new Date('2026-04-14T00:00:00.000Z'),
      disabledReason: 'abuse',
      sessionVersion: 1,
    });

    try {
      await requireSession(new NextRequest('http://localhost/api/secure'));
      throw new Error('Expected suspended user to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(403);
    }
  });

  it('rejects stale tokens after session revocation', async () => {
    getTokenFromRequestMock.mockReturnValue('token_1');
    verifySessionTokenMock.mockReturnValue({ userId: 'user_1', isAdmin: false, sessionVersion: 1 });
    authUserFindUniqueMock.mockResolvedValue({
      disabledAt: null,
      disabledReason: null,
      sessionVersion: 2,
    });
    isSessionTokenCurrentMock.mockReturnValue(false);

    await expect(requireSession(new NextRequest('http://localhost/api/secure'))).rejects.toMatchObject({
      status: 401,
    });
  });
});
