import { logServerError, sanitizeErrorLogContext } from '@/server/http/errorLogging';

describe('server error logging', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    errorSpy.mockClear();
    warnSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs handled 4xx errors as warnings', () => {
    logServerError({
      message: 'Request failed',
      status: 404,
      error: 'Discount code was not found.',
      route: '/api/billing/discount-preview',
      stage: 'resolve_discount',
      context: { userId: 'user_1' },
    });

    expect(warnSpy).toHaveBeenCalledWith('Request failed', expect.objectContaining({
      route: '/api/billing/discount-preview',
      stage: 'resolve_discount',
      status: 404,
      message: 'Discount code was not found.',
      userId: 'user_1',
    }));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs 5xx errors with stack traces', () => {
    const error = new Error('Stripe is not configured.');

    logServerError({
      message: 'Checkout failed',
      status: 500,
      error,
    });

    expect(errorSpy).toHaveBeenCalledWith('Checkout failed', expect.objectContaining({
      status: 500,
      message: 'Stripe is not configured.',
      errorName: 'Error',
      stack: expect.stringContaining('Stripe is not configured.'),
    }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('redacts sensitive context and summarizes discount codes', () => {
    const sanitized = sanitizeErrorLogContext({
      discountCode: 'BIQ466B2FC5',
      guestEmail: 'player@example.com',
      registrationToken: 'secret-token',
      empty: '',
      nested: {
        phone: '555-555-1212',
        eventId: 'event_1',
      },
    });

    expect(sanitized).toEqual({
      discountCode: {
        prefix: 'BIQ4',
        length: 11,
        sha256: expect.any(String),
      },
      guestEmail: '[redacted]',
      registrationToken: '[redacted]',
      nested: {
        phone: '[redacted]',
        eventId: 'event_1',
      },
    });
  });
});
