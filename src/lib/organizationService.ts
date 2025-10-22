'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Event, Field, Organization, Team, TimeSlot } from '@/types';
import { getCategoryFromEvent } from '@/types';
import { ensureLocalDateTimeString } from '@/lib/dateUtils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ORGANIZATIONS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_TABLE_ID!;
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

  private buildOrganizationPayload(data: Partial<Organization> & { ownerId?: string }) {
    const payload: Record<string, any> = {};

    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.website !== undefined) payload.website = data.website;
    if (data.location !== undefined) payload.location = data.location;
    if (data.logoId !== undefined) payload.logoId = data.logoId;
    if (data.ownerId !== undefined) payload.ownerId = data.ownerId;
    if (data.hasStripeAccount !== undefined) payload.hasStripeAccount = data.hasStripeAccount;

    if ('coordinates' in data) {
      if (Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
        payload.coordinates = [
          Number(data.coordinates[0]),
          Number(data.coordinates[1]),
        ];
      } else {
        payload.coordinates = null;
      }
    }

    return payload;
  }

  private mapRowToEvent(row: AnyRow): Event {
    const resolvedCoordinates =
      this.resolveCoordinates(row) ??
      (Array.isArray(row.coordinates) && row.coordinates.length >= 2
        ? [
            Number(row.coordinates[0]),
            Number(row.coordinates[1]),
          ] as [number, number]
        : undefined);

    return {
      ...(row as any),
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: resolvedCoordinates ?? [0, 0],
      category: getCategoryFromEvent({ sport: row.sport } as Event),
    } as Event;
  }

  private mapRowToTeam(row: AnyRow): Team {
    const currentSize = (row.playerIds || []).length;
    const maxPlayers = row.teamSize;
    return {
      ...(row as any),
      profileImageId: row.profileImage || row.profileImageId || row.profileImageID,
      currentSize,
      isFull: currentSize >= maxPlayers,
      winRate: Math.round(((row.wins || 0) / Math.max(1, (row.wins || 0) + (row.losses || 0))) * 100),
      avatarUrl: '',
    } as Team;
  }

  private mapRowToField(row: AnyRow): Field {
    const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat ?? 0);
    const long = typeof row.long === 'number' ? row.long : Number(row.long ?? 0);
    const fieldNumber = typeof row.fieldNumber === 'number' ? row.fieldNumber : Number(row.fieldNumber ?? 0);

    const field: Field = {
      $id: row.$id,
      name: row.name ?? '',
      location: row.location ?? '',
      lat: Number.isFinite(lat) ? lat : 0,
      long: Number.isFinite(long) ? long : 0,
      type: row.type ?? '',
      fieldNumber: Number.isFinite(fieldNumber) ? fieldNumber : 0,
      divisions: row.divisions,
      organization: row.organization,
    } as Field;

    if (Array.isArray(row.rentalSlots) && row.rentalSlots.length) {
      field.rentalSlots = row.rentalSlots
        .map((slot: AnyRow) => this.mapRowToTimeSlot(slot))
        .filter((slot): slot is TimeSlot => Boolean(slot));
    }

    return field;
  }

  private mapRowToTimeSlot(row: AnyRow): TimeSlot | null {
    if (!row) {
      return null;
    }

    const dayOfWeek = Number(row.dayOfWeek ?? 0);

    const startDate = ensureLocalDateTimeString(row.startDate ?? row.start ?? null);
    const endDate =
      row.endDate === null
        ? null
        : ensureLocalDateTimeString(row.endDate ?? row.end ?? null) ?? undefined;

    const slot: TimeSlot = {
      $id: row.$id ?? row.id ?? '',
      dayOfWeek: Number.isNaN(dayOfWeek) ? 0 : (dayOfWeek % 7) as TimeSlot['dayOfWeek'],
      repeating: row.repeating === undefined ? false : Boolean(row.repeating),
      startDate: startDate ?? undefined,
      endDate,
      startTimeMinutes:
        typeof row.startTimeMinutes === 'number' ? row.startTimeMinutes : undefined,
      endTimeMinutes:
        typeof row.endTimeMinutes === 'number' ? row.endTimeMinutes : undefined,
      price: typeof row.price === 'number' ? row.price : undefined,
    };

    return slot;
  }

  private mapRowToOrganization(row: AnyRow): Organization {
    const coordinates = this.resolveCoordinates(row);

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
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
    };

    if (Array.isArray(row.events)) {
      organization.events = row.events
        .map((eventRow: AnyRow) => this.mapRowToEvent(eventRow))
        .filter((event): event is Event => Boolean(event));
    }

    if (Array.isArray(row.fields)) {
      organization.fields = row.fields
        .map((fieldRow: AnyRow) => this.mapRowToField(fieldRow))
        .filter((field): field is Field => Boolean(field));
    }

    if (Array.isArray(row.teams)) {
      organization.teams = row.teams
        .map((teamRow: AnyRow) => this.mapRowToTeam(teamRow))
        .filter((team): team is Team => Boolean(team));
    }

    return organization;
  }

  async createOrganization(data: Partial<Organization> & { name: string; ownerId: string }): Promise<Organization> {
    const payload = this.buildOrganizationPayload({
      ...data,
      hasStripeAccount: data.hasStripeAccount ?? false,
    });

    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      rowId: ID.unique(),
      data: payload,
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const payload = this.buildOrganizationPayload(data);
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
          queries: [Query.select(['fields.*', "fields.rentalSlots.*", 'teams.*', 'events.*'])],
        });
      return this.mapRowToOrganization(response as AnyRow) as Organization;
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
          Query.select(['*', 'fields.*', 'fields.rentalSlots.*']),
          Query.limit(limit),
        ],
      });

      const rows = Array.isArray(response.rows) ? (response.rows as AnyRow[]) : [];
      return rows.map((row) => this.mapRowToOrganization(row));
    } catch (error) {
      console.error('Failed to list organizations with fields:', error);
      return [];
    }
  }
}

export const organizationService = new OrganizationService();
