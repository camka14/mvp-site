import { databases } from '@/app/appwrite';
import {
    Event,
    LocationCoordinates,
    Team,
    UserData,
    Field,
    Match,
    LeagueConfig,
    LeagueScoringConfig,
    Sport,
    TimeSlot,
    EventStatus,
    EventState,
    Organization,
    getTeamAvatarUrl,
    getTeamWinRate,
} from '@/types';
import { ID, Query } from 'appwrite';
import { ensureLocalDateTimeString } from '@/lib/dateUtils';
import { sportsService } from '@/lib/sportsService';
import { userService } from '@/lib/userService';
import { buildPayload } from './utils';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;
const EVENT_MANAGER_FUNCTION_ID = process.env.NEXT_PUBLIC_EVENT_MANAGER_FUNCTION_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;
const MATCHES_TABLE_ID = process.env.NEXT_PUBLIC_MATCHES_TABLE_ID!;
const TEAMS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID!;
const USERS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_USERS_TABLE_ID!;
const TIME_SLOTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_WEEKLY_SCHEDULES_TABLE_ID!;
const ORGANIZATIONS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_TABLE_ID!;
const LEAGUE_SCORING_CONFIG_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_LEAGUE_SCORING_CONFIG_TABLE_ID!;

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
    private sportsCache: Map<string, Sport> | null = null;
    private sportsCachePromise: Promise<Map<string, Sport>> | null = null;
    async getEventWithRelations(id: string): Promise<Event | undefined> {
        try {
            const response = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: EVENTS_TABLE_ID,
                rowId: id,
            });

            await this.ensureSportRelationship(response);
            await this.ensureLeagueScoringConfig(response);

            const baseEvent = this.mapRowToEvent(response);
            return await this.hydrateEventRelations(baseEvent, response);
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
                rowId: id,
            });

            await this.ensureSportRelationship(response);
            await this.ensureLeagueScoringConfig(response);

            return this.mapRowToEvent(response);
        } catch (error) {
            console.error('Failed to fetch event:', error);
            return undefined;
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

            const hydrated = await this.getEvent(eventId);
            if (hydrated) {
                return hydrated;
            }

            await this.ensureSportRelationship(response);
            await this.ensureLeagueScoringConfig(response);
            return this.mapRowToEvent(response);
        } catch (error) {
            console.error('Failed to update event participants:', error);
            throw error;
        }
    }

    async updateEvent(eventId: string, eventData: Partial<Event>): Promise<Event> {
        try {
            const response = await databases.updateRow({
                databaseId: DATABASE_ID,
                tableId: EVENTS_TABLE_ID,
                rowId: eventId,
                data: eventData
            });

            const hydrated = await this.getEvent(eventId);
            if (hydrated) {
                return hydrated;
            }

            await this.ensureSportRelationship(response);
            await this.ensureLeagueScoringConfig(response);
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
                    rowId: field.$id
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
            const payload = buildPayload(newEvent);
            const response = await databases.createRow({
                databaseId: DATABASE_ID,
                tableId: EVENTS_TABLE_ID,
                rowId: ID.unique(),
                data: payload
            });

            const eventId = response.$id ?? response.id;
            if (eventId) {
                const hydrated = await this.getEvent(eventId);
                if (hydrated) {
                    return hydrated;
                }
            }

            await this.ensureSportRelationship(response);
            return this.mapRowToEvent(response);
        } catch (error) {
            console.error('Failed to create event:', error);
            throw error;
        }
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

    private mapRowToEvent(row: any): Event {
        const restTime =
            typeof row.restTimeMinutes === 'number'
                ? row.restTimeMinutes
                : row.restTimeMinutes !== undefined && row.restTimeMinutes !== null
                    ? Number(row.restTimeMinutes)
                    : undefined;
        const state = this.normalizeEventState(row.state);
        const organization = row.organization ?? row.organizationId;

        return {
            ...row,
            organization,
            // Computed properties
            attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
            restTimeMinutes: Number.isFinite(restTime) ? restTime : undefined,
            // Ensure divisions is always an array
            divisions: Array.isArray(row.divisions) ? row.divisions : [],
            status: row.status as EventStatus | undefined,
            state,
            leagueConfig: this.buildLeagueConfig(row),
        };
    }

    async getEventsForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Event[]> {
        const startFilter = this.normalizeDateInput(start);
        const endFilter = this.normalizeDateInput(end);

        const queries: string[] = [
            Query.contains('fieldIds', [fieldId]),
        ];

        if (startFilter) {
            queries.push(Query.greaterThanEqual('end', startFilter));
        }

        if (endFilter) {
            queries.push(Query.lessThanEqual('start', endFilter));
        }

        const response = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: EVENTS_TABLE_ID,
            queries,
        });

        const rows = response.rows ?? [];
        const events: Event[] = [];
        for (const row of rows) {
            await this.ensureSportRelationship(row);
            await this.ensureLeagueScoringConfig(row);
            events.push(this.mapRowToEvent(row));
        }

        return events;
    }

    async getMatchesForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Match[]> {
        const startFilter = this.normalizeDateInput(start);
        const endFilter = this.normalizeDateInput(end);

        const limit = 100;
        let offset = 0;
        const rows: any[] = [];

        while (true) {
            const queries: string[] = [Query.equal('fieldId', fieldId), Query.orderAsc('start'), Query.limit(limit)];
            if (startFilter) {
                queries.push(Query.greaterThanEqual('end', startFilter));
            }
            if (endFilter) {
                queries.push(Query.lessThanEqual('start', endFilter));
            }
            if (offset > 0) {
                queries.push(Query.offset(offset));
            }

            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: MATCHES_TABLE_ID,
                queries,
            });

            const batch = response.rows ?? [];
            rows.push(...batch);
            if (batch.length < limit) {
                break;
            }
            offset += limit;
        }

        if (!rows.length) {
            return [];
        }

        const teamIds = new Set<string>();
        const eventIds = new Set<string>();

        rows.forEach((row) => {
            if (typeof row.team1Id === 'string') {
                teamIds.add(row.team1Id);
            }
            if (typeof row.team2Id === 'string') {
                teamIds.add(row.team2Id);
            }
            if (typeof row.refereeId === 'string') {
                teamIds.add(row.refereeId);
            }
            if (typeof row.eventId === 'string') {
                eventIds.add(row.eventId);
            }
        });

        const [teams, fields, events] = await Promise.all([
            this.fetchTeamsByIds(Array.from(teamIds)),
            this.fetchFieldsByIds([fieldId]),
            this.fetchEventsByIds(Array.from(eventIds)),
        ]);

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const fieldsById = new Map(fields.map((field) => [field.$id, field]));
        const eventsById = new Map(events.map((event) => [event.$id, event]));

        return rows.map((row) => {
            const match = this.mapMatchRecord(row, { teamsById, fieldsById });
            const eventId = typeof row.eventId === 'string' ? row.eventId : undefined;
            if (eventId && eventsById.has(eventId)) {
                match.event = eventsById.get(eventId);
            }
            return match;
        });
    }

    async mapRowFromDatabase(row: any, includeRelations: boolean = false): Promise<Event> {
        await this.ensureSportRelationship(row);
        await this.ensureLeagueScoringConfig(row);
        const event = this.mapRowToEvent(row);
        if (includeRelations) {
            return this.hydrateEventRelations(event, row);
        }
        return event;
    }

    private async hydrateEventRelations(event: Event, source: any): Promise<Event> {
        const data = source ?? event;

        const teamIds = this.extractStringIds(data.teamIds ?? event.teamIds ?? []);
        const fieldIds = this.extractStringIds(data.fieldIds ?? event.fieldIds ?? []);
        const timeSlotIds = this.extractStringIds(data.timeSlotIds ?? event.timeSlotIds ?? []);
        const playerIds = this.extractStringIds(data.playerIds ?? data.userIds ?? event.playerIds ?? []);

        const [teams, players, fields, timeSlots, organization] = await Promise.all([
            this.resolveTeams(data.teams, teamIds),
            this.resolvePlayers(data.players, playerIds),
            this.resolveFields(data.fields, fieldIds),
            this.resolveTimeSlots(data.timeSlots, timeSlotIds),
            this.resolveOrganization(data.organization ?? data.organizationId ?? event.organization),
        ]);

        const matches = await this.resolveMatches(event, data.matches, teams, fields);

        const matchesByField = new Map<string, Match[]>();
        matches.forEach((match) => {
            const fieldId = match.field?.$id;
            if (!fieldId) {
                return;
            }
            const bucket = matchesByField.get(fieldId) ?? [];
            bucket.push(match);
            matchesByField.set(fieldId, bucket);
        });

        fields.forEach((field) => {
            field.matches = matchesByField.get(field.$id) ?? [];
        });

        event.teams = teams;
        event.players = players;
        event.fields = fields;
        event.timeSlots = timeSlots;
        event.matches = matches;
        if (organization) {
            event.organization = organization;
        }

        return event;
    }

    private extractStringIds(value: unknown): string[] {
        if (!value) {
            return [];
        }
        if (Array.isArray(value)) {
            return Array.from(
                new Set(
                    value
                        .map((item) => {
                            if (typeof item === 'string') return item;
                            if (item && typeof item === 'object' && '$id' in item) {
                                return (item as { $id?: string }).$id ?? '';
                            }
                            return '';
                        })
                        .filter((id): id is string => Boolean(id && typeof id === 'string')),
                ),
            );
        }
        if (typeof value === 'string') {
            return [value];
        }
        return [];
    }

    private chunkIds(ids: string[], size: number = 100): string[][] {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += size) {
            chunks.push(ids.slice(i, i + size));
        }
        return chunks;
    }

    private async resolveTeams(existing: any, ids: string[]): Promise<Team[]> {
        if (Array.isArray(existing) && existing.length) {
            return existing.map((entry) => this.mapTeamRow(entry));
        }
        if (!ids.length) {
            return [];
        }
        return this.fetchTeamsByIds(ids);
    }

    private async fetchTeamsByIds(ids: string[]): Promise<Team[]> {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        if (!unique.length) {
            return [];
        }

        const responses = await Promise.all(
            this.chunkIds(unique).map((batch) =>
                databases.listRows({
                    databaseId: DATABASE_ID,
                    tableId: TEAMS_TABLE_ID,
                    queries: [Query.equal('$id', batch)],
                }),
            ),
        );

        return responses.flatMap((response) => (response.rows ?? []).map((row: any) => this.mapTeamRow(row)));
    }

    private mapTeamRow(row: any): Team {
        const playerIds = Array.isArray(row.playerIds) ? row.playerIds.map(String) : [];
        const pending = Array.isArray(row.pending) ? row.pending.map(String) : [];
        const teamSize =
            typeof row.teamSize === 'number'
                ? row.teamSize
                : Number.isFinite(Number(row.teamSize))
                ? Number(row.teamSize)
                : playerIds.length;
        const wins = typeof row.wins === 'number' ? row.wins : Number(row.wins ?? 0);
        const losses = typeof row.losses === 'number' ? row.losses : Number(row.losses ?? 0);
        const seed = typeof row.seed === 'number' ? row.seed : Number(row.seed ?? 0);

        let division: any = 'Open';
        if (row.division && typeof row.division === 'object' && ('name' in row.division || 'id' in row.division)) {
            division = row.division;
        } else if (typeof row.division === 'string' && row.division.trim()) {
            division = row.division;
        }

        const team: Team = {
            $id: String(row.$id ?? row.id ?? ''),
            name: row.name ?? '',
            seed,
            division,
            sport: typeof row.sport === 'string' ? row.sport : row.sport?.name ?? '',
            wins,
            losses,
            playerIds,
            captainId:
                typeof row.captainId === 'string'
                    ? row.captainId
                    : row.captain && typeof row.captain === 'object'
                    ? (row.captain as { $id?: string }).$id ?? undefined
                    : undefined,
            pending,
            teamSize,
            profileImageId: row.profileImage || row.profileImageId || row.profileImageID,
            $createdAt: row.$createdAt,
            $updatedAt: row.$updatedAt,
            winRate: 0,
            currentSize: playerIds.length,
            isFull: playerIds.length >= teamSize,
            avatarUrl: '',
        };

        team.winRate = getTeamWinRate(team);
        team.avatarUrl = getTeamAvatarUrl(team);
        return team;
    }

    private async resolvePlayers(existing: any, ids: string[]): Promise<UserData[]> {
        if (Array.isArray(existing) && existing.length) {
            return existing.map((entry) => ({
                ...entry,
                fullName: `${entry.firstName || ''} ${entry.lastName || ''}`.trim(),
                avatarUrl: entry.avatarUrl ?? '',
            })) as UserData[];
        }
        if (!ids.length) {
            return [];
        }
        return userService.getUsersByIds(ids);
    }

    private async resolveFields(existing: any, ids: string[]): Promise<Field[]> {
        if (Array.isArray(existing) && existing.length) {
            const fields = existing.map((entry) => this.mapFieldRow(entry));
            await this.hydrateFieldRentalSlots(fields);
            return fields;
        }
        if (!ids.length) {
            return [];
        }
        return this.fetchFieldsByIds(ids);
    }

    private async fetchFieldsByIds(ids: string[]): Promise<Field[]> {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        if (!unique.length) {
            return [];
        }

        const responses = await Promise.all(
            this.chunkIds(unique).map((batch) =>
                databases.listRows({
                    databaseId: DATABASE_ID,
                    tableId: FIELDS_TABLE_ID,
                    queries: [Query.equal('$id', batch)],
                }),
            ),
        );

        const fields = responses.flatMap((response) => (response.rows ?? []).map((row: any) => this.mapFieldRow(row)));
        await this.hydrateFieldRentalSlots(fields);
        return fields;
    }

    private mapFieldRow(row: any): Field {
        const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat ?? 0);
        const long = typeof row.long === 'number' ? row.long : Number(row.long ?? 0);
        const fieldNumber = typeof row.fieldNumber === 'number' ? row.fieldNumber : Number(row.fieldNumber ?? 0);
        const rentalSlotIds = Array.isArray(row.rentalSlotIds)
            ? row.rentalSlotIds.map((value: unknown) => String(value))
            : undefined;

        const field: Field = {
            $id: String(row.$id ?? row.id ?? ''),
            name: row.name ?? '',
            location: row.location ?? '',
            lat: Number.isFinite(lat) ? lat : 0,
            long: Number.isFinite(long) ? long : 0,
            type: row.type ?? '',
            fieldNumber: Number.isFinite(fieldNumber) ? fieldNumber : 0,
            divisions: Array.isArray(row.divisions) ? row.divisions : undefined,
            organization: row.organization ?? row.organizationId ?? undefined,
            rentalSlotIds,
        } as Field;

        return field;
    }

    private async hydrateFieldRentalSlots(fields: Field[]): Promise<void> {
        const allIds = Array.from(
            new Set(
                fields.flatMap((field) => (Array.isArray(field.rentalSlotIds) ? field.rentalSlotIds : [])),
            ),
        );

        if (!allIds.length) {
            fields.forEach((field) => {
                if (!field.rentalSlots) {
                    field.rentalSlots = [];
                }
            });
            return;
        }

        const slots = await this.fetchTimeSlotsByIds(allIds);
        const slotMap = new Map(slots.map((slot) => [slot.$id, slot]));

        fields.forEach((field) => {
            const ids = field.rentalSlotIds ?? [];
            field.rentalSlots = ids.map((id) => slotMap.get(id)).filter((slot): slot is TimeSlot => Boolean(slot));
        });
    }

    private async resolveTimeSlots(existing: any, ids: string[]): Promise<TimeSlot[]> {
        if (Array.isArray(existing) && existing.length) {
            return existing.map((entry) => this.mapRowToTimeSlot(entry));
        }
        if (!ids.length) {
            return [];
        }
        return this.fetchTimeSlotsByIds(ids);
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

    private async resolveMatches(event: Event, existing: any, teams: Team[], fields: Field[]): Promise<Match[]> {
        const rows = Array.isArray(existing) && existing.length ? existing : await this.fetchMatchesByEventId(event.$id);
        if (!rows.length) {
            return [];
        }

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const fieldsById = new Map(fields.map((field) => [field.$id, field]));

        return (rows as any[]).map((row) => {
            const match = this.mapMatchRecord(row, { teamsById, fieldsById });
            match.event = event;
            return match;
        });
    }

    private async fetchMatchesByEventId(eventId: string): Promise<any[]> {
        const results: any[] = [];
        let offset = 0;
        const limit = 100;

        while (true) {
            const queries: string[] = [Query.equal('eventId', eventId), Query.limit(limit)];
            if (offset > 0) {
                queries.push(Query.offset(offset));
            }
            const response = await databases.listRows({
                databaseId: DATABASE_ID,
                tableId: MATCHES_TABLE_ID,
                queries,
            });
            const rows = response.rows ?? [];
            results.push(...rows);
            if (rows.length < limit) {
                break;
            }
            offset += limit;
        }

        return results;
    }

    private async fetchEventsByIds(ids: string[]): Promise<Event[]> {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        if (!unique.length) {
            return [];
        }

        const responses = await Promise.all(
            this.chunkIds(unique).map((batch) =>
                databases.listRows({
                    databaseId: DATABASE_ID,
                    tableId: EVENTS_TABLE_ID,
                    queries: [Query.equal('$id', batch)],
                }),
            ),
        );

        const events: Event[] = [];
        for (const row of responses.flatMap((response) => response.rows ?? [])) {
            await this.ensureSportRelationship(row);
            await this.ensureLeagueScoringConfig(row);
            events.push(this.mapRowToEvent(row));
        }

        return events;
    }

    private async resolveOrganization(input: unknown): Promise<Organization | string | undefined> {
        if (!input) {
            return undefined;
        }

        if (typeof input === 'string') {
            return this.fetchOrganizationById(input);
        }

        if (typeof input === 'object' && '$id' in (input as Record<string, unknown>)) {
            return this.mapOrganizationRow(input as any);
        }

        return undefined;
    }

    private async fetchOrganizationById(id: string): Promise<Organization | undefined> {
        if (!id) {
            return undefined;
        }

        try {
            const row = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: ORGANIZATIONS_TABLE_ID,
                rowId: id,
            });
            return this.mapOrganizationRow(row);
        } catch (error) {
            console.error('Failed to fetch organization:', error);
            return undefined;
        }
    }

    private mapOrganizationRow(row: any): Organization {
        const coordinates = Array.isArray(row.coordinates)
            ? (row.coordinates.slice(0, 2).map((value: unknown) => Number(value)) as [number, number])
            : undefined;

        return {
            $id: String(row.$id ?? row.id ?? ''),
            name: row.name ?? '',
            description: row.description ?? undefined,
            website: row.website ?? undefined,
            logoId: row.logoId ?? undefined,
            location: row.location ?? undefined,
            coordinates: coordinates,
            ownerId: row.ownerId ?? undefined,
            hasStripeAccount: typeof row.hasStripeAccount === 'boolean' ? row.hasStripeAccount : Boolean(row.hasStripeAccount),
            $createdAt: row.$createdAt,
            $updatedAt: row.$updatedAt,
        };
    }

    private async ensureLeagueScoringConfig(row: any): Promise<void> {
        if (row?.leagueScoringConfig && typeof row.leagueScoringConfig === 'object') {
            return;
        }

        const configId =
            typeof row?.leagueScoringConfig === 'string'
                ? row.leagueScoringConfig
                : typeof row?.leagueScoringConfigId === 'string'
                ? row.leagueScoringConfigId
                : undefined;

        if (!configId) {
            row.leagueScoringConfig = null;
            return;
        }

        try {
            const config = await databases.getRow({
                databaseId: DATABASE_ID,
                tableId: LEAGUE_SCORING_CONFIG_TABLE_ID,
                rowId: configId,
            });
            row.leagueScoringConfig = config;
        } catch (error) {
            console.error('Failed to fetch league scoring config:', error);
            row.leagueScoringConfig = null;
        }
    }

    private mapMatchRecord(
        input: any,
        context?: { teamsById?: Map<string, Team>; fieldsById?: Map<string, Field> },
    ): Match {
        const eventId =
            typeof input.eventId === 'string'
                ? input.eventId
                : input.event && typeof input.event === 'object' && '$id' in input.event
                ? (input.event as { $id?: string }).$id ?? undefined
                : undefined;

        const fieldId =
            typeof input.fieldId === 'string'
                ? input.fieldId
                : typeof input.field === 'string'
                ? input.field
                : input.field && typeof input.field === 'object' && '$id' in input.field
                ? (input.field as { $id?: string }).$id ?? undefined
                : undefined;

        const team1Id =
            typeof input.team1Id === 'string'
                ? input.team1Id
                : typeof input.team1 === 'string'
                ? input.team1
                : input.team1 && typeof input.team1 === 'object' && '$id' in input.team1
                ? (input.team1 as { $id?: string }).$id ?? undefined
                : undefined;

        const team2Id =
            typeof input.team2Id === 'string'
                ? input.team2Id
                : typeof input.team2 === 'string'
                ? input.team2
                : input.team2 && typeof input.team2 === 'object' && '$id' in input.team2
                ? (input.team2 as { $id?: string }).$id ?? undefined
                : undefined;

        const refereeId =
            typeof input.refereeId === 'string'
                ? input.refereeId
                : typeof input.referee === 'string'
                ? input.referee
                : input.referee && typeof input.referee === 'object' && '$id' in input.referee
                ? (input.referee as { $id?: string }).$id ?? undefined
                : undefined;

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
            winnerNextMatchId:
                input.winnerNextMatchId ?? (input.winnerNextMatch ? (input.winnerNextMatch as Match).$id : undefined),
            loserNextMatchId:
                input.loserNextMatchId ?? (input.loserNextMatch ? (input.loserNextMatch as Match).$id : undefined),
            field: fieldId ? context?.fieldsById?.get(fieldId) : undefined,
            event: input?.event as Event,
        };

        if (input.division) {
            match.division = input.division;
        }

        if (team1Id && context?.teamsById?.has(team1Id)) {
            match.team1 = context.teamsById.get(team1Id);
        } else if (input.team1 && typeof input.team1 === 'object') {
            match.team1 = input.team1 as Team;
        }

        if (team2Id && context?.teamsById?.has(team2Id)) {
            match.team2 = context.teamsById.get(team2Id);
        } else if (input.team2 && typeof input.team2 === 'object') {
            match.team2 = input.team2 as Team;
        }

        if (refereeId && context?.teamsById?.has(refereeId)) {
            match.referee = context.teamsById.get(refereeId);
        } else if (input.referee && typeof input.referee === 'object') {
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

        if (!match.field && fieldId && context?.fieldsById) {
            match.field = context.fieldsById.get(fieldId);
        }

        match.eventId = eventId;
        match.fieldId = fieldId ?? null;
        match.team1Id = team1Id ?? null;
        match.team2Id = team2Id ?? null;
        match.refereeId = refereeId ?? null;
        match.refereeCheckedIn = match.refereeCheckedIn ?? input.refereeCheckedIn ?? undefined;

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
            pointsToVictory: Array.isArray(row.pointsToVictory) ? (row.pointsToVictory as number[]) : undefined,
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

    private async ensureSportRelationship(row: any): Promise<void> {
        if (row?.sport && typeof row.sport === 'object' && '$id' in row.sport) {
            return;
        }

        const sportId =
            (row?.sport && typeof row.sport === 'string' ? row.sport : undefined) ??
            (typeof row?.sportId === 'string' ? row.sportId : undefined);

        if (!sportId) {
            throw new Error('Event record is missing sport relationship data.');
        }

        let sportsMap = await this.getSportsMap();
        let sport = sportsMap.get(sportId);

        if (!sport) {
            sportsMap = await this.refreshSportsMap();
            sport = sportsMap.get(sportId);
        }

        if (!sport) {
            throw new Error(`Sport with id ${sportId} could not be resolved.`);
        }

        row.sport = sport;
    }

    private async getSportsMap(): Promise<Map<string, Sport>> {
        if (this.sportsCache) {
            return this.sportsCache;
        }

        if (!this.sportsCachePromise) {
            this.sportsCachePromise = sportsService.getAll().then((sports) => {
                const map = new Map<string, Sport>();
                sports.forEach((sport) => {
                    if (sport.$id) {
                        map.set(sport.$id, sport);
                    }
                });
                this.sportsCache = map;
                return map;
            }).finally(() => {
                this.sportsCachePromise = null;
            });
        }

        return this.sportsCachePromise;
    }

    private async refreshSportsMap(): Promise<Map<string, Sport>> {
        this.sportsCache = null;
        this.sportsCachePromise = null;

        const sports = await sportsService.getAll();
        const map = new Map<string, Sport>();
        sports.forEach((sport) => {
            if (sport.$id) {
                map.set(sport.$id, sport);
            }
        });
        this.sportsCache = map;
        return map;
    }

    private resolveSport(input: unknown): Sport {
        if (!input || typeof input !== 'object') {
            throw new Error('Event record is missing sport relationship data.');
        }

        const sport = input as Sport;
        if (!sport.$id || !sport.name) {
            throw new Error('Sport relationship is missing required fields.');
        }

        return sport;
    }

    private resolveLeagueScoringConfig(input: unknown): LeagueScoringConfig | null {
        if (!input || typeof input !== 'object') {
            return null;
        }
        return input as LeagueScoringConfig;
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
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
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
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
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
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
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

            const rows = response.rows ?? [];
            const events: Event[] = [];
            for (const row of rows) {
                await this.ensureSportRelationship(row);
                await this.ensureLeagueScoringConfig(row);
                events.push(this.mapRowToEvent(row));
            }

            let filtered = events;

            if (filters.sports && filters.sports.length > 0) {
                const lower = filters.sports.map((sport) => sport.toLowerCase());
                filtered = filtered.filter(
                    (event) => event.sport && lower.includes(event.sport.name.toLowerCase()),
                );
            }

            // Apply client-side filtering
            if (filters.query) {
                const searchTerm = filters.query.toLowerCase();
                filtered = filtered.filter(event =>
                    event.name.toLowerCase().includes(searchTerm) ||
                    event.description.toLowerCase().includes(searchTerm) ||
                    event.location.toLowerCase().includes(searchTerm) ||
                    (event.sport?.name ?? '').toLowerCase().includes(searchTerm)
                );
            }

            return filtered;
        } catch (error) {
            console.error('Failed to fetch paginated events:', error);
            throw new Error('Failed to load events');
        }
    }
}

export const eventService = new EventService();
