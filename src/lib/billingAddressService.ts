'use client';

import { apiRequest } from '@/lib/apiClient';
import type { BillingAddress, BillingAddressProfile } from '@/types';

type BillingAddressResponse = {
  billingAddress: BillingAddress | null;
  email?: string | null;
};

class BillingAddressService {
  async getBillingAddressProfile(): Promise<BillingAddressProfile> {
    const result = await apiRequest<BillingAddressResponse>('/api/profile/billing-address');
    return {
      billingAddress: result.billingAddress ?? null,
      email: result.email ?? null,
    };
  }

  async saveBillingAddress(billingAddress: BillingAddress): Promise<BillingAddressProfile> {
    const result = await apiRequest<BillingAddressResponse>('/api/profile/billing-address', {
      method: 'PATCH',
      body: { billingAddress },
    });
    return {
      billingAddress: result.billingAddress ?? null,
      email: result.email ?? null,
    };
  }
}

export const billingAddressService = new BillingAddressService();
