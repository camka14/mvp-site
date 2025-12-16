'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Event, Field, Organization, Product, UserData } from '@/types';
import { fieldService } from './fieldService';
import { eventService } from './eventService';
import { buildPayload } from './utils';
import { userService } from './userService';
import { productService } from './productService';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ORGANIZATIONS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_TABLE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;
type AnyRow = Record<string, any> & { $id: string };

class OrganizationService {
  private resolveCoordinates(row: AnyRow): [number, number] | undefined {
    if (Array.isArray(row.coordinates) && row.coordinates.length >= 2) {
      const [lngRaw, latRaw] = row.coordinates;
      const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
      const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }

    const latRaw = row.lat ?? row.latitude;
    const lngRaw = row.long ?? row.longitude;
    const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }

    return undefined;
  }

  private mapRowToOrganization(row: AnyRow): Organization {
    const coordinates = this.resolveCoordinates(row);
    const fieldIds = Array.isArray(row.fieldIds)
      ? row.fieldIds.map((value: unknown) => String(value))
      : undefined;
    const refIds = Array.isArray(row.refIds)
      ? row.refIds.map((value: unknown) => String(value))
      : undefined;
    const productIds = Array.isArray(row.productIds)
      ? row.productIds.map((value: unknown) => String(value))
      : undefined;

    const organization: Organization = {
      $id: row.$id,
      name: row.name ?? '',
      description: row.description ?? undefined,
      website: row.website ?? undefined,
      logoId: row.logoId ?? row.logo_id ?? undefined,
      location: row.location ?? undefined,
      coordinates: coordinates,
      ownerId: row.ownerId ?? row.owner_id ?? undefined,
      hasStripeAccount: Boolean(row.hasStripeAccount),
      fieldIds,
      refIds,
      productIds,
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
      events: [],
      teams: [],
      fields: [],
      referees: [],
      products: [],
    };

    return organization;
  }

  async createOrganization(data: Partial<Organization> & { name: string; ownerId: string }): Promise<Organization> {
    const payload = buildPayload({
      ...data,
      hasStripeAccount: data.hasStripeAccount ?? false,
    });

    if (data.refIds !== undefined) {
      payload.refIds = Array.isArray(data.refIds) ? data.refIds : [];
    }

    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      rowId: ID.unique(),
      data: payload,
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const payload = buildPayload(data);
    if (data.refIds !== undefined) {
      payload.refIds = Array.isArray(data.refIds) ? data.refIds : [];
    }
    const response = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      rowId: id,
      data: payload,
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      queries: [Query.equal('ownerId', ownerId), Query.orderDesc('$createdAt'), Query.limit(100)],
    });
    return (response.rows as AnyRow[]).map((row) => this.mapRowToOrganization(row));
  }

  async getOrganizationsByIds(ids: string[]): Promise<Organization[]> {
    const organizationIds = ids.filter((id): id is string => typeof id === 'string' && Boolean(id));
    if (!organizationIds.length) return [];

    try {
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: ORGANIZATIONS_TABLE_ID,
        queries: [Query.contains('$id', organizationIds), Query.limit(organizationIds.length)],
      });
      const rows = Array.isArray(response.rows) ? (response.rows as AnyRow[]) : [];
      return rows.map((row) => this.mapRowToOrganization(row));
    } catch (error) {
      console.error('Failed to fetch organizations by ids:', error);
      return [];
    }
  }

  async getOrganizationById(id: string, includeRelations: boolean = true): Promise<Organization | undefined> {
    try {
      if (!includeRelations) {
        const response = await databases.getRow({
          databaseId: DATABASE_ID,
          tableId: ORGANIZATIONS_TABLE_ID,
          rowId: id,
        });
        return this.mapRowToOrganization(response as AnyRow) as Organization;
      } else {
        const response = await databases.getRow({
          databaseId: DATABASE_ID,
          tableId: ORGANIZATIONS_TABLE_ID,
          rowId: id,
        });
        const organization = this.mapRowToOrganization(response as AnyRow);
        return this.withRelations(organization);
      }
    } catch (e) {
      console.error('Failed to fetch organization:', e);
      return undefined;
    }
  }

  async listOrganizationsWithFields(limit: number = 100): Promise<Organization[]> {
    try {
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: ORGANIZATIONS_TABLE_ID,
        queries: [
          Query.limit(limit),
        ],
      });

      const rows = Array.isArray(response.rows) ? (response.rows as AnyRow[]) : [];
      const organizations = rows.map((row) => this.mapRowToOrganization(row));
      return Promise.all(organizations.map((org) => this.withRelations(org)));
    } catch (error) {
      console.error('Failed to list organizations with fields:', error);
      return [];
    }
  }

    private async withRelations(organization: Organization): Promise<Organization> {
      const fieldIds = Array.isArray(organization.fieldIds)
        ? organization.fieldIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];

      const fieldsPromise = fieldIds.length ? fieldService.listFields({ fieldIds }) : Promise.resolve<Field[]>([]);
      const refereeIds = Array.isArray(organization.refIds)
        ? organization.refIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const refereesPromise = refereeIds.length ? userService.getUsersByIds(refereeIds) : Promise.resolve<UserData[]>([]);

      const productIds = Array.isArray(organization.productIds)
        ? organization.productIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const productsPromise: Promise<Product[]> = productIds.length
        ? productService.listProducts(organization.$id)
        : Promise.resolve<Product[]>([]);

      const [fields, events, referees, products] = await Promise.all([
        fieldsPromise,
        this.fetchEventsByOrganization(organization.$id),
        refereesPromise,
        productsPromise,
      ]);

      organization.fields = fields;
      organization.events = events;
      organization.referees = referees;
      organization.products = products;
      organization.teams = organization.teams ?? [];

      return organization;
    }

  private async fetchEventsByOrganization(organizationId: string): Promise<Event[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      queries: [Query.equal('organizationId', organizationId), Query.limit(200)],
    });

    const rows = Array.isArray(response.rows) ? response.rows : [];
    const events = await Promise.all(
      rows.map((row: any) => eventService.mapRowFromDatabase(row, false)),
    );
    return events.filter((event): event is Event => Boolean(event));
  }
}

export const organizationService = new OrganizationService();
