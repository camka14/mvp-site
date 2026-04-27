/** @jest-environment node */

import { NextRequest } from 'next/server';

const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();

jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { POST } from '@/app/api/demo-requests/route';

const originalEnv = process.env;

const buildJsonRequest = (body: unknown): NextRequest => new NextRequest('http://localhost/api/demo-requests', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'jest-demo-agent',
  },
  body: JSON.stringify(body),
});

describe('POST /api/demo-requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, DEMO_REQUEST_TO: 'owner@example.com' };
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends a demo request notification for valid input', async () => {
    const response = await POST(buildJsonRequest({
      name: 'Morgan Host',
      email: 'morgan@example.com',
      organization: 'Morgan Volleyball Club',
      role: 'Director',
      phone: '555-0100',
      eventType: 'Leagues',
      eventVolume: '20 events per year',
      message: 'We need registration and scheduling.',
      sourcePath: 'http://localhost/request-demo',
      companyWebsite: '',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      replyTo: 'morgan@example.com',
      subject: 'BracketIQ demo request: Morgan Volleyball Club',
      text: expect.stringContaining('Morgan Volleyball Club'),
      html: expect.stringContaining('Morgan Volleyball Club'),
    }));
  });

  it('accepts comma-separated notification recipients', async () => {
    process.env.DEMO_REQUEST_TO = 'owner@example.com, sales@example.com';

    const response = await POST(buildJsonRequest({
      name: 'Taylor Admin',
      email: 'taylor@example.com',
      organization: 'Taylor Events',
    }));

    expect(response.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com, sales@example.com',
    }));
  });

  it('returns success without sending when the honeypot is filled', async () => {
    const response = await POST(buildJsonRequest({
      name: 'Spam Bot',
      email: 'spam@example.com',
      organization: 'Spam Org',
      companyWebsite: 'https://spam.example.com',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    const response = await POST(buildJsonRequest({
      name: 'A',
      email: 'not-an-email',
      organization: '',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe('Invalid input');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns unavailable when no notification recipient is configured', async () => {
    delete process.env.DEMO_REQUEST_TO;

    const response = await POST(buildJsonRequest({
      name: 'Morgan Host',
      email: 'morgan@example.com',
      organization: 'Morgan Volleyball Club',
    }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain('DEMO_REQUEST_TO');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns unavailable when SMTP is not configured', async () => {
    isEmailEnabledMock.mockReturnValue(false);

    const response = await POST(buildJsonRequest({
      name: 'Morgan Host',
      email: 'morgan@example.com',
      organization: 'Morgan Volleyball Club',
    }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain('SMTP is not configured');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
