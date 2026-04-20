export type PaymentModalPurchaseType = string | null | undefined;

export type PaymentModalCopy = {
  summaryTypeLabel: string;
  refreshFailureMessage: string;
  reloadingMessage: string;
  refreshedMessage: string;
};

const defaultSummaryTypeLabel = 'Event';
const defaultRefreshFailureMessage = 'Payment succeeded but failed to refresh the details. Please contact support.';
const defaultReloadingMessage = 'Reloading details…';
const defaultRefreshedMessage = 'Details are up to date.';

export const getPaymentModalCopy = (purchaseType: PaymentModalPurchaseType): PaymentModalCopy => {
  const normalized = typeof purchaseType === 'string' ? purchaseType.trim().toLowerCase() : '';

  if (normalized === 'product') {
    return {
      summaryTypeLabel: 'Product',
      refreshFailureMessage: 'Payment succeeded but failed to refresh the product details. Please contact support.',
      reloadingMessage: 'Reloading product details…',
      refreshedMessage: 'Product details are up to date.',
    };
  }

  if (normalized === 'rental') {
    return {
      summaryTypeLabel: 'Rental',
      refreshFailureMessage: 'Payment succeeded but failed to refresh the rental details. Please contact support.',
      reloadingMessage: 'Reloading rental details…',
      refreshedMessage: 'Rental details are up to date.',
    };
  }

  if (normalized === 'bill') {
    return {
      summaryTypeLabel: 'Bill Payment',
      refreshFailureMessage: 'Payment succeeded but failed to refresh the billing details. Please contact support.',
      reloadingMessage: 'Reloading billing details…',
      refreshedMessage: 'Billing details are up to date.',
    };
  }

  if (normalized === 'team_registration') {
    return {
      summaryTypeLabel: 'Team',
      refreshFailureMessage: 'Payment succeeded but failed to refresh the team details. Please contact support.',
      reloadingMessage: 'Reloading team...',
      refreshedMessage: 'Team details are up to date.',
    };
  }

  if (normalized === 'event') {
    return {
      summaryTypeLabel: defaultSummaryTypeLabel,
      refreshFailureMessage: 'Payment succeeded but failed to refresh the event details. Please contact support.',
      reloadingMessage: 'Reloading event…',
      refreshedMessage: 'Event details are up to date.',
    };
  }

  return {
    summaryTypeLabel: defaultSummaryTypeLabel,
    refreshFailureMessage: defaultRefreshFailureMessage,
    reloadingMessage: defaultReloadingMessage,
    refreshedMessage: defaultRefreshedMessage,
  };
};
