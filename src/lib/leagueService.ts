import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import {
  TimeSlot,
  Match,
  Event,
  Field,
  FieldSurfaceType,
} from '@/types';
import { eventService } from './eventService';


export interface WeeklySlotConflict {
  schedule: TimeSlot;
  event: Event;
}

export interface LeagueScheduleResponse {
  preview?: boolean;
  event?: Event;
}

export interface LeagueFieldTemplateInput {
  key: string;
  name: string;
  fieldNumber: number;
  fieldType?: FieldSurfaceType;
}

export interface LeagueSlotCreationInput {
  fieldKey?: string;
  field?: Field;
  dayOfWeek: TimeSlot['dayOfWeek'];
  startTimeMinutes: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string | null;
  repeating?: boolean;
}

export interface CreateLeagueDraftOptions {
  eventData: Partial<Event> & { lat?: number; long?: number };
  fieldTemplates?: LeagueFieldTemplateInput[];
  slots: LeagueSlotCreationInput[];
}

export interface CreateLeagueDraftResult {
  event: Event;
  fieldIdMap: Record<string, string>;
}

class LeagueService {
  async createWeeklySchedules(eventId: string, slots: TimeSlot[]): Promise<TimeSlot[]> {
    if (!slots.length) {
      return [];
    }

    const created = await Promise.all(slots.map(async (slot) => {
      const startTime = this.normalizeTime(slot.startTimeMinutes);
      if (typeof startTime !== 'number') {
        throw new Error('TimeSlot requires a start time');
      }
      const endTime = this.normalizeTime(slot.endTimeMinutes);
      if (typeof endTime !== 'number') {
        throw new Error('TimeSlot requires an end time');
      }
      const fieldId = this.extractId(slot.scheduledFieldId);
      if (!fieldId) {
        throw new Error('TimeSlot requires a related field');
      }
      const data: Record<string, unknown> = {
        eventId,
        scheduledFieldId: fieldId,
        dayOfWeek: slot.dayOfWeek,
        startTimeMinutes: startTime,
        endTimeMinutes: endTime,
        repeating: typeof slot.repeating === 'boolean' ? slot.repeating : true,
      };

      if (slot.startDate) {
        data.startDate = slot.startDate;
      }
      if (slot.endDate !== undefined) {
        data.endDate = slot.endDate;
      }

      const response = await apiRequest<any>('/api/time-slots', {
        method: 'POST',
        body: {
          id: createId(),
          ...data,
        },
      });

      return this.mapRowToTimeSlot(response as any);
    }));

    await this.appendTimeSlotsToEvent(eventId, created.map((slot) => slot.$id));

    return created;
  }

  async deleteWeeklySchedulesForEvent(eventId: string): Promise<void> {
    const schedules = await this.listWeeklySchedulesByEvent(eventId);

    await Promise.all(
      schedules.map((schedule) =>
        apiRequest(`/api/time-slots/${schedule.$id}`, { method: 'DELETE' })
      )
    );

    await this.removeTimeSlotsFromEvent(eventId, schedules.map((schedule) => schedule.$id));
  }

  async listWeeklySchedulesByEvent(eventId: string): Promise<TimeSlot[]> {
    const event = await eventService.getEventWithRelations(eventId);
    return event?.timeSlots ?? [];
  }

  async listTimeSlotsByField(fieldId: string, dayOfWeek?: number): Promise<TimeSlot[]> {
    const params = new URLSearchParams();
    params.set('fieldId', fieldId);
    if (typeof dayOfWeek === 'number') {
      params.set('dayOfWeek', String(dayOfWeek));
    }

    const response = await apiRequest<{ timeSlots?: any[] }>(`/api/time-slots?${params.toString()}`);

    return (response.timeSlots ?? []).map((row: any) => this.mapRowToTimeSlot(row));
  }

  async listMatchesByEvent(eventId: string): Promise<Match[]> {
    const event = await eventService.getEventWithRelations(eventId);
    return (event?.matches ?? []).sort((a, b) => a.start.localeCompare(b.start));
  }

  async deleteMatchesByEvent(eventId: string): Promise<void> {
    await apiRequest(`/api/events/${eventId}/matches`, { method: 'DELETE' });
  }

  private async appendTimeSlotsToEvent(eventId: string, slotIds: string[]): Promise<void> {
    if (!slotIds.length) {
      return;
    }

    try {
      const eventRow = await apiRequest<any>(`/api/events/${eventId}`);
      const existing = Array.isArray(eventRow.timeSlotIds) ? eventRow.timeSlotIds : [];
      const next = Array.from(new Set([...existing, ...slotIds]));
      await apiRequest(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: { event: { timeSlotIds: next } },
      });
    } catch (error) {
      console.error('Failed to append time slots to event:', error);
      throw error;
    }
  }

  private async removeTimeSlotsFromEvent(eventId: string, slotIds: string[]): Promise<void> {
    if (!slotIds.length) {
      return;
    }

    try {
      const eventRow = await apiRequest<any>(`/api/events/${eventId}`);
      const existing = Array.isArray(eventRow.timeSlotIds) ? eventRow.timeSlotIds : [];
      const next = existing.filter((id: string) => !slotIds.includes(id));
      await apiRequest(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: { event: { timeSlotIds: next } },
      });
    } catch (error) {
      console.error('Failed to remove time slots from event:', error);
      throw error;
    }
  }

  private mapRowToTimeSlot(row: any): TimeSlot {
    const startTime = this.normalizeTime(row.startTimeMinutes ?? row.startTime) ?? 0;
    const endTime = this.normalizeTime(row.endTimeMinutes ?? row.endTime) ?? startTime;
    const schedule: TimeSlot = {
      $id: String(row.$id ?? row.id ?? ''),
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      startTimeMinutes: startTime,
      endTimeMinutes: endTime,
      repeating: row.repeating === undefined ? true : Boolean(row.repeating),
      event:
        typeof row.eventId === 'string'
          ? row.eventId
          : row.event && typeof row.event === 'object' && '$id' in row.event
          ? (row.event as { $id?: string }).$id ?? undefined
          : undefined,
      scheduledFieldId:
        typeof row.scheduledFieldId === 'string'
          ? row.scheduledFieldId
          : typeof row.fieldId === 'string'
          ? row.fieldId
          : typeof row.field === 'string'
          ? row.field
          : row.field && typeof row.field === 'object' && '$id' in row.field
          ? (row.field as { $id?: string }).$id ?? undefined
          : undefined,
    };

    if (row.startDate) {
      schedule.startDate = typeof row.startDate === 'string' ? row.startDate : String(row.startDate);
    }

    if (row.endDate !== undefined) {
      schedule.endDate = row.endDate;
    }

    return schedule;
  }

  private normalizeTime(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      if (/^\d{1,2}:\d{2}$/.test(value)) {
        return this.timeStringToMinutes(value);
      }

      const numeric = Number(value);
      if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
        return numeric;
      }
    }

    return undefined;
  }

  private timeStringToMinutes(time: string): number {
    const [hoursRaw, minutesRaw] = time.split(':');
    const hours = Number(hoursRaw ?? 0);
    const minutes = Number(minutesRaw ?? 0);
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
  }

  private extractId(value: any): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      const first = value[0];
      return this.extractId(first);
    }

    if (typeof value === 'object' && '$id' in value) {
      return (value.$id as string) || '';
    }

    return '';
  }
}

export const leagueService = new LeagueService();
