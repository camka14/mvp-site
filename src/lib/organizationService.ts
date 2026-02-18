'use client';

import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import type { Event, Field, Organization, Product, Team, UserData } from '@/types';
import { fieldService } from './fieldService';
import { eventService } from './eventService';
import { buildPayload } from './utils';
import { userService } from './userService';
import { productService } from './productService';
import { teamService } from './teamService';

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
    const hostIds = Array.isArray(row.hostIds)
      ? row.hostIds.map((value: unknown) => String(value))
      : undefined;
    const productIds = Array.isArray(row.productIds)
      ? row.productIds.map((value: unknown) => String(value))
      : undefined;
    const teamIds = Array.isArray(row.teamIds)
      ? row.teamIds.map((value: unknown) => String(value))
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
      hostIds,
      hasStripeAccount: Boolean(row.hasStripeAccount),
      fieldIds,
      refIds,
      productIds,
      teamIds,
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
      events: [],
      teams: [],
      fields: [],
      referees: [],
      hosts: [],
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
    if (data.hostIds !== undefined) {
      payload.hostIds = Array.isArray(data.hostIds) ? data.hostIds : [];
    }
    if (data.teamIds !== undefined) {
      payload.teamIds = Array.isArray(data.teamIds) ? data.teamIds : [];
    }

    const response = await apiRequest<any>('/api/organizations', {
      method: 'POST',
      body: { ...payload, id: createId() },
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const payload = buildPayload(data);
    if (data.refIds !== undefined) {
      payload.refIds = Array.isArray(data.refIds) ? data.refIds : [];
    }
    if (data.hostIds !== undefined) {
      payload.hostIds = Array.isArray(data.hostIds) ? data.hostIds : [];
    }
    if (data.teamIds !== undefined) {
      payload.teamIds = Array.isArray(data.teamIds) ? data.teamIds : [];
    }
    const response = await apiRequest<any>(`/api/organizations/${id}`, {
      method: 'PATCH',
      body: { organization: payload },
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    const params = new URLSearchParams();
    params.set('ownerId', ownerId);
    params.set('limit', '100');
    const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
    return (response.organizations ?? []).map((row) => this.mapRowToOrganization(row));
  }

  async getOrganizationsByIds(ids: string[]): Promise<Organization[]> {
    const organizationIds = ids.filter((id): id is string => typeof id === 'string' && Boolean(id));
    if (!organizationIds.length) return [];

    try {
      const params = new URLSearchParams();
      params.set('ids', organizationIds.join(','));
      const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
      const rows = Array.isArray(response.organizations) ? (response.organizations as AnyRow[]) : [];
      return rows.map((row) => this.mapRowToOrganization(row));
    } catch (error) {
      console.error('Failed to fetch organizations by ids:', error);
      return [];
    }
  }

  async getOrganizationById(id: string, includeRelations: boolean = true): Promise<Organization | undefined> {
    try {
      const response = await apiRequest<any>(`/api/organizations/${id}`);
      const organization = this.mapRowToOrganization(response as AnyRow);
      if (!includeRelations) {
        return organization;
      }
      return this.withRelations(organization);
    } catch (e) {
      console.error('Failed to fetch organization:', e);
      return undefined;
    }
  }

  async listOrganizationsWithFields(limit: number = 100): Promise<Organization[]> {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
      const rows = Array.isArray(response.organizations) ? (response.organizations as AnyRow[]) : [];
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
      const hostIds = Array.isArray(organization.hostIds)
        ? organization.hostIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const hostsPromise = hostIds.length ? userService.getUsersByIds(hostIds) : Promise.resolve<UserData[]>([]);
      const ownerPromise = organization.ownerId
        ? userService.getUserById(organization.ownerId)
        : Promise.resolve(undefined);

      const productIds = Array.isArray(organization.productIds)
        ? organization.productIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const teamIds = Array.isArray(organization.teamIds)
        ? organization.teamIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const productsPromise: Promise<Product[]> = productIds.length
        ? productService.listProducts(organization.$id)
        : Promise.resolve<Product[]>([]);
      const teamsPromise: Promise<Team[]> = teamIds.length
        ? teamService.getTeamsByIds(teamIds, true)
        : Promise.resolve<Team[]>([]);

      const [fields, events, referees, hosts, owner, products, teams] = await Promise.all([
        fieldsPromise,
        this.fetchEventsByOrganization(organization.$id),
        refereesPromise,
        hostsPromise,
        ownerPromise,
        productsPromise,
        teamsPromise,
      ]);

      organization.fields = fields;
      organization.events = events;
      organization.referees = referees;
      organization.hosts = hosts;
      organization.owner = owner;
      organization.products = products;
      organization.teams = teams;

      return organization;
    }

  private async fetchEventsByOrganization(organizationId: string): Promise<Event[]> {
    const params = new URLSearchParams();
    params.set('organizationId', organizationId);
    params.set('limit', '200');
    const response = await apiRequest<{ events?: any[] }>(`/api/events?${params.toString()}`);
    const rows = Array.isArray(response.events) ? response.events : [];
    const events = await Promise.all(
      rows.map((row: any) => eventService.mapRowFromDatabase(row, false)),
    );
    return events.filter((event): event is Event => Boolean(event));
  }
}

export const organizationService = new OrganizationService();
