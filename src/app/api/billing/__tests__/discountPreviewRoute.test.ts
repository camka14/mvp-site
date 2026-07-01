/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const resolvePurchaseContextMock = jest.fn();
const resolveDiscountApplicationMock = jest.fn();

class MockDiscountCodeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'DiscountCodeError';
    this.status = status;
  }
}

jest.mock('@/lib/permissions', () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock('@/lib/purchaseContext', () => ({
  resolvePurchaseContext: (...args: unknown[]) => resolvePurchaseContextMock(...args),
}));
jest.mock('@/server/discounts/discountCodeResolver', () => ({
  DiscountCodeError: MockDiscountCodeError,
  resolveDiscountApplication: (...args: unknown[]) => resolveDiscountApplicationMock(...args),
}));

import { POST } from '@/app/api/billing/discount-preview/route';

const jsonPost = (body: unknown) =>
  new NextRequest('http://localhost/api/billing/discount-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/billing/discount-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
    resolvePurchaseContextMock.mockResolvedValue({
      purchaseType: 'event',
      amountCents: 2500,
      product: null,
      team: null,
    });
    resolveDiscountApplicationMock.mockResolvedValue({
      amountCents: 1500,
      discount: {
        code: 'SAVE10',
        discountId: 'discount_1',
        discountCodeId: 'code_1',
        originalAmountCents: 2500,
        discountedAmountCents: 1500,
      },
    });
  });

  it('returns original, discount, and discounted amounts for an event code', async () => {
    const response = await POST(jsonPost({
      user: { id: 'user_1' },
      event: { id: 'event_1', price: 2500 },
      discountCode: ' save10 ',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(resolveDiscountApplicationMock).toHaveBeenCalledWith(expect.objectContaining({
      code: 'save10',
      purchaseType: 'event',
      targetId: 'event_1',
      originalAmountCents: 2500,
      buyerUserId: 'user_1',
    }));
    expect(payload).toEqual(expect.objectContaining({
      code: 'SAVE10',
      applied: true,
      originalAmountCents: 2500,
      discountAmountCents: 1000,
      discountedAmountCents: 1500,
      discountId: 'discount_1',
      discountCodeId: 'code_1',
    }));
  });

  it('returns the original amount when no code is supplied', async () => {
    const response = await POST(jsonPost({
      event: { id: 'event_1', price: 2500 },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(resolveDiscountApplicationMock).not.toHaveBeenCalled();
    expect(payload).toEqual(expect.objectContaining({
      code: null,
      applied: false,
      originalAmountCents: 2500,
      discountAmountCents: 0,
      discountedAmountCents: 2500,
    }));
  });
});
