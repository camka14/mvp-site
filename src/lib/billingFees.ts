export const DEFAULT_MVP_FEE_PERCENTAGE = 0.01;
export const STRIPE_FIXED_FEE_CENTS = 30;
export const STRIPE_PERCENT_FEE = 0.029;
export const DEFAULT_STRIPE_TAX_SERVICE_FEE_CENTS = 50;
export const ACH_DIRECT_DEBIT_PERCENT_FEE = 0.008;
export const ACH_DIRECT_DEBIT_FEE_CAP_CENTS = 500;
export const USD_BANK_TRANSFER_PERCENT_FEE = 0.005;
export const USD_BANK_TRANSFER_FEE_CAP_CENTS = 500;
export const PAY_BY_BANK_PERCENT_FEE = 0.015;
export const PAY_BY_BANK_FIXED_FEE_CENTS = 30;

export type PaymentMethodFeeType =
  | 'card'
  | 'us_bank_account'
  | 'customer_balance'
  | 'pay_by_bank';

export const resolveMvpFeePercentage = (_eventType: unknown): number => {
  return DEFAULT_MVP_FEE_PERCENTAGE;
};

export const calculateChargeAmount = (
  goalAmountCents: number,
  fixedFeeCents = STRIPE_FIXED_FEE_CENTS,
  percentFee = STRIPE_PERCENT_FEE,
): number => {
  const numerator = goalAmountCents + fixedFeeCents;
  const denominator = 1 - percentFee;
  return Math.round(numerator / denominator);
};

const calculatePercentOnlyChargeAmount = (
  goalAmountCents: number,
  percentFee: number,
  feeCapCents: number,
): number => {
  if (goalAmountCents <= 0) return 0;
  const uncappedTotal = Math.round(goalAmountCents / (1 - percentFee));
  const uncappedFee = Math.max(0, uncappedTotal - goalAmountCents);
  if (uncappedFee > feeCapCents) {
    return goalAmountCents + feeCapCents;
  }
  return uncappedTotal;
};

export const normalizePaymentMethodFeeType = (value: unknown): PaymentMethodFeeType => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'us_bank_account' || normalized === 'ach' || normalized === 'ach_direct_debit') {
    return 'us_bank_account';
  }
  if (normalized === 'customer_balance' || normalized === 'bank_transfer' || normalized === 'us_bank_transfer') {
    return 'customer_balance';
  }
  if (normalized === 'pay_by_bank') {
    return 'pay_by_bank';
  }
  return 'card';
};

export const getPaymentMethodFeeLabel = (paymentMethodType: unknown): string => {
  const normalized = normalizePaymentMethodFeeType(paymentMethodType);
  if (normalized === 'us_bank_account') return 'Bank account';
  if (normalized === 'customer_balance') return 'Bank transfer';
  if (normalized === 'pay_by_bank') return 'Pay by bank';
  return 'Card';
};

const normalizeCents = (value: unknown): number => (
  Number.isFinite(Number(value))
    ? Math.max(0, Math.round(Number(value)))
    : 0
);

export type InclusivePriceBreakdown = {
  hostReceivesCents: number;
  processingFeeCents: number;
  platformFeeCents: number;
  totalPriceCents: number;
  platformFeePercentage: number;
};

export const calculateInclusivePriceFromHostAmount = ({
  hostAmountCents,
  eventType,
}: {
  hostAmountCents: number;
  eventType?: unknown;
}): InclusivePriceBreakdown => {
  const normalizedHostAmount = normalizeCents(hostAmountCents);
  const platformFeePercentage = resolveMvpFeePercentage(eventType);
  if (normalizedHostAmount <= 0) {
    return {
      hostReceivesCents: 0,
      processingFeeCents: 0,
      platformFeeCents: 0,
      totalPriceCents: 0,
      platformFeePercentage,
    };
  }

  const platformFeeCents = Math.round(normalizedHostAmount * platformFeePercentage);
  const totalPriceCents = calculateChargeAmount(normalizedHostAmount + platformFeeCents);
  return {
    hostReceivesCents: normalizedHostAmount,
    processingFeeCents: Math.max(0, totalPriceCents - normalizedHostAmount - platformFeeCents),
    platformFeeCents,
    totalPriceCents,
    platformFeePercentage,
  };
};

export const calculateIncludedFeesFromTotalPrice = ({
  totalPriceCents,
  eventType,
}: {
  totalPriceCents: number;
  eventType?: unknown;
}): InclusivePriceBreakdown => {
  const normalizedTotalPrice = normalizeCents(totalPriceCents);
  const platformFeePercentage = resolveMvpFeePercentage(eventType);
  if (normalizedTotalPrice <= 0) {
    return {
      hostReceivesCents: 0,
      processingFeeCents: 0,
      platformFeeCents: 0,
      totalPriceCents: 0,
      platformFeePercentage,
    };
  }

  let low = 0;
  let high = normalizedTotalPrice;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = calculateInclusivePriceFromHostAmount({
      hostAmountCents: mid,
      eventType,
    }).totalPriceCents;
    if (candidate <= normalizedTotalPrice) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const platformFeeCents = Math.round(best * platformFeePercentage);
  return {
    hostReceivesCents: best,
    platformFeeCents,
    processingFeeCents: Math.max(0, normalizedTotalPrice - best - platformFeeCents),
    totalPriceCents: normalizedTotalPrice,
    platformFeePercentage,
  };
};

export const calculateChargeAmountForPaymentMethod = ({
  goalAmountCents,
  paymentMethodType,
}: {
  goalAmountCents: number;
  paymentMethodType?: unknown;
}): {
  paymentMethodType: PaymentMethodFeeType;
  stripeProcessingFeeCents: number;
  totalChargeCents: number;
} => {
  const normalizedGoalAmount = Number.isFinite(Number(goalAmountCents))
    ? Math.max(0, Math.round(Number(goalAmountCents)))
    : 0;
  const normalizedPaymentMethodType = normalizePaymentMethodFeeType(paymentMethodType);

  let totalChargeCents = 0;
  if (normalizedPaymentMethodType === 'us_bank_account') {
    totalChargeCents = calculatePercentOnlyChargeAmount(
      normalizedGoalAmount,
      ACH_DIRECT_DEBIT_PERCENT_FEE,
      ACH_DIRECT_DEBIT_FEE_CAP_CENTS,
    );
  } else if (normalizedPaymentMethodType === 'customer_balance') {
    totalChargeCents = calculatePercentOnlyChargeAmount(
      normalizedGoalAmount,
      USD_BANK_TRANSFER_PERCENT_FEE,
      USD_BANK_TRANSFER_FEE_CAP_CENTS,
    );
  } else if (normalizedPaymentMethodType === 'pay_by_bank') {
    totalChargeCents = calculateChargeAmount(
      normalizedGoalAmount,
      PAY_BY_BANK_FIXED_FEE_CENTS,
      PAY_BY_BANK_PERCENT_FEE,
    );
  } else {
    totalChargeCents = calculateChargeAmount(normalizedGoalAmount);
  }

  return {
    paymentMethodType: normalizedPaymentMethodType,
    stripeProcessingFeeCents: Math.max(0, totalChargeCents - normalizedGoalAmount),
    totalChargeCents,
  };
};

export const calculateMvpAndStripeFees = ({
  eventAmountCents,
  eventType,
}: {
  eventAmountCents: number;
  eventType?: unknown;
}): {
  mvpFeeCents: number;
  stripeFeeCents: number;
  totalChargeCents: number;
  mvpFeePercentage: number;
} => {
  const normalizedEventAmount = normalizeCents(eventAmountCents);
  if (normalizedEventAmount === 0) {
    return {
      mvpFeeCents: 0,
      stripeFeeCents: 0,
      totalChargeCents: 0,
      mvpFeePercentage: resolveMvpFeePercentage(eventType),
    };
  }
  const includedFees = calculateIncludedFeesFromTotalPrice({
    totalPriceCents: normalizedEventAmount,
    eventType,
  });

  return {
    mvpFeeCents: includedFees.platformFeeCents,
    stripeFeeCents: includedFees.processingFeeCents,
    totalChargeCents: normalizedEventAmount,
    mvpFeePercentage: includedFees.platformFeePercentage,
  };
};

export const calculateMvpAndStripeFeesWithTax = ({
  eventAmountCents,
  eventType,
  paymentMethodType,
  taxAmountCents,
  stripeTaxServiceFeeCents,
}: {
  eventAmountCents: number;
  eventType?: unknown;
  paymentMethodType?: unknown;
  taxAmountCents?: number;
  stripeTaxServiceFeeCents?: number;
}): {
  mvpFeeCents: number;
  stripeProcessingFeeCents: number;
  stripeTaxServiceFeeCents: number;
  stripeFeeCents: number;
  taxAmountCents: number;
  totalChargeCents: number;
  hostReceivesCents: number;
  mvpFeePercentage: number;
  paymentMethodType: PaymentMethodFeeType;
} => {
  const normalizedEventAmount = normalizeCents(eventAmountCents);
  const normalizedTaxAmount = normalizeCents(taxAmountCents);
  const normalizedStripeTaxServiceFee = normalizeCents(stripeTaxServiceFeeCents);
  const mvpFeePercentage = resolveMvpFeePercentage(eventType);

  if (normalizedEventAmount === 0) {
    return {
      mvpFeeCents: 0,
      stripeProcessingFeeCents: 0,
      stripeTaxServiceFeeCents: normalizedStripeTaxServiceFee,
      stripeFeeCents: normalizedStripeTaxServiceFee,
      taxAmountCents: normalizedTaxAmount,
      totalChargeCents: normalizedTaxAmount + normalizedStripeTaxServiceFee,
      hostReceivesCents: 0,
      mvpFeePercentage,
      paymentMethodType: normalizePaymentMethodFeeType(paymentMethodType),
    };
  }

  const includedFees = calculateIncludedFeesFromTotalPrice({
    totalPriceCents: normalizedEventAmount,
    eventType,
  });

  return {
    mvpFeeCents: includedFees.platformFeeCents,
    stripeProcessingFeeCents: includedFees.processingFeeCents,
    stripeTaxServiceFeeCents: normalizedStripeTaxServiceFee,
    stripeFeeCents: includedFees.processingFeeCents + normalizedStripeTaxServiceFee,
    taxAmountCents: normalizedTaxAmount,
    totalChargeCents: normalizedEventAmount + normalizedTaxAmount,
    hostReceivesCents: includedFees.hostReceivesCents,
    mvpFeePercentage,
    paymentMethodType: normalizePaymentMethodFeeType(paymentMethodType),
  };
};
