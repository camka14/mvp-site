export const isStripePaymentIntentClientSecret = (value: unknown): value is string => (
  typeof value === 'string'
  && value.includes('_secret_')
);

export const extractStripePaymentIntentId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const [paymentIntentId] = value.split('_secret_');
  return paymentIntentId && paymentIntentId.startsWith('pi_') ? paymentIntentId : null;
};
