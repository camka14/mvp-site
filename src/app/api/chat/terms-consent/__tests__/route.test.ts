/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const prismaMock = {
  userData: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: any[]) => requireSessionMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import { GET, POST } from '@/app/api/chat/terms-consent/route';
import { CHAT_TERMS_VERSION } from '@/server/chatTerms';

describe('/api/chat/terms-consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current consent state for the signed-in user', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.userData.findUnique.mockResolvedValue({
      chatTermsAcceptedAt: new Date('2026-04-14T12:00:00.000Z'),
      chatTermsVersion: CHAT_TERMS_VERSION,
    });

    const res = await GET(new NextRequest('http://localhost/api/chat/terms-consent'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.accepted).toBe(true);
    expect(json.version).toBe(CHAT_TERMS_VERSION);
  });

  it('records consent with the current version', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    prismaMock.userData.update.mockResolvedValue({
      chatTermsAcceptedAt: new Date('2026-04-14T12:00:00.000Z'),
      chatTermsVersion: CHAT_TERMS_VERSION,
    });

    const res = await POST(new NextRequest('http://localhost/api/chat/terms-consent', {
      method: 'POST',
      body: JSON.stringify({ accepted: true }),
      headers: { 'content-type': 'application/json' },
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(prismaMock.userData.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_1' },
      data: expect.objectContaining({
        chatTermsVersion: CHAT_TERMS_VERSION,
      }),
    }));
    expect(json.accepted).toBe(true);
    expect(json.version).toBe(CHAT_TERMS_VERSION);
  });
});
