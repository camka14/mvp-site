'use client';

import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import type { Facility } from '@/types';

export interface CreateFacilityData {
  $id?: string;
  organizationId: string;
  name: string;
  location: string;
  address?: string | null;
  affiliateUrl?: string | null;
  coordinates?: Facility['coordinates'];
  operatingHours?: Facility['operatingHours'];
  timeZone?: string;
  isDefault?: boolean;
  sortOrder?: number | null;
}

export interface UpdateFacilityData {
  name?: string | null;
  location?: string;
  address?: string | null;
  affiliateUrl?: string | null;
  coordinates?: Facility['coordinates'];
  operatingHours?: Facility['operatingHours'];
  timeZone?: string | null;
  status?: string | null;
  isDefault?: boolean;
  sortOrder?: number | null;
}

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

class FacilityService {
  async createFacility(data: CreateFacilityData): Promise<Facility> {
    const response = await apiRequest<any>('/api/facilities', {
      method: 'POST',
      body: {
        id: data.$id ?? createId(),
        organizationId: data.organizationId,
        name: data.name,
        location: data.location,
        address: data.address ?? null,
        affiliateUrl: data.affiliateUrl ?? null,
        coordinates: data.coordinates ?? null,
        operatingHours: data.operatingHours ?? null,
        timeZone: data.timeZone,
        isDefault: data.isDefault,
        sortOrder: data.sortOrder,
      },
    });

    return this.mapRowToFacility(response);
  }

  async updateFacility(id: string, data: UpdateFacilityData): Promise<Facility> {
    const normalizedId = normalizeText(id);
    if (!normalizedId) {
      throw new Error('Facility update requires an id');
    }

    const response = await apiRequest<any>(`/api/facilities/${normalizedId}`, {
      method: 'PATCH',
      body: {
        facility: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.affiliateUrl !== undefined ? { affiliateUrl: data.affiliateUrl } : {}),
          ...(data.coordinates !== undefined ? { coordinates: data.coordinates } : {}),
          ...(data.operatingHours !== undefined ? { operatingHours: data.operatingHours } : {}),
          ...(data.timeZone !== undefined ? { timeZone: data.timeZone } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
      },
    });

    return this.mapRowToFacility(response);
  }

  async getFacilitiesByIds(ids: string[]): Promise<Facility[]> {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (!unique.length) {
      return [];
    }

    const responses = await Promise.all(
      this.chunkIds(unique).map((batch) => {
        const params = new URLSearchParams();
        params.set('ids', batch.join(','));
        return apiRequest<{ facilities?: any[] }>(`/api/facilities?${params.toString()}`);
      }),
    );

    return responses.flatMap((response) => (response.facilities ?? []).map((row) => this.mapRowToFacility(row)));
  }

  async listFacilitiesByOrganization(organizationId: string): Promise<Facility[]> {
    const normalizedOrganizationId = normalizeText(organizationId);
    if (!normalizedOrganizationId) {
      return [];
    }

    const params = new URLSearchParams();
    params.set('organizationId', normalizedOrganizationId);
    const response = await apiRequest<{ facilities?: any[] }>(`/api/facilities?${params.toString()}`);
    return (response.facilities ?? []).map((row) => this.mapRowToFacility(row));
  }

  mapRowToFacility(row: any): Facility {
    const sortOrder = typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder)
      ? row.sortOrder
      : null;

    return {
      $id: String(row.$id ?? row.id ?? ''),
      organizationId: String(row.organizationId ?? ''),
      name: row.name ?? '',
      location: row.location ?? '',
      address: row.address ?? null,
      affiliateUrl: typeof row.affiliateUrl === 'string' && row.affiliateUrl.trim().length > 0
        ? row.affiliateUrl
        : null,
      coordinates: row.coordinates ?? null,
      operatingHours: row.operatingHours ?? null,
      timeZone: row.timeZone ?? 'UTC',
      status: row.status ?? 'ACTIVE',
      isDefault: Boolean(row.isDefault),
      sortOrder,
      createdAt: row.createdAt ?? row.$createdAt ?? null,
      updatedAt: row.updatedAt ?? row.$updatedAt ?? null,
      $createdAt: typeof row.$createdAt === 'string' ? row.$createdAt : null,
      $updatedAt: typeof row.$updatedAt === 'string' ? row.$updatedAt : null,
    };
  }

  private chunkIds(ids: string[], size: number = 100): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += size) {
      chunks.push(ids.slice(i, i + size));
    }
    return chunks;
  }
}

export const facilityService = new FacilityService();
