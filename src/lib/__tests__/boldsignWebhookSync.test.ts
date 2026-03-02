/** @jest-environment node */

import crypto from 'crypto';
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
import {
  isAuthEventType,
  isVerificationEvent,
  parseBoldSignWebhookEvent,
  shouldProcessBoldSignEvent,
  verifyBoldSignWebhookSignature,
} from '@/lib/boldsignWebhookSync';

describe('boldsignWebhookSync', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BOLDSIGN_WEBHOOK_SECRET: 'test_webhook_secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('verifies a valid BoldSign webhook signature', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', 'test_webhook_secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=${signature}`,
      now: new Date(timestamp * 1000),
    });

    expect(result.valid).toBe(true);
    expect(result.signatureTimestamp).toBe(timestamp);
  });

  it('rejects invalid signatures', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000);

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=deadbeef`,
      now: new Date(timestamp * 1000),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('verification failed');
  });

  it('rejects signatures outside timestamp tolerance', () => {
    const payload = JSON.stringify({ event: { id: 'evt_1', eventType: 'Sent' } });
    const timestamp = Math.floor(Date.now() / 1000) - 1_000;
    const signature = crypto
      .createHmac('sha256', 'test_webhook_secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const result = verifyBoldSignWebhookSignature({
      rawBody: payload,
      signatureHeader: `t=${timestamp},s0=${signature}`,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside tolerance');
  });

  it('parses canonical event fields from webhook payloads', () => {
    const parsed = parseBoldSignWebhookEvent({
      payload: {
        event: {
          id: 'evt_1',
          eventType: 'TemplateCreated',
          createdAt: '2026-03-01T12:00:00.000Z',
        },
        data: {
          object: {
            templateId: 'tmpl_1',
            status: 'Active',
          },
        },
      },
      rawBody: '{"event":{"id":"evt_1"}}',
      headerEventType: 'TemplateCreated',
    });

    expect(parsed.eventId).toBe('evt_1');
    expect(parsed.eventType).toBe('TemplateCreated');
    expect(parsed.eventToken).toBe('templatecreated');
    expect(parsed.templateId).toBe('tmpl_1');
    expect(parsed.status).toBe('Active');
    expect(parsed.eventTimestamp).toBeGreaterThan(0);
  });

  it('identifies authentication and verification events for filtering', () => {
    expect(isAuthEventType('AuthenticationFailed')).toBe(true);
    expect(shouldProcessBoldSignEvent('AuthenticationFailed')).toBe(false);
    expect(shouldProcessBoldSignEvent('Sent')).toBe(true);
    expect(isVerificationEvent('Verification', 'TemplateCreated')).toBe(true);
  });
});
