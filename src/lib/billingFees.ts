export const DEFAULT_MVP_FEE_PERCENTAGE = 0.01;
export const LEAGUE_OR_TOURNAMENT_MVP_FEE_PERCENTAGE = 0.03;
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

const normalizeEventType = (eventType: unknown): string => {
  if (typeof eventType !== 'string') {
    return '';
  }
  return eventType.trim().toUpperCase();
};

export const resolveMvpFeePercentage = (eventType: unknown): number => {
  const normalized = normalizeEventType(eventType);
  if (normalized === 'LEAGUE' || normalized === 'TOURNAMENT') {
    return LEAGUE_OR_TOURNAMENT_MVP_FEE_PERCENTAGE;
  }
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
  const normalizedEventAmount = Number.isFinite(Number(eventAmountCents))
    ? Math.max(0, Math.round(Number(eventAmountCents)))
    : 0;
  if (normalizedEventAmount === 0) {
    return {
      mvpFeeCents: 0,
      stripeFeeCents: 0,
      totalChargeCents: 0,
      mvpFeePercentage: resolveMvpFeePercentage(eventType),
    };
  }
  const mvpFeePercentage = resolveMvpFeePercentage(eventType);
  const mvpFeeCents = Math.round(normalizedEventAmount * mvpFeePercentage);
  const totalChargeCents = calculateChargeAmount(normalizedEventAmount + mvpFeeCents);
  const stripeFeeCents = Math.max(0, totalChargeCents - normalizedEventAmount - mvpFeeCents);

  return {
    mvpFeeCents,
    stripeFeeCents,
    totalChargeCents,
    mvpFeePercentage,
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
  mvpFeePercentage: number;
  paymentMethodType: PaymentMethodFeeType;
} => {
  const normalizedEventAmount = Number.isFinite(Number(eventAmountCents))
    ? Math.max(0, Math.round(Number(eventAmountCents)))
    : 0;
  const normalizedTaxAmount = Number.isFinite(Number(taxAmountCents))
    ? Math.max(0, Math.round(Number(taxAmountCents)))
    : 0;
  const normalizedStripeTaxServiceFee = Number.isFinite(Number(stripeTaxServiceFeeCents))
    ? Math.max(0, Math.round(Number(stripeTaxServiceFeeCents)))
    : 0;
  const mvpFeePercentage = resolveMvpFeePercentage(eventType);

  if (normalizedEventAmount === 0) {
    return {
      mvpFeeCents: 0,
      stripeProcessingFeeCents: 0,
      stripeTaxServiceFeeCents: normalizedStripeTaxServiceFee,
      stripeFeeCents: normalizedStripeTaxServiceFee,
      taxAmountCents: normalizedTaxAmount,
      totalChargeCents: normalizedTaxAmount + normalizedStripeTaxServiceFee,
      mvpFeePercentage,
      paymentMethodType: normalizePaymentMethodFeeType(paymentMethodType),
    };
  }

  const mvpFeeCents = Math.round(normalizedEventAmount * mvpFeePercentage);
  const goalAmountCents = normalizedEventAmount
    + mvpFeeCents
    + normalizedTaxAmount
    + normalizedStripeTaxServiceFee;
  const paymentMethodFees = calculateChargeAmountForPaymentMethod({
    goalAmountCents,
    paymentMethodType,
  });
  const { totalChargeCents, stripeProcessingFeeCents } = paymentMethodFees;

  return {
    mvpFeeCents,
    stripeProcessingFeeCents,
    stripeTaxServiceFeeCents: normalizedStripeTaxServiceFee,
    stripeFeeCents: stripeProcessingFeeCents + normalizedStripeTaxServiceFee,
    taxAmountCents: normalizedTaxAmount,
    totalChargeCents,
    mvpFeePercentage,
    paymentMethodType: paymentMethodFees.paymentMethodType,
  };
};
