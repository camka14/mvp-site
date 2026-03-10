import { calculateMvpAndStripeFees } from '@/lib/billingFees';

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

  it('uses the league and tournament fee percentage when applicable', () => {
    expect(
      calculateMvpAndStripeFees({
        eventAmountCents: 1000,
        eventType: 'LEAGUE',
      }),
    ).toEqual({
      mvpFeeCents: 30,
      stripeFeeCents: 62,
      totalChargeCents: 1092,
      mvpFeePercentage: 0.03,
    });
  });
});
