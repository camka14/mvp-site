import {
    useCallback,
    useEffect,
    useMemo,
} from 'react';

import { createClientId } from '@/lib/clientId';
import { normalizeEntityId } from '@/lib/organizationEventAccess';
import type {
    EventOfficial,
    EventOfficialPosition,
    UserData,
} from '@/types';

import {
    buildAvailableOfficialFieldOptions,
    buildOfficialPositionsFromTemplates,
    buildOfficialStaffingCoverageError,
    countAssignedActiveOfficialsForStaffing,
    countRequiredOfficialSlotsPerMatch,
    getEventOfficialUserIds,
    normalizeEventOfficials,
    normalizeSportOfficialPositionTemplates,
} from '../officials';
import { stringArraysEqual } from '../shared';
import type { UseStaffOfficialControllerParams } from './staffOfficialControllerTypes';

type UseOfficialAssignmentsControllerParams = Pick<
    UseStaffOfficialControllerParams,
    | 'eventData'
    | 'fields'
    | 'isOrganizationHostedEvent'
    | 'selectedFieldIds'
    | 'selectedSportForOfficials'
    | 'setEventData'
    | 'setValue'
> & {
    organizationAllowedOfficialIdSet: Set<string>;
    organizationOfficialsById: Map<string, UserData>;
};

export const useOfficialAssignmentsController = ({
    eventData,
    fields,
    isOrganizationHostedEvent,
    organizationAllowedOfficialIdSet,
    organizationOfficialsById,
    selectedFieldIds,
    selectedSportForOfficials,
    setEventData,
    setValue,
}: UseOfficialAssignmentsControllerParams) => {
    const sportOfficialPositionTemplates = useMemo(
        () => normalizeSportOfficialPositionTemplates(selectedSportForOfficials?.officialPositionTemplates),
        [selectedSportForOfficials],
    );
    const availableOfficialFieldOptions = useMemo(
        () => buildAvailableOfficialFieldOptions(fields, selectedFieldIds),
        [fields, selectedFieldIds],
    );
    const eventOfficialByUserId = useMemo(
        () => new Map((eventData.eventOfficials || []).map((official) => [official.userId, official] as const)),
        [eventData.eventOfficials],
    );

    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const nextEventOfficials = normalizeEventOfficials(
            (eventData.eventOfficials || []).filter((official) => organizationAllowedOfficialIdSet.has(official.userId)),
            [],
            eventData.officialPositions || [],
        );
        const nextOfficialIds = getEventOfficialUserIds(nextEventOfficials);
        const nextOfficials = nextOfficialIds
            .map((id) => organizationOfficialsById.get(id))
            .filter((candidate): candidate is UserData => Boolean(candidate));
        if (
            stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), nextOfficialIds)
            && JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(nextEventOfficials)
            && stringArraysEqual(
                (eventData.officials || []).map((official) => official?.$id).filter((id): id is string => Boolean(id)),
                nextOfficials.map((official) => official.$id),
            )
        ) {
            return;
        }
        setEventData((previous) => ({
            ...previous,
            officialIds: nextOfficialIds,
            eventOfficials: nextEventOfficials,
            officials: nextOfficials,
        }), { shouldDirty: false });
    }, [
        eventData.eventOfficials,
        eventData.officialPositions,
        eventData.officialIds,
        eventData.officials,
        isOrganizationHostedEvent,
        organizationAllowedOfficialIdSet,
        organizationOfficialsById,
        setEventData,
    ]);

    useEffect(() => {
        const normalized = normalizeEventOfficials(
            eventData.eventOfficials,
            Array.isArray(eventData.eventOfficials) ? [] : eventData.officialIds || [],
            eventData.officialPositions || [],
        );
        const normalizedOfficialIds = getEventOfficialUserIds(normalized);
        if (
            JSON.stringify(eventData.eventOfficials || []) === JSON.stringify(normalized)
            && stringArraysEqual((eventData.officialIds || []).map((id) => String(id)).filter(Boolean), normalizedOfficialIds)
        ) {
            return;
        }
        setValue('eventOfficials', normalized, { shouldDirty: false, shouldValidate: false });
        setValue('officialIds', normalizedOfficialIds, { shouldDirty: false, shouldValidate: false });
    }, [eventData.eventOfficials, eventData.officialIds, eventData.officialPositions, setValue]);

    const handleResetOfficialPositionsFromSport = useCallback(() => {
        const nextPositions = buildOfficialPositionsFromTemplates(sportOfficialPositionTemplates);
        setEventData((previous) => ({
            ...previous,
            officialPositions: nextPositions,
            eventOfficials: normalizeEventOfficials(previous.eventOfficials, getEventOfficialUserIds(previous.eventOfficials), nextPositions),
            officialIds: getEventOfficialUserIds(previous.eventOfficials),
        }));
    }, [setEventData, sportOfficialPositionTemplates]);

    const handleAddOfficialPosition = useCallback(() => {
        setEventData((previous) => {
            const nextPositions = [
                ...(previous.officialPositions || []),
                {
                    id: createClientId(),
                    name: '',
                    count: 1,
                    order: (previous.officialPositions || []).length,
                } satisfies EventOfficialPosition,
            ];
            return {
                ...previous,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(previous.eventOfficials, getEventOfficialUserIds(previous.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(previous.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateOfficialPosition = useCallback((
        positionId: string,
        updates: Partial<Pick<EventOfficialPosition, 'name' | 'count'>>,
    ) => {
        setEventData((previous) => {
            const nextPositions = (previous.officialPositions || []).map((position, index) => (
                position.id === positionId
                    ? {
                        ...position,
                        name: updates.name ?? position.name,
                        count: updates.count !== undefined
                            ? Math.max(1, Math.trunc(updates.count || 1))
                            : position.count,
                        order: index,
                    }
                    : { ...position, order: index }
            ));
            return {
                ...previous,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(previous.eventOfficials, getEventOfficialUserIds(previous.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(previous.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleRemoveOfficialPosition = useCallback((positionId: string) => {
        setEventData((previous) => {
            const nextPositions = (previous.officialPositions || [])
                .filter((position) => position.id !== positionId)
                .map((position, index) => ({ ...position, order: index }));
            return {
                ...previous,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(previous.eventOfficials, getEventOfficialUserIds(previous.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(previous.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateEventOfficialEligibility = useCallback((
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => {
        setEventData((previous) => {
            const nextPositions = previous.officialPositions || [];
            const nextOfficials = normalizeEventOfficials(previous.eventOfficials, getEventOfficialUserIds(previous.eventOfficials), nextPositions).map((official) => {
                if (official.userId !== userId) {
                    return official;
                }
                return {
                    ...official,
                    positionIds: updates.positionIds !== undefined
                        ? Array.from(new Set(updates.positionIds.filter(Boolean)))
                        : official.positionIds,
                    fieldIds: updates.fieldIds !== undefined
                        ? Array.from(new Set(updates.fieldIds.filter(Boolean)))
                        : official.fieldIds,
                };
            });
            return {
                ...previous,
                eventOfficials: normalizeEventOfficials(nextOfficials, getEventOfficialUserIds(nextOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(nextOfficials),
            };
        });
    }, [setEventData]);

    const handleAddOfficial = useCallback((official: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const officialId = normalizeEntityId(official.$id ?? official.userId);
        if (!officialId || (isOrganizationHostedEvent && !organizationAllowedOfficialIdSet.has(officialId))) {
            return;
        }
        setEventData((previous) => {
            const nextPositions = previous.officialPositions || [];
            const existingOfficials = normalizeEventOfficials(
                previous.eventOfficials,
                getEventOfficialUserIds(previous.eventOfficials),
                nextPositions,
            );
            const nextEventOfficials = normalizeEventOfficials(
                existingOfficials.some((entry) => entry.userId === officialId)
                    ? existingOfficials
                    : [
                        ...existingOfficials,
                        {
                            id: createClientId(),
                            userId: officialId,
                            positionIds: nextPositions.map((position) => position.id),
                            fieldIds: [],
                            isActive: true,
                        } satisfies EventOfficial,
                    ],
                [],
                nextPositions,
            );
            const nextIds = getEventOfficialUserIds(nextEventOfficials);
            const nextRefs = official.$id && !(previous.officials || []).some((ref) => ref.$id === official.$id)
                ? [...(previous.officials || []), official as UserData]
                : previous.officials || [];
            return {
                ...previous,
                officialIds: nextIds,
                eventOfficials: nextEventOfficials,
                officials: nextRefs,
            };
        });
    }, [isOrganizationHostedEvent, organizationAllowedOfficialIdSet, setEventData]);

    const handleRemoveOfficial = useCallback((officialId: string) => {
        setEventData((previous) => ({
            ...previous,
            eventOfficials: normalizeEventOfficials(
                (previous.eventOfficials || []).filter((official) => official.userId !== officialId),
                [],
                previous.officialPositions || [],
            ),
            officialIds: getEventOfficialUserIds(
                (previous.eventOfficials || []).filter((official) => official.userId !== officialId),
            ),
            officials: (previous.officials || []).filter((reference) => reference.$id !== officialId),
        }));
    }, [setEventData]);

    const requiredOfficialSlotsPerMatch = useMemo(
        () => countRequiredOfficialSlotsPerMatch(eventData.officialPositions),
        [eventData.officialPositions],
    );
    const assignedActiveOfficialsForStaffing = useMemo(
        () => countAssignedActiveOfficialsForStaffing(eventData.eventOfficials, eventData.officialPositions),
        [eventData.eventOfficials, eventData.officialPositions],
    );
    const officialStaffingCoverageError = useMemo(
        () => buildOfficialStaffingCoverageError({
            mode: eventData.officialSchedulingMode,
            requiredOfficialSlotsPerMatch,
            assignedActiveOfficialsForStaffing,
        }),
        [assignedActiveOfficialsForStaffing, eventData.officialSchedulingMode, requiredOfficialSlotsPerMatch],
    );

    return {
        assignedActiveOfficialsForStaffing,
        availableOfficialFieldOptions,
        eventOfficialByUserId,
        handleAddOfficial,
        handleAddOfficialPosition,
        handleRemoveOfficial,
        handleRemoveOfficialPosition,
        handleResetOfficialPositionsFromSport,
        handleUpdateEventOfficialEligibility,
        handleUpdateOfficialPosition,
        officialStaffingCoverageError,
        requiredOfficialSlotsPerMatch,
        sportOfficialPositionTemplates,
    };
};
