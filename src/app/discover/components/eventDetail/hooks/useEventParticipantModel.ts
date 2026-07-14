import { useCallback, useMemo } from 'react';

import { calculateAgeOnDate, isAgeWithinRange } from '@/lib/age';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { evaluateDivisionAgeEligibility } from '@/lib/divisionTypes';
import type { FamilyChild } from '@/lib/familyService';
import type { Event, Team, UserData } from '@/types';
import { isActiveFamilyChild, type EventDivisionOption } from '../divisionRegistration';
import { collectUniqueUserIds, normalizeUserId } from '../eventDetailData';
import { parseDateValue } from '../weeklySessions';

type UseEventParticipantModelArgs = {
    event: Event;
    user: UserData | null | undefined;
    players: UserData[];
    teams: Team[];
    freeAgents: UserData[];
    children: FamilyChild[];
    childrenLoading: boolean;
    childrenError: string | null | undefined;
    selectedChildId: string;
    childRegistrationChildId: string | null | undefined;
    eventStartDate: Date | null | undefined;
    eventMinAge?: number;
    eventMaxAge?: number;
    hasAgeLimits: boolean;
    isTeamSignup: boolean;
    selectedDivisionOption: EventDivisionOption | null;
    canRegisterChild: boolean;
};

export function useEventParticipantModel({
    event,
    user,
    players,
    teams,
    freeAgents,
    children,
    childrenLoading,
    childrenError,
    selectedChildId,
    childRegistrationChildId,
    eventStartDate,
    eventMinAge,
    eventMaxAge,
    hasAgeLimits,
    isTeamSignup,
    selectedDivisionOption,
    canRegisterChild,
}: UseEventParticipantModelArgs) {
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    const participantCapacity = resolveEventParticipantCapacity(event);
    const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
    const spotsLeft = participantCapacity > 0
        ? Math.max(0, participantCapacity - totalParticipants)
        : 0;
    const eventFillPercent = participantCapacity > 0
        ? Math.min(100, Math.round((totalParticipants / participantCapacity) * 100))
        : 0;
    const normalizedFreeAgentIds = useMemo(() => {
        const fromEvent = collectUniqueUserIds(event.freeAgentIds);
        const additionalFromProfiles = freeAgents
            .map((entry) => normalizeUserId(entry?.$id))
            .filter((entry): entry is string => Boolean(entry));
        return Array.from(new Set([...fromEvent, ...additionalFromProfiles]));
    }, [event.freeAgentIds, freeAgents]);
    const normalizedWaitlistIds = useMemo(() => {
        const fromEvent = collectUniqueUserIds(event.waitListIds);
        const fromLegacy = collectUniqueUserIds(event.waitList);
        return Array.from(new Set([...fromEvent, ...fromLegacy]));
    }, [event.waitList, event.waitListIds]);
    const normalizedParticipantUserIds = useMemo(
        () => collectUniqueUserIds(event.userIds),
        [event.userIds],
    );
    const normalizedFreeAgentIdSet = useMemo(
        () => new Set(normalizedFreeAgentIds),
        [normalizedFreeAgentIds],
    );
    const normalizedWaitlistIdSet = useMemo(
        () => new Set(normalizedWaitlistIds),
        [normalizedWaitlistIds],
    );
    const isUserRegistered = Boolean(user && (
        (!isTeamSignup && (
            players.some((player) => player.$id === user.$id)
            || normalizedParticipantUserIds.includes(user.$id)
        ))
        || (isTeamSignup && teams.some((team) => (team.playerIds || []).includes(user.$id)))
    ));
    const isUserWaitlisted = Boolean(user && normalizedWaitlistIdSet.has(user.$id));
    const isUserFreeAgent = Boolean(user && normalizedFreeAgentIdSet.has(user.$id));
    const isChildEligible = useCallback((child: FamilyChild): boolean => {
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        if (!childDob) {
            return false;
        }
        const childAgeAtEvent = calculateAgeOnDate(childDob, eventStartDate ?? new Date());
        if (!Number.isFinite(childAgeAtEvent)) {
            return false;
        }
        if (hasAgeLimits) {
            return isAgeWithinRange(childAgeAtEvent, eventMinAge, eventMaxAge);
        }
        if (isTeamSignup || !selectedDivisionOption) {
            return true;
        }
        const divisionEligibility = evaluateDivisionAgeEligibility({
            dateOfBirth: childDob,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
        return !divisionEligibility.applies || divisionEligibility.eligible !== false;
    }, [
        eventMaxAge,
        eventMinAge,
        eventStartDate,
        hasAgeLimits,
        isTeamSignup,
        selectedDivisionOption,
    ]);
    const activeChildren = useMemo(
        () => children.filter(isActiveFamilyChild),
        [children],
    );
    const hasActiveChildren = activeChildren.length > 0;
    const childHasExistingEventState = useCallback((childId: string | null): boolean => Boolean(
        childId
        && (
            normalizedParticipantUserIds.includes(childId)
            || normalizedWaitlistIdSet.has(childId)
            || normalizedFreeAgentIdSet.has(childId)
            || teams.some((team) => (team.playerIds || []).includes(childId))
        )
    ), [normalizedFreeAgentIdSet, normalizedParticipantUserIds, normalizedWaitlistIdSet, teams]);
    const hasLinkedChildRefundTarget = activeChildren.some((child) => (
        childHasExistingEventState(normalizeUserId(child.userId))
    ));
    const hasRefundTarget = Boolean(user && (
        isUserRegistered
        || isUserWaitlisted
        || isUserFreeAgent
        || hasLinkedChildRefundTarget
    ));
    const shouldShowChildRegistrationPanel = canRegisterChild
        && (childrenLoading || Boolean(childrenError) || hasActiveChildren);
    const childOptions = activeChildren.map((child) => {
        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child';
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        const childAgeAtEvent = childDob
            ? calculateAgeOnDate(childDob, eventStartDate ?? new Date())
            : undefined;
        const ageLabel = typeof childAgeAtEvent === 'number' && Number.isFinite(childAgeAtEvent)
            ? `${childAgeAtEvent}y at event`
            : 'age unknown';
        return {
            value: child.userId,
            label: `${name} (${ageLabel})`,
            visible: isChildEligible(child)
                || childHasExistingEventState(normalizeUserId(child.userId)),
        };
    }).filter((option) => option.visible).map(({ value, label }) => ({ value, label }));
    const selectedChild = activeChildren.find((child) => child.userId === selectedChildId);
    const selectedChildEligible = selectedChild ? isChildEligible(selectedChild) : false;
    const selectedChildHasEmail = selectedChild
        ? (typeof selectedChild.hasEmail === 'boolean'
            ? selectedChild.hasEmail
            : Boolean(selectedChild.email))
        : true;
    const selectedChildIsFreeAgent = Boolean(
        selectedChildId && normalizedFreeAgentIdSet.has(selectedChildId),
    );
    const selectedChildIsWaitlisted = Boolean(
        selectedChildId && normalizedWaitlistIdSet.has(selectedChildId),
    );
    const selectedChildIsRegistered = Boolean(
        selectedChildId
        && (
            players.some((participant) => participant.$id === selectedChildId)
            || normalizedParticipantUserIds.includes(selectedChildId)
        ),
    );
    const showChildRegistrationStatus = Boolean(
        selectedChildId && childRegistrationChildId === selectedChildId,
    );

    return {
        totalParticipants,
        participantCapacity,
        eventAtCapacity,
        spotsLeft,
        eventFillPercent,
        normalizedFreeAgentIds,
        normalizedWaitlistIds,
        normalizedParticipantUserIds,
        normalizedFreeAgentIdSet,
        normalizedWaitlistIdSet,
        isUserRegistered,
        isUserWaitlisted,
        isUserFreeAgent,
        activeChildren,
        hasRefundTarget,
        shouldShowChildRegistrationPanel,
        childOptions,
        selectedChild,
        selectedChildEligible,
        selectedChildHasEmail,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
        showChildRegistrationStatus,
    };
}
