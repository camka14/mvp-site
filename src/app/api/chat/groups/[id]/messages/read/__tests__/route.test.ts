/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const chatGroupFindUniqueMock = jest.fn();
const executeRawMock = jest.fn();

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatGroup: {
      findUnique: (...args: any[]) => chatGroupFindUniqueMock(...args),
    },
    $executeRaw: (...args: any[]) => executeRawMock(...args),
  },
}));

import { POST } from '@/app/api/chat/groups/[id]/messages/read/route';

const requestFor = () => new NextRequest('http://localhost/api/chat/groups/chat_1/messages/read', {
  method: 'POST',
});

describe('/api/chat/groups/[id]/messages/read POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks chat messages as read for an authorized member', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    chatGroupFindUniqueMock.mockResolvedValue({ id: 'chat_1', userIds: ['user_1', 'user_2'] });
    executeRawMock.mockResolvedValue(3);

    const response = await POST(requestFor(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when user is outside chat membership', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'outsider_1', isAdmin: false });
    chatGroupFindUniqueMock.mockResolvedValue({ id: 'chat_1', userIds: ['user_1', 'user_2'] });

    const response = await POST(requestFor(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(403);
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('returns the thrown unauthorized response instead of a 500', async () => {
    requireSessionMock.mockRejectedValue(new Response('Unauthorized', { status: 401 }));

    const response = await POST(requestFor(), {
      params: Promise.resolve({ id: 'chat_1' }),
    });

    expect(response.status).toBe(401);
    expect(chatGroupFindUniqueMock).not.toHaveBeenCalled();
    expect(executeRawMock).not.toHaveBeenCalled();
  });
});
