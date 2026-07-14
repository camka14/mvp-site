import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Event, RegistrationQuestion, Team, UserData } from '@/types';
import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { familyService, type FamilyChild } from '@/lib/familyService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import {
    buildEmptyParticipantEventData,
    buildEventDetailsLoadKey,
    buildParticipantEventData,
    collectUniqueUserIds,
    getManagedUserTeamsForEvent,
    normalizeRequestToken,
    type EventParticipantData,
} from '../eventDetailData';

type LoadEventDetailsOptions = {
    automatic?: boolean;
};

type UseEventDetailDataControllerOptions = {
    event: Event;
    isActive: boolean;
    renderInline: boolean;
    selectedOccurrence?: WeeklyOccurrenceSelection | null;
    user: UserData | null | undefined;
    cachedUserTeams: Team[] | null | undefined;
    userTeamsLoading: boolean;
};

function buildBaseParticipantData(event: Event): EventParticipantData {
    return {
        event,
        players: Array.isArray(event.players) ? event.players as UserData[] : [],
        teams: Array.isArray(event.teams) ? event.teams as Team[] : [],
        freeAgents: [],
        currentUserPaymentFailed: false,
        paymentFailedTeamIds: [],
    };
}

export function useEventDetailDataController({
    event,
    isActive,
    renderInline,
    selectedOccurrence,
    user,
    cachedUserTeams,
    userTeamsLoading,
}: UseEventDetailDataControllerOptions) {
    const [detailedEvent, setDetailedEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<UserData[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
    const [currentUserPaymentFailed, setCurrentUserPaymentFailed] = useState(false);
    const [paymentFailedTeamIds, setPaymentFailedTeamIds] = useState<string[]>([]);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [eventLoadError, setEventLoadError] = useState<string | null>(null);
    const [hostUser, setHostUser] = useState<UserData | null>(null);
    const [children, setChildren] = useState<FamilyChild[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [childrenError, setChildrenError] = useState<string | null>(null);
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [registrationQuestions, setRegistrationQuestions] = useState<RegistrationQuestion[]>([]);
    const [registrationQuestionAnswers, setRegistrationQuestionAnswers] = useState<Record<string, string>>({});
    const eventRef = useRef<Event>(event);
    const loadedEventDetailsKeyRef = useRef<string | null>(null);
    const eventDetailsRequestGenerationRef = useRef(0);
    const currentEvent = detailedEvent ?? event;
    const normalizedOccurrence = useMemo<WeeklyOccurrenceSelection | undefined>(() => {
        const slotId = normalizeRequestToken(selectedOccurrence?.slotId);
        const occurrenceDate = normalizeRequestToken(selectedOccurrence?.occurrenceDate);
        return slotId && occurrenceDate ? { slotId, occurrenceDate } : undefined;
    }, [selectedOccurrence?.occurrenceDate, selectedOccurrence?.slotId]);

    useEffect(() => {
        if (!isActive || !currentEvent.$id) {
            setRegistrationQuestions([]);
            setRegistrationQuestionAnswers({});
            return undefined;
        }

        let cancelled = false;
        const loadQuestions = async () => {
            try {
                const questions = await teamService.getRegistrationQuestions('EVENT', currentEvent.$id);
                if (cancelled) {
                    return;
                }
                setRegistrationQuestions(questions);
                setRegistrationQuestionAnswers((current) => {
                    const next = { ...current };
                    questions.forEach((question) => {
                        if (!(question.id in next)) {
                            next[question.id] = '';
                        }
                    });
                    return next;
                });
            } catch {
                if (!cancelled) {
                    setRegistrationQuestions([]);
                    setRegistrationQuestionAnswers({});
                }
            }
        };
        void loadQuestions();
        return () => {
            cancelled = true;
        };
    }, [currentEvent.$id, isActive]);

    useEffect(() => {
        if (!isActive || !currentEvent.hostId) {
            setHostUser(null);
            return undefined;
        }
        const hostId = currentEvent.hostId;
        let cancelled = false;

        const loadHostUser = async () => {
            try {
                const resolvedHost = await userService.getUserById(hostId, { eventId: currentEvent.$id });
                if (!cancelled) {
                    setHostUser(resolvedHost ?? null);
                }
            } catch (error) {
                console.error('Failed to load host user:', error);
                if (!cancelled) {
                    setHostUser(null);
                }
            }
        };
        void loadHostUser();
        return () => {
            cancelled = true;
        };
    }, [currentEvent.$id, currentEvent.hostId, isActive]);

    useEffect(() => {
        if (!isActive || !user || !currentEvent.teamSignup) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const managedTeams = getManagedUserTeamsForEvent(cachedUserTeams, currentEvent, user.$id);
        setUserTeams(managedTeams);
        setIsLoadingTeams(userTeamsLoading && managedTeams.length === 0);
    }, [cachedUserTeams, currentEvent, isActive, user, userTeamsLoading]);

    useEffect(() => {
        if (!isActive || !user) {
            setChildren([]);
            setChildrenLoading(false);
            setChildrenError(null);
            return undefined;
        }

        let cancelled = false;
        setChildrenLoading(true);
        setChildrenError(null);

        const loadChildren = async () => {
            try {
                const result = await familyService.listChildren();
                if (!cancelled) {
                    setChildren(result);
                }
            } catch (error) {
                if (!cancelled) {
                    setChildren([]);
                    setChildrenError(error instanceof Error ? error.message : 'Failed to load children.');
                }
            } finally {
                if (!cancelled) {
                    setChildrenLoading(false);
                }
            }
        };
        void loadChildren();
        return () => {
            cancelled = true;
        };
    }, [isActive, user]);

    const reload = useCallback(async (eventId?: string, options: LoadEventDetailsOptions = {}) => {
        const sourceEvent = eventRef.current;
        const targetId = eventId ?? sourceEvent.$id;
        if (!targetId) {
            return;
        }

        const loadKey = buildEventDetailsLoadKey(targetId, normalizedOccurrence);
        if (options.automatic && loadKey && loadedEventDetailsKeyRef.current === loadKey) {
            return;
        }
        if (options.automatic) {
            loadedEventDetailsKeyRef.current = loadKey;
        }

        const requestGeneration = eventDetailsRequestGenerationRef.current + 1;
        eventDetailsRequestGenerationRef.current = requestGeneration;
        const normalizedTargetId = normalizeRequestToken(targetId);
        const isCurrentRequest = () => (
            eventDetailsRequestGenerationRef.current === requestGeneration
            && normalizeRequestToken(eventRef.current.$id) === normalizedTargetId
        );

        setIsLoadingEvent(true);
        setEventLoadError(null);
        try {
            let latest = renderInline ? sourceEvent : await eventService.getEventWithRelations(targetId);
            if (!isCurrentRequest()) {
                return;
            }
            if (!latest && !renderInline) {
                latest = await eventService.getEvent(targetId);
                if (!isCurrentRequest()) {
                    return;
                }
            }
            const baseEvent = latest ?? sourceEvent;
            let participantData = buildBaseParticipantData(baseEvent);
            const isWeeklyParent = baseEvent.eventType === 'WEEKLY_EVENT' && !baseEvent.parentEvent;

            if (isWeeklyParent && !normalizedOccurrence) {
                participantData = buildEmptyParticipantEventData(baseEvent);
            } else {
                try {
                    const snapshot = await eventService.getEventParticipants(
                        targetId,
                        isWeeklyParent ? normalizedOccurrence : undefined,
                    );
                    if (!isCurrentRequest()) {
                        return;
                    }
                    participantData = buildParticipantEventData(baseEvent, snapshot, user?.$id ?? null);
                } catch (error) {
                    if (!isCurrentRequest()) {
                        return;
                    }
                    console.error(
                        isWeeklyParent
                            ? 'Failed to load weekly session participants:'
                            : 'Failed to load event participants:',
                        error,
                    );
                    if (isWeeklyParent) {
                        participantData = buildEmptyParticipantEventData(baseEvent);
                    } else {
                        const freeAgentIds = collectUniqueUserIds(baseEvent.freeAgentIds);
                        if (baseEvent.teamSignup && freeAgentIds.length > 0) {
                            try {
                                participantData = {
                                    ...participantData,
                                    freeAgents: await userService.getUsersByIds(freeAgentIds, { eventId: baseEvent.$id }),
                                };
                                if (!isCurrentRequest()) {
                                    return;
                                }
                            } catch (freeAgentError) {
                                if (!isCurrentRequest()) {
                                    return;
                                }
                                console.error('Failed to load free agents:', freeAgentError);
                                participantData = { ...participantData, freeAgents: [] };
                            }
                        }
                    }
                }
            }

            if (!isCurrentRequest()) {
                return;
            }
            setDetailedEvent(participantData.event);
            setPlayers(participantData.players);
            const isSchedulableSlotEvent = participantData.event.eventType === 'LEAGUE'
                || participantData.event.eventType === 'TOURNAMENT';
            setTeams(isSchedulableSlotEvent
                ? participantData.teams.filter((team) => (
                    typeof team.parentTeamId === 'string' && team.parentTeamId.trim().length > 0
                ))
                : participantData.teams);
            setFreeAgents(participantData.freeAgents);
            setCurrentUserPaymentFailed(participantData.currentUserPaymentFailed);
            setPaymentFailedTeamIds(participantData.paymentFailedTeamIds);
        } catch (error) {
            if (!isCurrentRequest()) {
                return;
            }
            console.error('Failed to load event details:', error);
            setEventLoadError(error instanceof Error ? error.message : 'Failed to load event details.');
        } finally {
            if (isCurrentRequest()) {
                setIsLoadingEvent(false);
            }
        }
    }, [normalizedOccurrence, renderInline, user?.$id]);

    useEffect(() => {
        eventRef.current = event;
        setDetailedEvent((previous) => {
            if (!previous || previous.$id !== event.$id) {
                return previous;
            }
            return {
                ...previous,
                fieldIds: Array.isArray(event.fieldIds) ? event.fieldIds : previous.fieldIds,
                fields: Array.isArray(event.fields) ? event.fields : previous.fields,
                timeSlotIds: Array.isArray(event.timeSlotIds) ? event.timeSlotIds : previous.timeSlotIds,
                timeSlots: Array.isArray(event.timeSlots) ? event.timeSlots : previous.timeSlots,
                divisions: Array.isArray(event.divisions) ? event.divisions : previous.divisions,
                divisionDetails: Array.isArray(event.divisionDetails) ? event.divisionDetails : previous.divisionDetails,
                playoffDivisionDetails: Array.isArray(event.playoffDivisionDetails)
                    ? event.playoffDivisionDetails
                    : previous.playoffDivisionDetails,
            } as Event;
        });
    }, [event]);

    useEffect(() => {
        if (isActive) {
            setDetailedEvent(event);
            void reload(event.$id, { automatic: true });
        } else {
            loadedEventDetailsKeyRef.current = null;
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setFreeAgents([]);
            setCurrentUserPaymentFailed(false);
            setPaymentFailedTeamIds([]);
            setIsLoadingEvent(false);
            setEventLoadError(null);
            setIsLoadingTeams(false);
        }

        return () => {
            eventDetailsRequestGenerationRef.current += 1;
        };
    }, [event, event.$id, isActive, reload]);

    return {
        currentEvent,
        players,
        teams,
        freeAgents,
        currentUserPaymentFailed,
        paymentFailedTeamIds,
        isLoadingEvent,
        eventLoadError,
        hostUser,
        children,
        childrenLoading,
        childrenError,
        userTeams,
        isLoadingTeams,
        registrationQuestions,
        registrationQuestionAnswers,
        setRegistrationQuestionAnswers,
        reload,
    };
}
