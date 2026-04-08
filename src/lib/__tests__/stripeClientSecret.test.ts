import { isStripePaymentIntentClientSecret } from '@/lib/stripeClientSecret';

describe('isStripePaymentIntentClientSecret', () => {
  it('accepts a Stripe payment intent client secret', () => {
    expect(isStripePaymentIntentClientSecret('pi_123_secret_456')).toBe(true);
  });

  it('accepts a Stripe subscription confirmation secret', () => {
    expect(isStripePaymentIntentClientSecret('seti_123_secret_456')).toBe(true);
  });

  it('rejects fake payment intent ids without a client secret suffix', () => {
    expect(isStripePaymentIntentClientSecret('pi_fallback_dfd6e0dc-7413-423d-99df-738a6d1482dd')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isStripePaymentIntentClientSecret(null)).toBe(false);
  });
});
