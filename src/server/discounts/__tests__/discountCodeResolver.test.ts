var mockPrisma: any;

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma = {
    discountCodes: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    discounts: {
      findUnique: jest.fn(),
    },
    discountCodeRedemptions: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import {
  DiscountCodeError,
  normalizeDiscountCode,
  normalizeDiscountedPriceCents,
  recordDiscountCodeRedemption,
  resolveDiscountApplication,
} from '@/server/discounts/discountCodeResolver';

describe('discountCodeResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma));
  });

  it('normalizes buyer-entered codes', () => {
    expect(normalizeDiscountCode(' summer25 ')).toBe('SUMMER25');
    expect(normalizeDiscountCode('')).toBeNull();
    expect(normalizeDiscountCode(null)).toBeNull();
  });

  it('returns the original amount when no code is supplied', async () => {
    await expect(resolveDiscountApplication({
      code: '',
      purchaseType: 'event',
      targetId: 'event_1',
      originalAmountCents: 2500,
    })).resolves.toEqual({
      amountCents: 2500,
      discount: null,
    });
    expect(mockPrisma.discountCodes.findUnique).not.toHaveBeenCalled();
  });

  it('applies an active code to the matching item', async () => {
    mockPrisma.discountCodes.findUnique.mockResolvedValue({
      id: 'code_1',
      discountId: 'discount_1',
      code: 'SUMMER25',
      status: 'ACTIVE',
      usageLimit: 10,
      usedCount: 3,
    });
    mockPrisma.discounts.findUnique.mockResolvedValue({
      id: 'discount_1',
      status: 'ACTIVE',
      targetType: 'EVENT',
      targetId: 'event_1',
      discountedPriceCents: 1500,
    });

    await expect(resolveDiscountApplication({
      code: 'summer25',
      purchaseType: 'event',
      targetId: 'event_1',
      originalAmountCents: 2500,
    })).resolves.toEqual({
      amountCents: 1500,
      discount: {
        code: 'SUMMER25',
        discountId: 'discount_1',
        discountCodeId: 'code_1',
        originalAmountCents: 2500,
        discountedAmountCents: 1500,
      },
    });
  });

  it('allows unlimited codes when usageLimit is null', async () => {
    mockPrisma.discountCodes.findUnique.mockResolvedValue({
      id: 'code_1',
      discountId: 'discount_1',
      code: 'OPEN',
      status: 'ACTIVE',
      usageLimit: null,
      usedCount: 100,
    });
    mockPrisma.discounts.findUnique.mockResolvedValue({
      id: 'discount_1',
      status: 'ACTIVE',
      targetType: 'PRODUCT',
      targetId: 'product_1',
      discountedPriceCents: 500,
    });

    await expect(resolveDiscountApplication({
      code: 'OPEN',
      purchaseType: 'product',
      targetId: 'product_1',
      originalAmountCents: 1000,
    })).resolves.toMatchObject({ amountCents: 500 });
  });

  it('rejects an exhausted limited-use code', async () => {
    mockPrisma.discountCodes.findUnique.mockResolvedValue({
      id: 'code_1',
      discountId: 'discount_1',
      code: 'USEDUP',
      status: 'ACTIVE',
      usageLimit: 2,
      usedCount: 2,
    });

    await expect(resolveDiscountApplication({
      code: 'USEDUP',
      purchaseType: 'team_registration',
      targetId: 'team_1',
      originalAmountCents: 1000,
    })).rejects.toMatchObject({
      name: 'DiscountCodeError',
      status: 409,
      message: 'Discount code has reached its usage limit.',
    });
    expect(mockPrisma.discounts.findUnique).not.toHaveBeenCalled();
  });

  it('rejects codes for a different target item', async () => {
    mockPrisma.discountCodes.findUnique.mockResolvedValue({
      id: 'code_1',
      discountId: 'discount_1',
      code: 'OTHER',
      status: 'ACTIVE',
      usageLimit: null,
      usedCount: 0,
    });
    mockPrisma.discounts.findUnique.mockResolvedValue({
      id: 'discount_1',
      status: 'ACTIVE',
      targetType: 'EVENT',
      targetId: 'event_2',
      discountedPriceCents: 100,
    });

    await expect(resolveDiscountApplication({
      code: 'OTHER',
      purchaseType: 'event',
      targetId: 'event_1',
      originalAmountCents: 1000,
    })).rejects.toBeInstanceOf(DiscountCodeError);
  });

  it('clamps unsafe stored discount prices to the current item price range', () => {
    expect(normalizeDiscountedPriceCents({
      originalAmountCents: 1000,
      discountedPriceCents: -500,
    })).toBe(0);
    expect(normalizeDiscountedPriceCents({
      originalAmountCents: 1000,
      discountedPriceCents: 1500,
    })).toBe(1000);
  });

  it('records a redemption once and increments usage', async () => {
    mockPrisma.discountCodeRedemptions.findFirst.mockResolvedValue(null);
    mockPrisma.discountCodeRedemptions.create.mockResolvedValue({ id: 'redemption_1' });
    mockPrisma.discountCodes.update.mockResolvedValue({ id: 'code_1', usedCount: 1 });

    await expect(recordDiscountCodeRedemption({
      discount: {
        code: 'SUMMER25',
        discountId: 'discount_1',
        discountCodeId: 'code_1',
        originalAmountCents: 2500,
        discountedAmountCents: 1500,
      },
      purchaseType: 'event',
      targetId: 'event_1',
      userId: 'user_1',
      paymentIntentId: 'pi_1',
      registrationId: 'registration_1',
      organizationId: 'org_1',
    })).resolves.toEqual({ recorded: true });

    expect(mockPrisma.discountCodeRedemptions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        discountId: 'discount_1',
        discountCodeId: 'code_1',
        code: 'SUMMER25',
        purchaseType: 'EVENT',
        purchaseTargetId: 'event_1',
        paymentIntentId: 'pi_1',
        registrationId: 'registration_1',
        originalAmountCents: 2500,
        discountedAmountCents: 1500,
      }),
    }));
    expect(mockPrisma.discountCodes.update).toHaveBeenCalledWith({
      where: { id: 'code_1' },
      data: { usedCount: { increment: 1 } },
    });
  });

  it('does not double-count an existing redemption', async () => {
    mockPrisma.discountCodeRedemptions.findFirst.mockResolvedValue({ id: 'redemption_1' });

    await expect(recordDiscountCodeRedemption({
      discount: {
        code: 'SUMMER25',
        discountId: 'discount_1',
        discountCodeId: 'code_1',
        originalAmountCents: 2500,
        discountedAmountCents: 1500,
      },
      purchaseType: 'event',
      targetId: 'event_1',
      paymentIntentId: 'pi_1',
    })).resolves.toEqual({ recorded: false });

    expect(mockPrisma.discountCodeRedemptions.create).not.toHaveBeenCalled();
    expect(mockPrisma.discountCodes.update).not.toHaveBeenCalled();
  });
});
