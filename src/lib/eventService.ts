import { apiRequest } from './apiClient';
import {
    Event,
    EventOfficial,
    EventType,
    Field,
    LocationCoordinates,
    Team,
    UserData,
    Match,
    MatchOfficialAssignment,
    LeagueConfig,
    LeagueScoringConfig,
    Sport,
    TimeSlot,
    EventStatus,
    EventState,
    Organization,
    Invite,
    getTeamAvatarUrl,
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
import { createSport } from '@/types/defaults';


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
    organizationId?: string;
    includeWeeklyChildren?: boolean;
    maxDistance?: number;
    userLocation?: LocationCoordinates;
    dateFrom?: string;
    dateTo?: string;
    priceMax?: number;
    eventTypes?: EventType[];
    sports?: string[];
    divisions?: string[];
}

export interface FieldBlockingResult {
    events: Event[];
    rentalSlots: TimeSlot[];
}

class EventService {
    private normalizeMatchOfficialAssignments(value: unknown): MatchOfficialAssignment[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const normalized: Array<MatchOfficialAssignment | null> = value
            .map((entry): MatchOfficialAssignment | null => {
                if (!entry || typeof entry !== 'object') {
                    return null;
                }
                const row = entry as Record<string, unknown>;
                const positionId = typeof row.positionId === 'string' ? row.positionId.trim() : '';
                const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
                const holderType = row.holderType === 'PLAYER'
                    ? 'PLAYER'
                    : row.holderType === 'OFFICIAL'
                        ? 'OFFICIAL'
                        : null;
                const slotIndex = Number(row.slotIndex);
                if (!positionId || !userId || !holderType || !Number.isInteger(slotIndex) || slotIndex < 0) {
                    return null;
                }
                return {
                    positionId,
                    slotIndex,
                    holderType,
                    userId,
                    eventOfficialId: typeof row.eventOfficialId === 'string' && row.eventOfficialId.trim().length > 0
                        ? row.eventOfficialId.trim()
                        : undefined,
                    checkedIn: typeof row.checkedIn === 'boolean' ? row.checkedIn : undefined,
                    hasConflict: typeof row.hasConflict === 'boolean' ? row.hasConflict : undefined,
                };
            });
        return normalized.filter((entry): entry is MatchOfficialAssignment => entry !== null);
    }

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
            try {
                return await this.hydrateEventRelations(baseEvent, response);
            } catch (error) {
                // Keep core event data usable even when one of the relation lookups fails.
                console.error('Failed to hydrate event relations:', error);
                return baseEvent;
            }
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

    async addTeamParticipant(eventId: string, params: { teamId: string; divisionId?: string | null }): Promise<Event> {
        try {
            await apiRequest<any>(`/api/events/${eventId}/participants`, {
                method: 'POST',
                body: {
                    teamId: params.teamId,
                    ...(params.divisionId ? { divisionId: params.divisionId } : {}),
                },
            });
            const hydrated = await this.getEventById(eventId);
            if (!hydrated) {
                throw new Error('Failed to refresh event after adding team participant');
            }
            return hydrated;
        } catch (error) {
            console.error('Failed to add team participant:', error);
            throw error;
        }
    }

    async createWeeklySession(
        parentEventId: string,
        params: {
            sessionStart: string;
            sessionEnd: string;
            slotId?: string;
            divisionId?: string;
            divisionTypeId?: string;
            divisionTypeKey?: string;
        },
    ): Promise<Event> {
        const response = await apiRequest<{ event?: any }>(`/api/events/${parentEventId}/weekly-sessions`, {
            method: 'POST',
            body: params,
        });
        const payload = response?.event ?? response;
        await this.ensureSportRelationship(payload);
        await this.ensureLeagueScoringConfig(payload);
        return this.mapRowToEvent(payload);
    }

    async removeTeamParticipant(eventId: string, teamId: string): Promise<Event> {
        try {
            await apiRequest<any>(`/api/events/${eventId}/participants`, {
                method: 'DELETE',
                body: { teamId },
            });
            const hydrated = await this.getEventById(eventId);
            if (!hydrated) {
                throw new Error('Failed to refresh event after removing team participant');
            }
            return hydrated;
        } catch (error) {
            console.error('Failed to remove team participant:', error);
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
            const normalizedEvent = this.withNormalizedOfficials(this.withNormalizedEventEnums(event));
            const payload = buildPayload(normalizedEvent);
            if (Object.prototype.hasOwnProperty.call(normalizedEvent, 'officialIds')) {
                payload.officialIds = normalizedEvent.officialIds ?? [];
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

        const eventOrganizationId = (() => {
            const organizationValue = event.organization as Organization | string | null | undefined;
            if (typeof organizationValue === 'string') {
                const normalized = organizationValue.trim();
                return normalized.length > 0 ? normalized : null;
            }
            if (organizationValue && typeof organizationValue === 'object' && typeof (organizationValue as any).$id === 'string') {
                const normalized = String((organizationValue as any).$id).trim();
                return normalized.length > 0 ? normalized : null;
            }
            if (typeof event.organizationId === 'string') {
                const normalized = event.organizationId.trim();
                return normalized.length > 0 ? normalized : null;
            }
            return null;
        })();

        if (eventOrganizationId) {
            return;
        }

        const fieldsToRemove = Array.isArray(event.fields)
            ? event.fields
                .filter((field): field is Field => Boolean(field?.$id))
                .filter((field) => {
                    const organizationValue = (field as Field & {
                        organization?: Organization | string | null;
                        organizationId?: string | null;
                    }).organization;

                    if (typeof organizationValue === 'string' && organizationValue.trim().length > 0) {
                        return false;
                    }

                    if (
                        organizationValue
                        && typeof organizationValue === 'object'
                        && typeof (organizationValue as any).$id === 'string'
                        && String((organizationValue as any).$id).trim().length > 0
                    ) {
                        return false;
                    }

                    const organizationIdValue = (field as Field & { organizationId?: string | null }).organizationId;
                    if (typeof organizationIdValue === 'string' && organizationIdValue.trim().length > 0) {
                        return false;
                    }

                    return true;
                })
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
            console.warn(`Failed to delete ${failures.length} field(s) for unpublished event ${event.$id}.`);
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
          warnings?: Array<{
            code?: string;
            message?: string;
            matchIds?: string[];
          }>;
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
          warnings: Array.isArray(result?.warnings)
            ? result.warnings
              .filter((warning): warning is { code: string; message: string; matchIds?: string[] } =>
                Boolean(warning && typeof warning.code === 'string' && typeof warning.message === 'string'),
              )
              .map((warning) => ({
                code: warning.code,
                message: warning.message,
                matchIds: Array.isArray(warning.matchIds) ? warning.matchIds : undefined,
              }))
            : [],
        };
      }

    async createEvent(newEvent: Partial<Event>): Promise<Event> {
        try {
            const normalizedEvent = this.withNormalizedOfficials(this.withNormalizedEventEnums(newEvent));
            const payload = buildPayload(normalizedEvent);
            if (Object.prototype.hasOwnProperty.call(normalizedEvent, 'officialIds')) {
                payload.officialIds = normalizedEvent.officialIds ?? [];
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

    private withNormalizedOfficials<T extends Partial<Event>>(event: T): T {
        const explicitOfficialIds = Array.isArray(event.officialIds)
            ? event.officialIds.map((id) => String(id))
            : event.officialIds === undefined
                ? undefined
                : [];

        if (explicitOfficialIds !== undefined) {
            return { ...event, officialIds: explicitOfficialIds } as T;
        }

        if (Array.isArray((event as any).officials)) {
            const derived = (event as any).officials
                .map((ref: any) => {
                    if (typeof ref === 'string') return ref;
                    if (ref && typeof ref === 'object' && '$id' in ref) {
                        return (ref as { $id?: string }).$id ?? '';
                    }
                    return '';
                })
                .filter((id: string) => Boolean(id));
            return { ...event, officialIds: derived } as T;
        }

        return event;
    }

    private normalizeOfficialSchedulingMode(value: unknown): Event['officialSchedulingMode'] {
        if (value === 'NONE') {
            return 'OFF';
        }
        if (value === 'STAFFING' || value === 'SCHEDULE' || value === 'OFF') {
            return value;
        }
        return 'SCHEDULE';
    }

    private mapEventOfficialPositions(value: unknown): NonNullable<Event['officialPositions']> {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .map((entry, index) => {
                if (!entry || typeof entry !== 'object') {
                    return null;
                }
                const row = entry as Record<string, unknown>;
                const id = String(row.id ?? '').trim();
                const name = String(row.name ?? '').trim();
                if (!id || !name) {
                    return null;
                }
                const count = Number(row.count);
                const order = Number(row.order);
                return {
                    id,
                    name,
                    count: Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1,
                    order: Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : index,
                };
            })
            .filter((entry): entry is NonNullable<Event['officialPositions']>[number] => Boolean(entry))
            .sort((left, right) => left.order - right.order)
            .map((entry, index) => ({ ...entry, order: index }));
    }

    private mapEventOfficials(
        value: unknown,
        fallbackOfficialIds: string[],
        officialPositions: NonNullable<Event['officialPositions']>,
    ): NonNullable<Event['eventOfficials']> {
        const officialIds = Array.from(new Set(fallbackOfficialIds.map((id) => String(id).trim()).filter(Boolean)));
        const officialIdSet = new Set(officialIds);
        const positionIds = officialPositions.map((position) => position.id);
        const positionIdSet = new Set(positionIds);

        const byUserId = new Map<string, EventOfficial>();
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return;
                }
                const row = entry as Record<string, unknown>;
                const id = String(row.id ?? '').trim();
                const userId = String(row.userId ?? '').trim();
                if (!id || !userId || !officialIdSet.has(userId)) {
                    return;
                }
                byUserId.set(userId, {
                    id,
                    userId,
                    positionIds: Array.isArray(row.positionIds)
                        ? Array.from(
                            new Set(
                                row.positionIds
                                    .map((positionId) => String(positionId).trim())
                                    .filter((positionId) => positionId.length > 0 && positionIdSet.has(positionId)),
                            ),
                        )
                        : [...positionIds],
                    fieldIds: Array.isArray(row.fieldIds)
                        ? Array.from(
                            new Set(
                                row.fieldIds
                                    .map((fieldId) => String(fieldId).trim())
                                    .filter(Boolean),
                            ),
                        )
                        : [],
                    isActive: row.isActive === undefined ? true : Boolean(row.isActive),
                });
            });
        }

        return officialIds.map((userId) => {
            const existing = byUserId.get(userId);
            if (existing) {
                return {
                    ...existing,
                    positionIds: existing.positionIds.length ? existing.positionIds : [...positionIds],
                };
            }
            return {
                id: createId(),
                userId,
                positionIds: [...positionIds],
                fieldIds: [],
                isActive: true,
            };
        });
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
        const normalizedFieldIds = Array.isArray(row.fieldIds)
            ? row.fieldIds
                .filter((fieldId: unknown): fieldId is string => typeof fieldId === 'string')
                .map((fieldId: string) => fieldId.trim())
                .filter((fieldId: string) => fieldId.length > 0)
            : [];
        const derivedFieldCount = (() => {
            if (normalizedFieldIds.length > 0) {
                return normalizedFieldIds.length;
            }
            if (Array.isArray(row.fields)) {
                return row.fields.length;
            }
            return undefined;
        })();
        const officialPositions = this.mapEventOfficialPositions(row.officialPositions);
        const officialIds = Array.isArray(row.officialIds)
            ? row.officialIds.map((id: unknown) => String(id))
            : Array.isArray(row.eventOfficials)
                ? Array.from(
                    new Set(
                        row.eventOfficials
                            .map((entry: any) => String(entry?.userId ?? '').trim())
                            .filter((id: string) => id.length > 0),
                    ),
                )
                : [];

        return {
            $id: row.$id,
            name: row.name,
            description: row.description,
            start: row.start,
            end: row.end,
            location: row.location,
            address: row.address ?? undefined,
            coordinates: row.coordinates,
            price: row.price,
            minAge: normalizeAge(row.minAge),
            maxAge: normalizeAge(row.maxAge),
            rating: row.rating,
            imageId: row.imageId,
            hostId: row.hostId,
            noFixedEndDateTime:
                typeof row.noFixedEndDateTime === 'boolean'
                    ? row.noFixedEndDateTime
                    : row.start && row.end
                        ? String(row.start) === String(row.end)
                        : false,
            maxParticipants: row.maxParticipants,
            teamSizeLimit: row.teamSizeLimit,
            restTimeMinutes: row.restTimeMinutes,
            teamSignup: row.teamSignup,
            singleDivision: row.singleDivision,
            splitLeaguePlayoffDivisions: Boolean(row.splitLeaguePlayoffDivisions),
            registrationByDivisionType: Boolean(row.registrationByDivisionType),
            waitListIds: row.waitListIds,
            freeAgentIds: row.freeAgentIds,
            teamIds: row.teamIds,
            userIds: Array.isArray(row.userIds) ? row.userIds.map(String) : [],
            fieldIds: normalizedFieldIds,
            timeSlotIds: row.timeSlotIds,
            officialIds,
            officialSchedulingMode: this.normalizeOfficialSchedulingMode(row.officialSchedulingMode),
            officialPositions,
            eventOfficials: this.mapEventOfficials(row.eventOfficials, officialIds, officialPositions),
            assistantHostIds: Array.isArray(row.assistantHostIds) ? row.assistantHostIds.map((id: unknown) => String(id)) : [],
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
            parentEvent:
                typeof row.parentEvent === 'string' && row.parentEvent.trim().length > 0
                    ? row.parentEvent
                    : null,
            requiredTemplateIds: Array.isArray(row.requiredTemplateIds)
                ? row.requiredTemplateIds.map((id: unknown) => String(id))
                : [],
            divisions: row.divisions,
            divisionDetails: Array.isArray(row.divisionDetails)
                ? row.divisionDetails.map((entry: any) => ({
                    id: String(entry?.id ?? entry?.$id ?? ''),
                    name: String(entry?.name ?? entry?.id ?? ''),
                    key: typeof entry?.key === 'string' ? entry.key : undefined,
                    kind:
                        entry?.kind === 'LEAGUE' || entry?.kind === 'PLAYOFF'
                            ? entry.kind
                            : 'LEAGUE',
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
                    price: typeof entry?.price === 'number'
                        ? entry.price
                        : Number.isFinite(Number(entry?.price))
                            ? Number(entry.price)
                            : undefined,
                    maxParticipants: typeof entry?.maxParticipants === 'number'
                        ? entry.maxParticipants
                        : Number.isFinite(Number(entry?.maxParticipants))
                            ? Number(entry.maxParticipants)
                            : undefined,
                    playoffTeamCount: typeof entry?.playoffTeamCount === 'number'
                        ? entry.playoffTeamCount
                        : Number.isFinite(Number(entry?.playoffTeamCount))
                            ? Number(entry.playoffTeamCount)
                            : undefined,
                    playoffPlacementDivisionIds: Array.isArray(entry?.playoffPlacementDivisionIds)
                        ? entry.playoffPlacementDivisionIds.map((divisionId: unknown) => String(divisionId ?? '').trim())
                        : undefined,
                    allowPaymentPlans: typeof entry?.allowPaymentPlans === 'boolean'
                        ? entry.allowPaymentPlans
                        : undefined,
                    installmentCount: typeof entry?.installmentCount === 'number'
                        ? entry.installmentCount
                        : Number.isFinite(Number(entry?.installmentCount))
                            ? Number(entry.installmentCount)
                            : undefined,
                    installmentDueDates: Array.isArray(entry?.installmentDueDates)
                        ? entry.installmentDueDates
                            .map((dueDate: unknown) => String(dueDate))
                            .filter((dueDate: string) => dueDate.length > 0)
                        : undefined,
                    installmentAmounts: Array.isArray(entry?.installmentAmounts)
                        ? entry.installmentAmounts
                            .map((amount: unknown) => (
                                typeof amount === 'number' ? amount : Number(amount)
                            ))
                            .filter((amount: number) => Number.isFinite(amount))
                        : undefined,
                    fieldIds: Array.isArray(entry?.fieldIds)
                        ? entry.fieldIds.map((fieldId: unknown) => String(fieldId)).filter(Boolean)
                        : [],
                    teamIds: Array.isArray(entry?.teamIds)
                        ? entry.teamIds
                            .filter((teamId: unknown): teamId is string => typeof teamId === 'string')
                            .map((teamId: string) => teamId.trim())
                            .filter((teamId: string) => teamId.length > 0)
                        : [],
                    ageCutoffDate: typeof entry?.ageCutoffDate === 'string' ? entry.ageCutoffDate : undefined,
                    ageCutoffLabel: typeof entry?.ageCutoffLabel === 'string' ? entry.ageCutoffLabel : undefined,
                    ageCutoffSource: typeof entry?.ageCutoffSource === 'string' ? entry.ageCutoffSource : undefined,
                })).filter((entry: any) => entry.id.length > 0)
                : undefined,
            playoffDivisionDetails: Array.isArray(row.playoffDivisionDetails)
                ? row.playoffDivisionDetails.map((entry: any) => ({
                    id: String(entry?.id ?? entry?.$id ?? ''),
                    name: String(entry?.name ?? entry?.id ?? ''),
                    key: typeof entry?.key === 'string' ? entry.key : undefined,
                    kind:
                        entry?.kind === 'LEAGUE' || entry?.kind === 'PLAYOFF'
                            ? entry.kind
                            : 'PLAYOFF',
                    maxParticipants: typeof entry?.maxParticipants === 'number'
                        ? entry.maxParticipants
                        : Number.isFinite(Number(entry?.maxParticipants))
                            ? Number(entry.maxParticipants)
                            : undefined,
                    playoffTeamCount: typeof entry?.playoffTeamCount === 'number'
                        ? entry.playoffTeamCount
                        : Number.isFinite(Number(entry?.playoffTeamCount))
                            ? Number(entry.playoffTeamCount)
                            : undefined,
                    teamIds: Array.isArray(entry?.teamIds)
                        ? entry.teamIds
                            .filter((teamId: unknown): teamId is string => typeof teamId === 'string')
                            .map((teamId: string) => teamId.trim())
                            .filter((teamId: string) => teamId.length > 0)
                        : [],
                    playoffConfig:
                        entry?.playoffConfig && typeof entry.playoffConfig === 'object'
                            ? entry.playoffConfig
                            : undefined,
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
            officials: Array.isArray(row.officials) ? (row.officials as UserData[]) : undefined,
            assistantHosts: Array.isArray(row.assistantHosts) ? (row.assistantHosts as UserData[]) : undefined,
            staffInvites: Array.isArray(row.staffInvites)
                ? row.staffInvites
                    .map((invite: any) => {
                        const inviteId = String(invite?.$id ?? invite?.id ?? '').trim();
                        if (!inviteId) {
                            return null;
                        }
                        return {
                            ...invite,
                            $id: inviteId,
                        };
                    })
                    .filter((invite: any): invite is Invite => Boolean(invite))
                : undefined,
            doubleElimination: row.doubleElimination,
            winnerSetCount: row.winnerSetCount,
            loserSetCount: row.loserSetCount,
            winnerBracketPointsToVictory: row.winnerBracketPointsToVictory,
            loserBracketPointsToVictory: row.loserBracketPointsToVictory,
            prize: row.prize,
            fieldCount: derivedFieldCount,
            gamesPerOpponent: row.gamesPerOpponent,
            includePlayoffs: row.includePlayoffs,
            playoffTeamCount: row.playoffTeamCount,
            usesSets: row.usesSets,
            matchDurationMinutes: row.matchDurationMinutes,
            setDurationMinutes: row.setDurationMinutes,
            setsPerMatch: row.setsPerMatch,
            doTeamsOfficiate: typeof row.doTeamsOfficiate === 'boolean' ? row.doTeamsOfficiate : undefined,
            teamOfficialsMaySwap:
                typeof row.doTeamsOfficiate === 'boolean' && row.doTeamsOfficiate
                    ? typeof row.teamOfficialsMaySwap === 'boolean'
                        ? row.teamOfficialsMaySwap
                        : false
                    : false,
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
            attendees: (() => {
                const explicitAttendees =
                    typeof row.attendees === 'number'
                        ? row.attendees
                        : Number.isFinite(Number(row.attendees))
                            ? Number(row.attendees)
                            : null;
                if (explicitAttendees !== null) {
                    return Math.max(0, Math.trunc(explicitAttendees));
                }
                return row.teamSignup
                    ? (Array.isArray(row.teamIds) ? row.teamIds.length : 0)
                    : (Array.isArray(row.userIds) ? row.userIds.length : 0);
            })(),
            status: row.status as EventStatus | undefined,
            state,
            leagueConfig: this.buildLeagueConfig(row),
            leagueScoringConfig: row.leagueScoringConfig
        };
    }

    async getBlockingForFieldInRange(
        fieldId: string,
        start: Date | string,
        end: Date | string | null = null,
        options?: {
            organizationId?: string;
            excludeEventId?: string;
        },
    ): Promise<FieldBlockingResult> {
        const startFilter = this.normalizeDateInput(start) ?? undefined;
        const endFilter = this.normalizeDateInput(end) ?? undefined;
        const params = new URLSearchParams();
        if (startFilter) params.set('start', startFilter);
        if (endFilter) params.set('end', endFilter);
        const organizationId = typeof options?.organizationId === 'string' ? options.organizationId.trim() : '';
        if (organizationId.length > 0) {
            params.set('organizationId', organizationId);
        }
        const excludeEventId = typeof options?.excludeEventId === 'string' ? options.excludeEventId.trim() : '';
        if (excludeEventId.length > 0) {
            params.set('excludeEventId', excludeEventId);
        }

        const response = await apiRequest<{ events?: any[]; rentalSlots?: any[] }>(`/api/events/field/${fieldId}?${params.toString()}`);
        const rows = Array.isArray(response?.events) ? response.events : [];
        const rentalRows = Array.isArray(response?.rentalSlots) ? response.rentalSlots : [];

        const events: Event[] = [];
        for (const row of rows) {
            await this.ensureSportRelationship(row);
            await this.ensureLeagueScoringConfig(row);
            events.push(this.mapRowToEvent(row));
        }

        const allTimeSlotIds = this.extractStringIds(events.flatMap((event) => event.timeSlotIds ?? []));
        let hydratedEvents = events;
        if (allTimeSlotIds.length > 0) {
            const timeSlots = await this.fetchTimeSlotsByIds(allTimeSlotIds);
            if (timeSlots.length > 0) {
                const slotsById = new Map(timeSlots.map((slot) => [slot.$id, slot]));
                hydratedEvents = events.map((event) => {
                    const slotIds = this.extractStringIds(event.timeSlotIds ?? []);
                    if (!slotIds.length) {
                        return event;
                    }
                    const hydratedSlots = slotIds
                        .map((slotId) => slotsById.get(slotId))
                        .filter((slot): slot is TimeSlot => Boolean(slot));
                    if (!hydratedSlots.length) {
                        return event;
                    }
                    return {
                        ...event,
                        timeSlots: hydratedSlots,
                    };
                });
            }
        }

        return {
            events: hydratedEvents,
            rentalSlots: rentalRows.map((row) => this.mapRowToTimeSlot(row)),
        };
    }

    async getEventsForFieldInRange(
        fieldId: string,
        start: Date | string,
        end: Date | string | null = null,
        options?: {
            organizationId?: string;
            excludeEventId?: string;
        },
    ): Promise<Event[]> {
        const result = await this.getBlockingForFieldInRange(fieldId, start, end, options);
        return result.events;
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
        const officialUserIds = new Set<string>();

        rows.forEach((row) => {
            if (typeof row.team1Id === 'string') {
                teamIds.add(row.team1Id);
            }
            if (typeof row.team2Id === 'string') {
                teamIds.add(row.team2Id);
            }
            if (typeof row.teamOfficialId === 'string') {
                teamIds.add(row.teamOfficialId);
            }
            if (typeof row.officialId === 'string') {
                officialUserIds.add(row.officialId);
                teamIds.add(row.officialId);
            }
        });

        const [teams, officials] = await Promise.all([
            this.fetchTeamsByIds(Array.from(teamIds)),
            userService.getUsersByIds(Array.from(officialUserIds)),
        ]);

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const officialsById = new Map(officials.map((official) => [official.$id, official]));

        return rows.map((row) => {
            return this.mapMatchRecord(row, { teamsById, officialsById });
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
        const officialIds = this.extractStringIds(
            data.officialIds
            ?? event.officialIds
            ?? (Array.isArray(data.eventOfficials) ? data.eventOfficials.map((entry: any) => entry?.userId) : [])
            ?? [],
        );
        const assistantHostIds = this.extractStringIds(data.assistantHostIds ?? event.assistantHostIds ?? []);
        const officialPositions = this.mapEventOfficialPositions(data.officialPositions ?? event.officialPositions ?? []);

        const [teams, players, fields, timeSlots, organization, officials, assistantHosts] = await Promise.all([
            this.resolveTeams(data.teams, teamIds),
            this.resolvePlayers(data.players, userIds, { eventId: event.$id }),
            this.resolveFields(data.fields, fieldIds),
            this.resolveTimeSlots(data.timeSlots, timeSlotIds),
            this.resolveOrganization(data.organization ?? data.organizationId ?? event.organization),
            this.resolvePlayers(data.officials, officialIds, { eventId: event.$id }),
            this.resolvePlayers(data.assistantHosts, assistantHostIds, { eventId: event.$id }),
        ]);

        const matches = await this.resolveMatches(event, data.matches, teams, fields, officials);

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
        event.officialIds = officialIds;
        event.officialSchedulingMode = this.normalizeOfficialSchedulingMode(data.officialSchedulingMode ?? event.officialSchedulingMode);
        event.officialPositions = officialPositions;
        event.eventOfficials = this.mapEventOfficials(data.eventOfficials ?? event.eventOfficials, officialIds, officialPositions);
        event.officials = officials;
        event.assistantHostIds = assistantHostIds;
        event.assistantHosts = assistantHosts;
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

        let division: any = 'Open';
        if (row.division && typeof row.division === 'object' && ('name' in row.division || 'id' in row.division)) {
            division = row.division;
        } else if (typeof row.division === 'string' && row.division.trim()) {
            division = row.division;
        }

        const team: Team = {
            $id: String(row.$id ?? row.id ?? ''),
            name: row.name ?? '',
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
            headCoachId:
                typeof row.headCoachId === 'string' && row.headCoachId.trim().length > 0
                    ? row.headCoachId
                    : null,
            assistantCoachIds: Array.isArray(row.assistantCoachIds)
                ? row.assistantCoachIds.map(String)
                : Array.isArray(row.coachIds)
                ? row.coachIds.map(String)
                : [],
            coachIds: Array.isArray(row.assistantCoachIds)
                ? row.assistantCoachIds.map(String)
                : Array.isArray(row.coachIds)
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
            currentSize: playerIds.length,
            isFull: playerIds.length >= teamSize,
            avatarUrl: '',
        };

        team.avatarUrl = getTeamAvatarUrl(team);
        return team;
    }

    private async resolvePlayers(
        existing: any,
        ids: string[],
        context: { eventId?: string } = {},
    ): Promise<UserData[]> {
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
        return userService.getUsersByIds(ids, context);
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

        const field: Field = {
            $id: String(row.$id ?? row.id ?? ''),
            name: row.name ?? '',
            location: row.location ?? '',
            lat: Number.isFinite(lat) ? lat : 0,
            long: Number.isFinite(long) ? long : 0,
            fieldNumber: Number.isFinite(fieldNumber) ? fieldNumber : 0,
            divisions: Array.isArray(row.divisions) ? row.divisions : undefined,
            organization: row.organization ?? row.organizationId ?? undefined,
            rentalSlotIds: Array.isArray(row.rentalSlotIds)
                ? row.rentalSlotIds.map((value: unknown) => String(value))
                : [],
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
        officials: UserData[] = [],
    ): Promise<Match[]> {
        const rows = Array.isArray(existing) && existing.length ? existing : await this.fetchMatchesByEventId(event.$id);
        if (!rows.length) {
            return [];
        }

        const teamsById = new Map(teams.map((team) => [team.$id, team]));
        const fieldsById = new Map(fields.map((field) => [field.$id, field]));
        const officialsById = new Map(officials.map((official) => [official.$id, official]));

        const teamOfficialIds = new Set<string>();
        const officialIds = new Set<string>();

        rows.forEach((row) => {
            if (typeof row.teamOfficialId === 'string') {
                teamOfficialIds.add(row.teamOfficialId);
            }
            if (typeof row.officialId === 'string') {
                officialIds.add(row.officialId);
            }
            this.normalizeMatchOfficialAssignments(row.officialIds).forEach((assignment) => {
                if (assignment.holderType === 'OFFICIAL' && assignment.userId) {
                    officialIds.add(assignment.userId);
                }
            });
        });

        const missingTeamOfficialIds = Array.from(teamOfficialIds).filter((id) => !teamsById.has(id));
        if (missingTeamOfficialIds.length) {
            const fetchedTeamOfficials = await this.fetchTeamsByIds(missingTeamOfficialIds);
            fetchedTeamOfficials.forEach((team) => teamsById.set(team.$id, team));
        }

        const missingOfficialIds = Array.from(officialIds).filter((id) => !officialsById.has(id));
        if (missingOfficialIds.length) {
            const fetchedRefs = await userService.getUsersByIds(missingOfficialIds);
            fetchedRefs.forEach((ref) => officialsById.set(ref.$id, ref));
        }

        return (rows as any[]).map((row) => {
            const match = this.mapMatchRecord(row, { teamsById, fieldsById, officialsById });
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
            address: row.address ?? undefined,
            coordinates: coordinates,
            ownerId: row.ownerId ?? undefined,
            hostIds: Array.isArray(row.hostIds) ? row.hostIds.map((id: unknown) => String(id)) : [],
            officialIds: Array.isArray(row.officialIds) ? row.officialIds.map((id: unknown) => String(id)) : [],
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
        context?: { teamsById?: Map<string, Team>; fieldsById?: Map<string, Field>; officialsById?: Map<string, UserData> },
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

        const officialId =
            typeof input.officialId === 'string'
                ? input.officialId
                : typeof input.official === 'string'
                    ? input.official
                    : input.official && typeof input.official === 'object' && '$id' in input.official
                        ? (input.official as { $id?: string }).$id ?? undefined
                        : undefined;

        const teamOfficialId =
            typeof input.teamOfficialId === 'string'
                ? input.teamOfficialId
                : typeof input.teamOfficial === 'string'
                    ? input.teamOfficial
                    : input.teamOfficial && typeof input.teamOfficial === 'object' && '$id' in input.teamOfficial
                        ? (input.teamOfficial as { $id?: string }).$id ?? undefined
                        : undefined;

        let resolvedOfficialId = officialId;
        let resolvedTeamOfficialId = teamOfficialId;

        if (!resolvedTeamOfficialId && input.official && typeof input.official === 'object') {
            const candidateId = '$id' in input.official ? (input.official as { $id?: string }).$id : undefined;
            const looksLikeTeam =
                Array.isArray((input.official as any).playerIds) || typeof (input.official as any).teamSize === 'number';
            if (candidateId && looksLikeTeam) {
                resolvedTeamOfficialId = candidateId;
                resolvedOfficialId = undefined;
            }
        }

        if (!resolvedTeamOfficialId && resolvedOfficialId && context?.teamsById?.has(resolvedOfficialId)) {
            resolvedTeamOfficialId = resolvedOfficialId;
            resolvedOfficialId = undefined;
        }

        const match: Match = {
            $id: (input?.$id ?? input?.id) as string,
            start: input.start,
            end: input.end,
            locked: Boolean(input.locked),
            team1Seed: input.team1Seed,
            team2Seed: input.team2Seed,
            teamOfficialSeed:
                typeof input.teamOfficialSeed === 'number' && Number.isFinite(input.teamOfficialSeed)
                    ? input.teamOfficialSeed
                    : null,
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
            officialIds: this.normalizeMatchOfficialAssignments(input.officialIds),
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

        if (resolvedTeamOfficialId && context?.teamsById?.has(resolvedTeamOfficialId)) {
            match.teamOfficial = context.teamsById.get(resolvedTeamOfficialId);
        } else if (input.teamOfficial && typeof input.teamOfficial === 'object') {
            match.teamOfficial = input.teamOfficial as Team;
        }
        if (
            match.teamOfficial
            && (typeof match.teamOfficialSeed !== 'number' || !Number.isFinite(match.teamOfficialSeed))
        ) {
            match.teamOfficialSeed = null;
        }

        if (resolvedOfficialId && context?.officialsById?.has(resolvedOfficialId)) {
            match.official = context.officialsById.get(resolvedOfficialId);
        } else if (
            input.official &&
            typeof input.official === 'object' &&
            !Array.isArray((input.official as any).playerIds)
        ) {
            match.official = input.official as UserData;
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
        match.teamOfficialId = resolvedTeamOfficialId ?? null;
        match.officialId = resolvedOfficialId ?? null;
        match.officialCheckedIn = match.officialCheckedIn ?? input.officialCheckedIn ?? undefined;

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
            rentalDocumentTemplateId:
                typeof row.rentalDocumentTemplateId === 'string' && row.rentalDocumentTemplateId.trim().length > 0
                    ? row.rentalDocumentTemplateId.trim()
                    : null,
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

        const normalizedState = typeof row?.state === 'string' ? row.state.toUpperCase() : '';
        const isTemplateEvent = normalizedState === 'TEMPLATE';
        const sportId =
            (row?.sport && typeof row.sport === 'string' ? row.sport : undefined) ??
            (typeof row?.sportId === 'string' ? row.sportId : undefined);

        if (!sportId) {
            if (isTemplateEvent) {
                row.sport = createSport();
                return;
            }
            throw new Error('Event record is missing sport relationship data.');
        }

        let sportsMap = await this.getSportsMap();
        let sport = sportsMap.get(sportId);

        if (!sport) {
            sportsMap = await this.refreshSportsMap();
            sport = sportsMap.get(sportId);
        }

        if (!sport) {
            if (isTemplateEvent) {
                row.sport = createSport({ $id: sportId, name: sportId });
                return;
            }
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

        const sports = await sportsService.getAll(true);
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
    async addToWaitlist(
        eventId: string,
        participantId: string,
        participantType: 'user' | 'team' = 'user',
    ): Promise<Event> {
        const response = await apiRequest<any>(`/api/events/${eventId}/waitlist`, {
            method: 'POST',
            body: participantType === 'team'
                ? { teamId: participantId }
                : { userId: participantId },
        });
        const payload = response?.event ?? response;
        await this.ensureSportRelationship(payload);
        await this.ensureLeagueScoringConfig(payload);
        return this.mapRowToEvent(payload);
    }

    async removeFromWaitlist(
        eventId: string,
        participantId: string,
        participantType: 'user' | 'team' = 'user',
    ): Promise<Event> {
        const response = await apiRequest<any>(`/api/events/${eventId}/waitlist`, {
            method: 'DELETE',
            body: participantType === 'team'
                ? { teamId: participantId }
                : { userId: participantId },
        });
        const payload = response?.event ?? response;
        await this.ensureSportRelationship(payload);
        await this.ensureLeagueScoringConfig(payload);
        return this.mapRowToEvent(payload);
    }

    async addFreeAgent(eventId: string, userId: string): Promise<Event> {
        const response = await apiRequest<any>(`/api/events/${eventId}/free-agents`, {
            method: 'POST',
            body: { userId },
        });
        const payload = response?.event ?? response;
        await this.ensureSportRelationship(payload);
        await this.ensureLeagueScoringConfig(payload);
        return this.mapRowToEvent(payload);
    }

    async removeFreeAgent(eventId: string, userId: string): Promise<Event> {
        const response = await apiRequest<any>(`/api/events/${eventId}/free-agents`, {
            method: 'DELETE',
            body: { userId },
        });
        const payload = response?.event ?? response;
        await this.ensureSportRelationship(payload);
        await this.ensureLeagueScoringConfig(payload);
        return this.mapRowToEvent(payload);
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

            return events;
        } catch (error) {
            console.error('Failed to fetch paginated events:', error);
            throw new Error('Failed to load events');
        }
    }
}

export const eventService = new EventService();


