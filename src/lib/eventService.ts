import { databases, functions } from '@/app/appwrite';
import {
  Event,
  LocationCoordinates,
  getCategoryFromEvent,
  Division,
  Team,
  UserData,
  Field,
  Match,
  LeagueConfig,
  TimeSlot,
  EventStatus,
  Organization,
  EventPayload,
  TeamPayload,
  UserDataPayload,
} from '@/types';
import { ID, Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!;

export interface LeagueGenerationOptions {
  dryRun?: boolean;
  participantCount?: number;
  teamId?: string;
  userId?: string;
}

export interface LeagueGenerationMatchResult {
  id?: string | number | null;
  matchId?: string | number | null;
  start?: string;
  end?: string;
  field?: unknown;
  team1?: unknown;
  team2?: unknown;
  team1Seed?: number | null;
  team2Seed?: number | null;
}

export interface LeagueGenerationResponse {
  preview?: boolean;
  status?: string;
  matches?: LeagueGenerationMatchResult[];
  warnings?: string[];
  error?: unknown;
}

export interface EventFilters {
  category?: string;
  query?: string;
  maxDistance?: number;
  userLocation?: LocationCoordinates;
  dateFrom?: string;
  dateTo?: string;
  priceMax?: number;
  eventTypes?: ('pickup' | 'tournament' | 'league')[];
  sports?: string[];
  divisions?: string[];
  fieldType?: string;
}

class EventService {
  /**
   * Get event with all relationships expanded (matching Python backend approach)
   * This fetches all related data in a single database call using Appwrite's relationship features
   */
  async getEventWithRelations(id: string): Promise<Event | undefined> {
    try {
      // Use Query.select to expand all relationships like in Python backend
      const queries = [
        Query.select([
          '*',
          'matches.*',
          'matches.field.$id',
          'matches.team1.$id',
          'matches.team2.$id',
          'matches.referee.$id',
          'players.*',
          'teams.*',
          'teams.matches.$id',
          'fields.*',
          'fields.matches.$id',
          'timeSlots.*',
          'timeSlots.field.$id',
        ])
      ];

      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: id,
        queries
      });

      return this.mapRowToEventWithRelations(response);
    } catch (error) {
      console.error('Failed to fetch event with relations:', error);
      return undefined;
    }
  }

  /**
   * Get basic event without expanded relationships (for list views)
   */
  async getEvent(id: string): Promise<Event | undefined> {
    try {
      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: id
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to fetch event:', error);
      return undefined;
    }
  }

  async getAllEvents(): Promise<Event[]> {
    try {
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries: [
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      });

      return response.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw new Error('Failed to load events');
    }
  }

  // Convenience alias used across UI
  async getEventById(id: string): Promise<Event | undefined> {
    return this.getEvent(id);
  }

  async updateEventParticipants(eventId: string, updates: { playerIds: string[], teamIds: string[] }): Promise<Event> {
    try {
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: updates
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to update event participants:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, eventData: Partial<Event>): Promise<Event> {
    try {
      const payload = this.buildEventPayload(eventData);

      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: payload
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await databases.deleteRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId
      });
      return true;
    } catch (error) {
      console.error('Failed to delete event:', error);
      return false;
    }
  }

  async createEvent(newEvent: Partial<Event>): Promise<Event> {
    try {
      const payload = this.buildEventPayload(newEvent);

      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: ID.unique(),
        data: payload
      });

      // Create fields if this is a tournament
      if (newEvent.fieldCount && newEvent.fieldCount > 0) {
        for (let fieldNum = 1; fieldNum <= newEvent.fieldCount; fieldNum++) {
          await databases.createRow({
            databaseId: DATABASE_ID,
            tableId: process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!,
            rowId: ID.unique(),
            data: {
              eventId: response.$id,
              fieldNumber: fieldNum,
              divisions: ["OPEN"], // Default division
            }
          });
        }
      }

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  }

  private buildEventPayload(event: Partial<Event>): Partial<EventPayload> {
    const clone = { ...event } as Record<string, unknown>;

    const players = Array.isArray(event.players) ? event.players : undefined;
    const teams = Array.isArray(event.teams) ? event.teams : undefined;

    [
      '$id',
      '$createdAt',
      '$updatedAt',
      'attendees',
      'category',
      'leagueConfig',
      'players',
      'teams',
    ].forEach((key) => {
      delete clone[key];
    });

    const cleaned = this.removeUndefined(clone) as Partial<EventPayload>;

    const sanitizedPlayers = this.sanitizeUsers(players);
    if (sanitizedPlayers) {
      cleaned.players = sanitizedPlayers;
    }

    const sanitizedTeams = teams
      ?.map((team) => this.sanitizeTeam(team))
      .filter((value): value is TeamPayload => Boolean(value));

    if (sanitizedTeams && sanitizedTeams.length) {
      cleaned.teams = sanitizedTeams;
    }

    return cleaned;
  }

  private sanitizeUsers(users?: Partial<UserData>[] | null): UserDataPayload[] | undefined {
    if (!users?.length) return undefined;
    const sanitized = users
      .map((user) => this.sanitizeUser(user))
      .filter((value): value is UserDataPayload => Boolean(value));
    return sanitized.length ? sanitized : undefined;
  }

  private sanitizeUser(user?: Partial<UserData> | null): UserDataPayload | undefined {
    if (!user) return undefined;
    const clone = { ...user } as Record<string, unknown>;
    delete clone.fullName;
    delete clone.avatarUrl;
    const cleaned = this.removeUndefined(clone) as Partial<UserDataPayload>;
    return Object.keys(cleaned).length ? (cleaned as UserDataPayload) : undefined;
  }

  private sanitizeTeam(team?: Partial<Team> | null): TeamPayload | undefined {
    if (!team) return undefined;
    const clone = { ...team } as Record<string, unknown>;
    const players = Array.isArray(team.players) ? team.players : undefined;
    const pendingPlayers = Array.isArray(team.pendingPlayers) ? team.pendingPlayers : undefined;
    const captain = team.captain;

    delete clone.winRate;
    delete clone.currentSize;
    delete clone.isFull;
    delete clone.avatarUrl;
    delete clone.players;
    delete clone.pendingPlayers;
    delete clone.captain;

    const cleaned = this.removeUndefined(clone) as Partial<TeamPayload>;

    const sanitizedPlayers = this.sanitizeUsers(players);
    if (sanitizedPlayers) {
      cleaned.players = sanitizedPlayers;
    }

    const sanitizedPending = this.sanitizeUsers(pendingPlayers);
    if (sanitizedPending) {
      cleaned.pendingPlayers = sanitizedPending;
    }

    const sanitizedCaptain = this.sanitizeUser(captain);
    if (sanitizedCaptain) {
      cleaned.captain = sanitizedCaptain;
    }

    return Object.keys(cleaned).length ? (cleaned as TeamPayload) : undefined;
  }

  private removeUndefined<T extends Record<string, unknown>>(record: T): T {
    const result: Record<string, unknown> = {};
    Object.keys(record).forEach((key) => {
      const value = record[key];
      if (value !== undefined) {
        result[key] = value;
      }
    });
    return result as T;
  }

  async generateLeagueSchedule(
    eventId: string,
    options: LeagueGenerationOptions = {}
  ): Promise<LeagueGenerationResponse> {
    try {
      const payload: Record<string, unknown> = {
        task: 'generateLeague',
        eventId,
      };

      if (options.dryRun !== undefined) {
        payload.dryRun = options.dryRun;
      }
      if (options.participantCount !== undefined) {
        payload.participantCount = options.participantCount;
      }
      if (options.teamId) {
        payload.teamId = options.teamId;
      }
      if (options.userId) {
        payload.userId = options.userId;
      }

      const execution = await functions.createExecution({
        functionId: EVENT_MANAGER_FUNCTION_ID,
        body: JSON.stringify(payload),
        async: false,
      });

      const parsed = this.parseLeagueGenerationResponse(execution.responseBody);
      const errorPayload = this.extractLeagueGenerationError(parsed?.error);
      if (errorPayload) {
        throw new Error(errorPayload);
      }

      return parsed;
    } catch (error) {
      console.error('Failed to request league generation:', error);
      throw error instanceof Error ? error : new Error('Failed to request league generation');
    }
  }

  private mapRowToEvent(row: any): Event {
    const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat ?? row.coordinates?.[1] ?? 0);
    const long = typeof row.long === 'number' ? row.long : Number(row.long ?? row.coordinates?.[0] ?? 0);

    return {
      ...row,
      // Computed properties
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: [long, lat],
      lat,
      long,
      category: getCategoryFromEvent({ sport: row.sport } as Event),
      // Ensure divisions is always an array
      divisions: Array.isArray(row.divisions) ? row.divisions : [],
      status: row.status as EventStatus | undefined,
      leagueConfig: this.buildLeagueConfig(row),
      organization: row.organization ?? row.organizationId,
    };
  }

  private mapRowToEventWithRelations(row: any): Event {
    const baseEvent = this.mapRowToEvent(row);

    const event: Event = { ...baseEvent };

    if (row.organization) {
      event.organization = row.organization as Organization;
    }

    // Simply cast lists from Appwrite; only compute player fullName.
    if (Array.isArray(row.teams)) {
      event.teams = row.teams as Team[];
    }

    if (Array.isArray(row.fields)) {
      event.fields = row.fields as Field[];
    }

    if (Array.isArray(row.matches)) {
      event.matches = (row.matches as any[]).map((m: any) => {
        const fieldRef = m.field && typeof m.field === 'object' ? (m.field as Field) : undefined;
        const mappedMatch: Match = {
          $id: m.$id ?? m.id,
          start: m.start,
          end: m.end,
          matchId: m.matchNumber ?? m.matchId,
          tournamentId: m.tournamentId,
          team1Seed: m.team1Seed ?? undefined,
          team2Seed: m.team2Seed ?? undefined,
          losersBracket: m.losersBracket ?? undefined,
          team1Points: Array.isArray(m.team1Points) ? (m.team1Points as number[]) : [],
          team2Points: Array.isArray(m.team2Points) ? (m.team2Points as number[]) : [],
          setResults: Array.isArray(m.setResults) ? (m.setResults as number[]) : [],
          previousLeftId: m.previousLeftId ?? m.previousLeftMatchId,
          previousRightId: m.previousRightId ?? m.previousRightMatchId,
          winnerNextMatchId: m.winnerNextMatchId ?? (m.winnerNextMatch ? (m.winnerNextMatch as Match).$id : undefined),
          loserNextMatchId: m.loserNextMatchId ?? (m.loserNextMatch ? (m.loserNextMatch as Match).$id : undefined),
        } as Match;

        if (fieldRef) {
          mappedMatch.field = fieldRef;
        }

        if (m.team1 && typeof m.team1 === 'object') {
          mappedMatch.team1 = event.teams?.find((team) => m.team1.$id === team.$id) as Team;
        }

        if (m.team2 && typeof m.team2 === 'object') {
          mappedMatch.team2 = event.teams?.find((team) => m.team2.$id === team.$id) as Team;
        }

        if (m.division) {
          mappedMatch.division = m.division;
        }

        if (m.referee && typeof m.referee === 'object') {
          mappedMatch.referee = m.referee as Team;
        }

        if (m.previousLeftMatch) {
          mappedMatch.previousLeftMatch = m.previousLeftMatch as Match;
        }

        if (m.previousRightMatch) {
          mappedMatch.previousRightMatch = m.previousRightMatch as Match;
        }

        if (m.winnerNextMatch) {
          mappedMatch.winnerNextMatch = m.winnerNextMatch as Match;
        }

        if (m.loserNextMatch) {
          mappedMatch.loserNextMatch = m.loserNextMatch as Match;
        }

        return mappedMatch;
      });
    }

    if (Array.isArray(row.timeSlots)) {
      event.timeSlots = (row.timeSlots as any[]).map((schedule: any) => this.mapRowToTimeSlot(schedule));
    }

    if (Array.isArray(row.players)) {
      event.players = (row.players as any[]).map((p: any) => ({
        ...p,
        fullName: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        avatarUrl: p.avatarUrl ?? '',
      } as UserData));
    }

    return event;
  }

  mapRowFromDatabase(row: any, includeRelations: boolean = false): Event {
    return includeRelations ? this.mapRowToEventWithRelations(row) : this.mapRowToEvent(row);
  }

  private buildLeagueConfig(row: any): LeagueConfig | undefined {
    if (typeof row?.gamesPerOpponent !== 'number') {
      return undefined;
    }

    return {
      gamesPerOpponent: row.gamesPerOpponent,
      includePlayoffs: Boolean(row.includePlayoffs),
      playoffTeamCount: row.playoffTeamCount ?? undefined,
      usesSets: Boolean(row.usesSets),
      matchDurationMinutes: row.matchDurationMinutes ?? 60,
      setDurationMinutes: row.setDurationMinutes ?? undefined,
      setsPerMatch: row.setsPerMatch ?? undefined,
    };
  }

  private mapRowToTimeSlot(row: any): TimeSlot {
    const slot: TimeSlot = {
      $id: row.$id ?? row.id,
      dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
      startTime: this.normalizeTime(row.startTime),
      endTime: this.normalizeTime(row.endTime),
      event: row.event ?? row.eventId ?? row.event?.$id,
      field: row.field ?? row.fieldId ?? row.field?.$id,
    };

    if (row.field) {
      slot.field = row.field;
    }

    if (row.event) {
      slot.event = row.event;
    }

    return slot;
  }

  private parseLeagueGenerationResponse(body?: string): LeagueGenerationResponse {
    if (!body) {
      return {};
    }

    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        return parsed as LeagueGenerationResponse;
      }
    } catch (error) {
      console.error('Failed to parse league generation response:', error);
    }

    return {};
  }

  private extractLeagueGenerationError(value: unknown): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object') {
      const message = (value as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    return 'Failed to generate league schedule';
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

  // Waitlist and free-agent helpers used by EventDetailModal
  async addToWaitlist(eventId: string, participantId: string): Promise<Event> {
    const existing = await this.getEvent(eventId);
    if (!existing) throw new Error('Event not found');
    const updated = Array.from(new Set([...(existing.waitListIds || []), participantId]));
    const response = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      rowId: eventId,
      data: { waitListIds: updated }
    });
    return this.mapRowToEvent(response);
  }

  async addFreeAgent(eventId: string, userId: string): Promise<Event> {
    const existing = await this.getEvent(eventId);
    if (!existing) throw new Error('Event not found');
    const updated = Array.from(new Set([...(existing.freeAgentIds || []), userId]));
    const response = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      rowId: eventId,
      data: { freeAgentIds: updated }
    });
    return this.mapRowToEvent(response);
  }

  async removeFreeAgent(eventId: string, userId: string): Promise<Event> {
    const existing = await this.getEvent(eventId);
    if (!existing) throw new Error('Event not found');
    const updated = (existing.freeAgentIds || []).filter(id => id !== userId);
    const response = await databases.updateRow({
      databaseId: DATABASE_ID,
      tableId: EVENTS_TABLE_ID,
      rowId: eventId,
      data: { freeAgentIds: updated }
    });
    return this.mapRowToEvent(response);
  }

  // Pagination methods remain largely the same but updated to use new types
  async getEventsPaginated(filters: EventFilters, limit: number = 18, offset: number = 0): Promise<Event[]> {
    try {
      const queries: string[] = [];

      queries.push(Query.orderAsc('start'));
      queries.push(Query.limit(limit));
      if (offset > 0) queries.push(Query.offset(offset));

      if (filters.eventTypes && filters.eventTypes.length > 0 && filters.eventTypes.length < 3) {
        queries.push(Query.equal('eventType', filters.eventTypes));
      }

      if (filters.sports && filters.sports.length > 0) {
        queries.push(Query.equal('sport', filters.sports));
      }

      if (filters.divisions && filters.divisions.length > 0) {
        queries.push(Query.contains('divisions', filters.divisions));
      }

      if (filters.fieldType) {
        queries.push(Query.equal('fieldType', filters.fieldType));
      }

      if (filters.dateFrom) {
        queries.push(Query.greaterThanEqual('start', filters.dateFrom));
      }

      if (filters.dateTo) {
        queries.push(Query.lessThanEqual('end', filters.dateTo));
      }

      if (filters.priceMax !== undefined) {
        queries.push(Query.lessThanEqual('price', filters.priceMax));
      }

      if (filters.userLocation && filters.maxDistance) {
        queries.push(
          Query.distanceLessThan(
            'coordinates',
            [filters.userLocation.lng, filters.userLocation.lat],
            Math.round(filters.maxDistance * 1000)
          )
        );
      }

      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries
      });

      let events = response.rows.map(row => this.mapRowToEvent(row));

      // Apply client-side filtering
      if (filters.query) {
        const searchTerm = filters.query.toLowerCase();
        events = events.filter(event =>
          event.name.toLowerCase().includes(searchTerm) ||
          event.description.toLowerCase().includes(searchTerm) ||
          event.location.toLowerCase().includes(searchTerm) ||
          event.sport.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.category && filters.category !== 'All') {
        events = events.filter(event => {
          const eventCategory = getCategoryFromEvent(event);
          return eventCategory === filters.category;
        });
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch paginated events:', error);
      throw new Error('Failed to load events');
    }
  }
}

export const eventService = new EventService();
