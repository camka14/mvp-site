/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireRazumlyAdminMock = jest.fn();
const getPushAudienceStatsMock = jest.fn();
const getPushAudienceUserIdsMock = jest.fn();
const sendPushToUsersMock = jest.fn();

jest.mock('@/server/razumlyAdmin', () => ({
  requireRazumlyAdmin: (...args: any[]) => requireRazumlyAdminMock(...args),
}));

jest.mock('@/server/pushNotifications', () => ({
  getPushAudienceStats: (...args: any[]) => getPushAudienceStatsMock(...args),
  getPushAudienceUserIds: (...args: any[]) => getPushAudienceUserIdsMock(...args),
  normalizePushDeviceTypes: (values?: string[] | null) => {
    const allowed = new Set(['all', 'ios', 'android', 'web', 'unknown']);
    const normalized = Array.from(new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter((value) => allowed.has(value))));
    return normalized.length === 0 || normalized.includes('all') ? ['all'] : normalized;
  },
  sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args),
}));

import { GET, POST } from '@/app/api/admin/notifications/route';

const jsonPost = (body: unknown) => new NextRequest('http://localhost/api/admin/notifications', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
});

describe('/api/admin/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireRazumlyAdminMock.mockResolvedValue({ userId: 'admin_1', adminEmail: 'admin@bracket-iq.com', isAdmin: true });
    getPushAudienceStatsMock.mockResolvedValue({
      totalUsers: 2,
      totalTokens: 3,
      byDeviceType: [{ deviceType: 'ios', userCount: 2, tokenCount: 3 }],
    });
    getPushAudienceUserIdsMock.mockResolvedValue(['user_1', 'user_2']);
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 2,
      tokenCount: 3,
      successCount: 3,
      failureCount: 0,
      prunedTokenCount: 0,
    });
  });

  it('returns audience stats for selected device types', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/notifications?deviceType=ios'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deviceTypes).toEqual(['ios']);
    expect(json.audience.totalTokens).toBe(3);
    expect(getPushAudienceStatsMock).toHaveBeenCalledWith(['ios']);
  });

  it('sends a custom notification to the selected device types', async () => {
    const res = await POST(jsonPost({
      title: 'Schedule update',
      body: 'Courts are open now.',
      deepLink: 'mvp://events/event_1',
      deviceTypes: ['ios'],
    }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(getPushAudienceUserIdsMock).toHaveBeenCalledWith(['ios']);
    expect(sendPushToUsersMock).toHaveBeenCalledWith({
      userIds: ['user_1', 'user_2'],
      title: 'Schedule update',
      body: 'Courts are open now.',
      deviceTypes: ['ios'],
      data: {
        adminNotification: true,
        senderId: 'admin_1',
        deepLink: 'mvp://events/event_1',
      },
    });
  });

  it('rejects invalid notification bodies', async () => {
    const res = await POST(jsonPost({ title: '', body: '', deviceTypes: ['ios'] }));

    expect(res.status).toBe(400);
    expect(sendPushToUsersMock).not.toHaveBeenCalled();
  });

  it('requires admin access', async () => {
    requireRazumlyAdminMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));

    const res = await GET(new NextRequest('http://localhost/api/admin/notifications'));

    expect(res.status).toBe(403);
  });
});
