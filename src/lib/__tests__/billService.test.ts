import { apiRequest } from '@/lib/apiClient';
import { billService } from '@/lib/billService';

jest.mock('@/lib/apiClient', () => ({
  apiRequest: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

const canonicalBill = {
  id: 'bill_1',
  ownerType: 'USER',
  ownerId: 'user_1',
  totalAmountCents: 2500,
  paidAmountCents: 0,
  status: 'OPEN',
  lineItems: [],
};

describe('billService canonical API mapping', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('maps a canonical-only create response into the existing bill model', async () => {
    apiRequestMock.mockResolvedValue({ bill: canonicalBill });

    const bill = await billService.createBill({
      ownerType: 'USER',
      ownerId: 'user_1',
      totalAmountCents: 2500,
    });

    expect(bill).toEqual(expect.objectContaining({
      $id: 'bill_1',
      ownerId: 'user_1',
      totalAmountCents: 2500,
    }));
  });

  it('uses the canonical bill id when loading canonical-only payments', async () => {
    apiRequestMock
      .mockResolvedValueOnce({ bill: canonicalBill })
      .mockResolvedValueOnce({
        payments: [{
          id: 'payment_1',
          billId: 'bill_1',
          sequence: 1,
          amountCents: 2500,
          status: 'PENDING',
        }],
      });

    const bill = await billService.getBill('bill_1');

    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/api/billing/bills/bill_1/payments');
    expect(bill?.payments?.[0].$id).toBe('payment_1');
  });
});
