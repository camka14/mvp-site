export const isStripePaymentIntentClientSecret = (value: unknown): value is string => (
  typeof value === 'string'
  && value.includes('_secret_')
);
