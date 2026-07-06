import { loadBillDiscountSummaries } from '@/server/billing/billDiscountSummaries';

describe('loadBillDiscountSummaries', () => {
  it('maps discount redemptions to bills by payment intent and registration id', async () => {
    const client = {
      discountCodeRedemptions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'redemption_1',
            discountId: 'discount_1',
            discountCodeId: 'code_1',
            code: 'SAVE40',
            paymentIntentId: 'pi_1',
            registrationId: 'registration_1',
            originalAmountCents: 10000,
            discountedAmountCents: 6000,
            createdAt: new Date('2026-07-01T00:00:00Z'),
          },
        ]),
      },
      discounts: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'discount_1', name: 'Host credit' },
        ]),
      },
    };

    const amounts = await loadBillDiscountSummaries(client, [
      {
        id: 'bill_1',
        totalAmountCents: 6000,
        sourceType: 'EVENT_REGISTRATION',
        sourceId: 'registration_1',
        payments: [{ paymentIntentId: 'pi_1' }],
      },
    ]);

    expect(amounts.get('bill_1')).toMatchObject({
      originalAmountCents: 10000,
      discountAmountCents: 4000,
      discountedAmountCents: 6000,
      discounts: [
        expect.objectContaining({
          code: 'SAVE40',
          name: 'Host credit',
          originalAmountCents: 10000,
          discountedAmountCents: 6000,
          discountAmountCents: 4000,
        }),
      ],
    });
  });

  it('returns no-discount defaults when discount tables are unavailable', async () => {
    const amounts = await loadBillDiscountSummaries({}, [
      { id: 'bill_1', totalAmountCents: 2500 },
    ]);

    expect(amounts.get('bill_1')).toEqual({
      discounts: [],
      originalAmountCents: 2500,
      discountAmountCents: 0,
      discountedAmountCents: 2500,
    });
  });
});
