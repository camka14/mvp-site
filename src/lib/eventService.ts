import { databases, functions } from '@/app/appwrite';
import {
    Event,
    LocationCoordinates,
    Team,
    UserData,
    Field,
    Match,
    LeagueConfig,
    TimeSlot,
    EventStatus,
    EventState,
    Organization,
    EventPayload,
    TimeSlotPayload,
} from '@/types';
import { ID, Query } from 'appwrite';
import { ensureLocalDateTimeString, formatLocalDateTime } from '@/lib/dateUtils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;
const MATCHES_TABLE_ID = process.env.NEXT_PUBLIC_MATCHES_TABLE_ID!;

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
                    'fields.rentalSlots.*',
                    'timeSlots.*',
                ])
            ];

            const response = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: EVENTS_TABLE_ID,
                rowId: id,
                queries
            });

            return await this.mapRowToEventWithRelations(response);
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

    async deleteUnpublishedEvent(event: Event): Promise<void> {
        try {
            await databases.deleteRow({
                databaseId: DATABASE_ID,
                tableId: EVENTS_TABLE_ID,
                rowId: event.$id,
            });
        } catch (error) {
            console.error('Failed to delete unpublished event:', error);
            throw error;
        }

        if (event.organization) {
            return;
        }

        const fieldsToRemove = Array.isArray(event.fields)
            ? event.fields.filter((field): field is Field => Boolean(field?.$id))
            : [];

        if (!fieldsToRemove.length) {
            return;
        }

        const deletionResults = await Promise.allSettled(
            fieldsToRemove.map(async (field) => {
                await databases.deleteRow({
                    databaseId: DATABASE_ID,
                    tableId: FIELDS_TABLE_ID,
                    rowId: field.$id,
                });
            })
        );

        const failures = deletionResults.filter((result) => result.status === 'rejected');
        if (failures.length) {
            console.error(`Failed to delete ${failures.length} field(s) for unpublished event ${event.$id}.`);
            throw new Error('Failed to delete fields for unpublished event');
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
        const fields = Array.isArray(event.fields) ? event.fields : undefined;
        const matches = Array.isArray(event.matches) ? event.matches : undefined;

        [
            '$id',
            '$createdAt',
            '$updatedAt',
            'attendees',
            'category',
            'leagueConfig',
            'players',
            'teams',
            'fields',
        ].forEach((key) => {
            delete clone[key];
        });

        const cleaned = this.removeUndefined(clone) as Partial<EventPayload>;

        const sanitizedPlayers = players?.map((player) => player.$id);
        if (sanitizedPlayers) {
            cleaned.players = sanitizedPlayers;
        }

        const sanitizedTeams = teams
            ?.map((team) => team.$id);

        if (sanitizedTeams && sanitizedTeams.length) {
            cleaned.teams = sanitizedTeams;
        }

        const sanitizedFields = fields
            ?.map((field) => field.$id);

        if (sanitizedFields && sanitizedFields.length) {
            cleaned.fields = sanitizedFields;
        }

        const sanitizedMatches = matches?.map((match) => match.$id);

        if (sanitizedMatches && sanitizedMatches.length) {
            cleaned.matches = sanitizedMatches;
        }

        const sanitizedTimeSlots = event.timeSlots?.map((slot: TimeSlot) => {
            const clone = { ...slot } as Record<string, unknown>;
            delete clone.$id;
            const cleaned = this.removeUndefined(clone) as Partial<TimeSlotPayload>;
            return Object.keys(cleaned).length ? (cleaned as TimeSlotPayload) : undefined;
        })

        if (sanitizedTimeSlots && sanitizedTimeSlots.length) {
            cleaned.timeSlots = sanitizedTimeSlots.filter((slot): slot is TimeSlotPayload => Boolean(slot));
        }

        if (
            Array.isArray(event.coordinates) &&
            event.coordinates.length === 2 &&
            typeof event.coordinates[0] === 'number' &&
            typeof event.coordinates[1] === 'number'
        ) {
            cleaned.coordinates = event.coordinates as [number, number];
        }

        return cleaned;
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

    private normalizeEventState(value: unknown): EventState {
        if (typeof value === 'string') {
            const normalized = value.toUpperCase();
            if (normalized === 'PUBLISHED' || normalized === 'UNPUBLISHED') {
                return normalized as EventState;
            }
        }
        return 'PUBLISHED';
    }

    private normalizeDateInput(value: Date | string | null | undefined): string | null {
        if (!value) {
            return null;
        }

        const serializeDate = (date: Date): string | null => {
            if (Number.isNaN(date.getTime())) {
                return null;
            }
            return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
        };

        if (value instanceof Date) {
            return serializeDate(value);
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }

            const parsed = new Date(trimmed);
            if (!Number.isNaN(parsed.getTime())) {
                return serializeDate(parsed);
            }

            return ensureLocalDateTimeString(trimmed);
        }

        return null;
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
        const restTime =
            typeof row.restTimeMinutes === 'number'
                ? row.restTimeMinutes
                : row.restTimeMinutes !== undefined && row.restTimeMinutes !== null
                    ? Number(row.restTimeMinutes)
                    : undefined;
        const state = this.normalizeEventState(row.state);

        return {
            ...row,
            // Computed properties
            attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
            restTimeMinutes: Number.isFinite(restTime) ? restTime : undefined,
            // Ensure divisions is always an array
            divisions: Array.isArray(row.divisions) ? row.divisions : [],
            status: row.status as EventStatus | undefined,
            state,
            leagueConfig: this.buildLeagueConfig(row),
            organization: row.organization ?? row.organizationId,
        };
    }

    async getEventsForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Event[]> {
        const startFilter = this.normalizeDateInput(start);
        const endFilter = this.normalizeDateInput(end);

        const queries: string[] = [
            Query.equal('fields.$id', fieldId),
        ];

        if (startFilter) {
            queries.push(Query.greaterThanEqual('end', startFilter));
        }

        if (endFilter) {
            queries.push(Query.lessThanEqual('start', endFilter));
        }

        queries.push(Query.select(['*', 'organization.$id']));

        return databases.listRows({
            databaseId: DATABASE_ID,
            tableId: EVENTS_TABLE_ID,
            queries,
        }).then(response => (response.rows || []).map((row: any) => this.mapRowToEvent(row)));
    }

    async getMatchesForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Match[]> {
        const startFilter = this.normalizeDateInput(start);
        const endFilter = this.normalizeDateInput(end);

        const queries: string[] = [
            Query.equal('field.$id', fieldId),
        ];

        if (startFilter) {
            queries.push(Query.greaterThanEqual('end', startFilter));
        }

        if (endFilter) {
            queries.push(Query.lessThanEqual('start', endFilter));
        }

        queries.push(Query.select(['*', 'referee.$id', 'team1.$id', 'team2.$id']));
        queries.push(Query.orderAsc('start'));

        return databases.listRows({
            databaseId: DATABASE_ID,
            tableId: MATCHES_TABLE_ID,
            queries,
        }).then(response => (response.rows || []).map((row: any) => this.mapMatchRecord(row)));
    }

    private async mapRowToEventWithRelations(row: any): Promise<Event> {
        const baseEvent = this.mapRowToEvent(row);

        const event: Event = { ...baseEvent };
        const fieldCache = new Map<string, { matches?: Match[]; events?: Event[] }>();

        if (row.organization) {
            event.organization = row.organization as Organization;
        }

        // Simply cast lists from Appwrite; only compute player fullName.
        if (Array.isArray(row.teams)) {
            event.teams = row.teams as Team[];
        }

        if (Array.isArray(row.fields)) {
            if (event.fields) {
                event.fields.forEach((field) => {
                    if (Array.isArray(field.rentalSlots)) {
                        field.rentalSlots.forEach((slot) => {
                            if (slot && typeof slot === 'object' && 'fields' in slot) {
                                delete (slot as any).fields;
                            }
                        });
                    }
                });
            }
        }

        if (Array.isArray(row.matches)) {
            const mappedMatches = await Promise.all(
                (row.matches as any[]).map(async (m: any) => {
                    const fieldRef = m.field && typeof m.field === 'object' ? (m.field as Field) : undefined;
                    if (fieldRef) {
                        const cacheEntry = fieldCache.get(fieldRef.$id) ?? {};
                        if (!cacheEntry.matches) {
                            cacheEntry.matches = await this.getMatchesForFieldInRange(fieldRef.$id, event.start, event.end ?? null);
                        }
                        if (!cacheEntry.events) {
                            cacheEntry.events = await this.getEventsForFieldInRange(fieldRef.$id, event.start, event.end ?? null);
                        }
                        fieldCache.set(fieldRef.$id, cacheEntry);
                        fieldRef.matches = cacheEntry.matches;
                        fieldRef.events = cacheEntry.events;
                    }

                    const mappedMatch = this.mapMatchRecord(m);

                    if (fieldRef) {
                        mappedMatch.field = fieldRef;
                    }

                    if (m.team1 && typeof m.team1 === 'object') {
                        mappedMatch.team1 =
                            event.teams?.find((team) => m.team1.$id === team.$id) ?? mappedMatch.team1;
                    }

                    if (m.team2 && typeof m.team2 === 'object') {
                        mappedMatch.team2 =
                            event.teams?.find((team) => m.team2.$id === team.$id) ?? mappedMatch.team2;
                    }

                    return mappedMatch;
                })
            );
            event.matches = mappedMatches;
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

    async mapRowFromDatabase(row: any, includeRelations: boolean = false): Promise<Event> {
        if (includeRelations) {
            return this.mapRowToEventWithRelations(row);
        }
        return this.mapRowToEvent(row);
    }

    private mapMatchRecord(input: any): Match {
        const match: Match = {
            $id: (input?.$id ?? input?.id) as string,
            start: input.start,
            end: input.end,
            team1Seed: input.team1Seed,
            team2Seed: input.team2Seed,
            losersBracket: input.losersBracket,
            matchId: input.matchId,
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
    }

    private buildLeagueConfig(row: any): LeagueConfig | undefined {
        if (typeof row?.gamesPerOpponent !== 'number') {
            return undefined;
        }

        const restTime =
            typeof row.restTimeMinutes === 'number'
                ? row.restTimeMinutes
                : row.restTimeMinutes !== undefined && row.restTimeMinutes !== null
                    ? Number(row.restTimeMinutes)
                    : undefined;

        return {
            gamesPerOpponent: row.gamesPerOpponent,
            includePlayoffs: Boolean(row.includePlayoffs),
            playoffTeamCount: row.playoffTeamCount ?? undefined,
            usesSets: Boolean(row.usesSets),
            matchDurationMinutes: row.matchDurationMinutes ?? 60,
            restTimeMinutes: Number.isFinite(restTime) ? restTime : undefined,
            setDurationMinutes: row.setDurationMinutes ?? undefined,
            setsPerMatch: row.setsPerMatch ?? undefined,
        };
    }

    private mapRowToTimeSlot(row: any): TimeSlot {
        const startTime = this.normalizeTime(row.startTimeMinutes ?? row.startTime) ?? 0;
        const endTime = this.normalizeTime(row.endTimeMinutes ?? row.endTime) ?? startTime;
        const slot: TimeSlot = {
            $id: row.$id ?? row.id,
            dayOfWeek: Number(row.dayOfWeek ?? 0) as TimeSlot['dayOfWeek'],
            startTimeMinutes: startTime,
            endTimeMinutes: endTime,
            repeating: row.repeating === undefined ? true : Boolean(row.repeating),
            event: row.event ?? row.eventId ?? row.event?.$id,
            scheduledFieldId: row.scheduledFieldId,
        };

        const normalizedStartDate = ensureLocalDateTimeString(row.startDate ?? row.start ?? null);
        if (normalizedStartDate) {
            slot.startDate = normalizedStartDate;
        }

        if (row.endDate === null) {
            slot.endDate = null;
        } else {
            const normalizedEndDate = ensureLocalDateTimeString(row.endDate ?? null);
            if (normalizedEndDate) {
                slot.endDate = normalizedEndDate;
            }
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
            queries.push(Query.select(["*", "teams.*", "players.*", "organization.*"]))
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

            return events;
        } catch (error) {
            console.error('Failed to fetch paginated events:', error);
            throw new Error('Failed to load events');
        }
    }
}

export const eventService = new EventService();
