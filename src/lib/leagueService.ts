import { databases, ID, functions } from '@/app/appwrite';
import { Query } from 'appwrite';
import {
  TimeSlot,
  Match,
  Event,
  Field,
  Team,
} from '@/types';
import { eventService } from './eventService';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const TIME_SLOTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID!;
const MATCHES_COLLECTION_ID = process.env.NEXT_PUBLIC_MATCHES_COLLECTION_ID!;
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!;

const mapMatchRecord = (input: any): Match => {
  const match: Match = {
    $id: (input?.$id ?? input?.id) as string,
    start: input.start,
    end: input.end,
    team1Seed: input.team1Seed,
    team2Seed: input.team2Seed,
    losersBracket: input.losersBracket,
    team1Points: Array.isArray(input.team1Points) ? (input.team1Points as number[]) : [],
    team2Points: Array.isArray(input.team2Points) ? (input.team2Points as number[]) : [],
    setResults: Array.isArray(input.setResults) ? (input.setResults as number[]) : [],
    previousLeftId: input.previousLeftId ?? input.previousLeftMatchId,
    previousRightId: input.previousRightId ?? input.previousRightMatchId,
    winnerNextMatchId: input.winnerNextMatchId ?? (input.winnerNextMatch ? (input.winnerNextMatch as Match).$id : undefined),
    loserNextMatchId: input.loserNextMatchId ?? (input.loserNextMatch ? (input.loserNextMatch as Match).$id : undefined),
    field: input?.field as Field,
    event: input?.event as Event,
  };

  if (input.division) {
    match.division = input.division;
  }

  if (input.team1 && typeof input.team1 === 'object') {
    match.team1 = input.team1 as Team;
  }

  if (input.team2 && typeof input.team2 === 'object') {
    match.team2 = input.team2 as Team;
  }

  if (input.referee && typeof input.referee === 'object') {
    match.referee = input.referee as Team;
  }

  if (input.previousLeftMatch) {
    match.previousLeftMatch = input.previousLeftMatch as Match;
  }

  if (input.previousRightMatch) {
    match.previousRightMatch = input.previousRightMatch as Match;
  }

  if (input.winnerNextMatch) {
    match.winnerNextMatch = input.winnerNextMatch as Match;
  }

  if (input.loserNextMatch) {
    match.loserNextMatch = input.loserNextMatch as Match;
  }

  return match;
};

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
  fieldType?: string;
}

export interface LeagueSlotCreationInput {
  fieldKey?: string;
  field?: Field;
  dayOfWeek: TimeSlot['dayOfWeek'];
  startTime: number;
  endTime: number;
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
      const startTime = this.normalizeTime(slot.startTime);
      const endTime = this.normalizeTime(slot.endTime);
      const fieldId = this.extractId(slot.field);
      if (!fieldId) {
        throw new Error('TimeSlot requires a related field');
      }
      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: TIME_SLOTS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          event: eventId,
          field: fieldId,
          dayOfWeek: slot.dayOfWeek,
          startTime,
          endTime,
        },
        queries: [
          Query.select([
            '*',
            'field.*',
            'event.$id',
          ]),
        ],
      } as any);

      return this.mapRowToTimeSlot(response as any);
    }));

    return created;
  }

  async deleteWeeklySchedulesForEvent(eventId: string): Promise<void> {
    const schedules = await this.listWeeklySchedulesByEvent(eventId);

    await Promise.all(
      schedules.map((schedule) =>
        databases.deleteRow({
          databaseId: DATABASE_ID,
          tableId: TIME_SLOTS_TABLE_ID,
          rowId: schedule.$id,
        })
      )
    );
  }

  async listWeeklySchedulesByEvent(eventId: string): Promise<TimeSlot[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: TIME_SLOTS_TABLE_ID,
      queries: [
        Query.equal('event.$id', eventId),
        Query.select([
          '*',
          'field.*',
        ]),
      ],
    });

    return response.rows.map((row: any) => this.mapRowToTimeSlot(row));
  }

  async listTimeSlotsByField(fieldId: string, dayOfWeek?: number): Promise<TimeSlot[]> {
    const queries = [
      Query.equal('field', fieldId),
      Query.select([
        '*',
        'field.*',
      ]),
    ];
    if (typeof dayOfWeek === 'number') {
      queries.push(Query.equal('dayOfWeek', dayOfWeek));
    }

    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: TIME_SLOTS_TABLE_ID,
      queries,
    });

    return response.rows.map((row: any) => this.mapRowToTimeSlot(row));
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
    if (parsed.warnings) {
      throw new Error(typeof parsed.error === 'string' ? parsed.error : 'Failed to preview league schedule');
    }

    let event: Event | undefined;
    if (parsed.event) {
      event = await eventService.mapRowFromDatabase(parsed.event, true);
    }

    return {
      preview: typeof parsed.preview === 'boolean' ? parsed.preview : true,
      event,
    };
  }

  async listMatchesByEvent(eventId: string): Promise<Match[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: MATCHES_COLLECTION_ID,
      queries: [
        Query.equal('event.$id', eventId),
        Query.orderAsc('start'),
      ],
    });

    return response.rows.map((row: any) => mapMatchRecord(row));
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

  private mapRowToTimeSlot(row: any): TimeSlot {
    const schedule: TimeSlot = {
      $id: row.$id,
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      startTime: this.normalizeTime(row.startTime),
      endTime: this.normalizeTime(row.endTime),
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
