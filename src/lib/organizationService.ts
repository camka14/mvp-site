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
  private mapRowToEvent(row: AnyRow): Event {
    return {
      ...(row as any),
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: { lat: row.lat, lng: row.long },
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
    const organization: Organization = {
      ...(row as any),
    };

    if (Array.isArray(row.fields)) {
      organization.fields = row.fields
        .map((fieldRow: AnyRow) => this.mapRowToField(fieldRow))
        .filter((field): field is Field => Boolean(field));
    }

    return organization;
  }

  async createOrganization(data: Partial<Organization> & { name: string; ownerId: string }): Promise<Organization> {
    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      rowId: ID.unique(),
      data,
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      queries: [Query.equal('ownerId', ownerId), Query.orderDesc('$createdAt'), Query.limit(100)],
    });
    return (response.rows as AnyRow[]).map(this.mapRowToOrganization);
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
          queries: [Query.select(['fields.*', 'teams.*', 'events.*'])],
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
