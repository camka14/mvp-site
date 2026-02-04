'use client';

import { apiRequest } from '@/lib/apiClient';
import type { Product, ProductPeriod, Subscription, UserData } from '@/types';


const normalizeProductPeriod = (value: unknown): ProductPeriod => {
  if (typeof value !== 'string') {
    return 'month';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'monthly') return 'month';
  if (normalized === 'weekly') return 'week';
  if (normalized === 'yearly') return 'year';
  if (normalized === 'week' || normalized === 'month' || normalized === 'year') {
    return normalized as ProductPeriod;
  }
  return 'month';
};

type CreateProductInput = {
  user: UserData;
  organizationId: string;
  name: string;
  priceCents: number;
  period: ProductPeriod;
  description?: string;
};

type CreateSubscriptionInput = {
  productId: string;
  user: UserData;
  startDate?: string;
  priceCents?: number;
  organizationId?: string;
};

type UpdateProductInput = {
  name?: string;
  description?: string;
  priceCents?: number;
  period?: ProductPeriod;
  isActive?: boolean;
};

class ProductService {
  private mapProduct(row: any): Product {
    const priceRaw = row?.priceCents ?? row?.price ?? 0;
    const priceCents = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0;
    const period = normalizeProductPeriod(row?.period);

    return {
      $id: row?.$id ?? row?.id,
      organizationId: row?.organizationId ?? '',
      name: row?.name ?? 'Product',
      description: row?.description ?? row?.desc ?? undefined,
      priceCents,
      period,
      createdBy: row?.createdBy ?? row?.ownerId,
      isActive: row?.isActive ?? true,
      $createdAt: row?.$createdAt,
    };
  }

  private mapSubscription(row: any): Subscription {
    const priceRaw = row?.priceCents ?? row?.price ?? 0;
    const priceCents = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0;
    const period = normalizeProductPeriod(row?.period);
    const statusRaw = typeof row?.status === 'string' ? row.status.toUpperCase() : 'ACTIVE';

    return {
      $id: row?.$id ?? row?.id,
      productId: row?.productId ?? '',
      userId: row?.userId ?? '',
      organizationId: row?.organizationId ?? undefined,
      startDate: row?.startDate ?? row?.$createdAt ?? new Date().toISOString(),
      priceCents,
      period,
      status: statusRaw as Subscription['status'],
    };
  }

  async listProducts(organizationId: string): Promise<Product[]> {
    try {
      const params = new URLSearchParams();
      params.set('organizationId', organizationId);
      const response = await apiRequest<{ products?: any[] }>(`/api/products?${params.toString()}`);
      const rows = Array.isArray(response.products) ? response.products : [];
      return rows.map((row: any) => this.mapProduct(row));
    } catch (error) {
      console.error('Failed to list products:', error);
      return [];
    }
  }

  async getProductsByIds(productIds: string[]): Promise<Product[]> {
    const ids = productIds.filter((id): id is string => typeof id === 'string' && Boolean(id));
    if (!ids.length) return [];

    try {
      const params = new URLSearchParams();
      params.set('ids', ids.join(','));
      const response = await apiRequest<{ products?: any[] }>(`/api/products?${params.toString()}`);
      const rows = Array.isArray(response.products) ? response.products : [];
      return rows.map((row: any) => this.mapProduct(row));
    } catch (error) {
      console.error('Failed to fetch products by ids:', error);
      return [];
    }
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    const payload = {
      user: input.user,
      organizationId: input.organizationId,
      organization: { $id: input.organizationId },
      product: {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        period: input.period,
      },
    };

    try {
      const result = await apiRequest<Product & { error?: string }>('/api/products', {
        method: 'POST',
        body: payload,
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }
      return this.mapProduct(result);
    } catch (error) {
      console.error('Failed to create product:', error);
      throw error;
    }
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const payload = {
      user: input.user,
      startDate: input.startDate ?? new Date().toISOString(),
      priceCents: input.priceCents,
      organizationId: input.organizationId,
    };

    try {
      const result = await apiRequest<Subscription & { error?: string }>(`/api/products/${input.productId}/subscriptions`, {
        method: 'POST',
        body: payload,
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }

      return this.mapSubscription(result);
    } catch (error) {
      console.error('Failed to create subscription:', error);
      throw error;
    }
  }

  async updateProduct(productId: string, updates: UpdateProductInput): Promise<Product> {
    try {
      const result = await apiRequest<Product & { error?: string }>(`/api/products/${productId}`, {
        method: 'PATCH',
        body: { product: updates },
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }
      return this.mapProduct(result);
    } catch (error) {
      console.error('Failed to update product:', error);
      throw error;
    }
  }

  async deleteProduct(productId: string): Promise<boolean> {
    try {
      const result = await apiRequest<{ deleted?: boolean; error?: string }>(`/api/products/${productId}`, {
        method: 'DELETE',
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }
      return Boolean(result?.deleted);
    } catch (error) {
      console.error('Failed to delete product:', error);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const result = await apiRequest<{ cancelled?: boolean; error?: string }>(`/api/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }
      return Boolean((result as any).cancelled);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  async restartSubscription(subscriptionId: string): Promise<boolean> {
    try {
      const result = await apiRequest<{ restarted?: boolean; error?: string }>(`/api/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
      });
      if (result && (result as any).error) {
        throw new Error((result as any).error as string);
      }
      return Boolean((result as any).restarted);
    } catch (error) {
      console.error('Failed to restart subscription:', error);
      throw error;
    }
  }
}

export const productService = new ProductService();
