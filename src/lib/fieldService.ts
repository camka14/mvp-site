'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Field } from '@/types';
import { eventService } from './eventService';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;


export interface CreateFieldData {
  name: string;
  type?: string;
  location?: string;
  lat?: number;
  long?: number;
  fieldNumber: number;
  organizationId?: string;
  eventId?: string;
}

class FieldService {
  async createField(data: CreateFieldData): Promise<Field> {
    const payload: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      location: data.location,
      lat: data.lat,
      long: data.long,
      fieldNumber: data.fieldNumber,
    };

    if (data.organizationId) {
      payload.organization = data.organizationId;
    }

    if (data.eventId) {
      payload.events = [data.eventId];
    }

    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: ID.unique(),
      data: payload,
      queries: [
        Query.select([
          '*',
          'organization.$id',
        ]),
      ],
    } as any);

    return this.mapRowToField(response);
  }

  async listFields(
    filter?: string | { organizationId?: string; eventId?: string },
    range?: { start: string; end?: string | null }
  ): Promise<Field[]> {
    const normalizedFilter = typeof filter === 'string' ? { organizationId: filter } : (filter ?? {});

    const queries = [
      Query.select([
        '*',
        'organization.$id',
      ]),
    ];

    if (normalizedFilter.organizationId) {
      queries.push(Query.equal('organization.$id', normalizedFilter.organizationId));
    }

    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      queries,
    });

    const fields = (response.rows || []).map((row: any) => this.mapRowToField(row));

    if (range?.start) {
      return Promise.all(fields.map((field) => this.getFieldEventsMatches(field, range)));
    }

    return fields;
  }

  async getFieldEventsMatches(
    field: Field,
    range: { start: string; end?: string | null }
  ): Promise<Field> {
    const start = range.start;
    const end = range.end ?? null;

    const [events, matches] = await Promise.all([
      eventService.getEventsForFieldInRange(field.$id, start, end),
      eventService.getMatchesForFieldInRange(field.$id, start, end),
    ]);

    return {
      ...field,
      events,
      matches,
    };
  }

  private mapRowToField(row: any): Field {
    const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat ?? 0);
    const long = typeof row.long === 'number' ? row.long : Number(row.long ?? 0);
    const fieldNumber = typeof row.fieldNumber === 'number' ? row.fieldNumber : Number(row.fieldNumber ?? 0);

    const organization = Array.isArray(row.organization)
      ? row.organization[0]
      : row.organization;

    return {
      $id: row.$id,
      name: row.name,
      location: row.location ?? '',
      lat: Number.isFinite(lat) ? lat : 0,
      long: Number.isFinite(long) ? long : 0,
      type: row.type ?? '',
      fieldNumber: Number.isFinite(fieldNumber) ? fieldNumber : 0,
      divisions: row.divisions,
      organization,
    } as Field;
  }
}

export const fieldService = new FieldService();
