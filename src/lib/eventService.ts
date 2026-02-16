import { apiRequest } from './apiClient';
import {
    Event,
    EventType,
    Field,
    LocationCoordinates,
    Team,
    UserData,
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
    toEventPayload,
} from '@/types';
import { ensureLocalDateTimeString } from '@/lib/dateUtils';
import { sportsService } from '@/lib/sportsService';
import { userService } from '@/lib/userService';
import { buildPayload } from './utils';
import { normalizeEnumValue } from '@/lib/enumUtils';
import { createId } from '@/lib/id';
import { LeagueScheduleResponse } from './leagueService';
import { normalizeApiEvent, normalizeApiMatch, normalizeOutgoingEventDocument } from './apiMappers';


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
    error?: string | null;
}

export interface EventFilters {
    query?: string;
    maxDistance?: number;
    userLocation?: LocationCoordinates;
    dateFrom?: string;
    dateTo?: string;
    priceMax?: number;
    eventTypes?: EventType[];
    sports?: string[];
    divisions?: string[];
}

class EventService {
    /**
     * Get event with all relationships expanded (matching Python backend approach)
     * This fetches all related data in a single database call using hydrated relationships
     */
    private sportsCache: Map<string, Sport> | null = null;
    private sportsCachePromise: Promise<Map<string, Sport>> | null = null;
    async getEventWithRelations(id: string): Promise<Event | undefined> {
        try {
            const response = await apiRequest<any>(`/api/events/${id}`);
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
            const response = await apiRequest<any>(`/api/events/${id}`);

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

    async updateEventParticipants(eventId: string, updates: { userIds: string[], teamIds: string[] }): Promise<Event> {
        try {
            const response = await apiRequest<any>(`/api/events/${eventId}`, {
                method: 'PATCH',
                body: { event: updates },
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
            const payload = toEventPayload(eventData as Event)
            const response = await apiRequest<any>(`/api/events/${eventId}`, {
                method: 'PATCH',
                body: { event: payload },
            });

            const hydrated = await this.getEvent(eventId);
            if (hydrated) {
                return hydrated;
            }

            if (response?.$id || response?.id) {
                return this.mapRowToEvent(response);
            }

            throw new Error('Failed to hydrate updated event');
        } catch (error) {
            console.error('Failed to update event:', error);
            throw error;
        }
    }

    async deleteEvent(event: Event): Promise<boolean> {
        try {
            const normalizedEvent = this.withNormalizedReferees(this.withNormalizedEventEnums(event));
            const payload = buildPayload(normalizedEvent);
            if (Object.prototype.hasOwnProperty.call(normalizedEvent, 'refereeIds')) {
                payload.refereeIds = normalizedEvent.refereeIds ?? [];
            }
            await apiRequest(`/api/events/${event.$id}`, {
                method: 'DELETE',
                body: { event: payload },
            });
            return true;
        } catch (error) {
            console.error('Failed to delete event:', error);
            return false;
        }
    }

    async deleteUnpublishedEvent(event: Event): Promise<void> {
        try {
            await apiRequest(`/api/events/${event.$id}`, {
                method: 'DELETE',
                body: { event },
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
                await apiRequest(`/api/fields/${field.$id}`, { method: 'DELETE' });
            })
        );

        const failures = deletionResults.filter((result) => result.status === 'rejected');
        if (failures.length) {
            console.error(`Failed to delete ${failures.length} field(s) for unpublished event ${event.$id}.`);
            throw new Error('Failed to delete fields for unpublished event');
        }
    }
    
      async scheduleEvent(
        eventDocument: Record<string, any>,
        options: { participantCount?: number; eventId?: string } = {},
      ): Promise<LeagueScheduleResponse> {
        const normalizedDocument = normalizeOutgoingEventDocument(eventDocument);
        const payload: Record<string, any> = { eventDocument: normalizedDocument };

        if (typeof options.participantCount === 'number') {
          payload.participantCount = options.participantCount;
        }

        const path = options.eventId ? `/api/events/${options.eventId}/schedule` : '/api/events/schedule';
        const result = await apiRequest<{
          preview?: boolean;
          event?: Event;
          matches?: Match[];
        }>(path, {
          method: 'POST',
          body: payload,
        });

        const normalizedMatches = Array.isArray(result?.matches)
          ? result.matches.map((match) => normalizeApiMatch(match))
          : undefined;
        const normalizedEvent = result?.event ? normalizeApiEvent(result.event) ?? undefined : undefined;

        if (normalizedEvent && normalizedMatches) {
          normalizedEvent.matches = normalizedMatches;
        }

        return {
          preview: typeof result?.preview === 'boolean' ? result.preview : false,
          event: normalizedEvent,
        };
      }

    async createEvent(newEvent: Partial<Event>): Promise<Event> {
        try {
            const normalizedEvent = this.withNormalizedReferees(this.withNormalizedEventEnums(newEvent));
            const payload = buildPayload(normalizedEvent);
            if (Object.prototype.hasOwnProperty.call(normalizedEvent, 'refereeIds')) {
                payload.refereeIds = normalizedEvent.refereeIds ?? [];
            }
            const response = await apiRequest<any>('/api/events', {
                method: 'POST',
                body: { event: payload, id: payload.$id ?? payload.id ?? createId() },
            });

            const createdEvent = response?.event ?? response;
            if (createdEvent?.$id || createdEvent?.id) {
                return await this.mapRowFromDatabase(createdEvent, true);
            }

            const eventId = response?.eventId ?? response?.id;
            if (eventId) {
                const hydrated = await this.getEvent(String(eventId));
                if (hydrated) {
                    return hydrated;
                }
            }

            throw new Error('Failed to hydrate created event');
        } catch (error) {
            console.error('Failed to create event:', error);
            throw error;
        }
    }


    private withNormalizedEventEnums<T extends Partial<Event>>(event: T): T {
        const normalizedEventType = normalizeEnumValue(event.eventType);
        return {
            ...event,
            ...(normalizedEventType ? { eventType: normalizedEventType as Event['eventType'] } : {}),
        };
    }

    private withNormalizedReferees<T extends Partial<Event>>(event: T): T {
        const explicitRefereeIds = Array.isArray(event.refereeIds)
            ? event.refereeIds.map((id) => String(id))
            : event.refereeIds === undefined
                ? undefined
                : [];

        if (explicitRefereeIds !== undefined) {
            return { ...event, refereeIds: explicitRefereeIds } as T;
        }

        if (Array.isArray((event as any).referees)) {
            const derived = (event as any).referees
                .map((ref: any) => {
                    if (typeof ref === 'string') return ref;
                    if (ref && typeof ref === 'object' && '$id' in ref) {
                        return (ref as { $id?: string }).$id ?? '';
                    }
                    return '';
                })
                .filter((id: string) => Boolean(id));
            return { ...event, refereeIds: derived } as T;
        }

        return event;
    }

    private normalizeEventState(value: unknown): EventState {
        if (typeof value === 'string') {
            const normalized = value.toUpperCase();
            if (normalized === 'PUBLISHED' || normalized === 'UNPUBLISHED' || normalized === 'TEMPLATE') {
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
        const state = this.normalizeEventState(row.state);
        const organization = row.organization ?? row.organizationId;
        const normalizedEventType =
            normalizeEnumValue(row.eventType) ??
            (typeof row.eventType === 'string' ? row.eventType.toUpperCase() : undefined);
        const normalizeAge = (value: unknown): number | undefined => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : undefined;
            }
            return undefined;
        };

        return {
            $id: row.$id,
            name: row.name,
            description: row.description,
            start: row.start,
            end: row.end,
            location: row.location,
            coordinates: row.coordinates,
            price: row.price,
            minAge: normalizeAge(row.minAge),
            maxAge: normalizeAge(row.maxAge),
            rating: row.rating,
            imageId: row.imageId,
            hostId: row.hostId,
            maxParticipants: row.maxParticipants,
            teamSizeLimit: row.teamSizeLimit,
            restTimeMinutes: row.restTimeMinutes,
            teamSignup: row.teamSignup,
            singleDivision: row.singleDivision,
            registrationByDivisionType: Boolean(row.registrationByDivisionType),
            waitListIds: row.waitListIds,
            freeAgentIds: row.freeAgentIds,
            teamIds: row.teamIds,
            userIds: Array.isArray(row.userIds) ? row.userIds.map(String) : [],
            fieldIds: row.fieldIds,
            timeSlotIds: row.timeSlotIds,
            refereeIds: Array.isArray(row.refereeIds) ? row.refereeIds.map((id: unknown) => String(id)) : [],
            waitList: row.waitList,
            freeAgents: row.freeAgents,
            cancellationRefundHours: row.cancellationRefundHours,
            registrationCutoffHours: row.registrationCutoffHours,
            seedColor: row.seedColor,
            $createdAt: row.$createdAt,
            $updatedAt: row.$updatedAt,
            eventType: (normalizedEventType ?? 'EVENT') as EventType,
            sport: row.sport,
            sportId: row.sportId,
            leagueScoringConfigId: row.leagueScoringConfigId,
            organizationId: row.organizationId,
            requiredTemplateIds: Array.isArray(row.requiredTemplateIds)
                ? row.requiredTemplateIds.map((id: unknown) => String(id))
                : [],
            divisions: row.divisions,
            divisionDetails: Array.isArray(row.divisionDetails)
                ? row.divisionDetails.map((entry: any) => ({
                    id: String(entry?.id ?? entry?.$id ?? ''),
                    name: String(entry?.name ?? entry?.id ?? ''),
                    key: typeof entry?.key === 'string' ? entry.key : undefined,
                    divisionTypeId: typeof entry?.divisionTypeId === 'string' ? entry.divisionTypeId : undefined,
                    divisionTypeName: typeof entry?.divisionTypeName === 'string' ? entry.divisionTypeName : undefined,
                    ratingType:
                        entry?.ratingType === 'AGE' || entry?.ratingType === 'SKILL'
                            ? entry.ratingType
                            : undefined,
                    gender:
                        entry?.gender === 'M' || entry?.gender === 'F' || entry?.gender === 'C'
                            ? entry.gender
                            : undefined,
                    sportId: typeof entry?.sportId === 'string' ? entry.sportId : undefined,
                    fieldIds: Array.isArray(entry?.fieldIds)
                        ? entry.fieldIds.map((fieldId: unknown) => String(fieldId)).filter(Boolean)
                        : [],
                    ageCutoffDate: typeof entry?.ageCutoffDate === 'string' ? entry.ageCutoffDate : undefined,
                    ageCutoffLabel: typeof entry?.ageCutoffLabel === 'string' ? entry.ageCutoffLabel : undefined,
                    ageCutoffSource: typeof entry?.ageCutoffSource === 'string' ? entry.ageCutoffSource : undefined,
                })).filter((entry: any) => entry.id.length > 0)
                : undefined,
            divisionFieldIds:
                row.divisionFieldIds && typeof row.divisionFieldIds === 'object'
                    ? Object.fromEntries(
                        Object.entries(row.divisionFieldIds as Record<string, unknown>).map(([key, value]) => [
                            key,
                            Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [],
                        ]),
                    )
                    : undefined,
            timeSlots: row.timeSlots,
            referees: Array.isArray(row.referees) ? (row.referees as UserData[]) : undefined,
            doubleElimination: row.doubleElimination,
            winnerSetCount: row.winnerSetCount,
            loserSetCount: row.loserSetCount,
            winnerBracketPointsToVictory: row.winnerBracketPointsToVictory,
            loserBracketPointsToVictory: row.loserBracketPointsToVictory,
            prize: row.prize,
            fieldCount: row.fieldCount,
            gamesPerOpponent: row.gamesPerOpponent,
            includePlayoffs: row.includePlayoffs,
            playoffTeamCount: row.playoffTeamCount,
            usesSets: row.usesSets,
            matchDurationMinutes: row.matchDurationMinutes,
            setDurationMinutes: row.setDurationMinutes,
            setsPerMatch: row.setsPerMatch,
            doTeamsRef: typeof row.doTeamsRef === 'boolean' ? row.doTeamsRef : undefined,
            refType: row.refType,
            pointsToVictory: row.pointsToVictory,
            allowPaymentPlans: !!row.allowPaymentPlans,
            installmentCount: row.installmentCount,
            installmentDueDates: row.installmentDueDates,
            installmentAmounts: row.installmentAmounts,
            allowTeamSplitDefault: row.allowTeamSplitDefault,

            // Computed properties
            organization,
            // Computed properties
            attendees: row.teamSignup
                ? (Array.isArray(row.teamIds) ? row.teamIds.length : 0)
                : (Array.isArray(row.userIds) ? row.userIds.length : 0),
            status: row.status as EventStatus | undefined,
            state,
            leagueConfig: this.buildLeagueConfig(row),
            leagueScoringConfig: row.leagueScoringConfig
        };
    }

    async getEventsForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Event[]> {
        const startFilter = this.normalizeDateInput(start) ?? undefined;
        const endFilter = this.normalizeDateInput(end) ?? undefined;
        const params = new URLSearchParams();
        if (startFilter) params.set('start', startFilter);
        if (endFilter) params.set('end', endFilter);

        const response = await apiRequest<{ events?: any[] }>(`/api/events/field/${fieldId}?${params.toString()}`);
        const rows = Array.isArray(response?.events) ? response.events : [];

        const events: Event[] = [];
        for (const row of rows) {
            await this.ensureSportRelationship(row);
            await this.ensureLeagueScoringConfig(row);
            events.push(this.mapRowToEvent(row));
        }

        return events;
    }

    async getMatchesForFieldInRange(fieldId: string, start: Date | string, end: Date | string | null = null): Promise<Match[]> {
        const startFilter = this.normalizeDateInput(start) ?? undefined;
        const endFilter = this.normalizeDateInput(end) ?? undefined;
        const params = new URLSearchParams();
        if (startFilter) params.set('start', startFilter);
        if (endFilter) params.set('end', endFilter);

        const response = await apiRequest<{ matches?: any[] }>(`/api/fields/${fieldId}/matches?${params.toString()}`);
        const rows = Array.isArray(response?.matches) ? response.matches : [];

        if (!rows.length) {
            return [];
        }

        const teamIds = new Set<string>();
        const refereeUserIds = new Set<string>();

        rows.forEach((row) => {
            if (typeof row.team1Id === 'string') {
                teamIds.add(row.team1Id);
            }
            if (typeof row.team2Id === 'string') {
                teamIds.add(row.team2Id);
            }
            if (typeof row.teamRefereeId === 'string') {
                teamIds.add(row.teamRefereeId);
            }
            if (typeof row.refereeId === 'string') {
                refereeUserIds.add(row.refereeId);
                teamIds.add(row.refereeId);
            }
        });

        const [teams, referees] = await Promise.all([
            this.fetchTeamsByIds(Array.from(teamIds)),
            userService.getUsersByIds(Array.from(refereeUserIds)),
        ]);

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const refereesById = new Map(referees.map((ref) => [ref.$id, ref]));

        return rows.map((row) => {
            return this.mapMatchRecord(row, { teamsById, refereesById });
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
        const userIds = this.extractStringIds(data.userIds ?? event.userIds ?? []);
        const refereeIds = this.extractStringIds(data.refereeIds ?? event.refereeIds ?? []);

        const [teams, players, fields, timeSlots, organization, referees] = await Promise.all([
            this.resolveTeams(data.teams, teamIds),
            this.resolvePlayers(data.players, userIds),
            this.resolveFields(data.fields, fieldIds),
            this.resolveTimeSlots(data.timeSlots, timeSlotIds),
            this.resolveOrganization(data.organization ?? data.organizationId ?? event.organization),
            this.resolvePlayers(data.referees, refereeIds),
        ]);

        const matches = await this.resolveMatches(event, data.matches, teams, fields, referees);

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
        event.refereeIds = refereeIds;
        event.referees = referees;
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
            this.chunkIds(unique).map((batch) => {
                const params = new URLSearchParams();
                params.set('ids', batch.join(','));
                return apiRequest<{ teams?: any[] }>(`/api/teams?${params.toString()}`);
            }),
        );

        return responses.flatMap((response) => (response?.teams ?? []).map((row: any) => this.mapTeamRow(row)));
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
            divisionTypeId:
                typeof row.divisionTypeId === 'string' && row.divisionTypeId.trim().length > 0
                    ? row.divisionTypeId
                    : undefined,
            divisionTypeName:
                typeof row.divisionTypeName === 'string' && row.divisionTypeName.trim().length > 0
                    ? row.divisionTypeName
                    : undefined,
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
            managerId:
                typeof row.managerId === 'string' && row.managerId.trim().length > 0
                    ? row.managerId
                    : (
                        typeof row.captainId === 'string'
                            ? row.captainId
                            : row.captain && typeof row.captain === 'object'
                                ? (row.captain as { $id?: string }).$id ?? undefined
                                : undefined
                    ),
            coachIds: Array.isArray(row.coachIds)
                ? row.coachIds.map(String)
                : [],
            parentTeamId:
                typeof row.parentTeamId === 'string' && row.parentTeamId.trim().length > 0
                    ? row.parentTeamId
                    : null,
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
            this.chunkIds(unique).map((batch) => {
                const params = new URLSearchParams();
                params.set('ids', batch.join(','));
                return apiRequest<{ fields?: any[] }>(`/api/fields?${params.toString()}`);
            }),
        );

        const fields = responses.flatMap((response) => (response?.fields ?? []).map((row: any) => this.mapFieldRow(row)));
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
            this.chunkIds(unique).map((batch) => {
                const params = new URLSearchParams();
                params.set('ids', batch.join(','));
                return apiRequest<{ timeSlots?: any[] }>(`/api/time-slots?${params.toString()}`);
            }),
        );

        return responses.flatMap((response) => (response?.timeSlots ?? []).map((row: any) => this.mapRowToTimeSlot(row)));
    }

    private async resolveMatches(
        event: Event,
        existing: any,
        teams: Team[],
        fields: Field[],
        referees: UserData[] = [],
    ): Promise<Match[]> {
        const rows = Array.isArray(existing) && existing.length ? existing : await this.fetchMatchesByEventId(event.$id);
        if (!rows.length) {
            return [];
        }

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const fieldsById = new Map(fields.map((field) => [field.$id, field]));
        const refereesById = new Map(referees.map((ref) => [ref.$id, ref]));

        const teamRefereeIds = new Set<string>();
        const refereeIds = new Set<string>();

        rows.forEach((row) => {
            if (typeof row.teamRefereeId === 'string') {
                teamRefereeIds.add(row.teamRefereeId);
            }
            if (typeof row.refereeId === 'string') {
                refereeIds.add(row.refereeId);
            }
        });

        const missingTeamRefIds = Array.from(teamRefereeIds).filter((id) => !teamsById.has(id));
        if (missingTeamRefIds.length) {
            const fetchedTeamRefs = await this.fetchTeamsByIds(missingTeamRefIds);
            fetchedTeamRefs.forEach((team) => teamsById.set(team.$id, team));
        }

        const missingRefereeIds = Array.from(refereeIds).filter((id) => !refereesById.has(id));
        if (missingRefereeIds.length) {
            const fetchedRefs = await userService.getUsersByIds(missingRefereeIds);
            fetchedRefs.forEach((ref) => refereesById.set(ref.$id, ref));
        }

        return (rows as any[]).map((row) => {
            const match = this.mapMatchRecord(row, { teamsById, fieldsById, refereesById });
            return match;
        });
    }

    private async fetchMatchesByEventId(eventId: string): Promise<any[]> {
        const response = await apiRequest<{ matches?: any[] }>(`/api/events/${eventId}/matches`);
        return Array.isArray(response?.matches) ? response.matches : [];
    }

    private async fetchEventsByIds(ids: string[]): Promise<Event[]> {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        if (!unique.length) {
            return [];
        }

        const responses = await Promise.all(
            this.chunkIds(unique).map((batch) => {
                const params = new URLSearchParams();
                params.set('ids', batch.join(','));
                return apiRequest<{ events?: any[] }>(`/api/events?${params.toString()}`);
            }),
        );

        const events: Event[] = [];
        for (const row of responses.flatMap((response) => response?.events ?? [])) {
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
            const row = await apiRequest<any>(`/api/organizations/${id}`);
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
            const config = await apiRequest<any>(`/api/league-scoring-configs/${configId}`);
            row.leagueScoringConfig = config;
        } catch (error) {
            console.error('Failed to fetch league scoring config:', error);
            row.leagueScoringConfig = null;
        }
    }

    private mapMatchRecord(
        input: any,
        context?: { teamsById?: Map<string, Team>; fieldsById?: Map<string, Field>; refereesById?: Map<string, UserData> },
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

        const teamRefereeId =
            typeof input.teamRefereeId === 'string'
                ? input.teamRefereeId
                : typeof input.teamReferee === 'string'
                    ? input.teamReferee
                    : input.teamReferee && typeof input.teamReferee === 'object' && '$id' in input.teamReferee
                        ? (input.teamReferee as { $id?: string }).$id ?? undefined
                        : undefined;

        let resolvedRefereeId = refereeId;
        let resolvedTeamRefereeId = teamRefereeId;

        if (!resolvedTeamRefereeId && input.referee && typeof input.referee === 'object') {
            const candidateId = '$id' in input.referee ? (input.referee as { $id?: string }).$id : undefined;
            const looksLikeTeam =
                Array.isArray((input.referee as any).playerIds) || typeof (input.referee as any).teamSize === 'number';
            if (candidateId && looksLikeTeam) {
                resolvedTeamRefereeId = candidateId;
                resolvedRefereeId = undefined;
            }
        }

        if (!resolvedTeamRefereeId && resolvedRefereeId && context?.teamsById?.has(resolvedRefereeId)) {
            resolvedTeamRefereeId = resolvedRefereeId;
            resolvedRefereeId = undefined;
        }

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

        if (resolvedTeamRefereeId && context?.teamsById?.has(resolvedTeamRefereeId)) {
            match.teamReferee = context.teamsById.get(resolvedTeamRefereeId);
        } else if (input.teamReferee && typeof input.teamReferee === 'object') {
            match.teamReferee = input.teamReferee as Team;
        }

        if (resolvedRefereeId && context?.refereesById?.has(resolvedRefereeId)) {
            match.referee = context.refereesById.get(resolvedRefereeId);
        } else if (
            input.referee &&
            typeof input.referee === 'object' &&
            !Array.isArray((input.referee as any).playerIds)
        ) {
            match.referee = input.referee as UserData;
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
        match.teamRefereeId = resolvedTeamRefereeId ?? null;
        match.refereeId = resolvedRefereeId ?? null;
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
        const normalizedFieldIds: string[] = Array.from(
            new Set<string>(
                (Array.isArray(row.scheduledFieldIds) && row.scheduledFieldIds.length
                    ? row.scheduledFieldIds
                    : row.scheduledFieldId
                        ? [row.scheduledFieldId]
                        : []
                )
                    .map((value: unknown) => String(value).trim())
                    .filter((value: string) => value.length > 0),
            ),
        );
        const normalizedDays = Array.from(
            new Set(
                (Array.isArray(row.daysOfWeek) && row.daysOfWeek.length
                    ? row.daysOfWeek
                    : row.dayOfWeek !== undefined
                        ? [row.dayOfWeek]
                        : []
                )
                    .map((value: unknown) => Number(value))
                    .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6),
            ),
        ) as NonNullable<TimeSlot['daysOfWeek']>;

        const slot: TimeSlot = {
            $id: row.$id ?? row.id,
            dayOfWeek: (normalizedDays[0] ?? Number(row.dayOfWeek ?? 0)) as TimeSlot['dayOfWeek'],
            daysOfWeek: normalizedDays,
            startTimeMinutes: startTime,
            endTimeMinutes: endTime,
            repeating: row.repeating === undefined ? true : Boolean(row.repeating),
            event: row.event ?? row.eventId ?? row.event?.$id,
            scheduledFieldId: normalizedFieldIds[0] ?? row.scheduledFieldId,
            scheduledFieldIds: normalizedFieldIds,
            divisions: Array.isArray(row.divisions)
                ? Array.from(
                    new Set(
                        row.divisions
                            .map((entry: unknown) => String(entry).trim().toLowerCase())
                            .filter((entry: string) => entry.length > 0),
                    ),
                )
                : [],
            requiredTemplateIds: Array.isArray(row.requiredTemplateIds)
                ? row.requiredTemplateIds.map((id: unknown) => String(id)).filter((id: string) => id.length > 0)
                : [],
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

    // Waitlist and free-agent helpers used by EventDetailSheet
    async addToWaitlist(eventId: string, participantId: string): Promise<Event> {
        const existing = await this.getEvent(eventId);
        if (!existing) throw new Error('Event not found');
        const updated = Array.from(new Set([...(existing.waitListIds || []), participantId]));
        const response = await apiRequest<any>(`/api/events/${eventId}`, {
            method: 'PATCH',
            body: { event: { waitListIds: updated } },
        });
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
        return this.mapRowToEvent(response);
    }

    async addFreeAgent(eventId: string, userId: string): Promise<Event> {
        const existing = await this.getEvent(eventId);
        if (!existing) throw new Error('Event not found');
        const updated = Array.from(new Set([...(existing.freeAgentIds || []), userId]));
        const response = await apiRequest<any>(`/api/events/${eventId}`, {
            method: 'PATCH',
            body: { event: { freeAgentIds: updated } },
        });
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
        return this.mapRowToEvent(response);
    }

    async removeFreeAgent(eventId: string, userId: string): Promise<Event> {
        const existing = await this.getEvent(eventId);
        if (!existing) throw new Error('Event not found');
        const updated = (existing.freeAgentIds || []).filter(id => id !== userId);
        const response = await apiRequest<any>(`/api/events/${eventId}`, {
            method: 'PATCH',
            body: { event: { freeAgentIds: updated } },
        });
        await this.ensureSportRelationship(response);
        await this.ensureLeagueScoringConfig(response);
        return this.mapRowToEvent(response);
    }

    // Pagination methods remain largely the same but updated to use new types
    async getEventsPaginated(filters: EventFilters, limit: number = 18, offset: number = 0): Promise<Event[]> {
        try {
            const response = await apiRequest<{ events?: any[] }>('/api/events/search', {
                method: 'POST',
                body: { filters, limit, offset },
            });

            const rows = response.events ?? [];
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
