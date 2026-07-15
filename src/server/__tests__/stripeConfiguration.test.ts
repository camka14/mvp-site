import { getConfiguredStripeSecretKey } from '@/server/stripeConfiguration';

describe('getConfiguredStripeSecretKey', () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalStripeSecret === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalStripeSecret;
    }
  });

  it('returns null for missing or whitespace-only configuration', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getConfiguredStripeSecretKey()).toBeNull();

    process.env.STRIPE_SECRET_KEY = '   ';
    expect(getConfiguredStripeSecretKey()).toBeNull();
  });

  it('trims an explicitly configured secret key', () => {
    process.env.STRIPE_SECRET_KEY = '  sk_test_123  ';

    expect(getConfiguredStripeSecretKey()).toBe('sk_test_123');
  });
});
