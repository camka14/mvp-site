'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Field, TimeSlot } from '@/types';
import { eventService } from './eventService';
import { ensureLocalDateTimeString } from '@/lib/dateUtils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;

export interface CreateFieldData {
  $id?: string;
  name: string;
  type?: string;
  location?: string;
  lat?: number;
  long?: number;
  fieldNumber: number;
  organizationId?: string;
  eventId?: string;
}

export interface ManageRentalSlotResult {
  field: Field;
  slot: TimeSlot;
}

class FieldService {
  async createField(data: CreateFieldData): Promise<Field> {
    const rowId = data.$id ?? ID.unique();

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

    const response = await databases.upsertRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId,
      data: payload,
      queries: [
        Query.select([
          '*',
          'organization.$id',
          'rentalSlots.*',
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
        'rentalSlots.*',
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

    const mappedField: Field = {
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

    const rentalSlots = this.extractRentalSlots(row.rentalSlots);
    if (rentalSlots) {
      mappedField.rentalSlots = rentalSlots;
    }

    return mappedField;
  }

  private extractRentalSlots(value: unknown): TimeSlot[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const slots: TimeSlot[] = [];

    value.forEach((entry) => {
      if (!entry) return;

      if (typeof entry === 'object') {
        const slot = this.mapRowToTimeSlot(entry);
        slots.push(slot);
      }
    });

    return slots.length ? slots : undefined;
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
      $id: row.$id ?? row.id,
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      repeating: row.repeating === undefined ? false : Boolean(row.repeating),
      scheduledFieldId: row.scheduledFieldId ?? undefined,
    };

    if (slot.repeating && typeof startMinutes === 'number') {
      slot.startTimeMinutes = startMinutes;
    }

    if (slot.repeating && typeof endMinutes === 'number') {
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

  private serializeRentalSlotForMutation(
    slot: Partial<TimeSlot> & { dayOfWeek: TimeSlot['dayOfWeek']; repeating?: boolean },
    options: { includeId?: boolean; fieldId: string }
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      dayOfWeek: slot.dayOfWeek,
      repeating: Boolean(slot.repeating),
      scheduledFieldId: options.fieldId,
      startDate: slot.startDate ?? null,
      endDate: slot.endDate ?? null,
      startTimeMinutes: slot.startTimeMinutes ?? null,
      endTimeMinutes: slot.endTimeMinutes ?? null,
      price: slot.price ?? null,
    };

    if (options.includeId && slot.$id) {
      payload.$id = slot.$id;
    }

    return payload;
  }

  private extractSlotIds(field: Field): Set<string> {
    const ids = new Set<string>();
    (field.rentalSlots || []).forEach((slot) => {
      if (slot && typeof slot.$id === 'string') {
        ids.add(slot.$id);
      }
    });
    return ids;
  }

  private buildExistingSlotRefs(field: Field, excludeId?: string): (string | Record<string, unknown>)[] {
    const refs: (string | Record<string, unknown>)[] = [];
    (field.rentalSlots || []).forEach((slot) => {
      if (!slot || typeof slot.$id !== 'string') {
        return;
      }

      if (excludeId && slot.$id === excludeId) {
        return;
      }

      refs.push(slot.$id);
    });
    return refs;
  }

  async createRentalSlot(
    field: Field,
    slotInput: Partial<TimeSlot> & { dayOfWeek: TimeSlot['dayOfWeek'] }
  ): Promise<ManageRentalSlotResult> {
    const existingIds = this.extractSlotIds(field);
    const existingRefs = this.buildExistingSlotRefs(field);

    const newSlotPayload = this.serializeRentalSlotForMutation(slotInput, {
      fieldId: field.$id,
    });

    const fieldResponse = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: field.$id,
      data: {
        rentalSlots: [...existingRefs, newSlotPayload],
      },
      queries: [
        Query.select([
          '*',
          'organization.$id',
          'rentalSlots.*',
        ]),
      ],
    } as any);

    const updatedField = this.mapRowToField(fieldResponse as any);
    const createdSlot = (updatedField.rentalSlots || []).find((slot) => {
      const id = slot?.$id;
      return typeof id === 'string' && !existingIds.has(id);
    }) || (updatedField.rentalSlots || []).slice(-1)[0];

    if (!createdSlot) {
      throw new Error('Failed to create rental slot');
    }

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

    const serializedSlots: (string | Record<string, unknown>)[] = [];
    let found = false;

    (field.rentalSlots || []).forEach((slot) => {
      if (!slot || typeof slot.$id !== 'string') {
        return;
      }

      if (slot.$id === slotId) {
        serializedSlots.push(
          this.serializeRentalSlotForMutation(slotInput, {
            includeId: true,
            fieldId: field.$id,
          }),
        );
        found = true;
      } else {
        serializedSlots.push(slot.$id);
      }
    });

    if (!found) {
      throw new Error('Rental slot not found on field');
    }

    const fieldResponse = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: FIELDS_TABLE_ID,
      rowId: field.$id,
      data: {
        rentalSlots: serializedSlots,
      },
      queries: [
        Query.select([
          '*',
          'organization.$id',
          'rentalSlots.*',
        ]),
      ],
    } as any);

    const updatedField = this.mapRowToField(fieldResponse as any);
    const updatedSlot = (updatedField.rentalSlots || []).find((slot) => slot?.$id === slotId);

    if (!updatedSlot) {
      throw new Error('Failed to update rental slot');
    }

    return { field: updatedField, slot: updatedSlot };
  }
}

export const fieldService = new FieldService();
