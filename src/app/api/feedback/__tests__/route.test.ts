/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  feedbackSubmissions: {
    create: jest.fn(),
  },
};
const getOptionalSessionMock = jest.fn();
const applyRateLimitMock = jest.fn();
const sendNotificationMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ getOptionalSession: (...args: any[]) => getOptionalSessionMock(...args) }));
jest.mock('@/server/rateLimit', () => ({
  applyRateLimit: (...args: any[]) => applyRateLimitMock(...args),
  RATE_LIMIT_POLICIES: { feedbackSubmission: { name: 'feedback:submission', limit: 10, windowSeconds: 3600 } },
}));
jest.mock('@/server/adminNotifications', () => ({
  sendAdminFeedbackSubmissionNotification: (...args: any[]) => sendNotificationMock(...args),
}));

import { POST } from '@/app/api/feedback/route';

const buildRequest = (body: unknown, headers: Record<string, string> = {}) => new NextRequest(
  'http://localhost/api/feedback',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  },
);

const validBody = {
  type: 'BUG',
  message: 'The schedule button does not save the selected field.',
  additionalContext: 'I expected the selected court to remain visible.',
  allowContact: true,
  contactEmail: 'player@example.com',
  sourcePath: '/discover?filter=private#results',
  clientContext: { surface: 'WEB', viewportWidth: 1440, viewportHeight: 900 },
};

describe('POST /api/feedback', () => {
  beforeEach(() => {
    getOptionalSessionMock.mockResolvedValue({ userId: 'user_1' });
    applyRateLimitMock.mockResolvedValue(null);
    sendNotificationMock.mockResolvedValue(undefined);
    prismaMock.feedbackSubmissions.create.mockImplementation(async ({ data }: any) => ({
      ...data,
      status: 'NEW',
      updatedAt: data.createdAt,
    }));
  });

  it('creates an authenticated submission with limited technical context', async () => {
    const longUserAgent = 'a'.repeat(600);
    const response = await POST(buildRequest(validBody, { 'user-agent': ` ${longUserAgent} ` }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toMatchObject({ ok: true, submission: { status: 'NEW' } });
    expect(prismaMock.feedbackSubmissions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'BUG',
        submitterUserId: 'user_1',
        contactEmail: 'player@example.com',
        sourcePath: null,
        userAgent: 'a'.repeat(512),
        clientContext: validBody.clientContext,
      }),
    });
    expect(prismaMock.feedbackSubmissions.create.mock.calls[0][0].data).not.toHaveProperty('ipAddress');
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('creates a guest submission and removes contact data when consent is false', async () => {
    getOptionalSessionMock.mockResolvedValue(null);
    const response = await POST(buildRequest({
      ...validBody,
      type: 'GENERAL',
      allowContact: false,
      contactEmail: 'should-not-be-stored@example.com',
      sourcePath: 'feedback',
    }));

    expect(response.status).toBe(201);
    expect(prismaMock.feedbackSubmissions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submitterUserId: null,
        allowContact: false,
        contactEmail: null,
        sourcePath: '/feedback',
      }),
    });
  });

  it('rejects invalid content and does not persist', async () => {
    const response = await POST(buildRequest({ ...validBody, message: 'short', contactEmail: 'bad' }));

    expect(response.status).toBe(400);
    expect(prismaMock.feedbackSubmissions.create).not.toHaveBeenCalled();
  });

  it('normalizes consent, invalid source paths, and rate-limit identity', async () => {
    const response = await POST(buildRequest({
      ...validBody,
      allowContact: false,
      contactEmail: 'not-valid-but-ignored@example',
      sourcePath: '//external.example/private?secret=1',
    }, { 'x-forwarded-for': '203.0.113.9' }));

    expect(response.status).toBe(201);
    expect(applyRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({ name: 'feedback:submission' }),
      'user_1',
    );
    expect(prismaMock.feedbackSubmissions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactEmail: null, sourcePath: null }),
    });
    expect(JSON.stringify(prismaMock.feedbackSubmissions.create.mock.calls)).not.toContain('203.0.113.9');
  });

  it('returns a normal success for the honeypot without inserting or notifying', async () => {
    const response = await POST(buildRequest({ ...validBody, companyWebsite: 'https://spam.example' }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toMatchObject({ ok: true, submission: { status: 'NEW' } });
    expect(prismaMock.feedbackSubmissions.create).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response without persisting', async () => {
    applyRateLimitMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Too many feedback submissions.' }), { status: 429 }));

    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(429);
    expect(prismaMock.feedbackSubmissions.create).not.toHaveBeenCalled();
  });

  it('returns 500 when persistence fails and does not notify', async () => {
    prismaMock.feedbackSubmissions.create.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(500);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('keeps the saved response successful when notification fails', async () => {
    sendNotificationMock.mockRejectedValue(new Error('smtp unavailable'));

    const response = await POST(buildRequest(validBody));

    expect(response.status).toBe(201);
    expect(prismaMock.feedbackSubmissions.create).toHaveBeenCalledTimes(1);
  });
});
