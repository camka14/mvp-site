/** @jest-environment node */

const originalEnv = process.env;
const originalFetch = global.fetch;

const decodeBase64Url = (value: string): string => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const resetEmailEnv = () => {
  process.env = {
    ...originalEnv,
    GMAIL_OAUTH_CLIENT_ID: 'gmail-client-id',
    GMAIL_OAUTH_CLIENT_SECRET: 'gmail-client-secret',
    GMAIL_OAUTH_REFRESH_TOKEN: 'gmail-refresh-token',
    GMAIL_SENDER_EMAIL: 'noreply@razumly.com',
    SMTP_FROM: 'noreply@bracket-iq.com',
    SMTP_FROM_NAME: 'BracketIQ',
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_URL;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_PASSWORD;
};

describe('email delivery', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    resetEmailEnv();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gmail-access-token',
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'message_1' }),
      }) as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('uses Gmail API when OAuth mail credentials are configured', async () => {
    const { isEmailEnabled, sendEmail } = await import('@/server/email');

    expect(isEmailEnabled()).toBe(true);

    await sendEmail({
      to: 'owner@example.com',
      subject: 'Demo request',
      text: 'Plain text body',
      html: '<p>Plain text body</p>',
      replyTo: 'requester@example.com',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://oauth2.googleapis.com/token', expect.objectContaining({
      method: 'POST',
    }));
    const tokenBody = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams;
    expect(tokenBody.get('client_id')).toBe('gmail-client-id');
    expect(tokenBody.get('refresh_token')).toBe('gmail-refresh-token');

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/noreply%40razumly.com/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer gmail-access-token',
        }),
      }),
    );

    const sendBody = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    const mime = decodeBase64Url(sendBody.raw);
    expect(mime).toContain('From: BracketIQ <noreply@bracket-iq.com>');
    expect(mime).toContain('To: owner@example.com');
    expect(mime).toContain('Subject: Demo request');
    expect(mime).toContain('Reply-To: requester@example.com');
    expect(mime).toContain('Content-Type: multipart/alternative');
  });

  it('reports token refresh failures from Gmail API', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.',
      }),
    }) as unknown as typeof fetch;
    const { sendEmail } = await import('@/server/email');

    await expect(sendEmail({
      to: 'owner@example.com',
      subject: 'Demo request',
      text: 'Plain text body',
    })).rejects.toThrow('Token has been expired or revoked');
  });
});
