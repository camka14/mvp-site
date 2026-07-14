import type { Event, Team, UserData } from '@/types';
import type {
    EventParticipantRegistrationEntry,
    EventParticipantsResponse,
    WeeklyOccurrenceSelection,
} from '@/lib/eventService';

export type EventParticipantData = {
    event: Event;
    players: UserData[];
    teams: Team[];
    freeAgents: UserData[];
    currentUserPaymentFailed: boolean;
    paymentFailedTeamIds: string[];
};

export function normalizeRequestToken(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function buildEventDetailsLoadKey(
    eventId: unknown,
    occurrence?: WeeklyOccurrenceSelection | null,
): string | null {
    const normalizedEventId = normalizeRequestToken(eventId);
    if (!normalizedEventId) {
        return null;
    }

    const slotId = normalizeRequestToken(occurrence?.slotId);
    const occurrenceDate = normalizeRequestToken(occurrence?.occurrenceDate);
    return slotId && occurrenceDate
        ? `${normalizedEventId}:${slotId}:${occurrenceDate}`
        : `${normalizedEventId}:all`;
}

export function normalizeUserId(value: unknown): string | null {
    return normalizeRequestToken(value);
}

function getEventSportName(event: Event | null | undefined): string {
    if (!event) {
        return '';
    }
    const rawSport: unknown = (event as { sport?: unknown }).sport;
    if (typeof rawSport === 'string' && rawSport.trim().length > 0) {
        return rawSport.trim();
    }
    if (
        rawSport
        && typeof rawSport === 'object'
        && typeof (rawSport as { name?: unknown }).name === 'string'
    ) {
        return ((rawSport as { name?: string }).name ?? '').trim();
    }
    if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
        return event.sportId.trim();
    }
    return '';
}

function teamIsManagedByUser(team: Team, userId: string): boolean {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
        return false;
    }
    const assistantCoachIds = Array.isArray((team as { assistantCoachIds?: unknown }).assistantCoachIds)
        ? ((team as { assistantCoachIds?: unknown }).assistantCoachIds as unknown[])
        : [];
    const coachIds = Array.isArray((team as { coachIds?: unknown }).coachIds)
        ? ((team as { coachIds?: unknown }).coachIds as unknown[])
        : [];
    const staffIds = [...assistantCoachIds, ...coachIds]
        .map((entry) => normalizeUserId(entry))
        .filter((entry): entry is string => Boolean(entry));

    return normalizeUserId(team.managerId) === normalizedUserId
        || normalizeUserId(team.captainId) === normalizedUserId
        || normalizeUserId(team.headCoachId) === normalizedUserId
        || staffIds.includes(normalizedUserId);
}

export function getManagedUserTeamsForEvent(
    teams: Team[] | null | undefined,
    event: Event | null | undefined,
    userId: string,
): Team[] {
    const targetSport = getEventSportName(event).toLowerCase();
    const teamList = Array.isArray(teams) ? teams : [];
    return teamList.filter((team) => {
        const matchesSport = targetSport.length === 0
            || (team.sport || '').trim().toLowerCase() === targetSport;
        return matchesSport && teamIsManagedByUser(team, userId);
    });
}

export function collectUniqueUserIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const ids = value
        .map((entry) => normalizeUserId(entry))
        .filter((entry): entry is string => Boolean(entry));
    return Array.from(new Set(ids));
}

function isPaymentFailedRegistration(registration: EventParticipantRegistrationEntry): boolean {
    return String(registration.status ?? '').trim().toUpperCase() === 'PAYMENT_FAILED';
}

export function collectPaymentFailedRegistrationState(
    registrations: EventParticipantsResponse['registrations'],
    currentUserId: string | null,
): { userFailed: boolean; teamIds: string[] } {
    const normalizedUserId = normalizeUserId(currentUserId);
    const failedUsers = (registrations?.users ?? []).filter(isPaymentFailedRegistration);
    const failedTeams = (registrations?.teams ?? []).filter(isPaymentFailedRegistration);

    return {
        userFailed: Boolean(
            normalizedUserId
            && failedUsers.some((registration) => normalizeUserId(registration.registrantId) === normalizedUserId),
        ),
        teamIds: Array.from(new Set(
            failedTeams
                .map((registration) => normalizeUserId(registration.registrantId))
                .filter((teamId): teamId is string => Boolean(teamId)),
        )),
    };
}

function normalizeEntityId<T extends { $id: string }>(entity: T): T {
    const id = normalizeRequestToken(entity.$id)
        ?? normalizeRequestToken((entity as T & { id?: unknown }).id)
        ?? '';
    return { ...entity, $id: id };
}

export function buildParticipantEventData(
    baseEvent: Event,
    snapshot: EventParticipantsResponse,
    currentUserId: string | null,
): EventParticipantData {
    const teamIds = collectUniqueUserIds(snapshot.participants.teamIds);
    const userIds = collectUniqueUserIds(snapshot.participants.userIds);
    const waitListIds = collectUniqueUserIds(snapshot.participants.waitListIds);
    const freeAgentIds = collectUniqueUserIds(snapshot.participants.freeAgentIds);
    const normalizedTeams = (snapshot.teams ?? [])
        .map(normalizeEntityId)
        .filter((team) => team.$id.length > 0);
    const normalizedUsers = (snapshot.users ?? [])
        .map(normalizeEntityId)
        .filter((participant) => participant.$id.length > 0);
    const teamsById = new Map(normalizedTeams.map((team) => [team.$id, team]));
    const usersById = new Map(normalizedUsers.map((participant) => [participant.$id, participant]));
    const teams = teamIds
        .map((teamId) => teamsById.get(teamId))
        .filter((team): team is Team => Boolean(team));
    const players = userIds
        .map((userId) => usersById.get(userId))
        .filter((participant): participant is UserData => Boolean(participant));
    const freeAgents = freeAgentIds
        .map((userId) => usersById.get(userId))
        .filter((participant): participant is UserData => Boolean(participant));
    const failedState = collectPaymentFailedRegistrationState(snapshot.registrations, currentUserId);

    return {
        event: {
            ...baseEvent,
            teamIds,
            teams,
            userIds,
            players,
            waitListIds,
            freeAgentIds,
            participantCount: snapshot.participantCount,
            participantCapacity: snapshot.participantCapacity ?? undefined,
        } as Event,
        players,
        teams,
        freeAgents,
        currentUserPaymentFailed: failedState.userFailed,
        paymentFailedTeamIds: failedState.teamIds,
    };
}

export function buildEmptyParticipantEventData(baseEvent: Event): EventParticipantData {
    return {
        event: {
            ...baseEvent,
            teamIds: [],
            teams: [],
            userIds: [],
            players: [],
            waitListIds: [],
            freeAgentIds: [],
        } as Event,
        players: [],
        teams: [],
        freeAgents: [],
        currentUserPaymentFailed: false,
        paymentFailedTeamIds: [],
    };
}
