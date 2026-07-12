/**
 * Stripe-backed operations must fail closed when the server is not configured
 * with a secret key. Do not substitute locally-generated payment or account
 * identifiers here: callers may persist or display those values as if Stripe
 * had accepted the operation.
 */
export const STRIPE_UNAVAILABLE_ERROR = 'Payment processing is temporarily unavailable. Please try again later.';

export const getConfiguredStripeSecretKey = (): string | null => {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey || null;
};
