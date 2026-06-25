import {
  calculateChargeAmountForPaymentMethod,
  calculateMvpAndStripeFees,
  calculateMvpAndStripeFeesWithTax,
} from '@/lib/billingFees';

describe('billingFees', () => {
  it('returns zero fees for a zero-dollar amount', () => {
    expect(
      calculateMvpAndStripeFees({
        eventAmountCents: 0,
        eventType: 'EVENT',
      }),
    ).toEqual({
      mvpFeeCents: 0,
      stripeFeeCents: 0,
      totalChargeCents: 0,
      mvpFeePercentage: 0.01,
    });
  });

  it.each(['EVENT', 'LEAGUE', 'TOURNAMENT'])(
    'allocates included fees inside the listed %s registration price',
    (eventType) => {
      expect(
        calculateMvpAndStripeFees({
          eventAmountCents: 1000,
          eventType,
        }),
      ).toEqual({
        mvpFeeCents: 9,
        stripeFeeCents: 59,
        totalChargeCents: 1000,
        mvpFeePercentage: 0.01,
      });
    },
  );

  it('keeps the listed price fixed while allocating included processing fees', () => {
    const cardFees = calculateMvpAndStripeFeesWithTax({
      eventAmountCents: 10000,
      eventType: 'EVENT',
      taxAmountCents: 0,
      stripeTaxServiceFeeCents: 0,
    });
    const achFees = calculateMvpAndStripeFeesWithTax({
      eventAmountCents: 10000,
      eventType: 'EVENT',
      paymentMethodType: 'us_bank_account',
      taxAmountCents: 0,
      stripeTaxServiceFeeCents: 0,
    });

    expect(cardFees).toEqual(expect.objectContaining({
      mvpFeeCents: 96,
      stripeProcessingFeeCents: 320,
      totalChargeCents: 10000,
      hostReceivesCents: 9584,
      paymentMethodType: 'card',
    }));
    expect(achFees).toEqual(expect.objectContaining({
      mvpFeeCents: 96,
      stripeProcessingFeeCents: 320,
      totalChargeCents: 10000,
      hostReceivesCents: 9584,
      paymentMethodType: 'us_bank_account',
    }));
  });

  it('caps percentage-only bank processing fees', () => {
    expect(
      calculateChargeAmountForPaymentMethod({
        goalAmountCents: 100000,
        paymentMethodType: 'customer_balance',
      }),
    ).toEqual({
      paymentMethodType: 'customer_balance',
      stripeProcessingFeeCents: 500,
      totalChargeCents: 100500,
    });
  });
});
