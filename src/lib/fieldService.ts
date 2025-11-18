'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Field, Organization, TimeSlot } from '@/types';
import { eventService } from './eventService';
import { ensureLocalDateTimeString } from '@/lib/dateUtils';
import { organizationService } from './organizationService';
import { normalizeEnumValue } from '@/lib/enumUtils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;
const TIME_SLOTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID!;

export interface CreateFieldData {
  $id?: string;
  name: string;
  type?: string;
  location?: string;
  lat?: number;
  long?: number;
  fieldNumber: number;
  heading?: number;
  inUse?: boolean;
  organization?: Organization;
  eventId?: string;
}

export interface ManageRentalSlotResult {
  field: Field;
  slot: TimeSlot;
}

class FieldService {
  async createField(data: CreateFieldData): Promise<Field> {
    const rowId = data.$id ?? ID.unique();
    const normalizedType = normalizeEnumValue(data.type);

    const payload: Record<string, unknown> = {
      name: data.name,
      type: normalizedType ?? data.type,
      location: data.location,
      lat: data.lat,
      long: data.long,
      fieldNumber: data.fieldNumber,
      heading: data.heading,
      inUse: data.inUse,
      organizationId: data.organization?.$id
    };

    const response = await databases.upsertRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId,
      data: payload,
    });
    if (data.organization) {
      data.organization?.fieldIds?.push(rowId)
      organizationService.updateOrganization(data.organization.$id, data.organization)
    }

    const field = this.mapRowToField(response);
    return field;
  }

  async listFields(
    filter?: { fieldIds?: string[]; eventId?: string },
    range?: { start: string; end?: string | null }
  ): Promise<Field[]> {
    const normalizedFilter = filter ?? {};
    const rows: any[] = [];

    if (normalizedFilter.fieldIds?.length) {
      const chunks = this.chunkIds(normalizedFilter.fieldIds);
      for (const chunk of chunks) {
        const response = await databases.listRows({
          databaseId: DATABASE_ID,
          tableId: FIELDS_TABLE_ID,
          queries: [Query.equal('$id', chunk)],
        });
        rows.push(...(response.rows ?? []));
      }
    } else {
      const queries: string[] = [];

      if (normalizedFilter.eventId) {
        queries.push(Query.equal('eventId', normalizedFilter.eventId));
      }

      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: FIELDS_TABLE_ID,
        queries,
      });
      rows.push(...(response.rows ?? []));
    }

    const fields = rows.map((row: any) => this.mapRowToField(row));
    await this.hydrateFieldRentalSlots(fields);

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
    const heading = typeof row.heading === 'number' ? row.heading : Number(row.heading ?? NaN);
    const inUse = typeof row.inUse === 'boolean' ? row.inUse : row.inUse !== undefined ? Boolean(row.inUse) : undefined;
    const rentalSlotIds = Array.isArray(row.rentalSlotIds)
      ? row.rentalSlotIds.map((value: unknown) => String(value))
      : undefined;

    const normalizedType =
      normalizeEnumValue(row.type) ??
      (typeof row.type === 'string' ? row.type.toUpperCase() : undefined);

    const field: Field = {
      $id: String(row.$id ?? row.id ?? ''),
      name: row.name ?? '',
      location: row.location ?? '',
      lat: Number.isFinite(lat) ? lat : 0,
      long: Number.isFinite(long) ? long : 0,
      type: (normalizedType ?? 'UNKNOWN') as Field['type'],
      fieldNumber: Number.isFinite(fieldNumber) ? fieldNumber : 0,
      heading: Number.isFinite(heading) ? heading : undefined,
      inUse: inUse,
      divisions: Array.isArray(row.divisions) ? row.divisions : undefined,
      organization: row.organization ?? row.organizationId ?? undefined,
      rentalSlotIds,
      rentalSlots: [],
    } as Field;

    return field;
  }

  private coerceMinutes(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    return undefined;
  }

  private mapRowToTimeSlot(row: any): TimeSlot {
    const startMinutes = this.coerceMinutes(row.startTimeMinutes ?? row.startTime);
    const endMinutes = this.coerceMinutes(row.endTimeMinutes ?? row.endTime);
    const slot: TimeSlot = {
      $id: String(row.$id ?? row.id ?? ''),
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      repeating: row.repeating === undefined ? false : Boolean(row.repeating),
      scheduledFieldId: typeof row.scheduledFieldId === 'string' ? row.scheduledFieldId : row.fieldId ?? undefined,
      eventId: typeof row.eventId === 'string' ? row.eventId : undefined,
    };

    if (typeof startMinutes === 'number') {
      slot.startTimeMinutes = startMinutes;
    }

    if (typeof endMinutes === 'number') {
      slot.endTimeMinutes = endMinutes;
    }

    if (typeof row.price === 'number' && Number.isFinite(row.price)) {
      slot.price = row.price;
    }

    const normalizedStart = ensureLocalDateTimeString(row.startDate ?? row.start ?? null);
    if (normalizedStart) {
      slot.startDate = normalizedStart;
    }

    if (row.endDate === null) {
      slot.endDate = null;
    } else {
      const normalizedEnd = ensureLocalDateTimeString(row.endDate ?? row.end ?? null);
      if (normalizedEnd) {
        slot.endDate = normalizedEnd;
      }
    }

    return slot;
  }

  private chunkIds(ids: string[], size: number = 100): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += size) {
      chunks.push(ids.slice(i, i + size));
    }
    return chunks;
  }

  private async hydrateFieldRentalSlots(fields: Field[]): Promise<void> {
    if (!fields.length) {
      return;
    }

    const allIds = Array.from(new Set(fields.flatMap((field) => field.rentalSlotIds ?? [])));
    if (!allIds.length) {
      fields.forEach((field) => {
        if (!field.rentalSlots) {
          field.rentalSlots = [];
        }
      });
      return;
    }

    const slotRows = await this.fetchTimeSlotsByIds(allIds);
    const slotMap = new Map(slotRows.map((slot) => [slot.$id, slot]));

    fields.forEach((field) => {
      const ids = field.rentalSlotIds ?? [];
      field.rentalSlots = ids.map((id) => slotMap.get(id)).filter((slot): slot is TimeSlot => Boolean(slot));
    });
  }

  private async fetchTimeSlotsByIds(ids: string[]): Promise<TimeSlot[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) {
      return [];
    }

    const responses = await Promise.all(
      this.chunkIds(unique).map((batch) =>
        databases.listRows({
          databaseId: DATABASE_ID,
          tableId: TIME_SLOTS_TABLE_ID,
          queries: [Query.equal('$id', batch)],
        }),
      ),
    );

    return responses.flatMap((response) => (response.rows ?? []).map((row: any) => this.mapRowToTimeSlot(row)));
  }

  private serializeTimeSlotForUpsert(
    slot: Partial<TimeSlot> & { dayOfWeek: TimeSlot['dayOfWeek'] },
    options: { slotId?: string; fieldId: string }
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      dayOfWeek: slot.dayOfWeek,
      repeating: slot.repeating ?? false,
      scheduledFieldId: options.fieldId,
      startTimeMinutes: slot.startTimeMinutes ?? null,
      endTimeMinutes: slot.endTimeMinutes ?? null,
      startDate: slot.startDate ?? null,
      endDate: slot.endDate ?? null,
      price: slot.price ?? null,
    };

    if (options.slotId) {
      payload.$id = options.slotId;
    }

    return payload;
  }

  async createRentalSlot(
    field: Field,
    slotInput: Partial<TimeSlot> & { dayOfWeek: TimeSlot['dayOfWeek'] }
  ): Promise<ManageRentalSlotResult> {
    const slotId = ID.unique();
    const slotPayload = this.serializeTimeSlotForUpsert(slotInput, {
      slotId,
      fieldId: field.$id,
    });

    const slotResponse = await databases.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TIME_SLOTS_TABLE_ID,
      rowId: slotId,
      data: slotPayload,
    });

    const rentalSlotIds = Array.isArray(field.rentalSlotIds)
      ? Array.from(new Set([...field.rentalSlotIds, slotId]))
      : [slotId];

    await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: field.$id,
      data: {
        rentalSlotIds,
      },
    });

    const fieldRow = await databases.getRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: field.$id,
    });

    const updatedField = this.mapRowToField(fieldRow);
    await this.hydrateFieldRentalSlots([updatedField]);

    const createdSlot = this.mapRowToTimeSlot(slotResponse);

    return { field: updatedField, slot: createdSlot };
  }

  async updateRentalSlot(
    field: Field,
    slotInput: Partial<TimeSlot> & { $id: string; dayOfWeek: TimeSlot['dayOfWeek'] }
  ): Promise<ManageRentalSlotResult> {
    const slotId = slotInput.$id;
    if (!slotId) {
      throw new Error('Rental slot update requires an id');
    }

    const slotPayload = this.serializeTimeSlotForUpsert(slotInput, {
      slotId,
      fieldId: field.$id,
    });

    await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: TIME_SLOTS_TABLE_ID,
      rowId: slotId,
      data: slotPayload,
    });

    const fieldRow = await databases.getRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: field.$id,
    });

    const updatedField = this.mapRowToField(fieldRow);
    await this.hydrateFieldRentalSlots([updatedField]);

    const updatedSlot = (updatedField.rentalSlots || []).find((slot) => slot?.$id === slotId);
    if (!updatedSlot) {
      throw new Error('Failed to update rental slot');
    }

    return { field: updatedField, slot: updatedSlot };
  }
}

export const fieldService = new FieldService();
