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
    'uses the standard 1%% fee for %s registrations',
    (eventType) => {
      expect(
        calculateMvpAndStripeFees({
          eventAmountCents: 1000,
          eventType,
        }),
      ).toEqual({
        mvpFeeCents: 10,
        stripeFeeCents: 61,
        totalChargeCents: 1071,
        mvpFeePercentage: 0.01,
      });
    },
  );

  it('calculates a lower gross-up for ACH Direct Debit than cards', () => {
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
      mvpFeeCents: 100,
      stripeProcessingFeeCents: 333,
      totalChargeCents: 10433,
      paymentMethodType: 'card',
    }));
    expect(achFees).toEqual(expect.objectContaining({
      mvpFeeCents: 100,
      stripeProcessingFeeCents: 81,
      totalChargeCents: 10181,
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
