import { databases, ID, functions } from '@/app/appwrite';
import { Query } from 'appwrite';
import {
  WeeklySchedule,
  ScheduledMatchPayload,
  CreateLeagueFnInput,
  Event,
} from '@/types';
import type { CreateEventData } from './eventService';
import { eventService } from './eventService';
import { fieldService } from './fieldService';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const WEEKLY_SCHEDULES_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID!;
const MATCHES_COLLECTION_ID = process.env.NEXT_PUBLIC_MATCHES_COLLECTION_ID!;
const CREATE_LEAGUE_FUNCTION_ID = process.env.NEXT_PUBLIC_CREATE_LEAGUE_FUNCTION_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;

export interface WeeklySlotInput {
  fieldId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
  $id?: string;
}

export interface WeeklySlotConflict {
  schedule: WeeklySchedule;
  event: Event;
}

export interface LeagueScheduleResponse {
  matches: ScheduledMatchPayload[];
  warnings?: string[];
}

export interface LeagueFieldTemplateInput {
  key: string;
  name: string;
  fieldNumber: number;
  fieldType?: string;
}

export interface LeagueSlotCreationInput {
  fieldKey?: string;
  fieldId?: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface CreateLeagueDraftOptions {
  eventData: Partial<CreateEventData>;
  fieldTemplates?: LeagueFieldTemplateInput[];
  slots: LeagueSlotCreationInput[];
}

export interface CreateLeagueDraftResult {
  event: Event;
  fieldIdMap: Record<string, string>;
}

class LeagueService {
  async createWeeklySchedules(eventId: string, slots: WeeklySlotInput[]): Promise<WeeklySchedule[]> {
    if (!slots.length) {
      return [];
    }

    const created = await Promise.all(slots.map(async (slot) => {
      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: WEEKLY_SCHEDULES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          eventId,
          fieldId: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone,
        },
      });

      return this.mapRowToWeeklySchedule(response as any);
    }));

    return created;
  }

  async deleteWeeklySchedulesForEvent(eventId: string): Promise<void> {
    const schedules = await this.listWeeklySchedulesByEvent(eventId);

    await Promise.all(
      schedules.map((schedule) =>
        databases.deleteRow({
          databaseId: DATABASE_ID,
          tableId: WEEKLY_SCHEDULES_TABLE_ID,
          rowId: schedule.$id,
        })
      )
    );
  }

  async listWeeklySchedulesByEvent(eventId: string): Promise<WeeklySchedule[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: WEEKLY_SCHEDULES_TABLE_ID,
      queries: [Query.equal('eventId', eventId)],
    });

    return response.rows.map((row: any) => this.mapRowToWeeklySchedule(row));
  }

  async listWeeklySchedulesByField(fieldId: string, dayOfWeek?: number): Promise<WeeklySchedule[]> {
    const queries = [Query.equal('fieldId', fieldId)];
    if (typeof dayOfWeek === 'number') {
      queries.push(Query.equal('dayOfWeek', dayOfWeek));
    }

    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: WEEKLY_SCHEDULES_TABLE_ID,
      queries,
    });

    return response.rows.map((row: any) => this.mapRowToWeeklySchedule(row));
  }

  async checkConflictsForSlot(
    slot: WeeklySlotInput,
    eventStart: string,
    eventEnd: string,
    options: { ignoreEventId?: string } = {},
  ): Promise<WeeklySlotConflict[]> {
    const existingSchedules = await this.listWeeklySchedulesByField(slot.fieldId, slot.dayOfWeek);
    const conflicts: WeeklySlotConflict[] = [];
    const cachedEvents = new Map<string, Event>();

    for (const schedule of existingSchedules) {
      const otherEventId = schedule.eventId;
      if (!otherEventId || otherEventId === options.ignoreEventId) {
        continue;
      }

      if (!this.timesOverlap(slot.startTime, slot.endTime, schedule.startTime, schedule.endTime)) {
        continue;
      }

      let otherEvent = cachedEvents.get(otherEventId);
      if (!otherEvent) {
        const fetched = await eventService.getEvent(otherEventId);
        if (!fetched) {
          continue;
        }
        otherEvent = fetched;
        cachedEvents.set(otherEventId, otherEvent);
      }

      if (this.dateRangesOverlap(eventStart, eventEnd, otherEvent.start, otherEvent.end)) {
        conflicts.push({ schedule, event: otherEvent });
      }
    }

    return conflicts;
  }

  async generateSchedule(eventId: string, dryRun = false): Promise<LeagueScheduleResponse> {
    const response = await functions.createExecution({
      functionId: CREATE_LEAGUE_FUNCTION_ID,
      body: JSON.stringify({
        eventId,
        dryRun,
      } as CreateLeagueFnInput),
      async: false,
    });

    const result = JSON.parse(response.responseBody || '{}');

    if (result.error) {
      throw new Error(typeof result.error === 'string' ? result.error : 'Failed to generate league schedule');
    }

    return result as LeagueScheduleResponse;
  }

  async listMatchesByEvent(eventId: string): Promise<ScheduledMatchPayload[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: MATCHES_COLLECTION_ID,
      queries: [
        Query.equal('eventId', eventId),
        Query.orderAsc('start'),
      ],
    });

    return response.rows.map((row: any) => ({
      id: row.$id,
      eventId: row.eventId ?? eventId,
      fieldId: row.fieldId,
      start: row.start,
      end: row.end,
      weekNumber: row.weekNumber ?? undefined,
      matchType: row.matchType ?? 'regular',
      team1Id: row.team1Id ?? undefined,
      team2Id: row.team2Id ?? undefined,
      team1Seed: row.team1Seed ?? undefined,
      team2Seed: row.team2Seed ?? undefined,
    })) as ScheduledMatchPayload[];
  }

  async deleteMatchesByEvent(eventId: string): Promise<void> {
    const matches = await this.listMatchesByEvent(eventId);
    await Promise.all(matches.map(match =>
      databases.deleteRow({
        databaseId: DATABASE_ID,
        tableId: MATCHES_COLLECTION_ID,
        rowId: match.id,
      })
    ));
  }

  async createLeagueDraft(options: CreateLeagueDraftOptions): Promise<CreateLeagueDraftResult> {
    const rowId = ID.unique();
    const newFieldTemplates = (options.fieldTemplates || []).filter(template => template.key);
    const relationshipsPayload: Record<string, any> = {};
    const newFieldKeySet = new Set(newFieldTemplates.map(template => template.key));
    const slotsForNewFields = options.slots.filter(slot => slot.fieldKey && newFieldKeySet.has(slot.fieldKey));
    const slotsForExistingFields = options.slots.filter(slot => slot.fieldId);

    if (newFieldTemplates.length) {
      relationshipsPayload.fields = {
        create: newFieldTemplates.map(template => {
          const fieldPayload: Record<string, any> = {
            name: template.name,
            fieldNumber: template.fieldNumber,
          };
          if (template.fieldType) {
            fieldPayload.type = template.fieldType;
          } else if ((options.eventData as any)?.fieldType) {
            fieldPayload.type = (options.eventData as any).fieldType;
          }
          const slots = slotsForNewFields.filter(slot => slot.fieldKey === template.key);
          if (slots.length) {
            fieldPayload.weeklySchedules = {
              create: slots.map(slot => ({
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                timezone: slot.timezone,
              })),
            };
          }
          return fieldPayload;
        }),
      };
    }

    if (slotsForExistingFields.length) {
      relationshipsPayload.weeklySchedules = {
        create: slotsForExistingFields.map(slot => ({
          fieldId: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone,
        })),
      };
    }

    try {
      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId,
        data: options.eventData,
        queries: [
          Query.select([
            '*',
            'fields.*',
            'fields.weeklySchedules.*',
            'weeklySchedules.*',
          ]),
        ],
        ...(Object.keys(relationshipsPayload).length > 0 ? { relationships: relationshipsPayload } : {}),
      } as any);

      const event = eventService.mapRowFromDatabase(response, true);
      const fieldIdMap: Record<string, string> = {};
      if (event.fields && Array.isArray(event.fields) && newFieldTemplates.length) {
        newFieldTemplates.forEach(template => {
          const match = event.fields?.find(field => field.fieldNumber === template.fieldNumber);
          if (match?.$id) {
            fieldIdMap[template.key] = match.$id;
          }
        });
      }

      return { event, fieldIdMap };
    } catch (error) {
      console.warn('Relationship draft creation failed, falling back to sequential creation.', error);
    }

    const cleanEventData = { ...options.eventData };
    delete (cleanEventData as any).fieldCount;

    const event = await eventService.createEvent(cleanEventData);
    const fieldIdMap: Record<string, string> = {};

    if (newFieldTemplates.length) {
      await Promise.all(newFieldTemplates.map(async (template) => {
        const createdField = await fieldService.createField({
          name: template.name,
          fieldNumber: template.fieldNumber,
          type: template.fieldType ?? (options.eventData as any)?.fieldType,
          eventId: event.$id,
        });
        fieldIdMap[template.key] = createdField.$id;
      }));
    }

    const weeklySlotInputs: WeeklySlotInput[] = options.slots
      .map(slot => {
        const fieldId = slot.fieldId || (slot.fieldKey ? fieldIdMap[slot.fieldKey] : undefined);
        if (!fieldId) {
          return undefined;
        }
        return {
          fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: slot.timezone,
        } as WeeklySlotInput;
      })
      .filter(Boolean) as WeeklySlotInput[];

    if (weeklySlotInputs.length) {
      await this.createWeeklySchedules(event.$id, weeklySlotInputs);
    }

    const hydrated = await eventService.getEventWithRelations(event.$id);

    return {
      event: hydrated || event,
      fieldIdMap,
    };
  }

  private mapRowToWeeklySchedule(row: any): WeeklySchedule {
    const eventId = typeof row.eventId === 'string'
      ? row.eventId
      : typeof row.event === 'string'
        ? row.event
        : row.eventId?.$id ?? row.event?.$id ?? '';

    const fieldId = typeof row.fieldId === 'string'
      ? row.fieldId
      : typeof row.field === 'string'
        ? row.field
        : row.fieldId?.$id ?? row.field?.$id ?? '';

    const schedule: WeeklySchedule = {
      $id: row.$id,
      eventId,
      fieldId,
      dayOfWeek: Number(row.dayOfWeek ?? 0) as WeeklySchedule['dayOfWeek'],
      startTime: row.startTime,
      endTime: row.endTime,
      timezone: row.timezone,
    };

    if (row.field) {
      schedule.field = row.field;
    }

    return schedule;
  }

  private timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const [startAMin, endAMin, startBMin, endBMin] = [startA, endA, startB, endB].map(this.timeToMinutes);
    return !(endAMin <= startBMin || startAMin >= endBMin);
  }

  private dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const startDateA = new Date(startA).getTime();
    const endDateA = new Date(endA).getTime();
    const startDateB = new Date(startB).getTime();
    const endDateB = new Date(endB).getTime();

    return !(endDateA < startDateB || startDateA > endDateB);
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map((value) => parseInt(value, 10));
    return hours * 60 + minutes;
  }
}

export const leagueService = new LeagueService();
