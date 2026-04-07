export const DEFAULT_MVP_FEE_PERCENTAGE = 0.01;
export const LEAGUE_OR_TOURNAMENT_MVP_FEE_PERCENTAGE = 0.03;
export const STRIPE_FIXED_FEE_CENTS = 30;
export const STRIPE_PERCENT_FEE = 0.029;

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
  taxAmountCents,
  stripeTaxServiceFeeCents,
}: {
  eventAmountCents: number;
  eventType?: unknown;
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
    };
  }

  const mvpFeeCents = Math.round(normalizedEventAmount * mvpFeePercentage);
  const goalAmountCents = normalizedEventAmount
    + mvpFeeCents
    + normalizedTaxAmount
    + normalizedStripeTaxServiceFee;
  const totalChargeCents = calculateChargeAmount(goalAmountCents);
  const stripeProcessingFeeCents = Math.max(0, totalChargeCents - goalAmountCents);

  return {
    mvpFeeCents,
    stripeProcessingFeeCents,
    stripeTaxServiceFeeCents: normalizedStripeTaxServiceFee,
    stripeFeeCents: stripeProcessingFeeCents + normalizedStripeTaxServiceFee,
    taxAmountCents: normalizedTaxAmount,
    totalChargeCents,
    mvpFeePercentage,
  };
};
