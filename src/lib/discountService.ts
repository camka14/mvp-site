import { apiRequest } from '@/lib/apiClient';

export type DiscountOwnerType = 'USER' | 'ORGANIZATION';
export type DiscountTargetType = 'EVENT' | 'PRODUCT' | 'TEAM_REGISTRATION';
export type DiscountStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type DiscountCodeStatus = 'ACTIVE' | 'INACTIVE';

export type DiscountCode = {
  id: string;
  discountId: string;
  code: string;
  status: DiscountCodeStatus;
  usageLimit: number | null;
  usedCount: number;
  createdBy: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type Discount = {
  id: string;
  ownerType: DiscountOwnerType;
  ownerId: string;
  createdBy: string;
  updatedBy?: string | null;
  name: string;
  description?: string | null;
  status: DiscountStatus;
  targetType: DiscountTargetType;
  targetId: string;
  originalPriceCentsSnapshot: number;
  discountedPriceCents: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  codes?: DiscountCode[];
};

export type CreateDiscountInput = {
  ownerType: DiscountOwnerType;
  ownerId?: string;
  name: string;
  description?: string;
  targetType: DiscountTargetType;
  targetId: string;
  discountedPriceCents: number;
};

export type GenerateDiscountCodeInput = {
  code?: string;
  usageLimit?: number | null;
};

class DiscountService {
  async listDiscounts(input: {
    ownerType?: DiscountOwnerType;
    ownerId?: string;
  } = {}): Promise<Discount[]> {
    const params = new URLSearchParams();
    if (input.ownerType) {
      params.set('ownerType', input.ownerType);
    }
    if (input.ownerId) {
      params.set('ownerId', input.ownerId);
    }
    const query = params.toString();
    const result = await apiRequest<{ discounts?: Discount[]; error?: string }>(
      `/api/discounts${query ? `?${query}` : ''}`,
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    return result.discounts ?? [];
  }

  async createDiscount(input: CreateDiscountInput): Promise<Discount> {
    const result = await apiRequest<{ discount?: Discount; error?: string }>('/api/discounts', {
      method: 'POST',
      body: input,
    });
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.discount) {
      throw new Error('Discount was not returned.');
    }
    return result.discount;
  }

  async generateCode(discountId: string, input: GenerateDiscountCodeInput = {}): Promise<DiscountCode> {
    const result = await apiRequest<{ code?: DiscountCode; error?: string }>(
      `/api/discounts/${encodeURIComponent(discountId)}/codes`,
      {
        method: 'POST',
        body: input,
      },
    );
    if (result?.error) {
      throw new Error(result.error);
    }
    if (!result?.code) {
      throw new Error('Discount code was not returned.');
    }
    return result.code;
  }
}

export const discountService = new DiscountService();
