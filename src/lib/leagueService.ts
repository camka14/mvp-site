import { databases, ID, functions } from '@/app/appwrite';
import { Query } from 'appwrite';
import {
  TimeSlot,
  Match,
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
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;

const mapMatchRecord = (input: any, fallbackEventId: string): Match => {
  const fieldRef = input?.field;
  const fieldId = typeof input?.fieldId === 'string'
    ? input.fieldId
    : typeof fieldRef === 'string'
      ? fieldRef
      : fieldRef?.$id;

  const fieldName = typeof input?.fieldName === 'string'
    ? input.fieldName
    : typeof fieldRef === 'object'
      ? fieldRef?.name
      : undefined;

  const fieldNumber = typeof input?.fieldNumber === 'number'
    ? input.fieldNumber
    : typeof fieldRef === 'object'
      ? fieldRef?.fieldNumber
      : undefined;

  const team1Id = typeof input?.team1Id === 'string'
    ? input.team1Id
    : typeof input?.team1 === 'string'
      ? input.team1
      : undefined;

  const team2Id = typeof input?.team2Id === 'string'
    ? input.team2Id
    : typeof input?.team2 === 'string'
      ? input.team2
      : undefined;

  return {
    $id: (input?.$id ?? input?.id) as string,
    eventId: (input?.eventId ?? fallbackEventId) as string,
    start: input.start,
    end: input.end,
    timezone: input.timezone,
    matchType: input.matchType ?? 'regular',
    weekNumber: input.weekNumber,
    team1Id,
    team2Id,
    team1Seed: input.team1Seed,
    team2Seed: input.team2Seed,
    losersBracket: input.losersBracket,
    fieldId,
    fieldName,
    fieldNumber,
    team1Points: input.team1Points as number[],
    team2Points: input.team2Points as number[],
    setResults: input.setResults as number[],
  } as Match;
};

export interface WeeklySlotInput {
  fieldId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: number;
  endTime: number;
  timezone: string;
  $id?: string;
}

export interface WeeklySlotConflict {
  schedule: TimeSlot;
  event: Event;
}

export interface LeagueScheduleResponse {
  matches: Match[];
  warnings?: string[];
  preview?: boolean;
  event?: Event;
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
  startTime: number;
  endTime: number;
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
  async createWeeklySchedules(eventId: string, slots: WeeklySlotInput[]): Promise<TimeSlot[]> {
    if (!slots.length) {
      return [];
    }

    const created = await Promise.all(slots.map(async (slot) => {
      const startTime = this.normalizeTime(slot.startTime);
      const endTime = this.normalizeTime(slot.endTime);
      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: WEEKLY_SCHEDULES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          event: eventId,
          field: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime,
          endTime,
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

  async listWeeklySchedulesByEvent(eventId: string): Promise<TimeSlot[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: WEEKLY_SCHEDULES_TABLE_ID,
      queries: [
        Query.equal('event', eventId),
        Query.select([
          '*',
          'field.*',
          'event.$id',
        ]),
      ],
    });

    return response.rows.map((row: any) => this.mapRowToWeeklySchedule(row));
  }

  async listWeeklySchedulesByField(fieldId: string, dayOfWeek?: number): Promise<TimeSlot[]> {
    const queries = [
      Query.equal('field', fieldId),
      Query.select([
        '*',
        'field.*',
        'event.$id',
      ]),
    ];
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
      const otherEventId = this.extractId(schedule.event);
      if (!otherEventId || otherEventId === options.ignoreEventId) {
        continue;
      }

      const slotStart = this.normalizeTime(slot.startTime);
      const slotEnd = this.normalizeTime(slot.endTime);
      if (!this.timesOverlap(slotStart, slotEnd, schedule.startTime, schedule.endTime)) {
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

    const eventRefId = typeof result?.event?.$id === 'string' ? result.event.$id : eventId;
    const matches = Array.isArray(result?.matches)
      ? result.matches.map((match: any) => mapMatchRecord(match, eventRefId))
      : [];

    return {
      ...result,
      matches,
    } as LeagueScheduleResponse;
  }

  async previewScheduleFromDocument(eventDocument: Record<string, any>, options: { participantCount?: number } = {}): Promise<LeagueScheduleResponse> {
    const payload: Record<string, any> = {
      task: 'generateLeague',
      eventDocument,
      persist: false,
    };

    if (typeof options.participantCount === 'number') {
      payload.participantCount = options.participantCount;
    }

    const execution = await functions.createExecution({
      functionId: EVENT_MANAGER_FUNCTION_ID,
      body: JSON.stringify(payload),
      async: false,
    });

    const parsed = JSON.parse(execution.responseBody || '{}');
    if (parsed.error) {
      throw new Error(typeof parsed.error === 'string' ? parsed.error : 'Failed to preview league schedule');
    }

    const matches: Match[] = Array.isArray(parsed.matches)
      ? (parsed.matches as any[]).map((match) => mapMatchRecord(match, parsed.event?.$id ?? eventDocument?.$id ?? 'preview'))
      : [];

    let event: Event | undefined;
    if (parsed.event) {
      event = eventService.mapRowFromDatabase(parsed.event, true);
    }

    return {
      matches,
      preview: typeof parsed.preview === 'boolean' ? parsed.preview : true,
      event,
    };
  }

  async listMatchesByEvent(eventId: string): Promise<Match[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: MATCHES_COLLECTION_ID,
      queries: [
        Query.equal('eventId', eventId),
        Query.orderAsc('start'),
      ],
    });

    return response.rows.map((row: any) => mapMatchRecord(row, row.eventId ?? eventId));
  }

  async deleteMatchesByEvent(eventId: string): Promise<void> {
    const matches = await this.listMatchesByEvent(eventId);
    await Promise.all(matches.map(match =>
      databases.deleteRow({
        databaseId: DATABASE_ID,
        tableId: MATCHES_COLLECTION_ID,
        rowId: match.$id,
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
                startTime: this.normalizeTime(slot.startTime),
                endTime: this.normalizeTime(slot.endTime),
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
          field: slot.fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime: this.normalizeTime(slot.startTime),
          endTime: this.normalizeTime(slot.endTime),
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

  private mapRowToWeeklySchedule(row: any): TimeSlot {
    const schedule: TimeSlot = {
      $id: row.$id,
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      startTime: this.normalizeTime(row.startTime),
      endTime: this.normalizeTime(row.endTime),
      timezone: typeof row.timezone === 'string' ? row.timezone : String(row.timezone ?? 'UTC'),
      event: row.event ?? row.eventId ?? row.event?.$id,
      field: row.field ?? row.fieldId ?? row.field?.$id,
    };

    if (row.field) {
      schedule.field = row.field;
    }

    if (row.event) {
      schedule.event = row.event;
    }

    return schedule;
  }

  private timesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return !(endA <= startB || startA >= endB);
  }

  private dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const startDateA = new Date(startA).getTime();
    const endDateA = new Date(endA).getTime();
    const startDateB = new Date(startB).getTime();
    const endDateB = new Date(endB).getTime();

    return !(endDateA < startDateB || startDateA > endDateB);
  }

  private normalizeTime(value: unknown): number {
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

    return 0;
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
