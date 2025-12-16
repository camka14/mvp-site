'use client';

import { databases, functions } from '@/app/appwrite';
import { ExecutionMethod, Query } from 'appwrite';
import type { Product, ProductPeriod, Subscription, UserData } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PRODUCTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_PRODUCTS_TABLE_ID || 'products';
const SUBSCRIPTIONS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_SUBSCRIPTIONS_TABLE_ID || 'subscriptions';
const FUNCTION_ID = process.env.NEXT_PUBLIC_SERVER_FUNCTION_ID!;

const parseExecutionResponse = <T = unknown>(responseBody: string | null | undefined): T => {
  if (!responseBody) {
    return {} as T;
  }

  try {
    return JSON.parse(responseBody) as T;
  } catch (error) {
    throw new Error('Unable to parse Appwrite function response.');
  }
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
    const periodRaw: string =
      typeof row?.period === 'string' ? row.period.toLowerCase() : (row?.period as string) || 'monthly';

    return {
      $id: row?.$id ?? row?.id,
      organizationId: row?.organizationId ?? '',
      name: row?.name ?? 'Product',
      description: row?.description ?? row?.desc ?? undefined,
      priceCents,
      period: (periodRaw as ProductPeriod) || 'monthly',
      createdBy: row?.createdBy ?? row?.ownerId,
      isActive: row?.isActive ?? true,
      createdAt: row?.createdAt ?? row?.$createdAt,
    };
  }

  private mapSubscription(row: any): Subscription {
    const priceRaw = row?.priceCents ?? row?.price ?? 0;
    const priceCents = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0;
    const periodRaw: string =
      typeof row?.period === 'string' ? row.period.toLowerCase() : (row?.period as string) || 'monthly';
    const statusRaw = typeof row?.status === 'string' ? row.status.toUpperCase() : 'ACTIVE';

    return {
      $id: row?.$id ?? row?.id,
      productId: row?.productId ?? '',
      userId: row?.userId ?? '',
      organizationId: row?.organizationId ?? undefined,
      startDate: row?.startDate ?? row?.$createdAt ?? new Date().toISOString(),
      priceCents,
      period: (periodRaw as ProductPeriod) || 'monthly',
      status: statusRaw as Subscription['status'],
    };
  }

  async listProducts(organizationId: string): Promise<Product[]> {
    try {
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: PRODUCTS_TABLE_ID,
        queries: [Query.equal('organizationId', organizationId)],
      });
      const rows = Array.isArray(response.rows) ? response.rows : [];
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
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: PRODUCTS_TABLE_ID,
        queries: [Query.contains('$id', ids), Query.limit(ids.length)],
      });
      const rows = Array.isArray(response.rows) ? response.rows : [];
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: '/products',
        method: ExecutionMethod.POST,
        body: JSON.stringify(payload),
        async: false,
      });
      const result = parseExecutionResponse<Product & { error?: string }>(response.responseBody);
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: `/products/${input.productId}/subscriptions`,
        method: ExecutionMethod.POST,
        body: JSON.stringify(payload),
        async: false,
      });

      const result = parseExecutionResponse<Subscription & { error?: string }>(response.responseBody);
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: `/products/${productId}`,
        method: ExecutionMethod.PATCH,
        body: JSON.stringify({ product: updates }),
        async: false,
      });
      const result = parseExecutionResponse<Product & { error?: string }>(response.responseBody);
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: `/products/${productId}`,
        method: ExecutionMethod.DELETE,
        async: false,
      });
      const result = parseExecutionResponse<{ deleted?: boolean; error?: string }>(response.responseBody);
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: `/products/${subscriptionId}/subscriptions`,
        method: ExecutionMethod.DELETE,
        async: false,
      });
      const result = parseExecutionResponse<{ cancelled?: boolean; error?: string }>(response.responseBody);
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
      const response = await functions.createExecution({
        functionId: FUNCTION_ID,
        xpath: `/products/${subscriptionId}/subscriptions`,
        method: ExecutionMethod.PATCH,
        async: false,
      });
      const result = parseExecutionResponse<{ restarted?: boolean; error?: string }>(response.responseBody);
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
