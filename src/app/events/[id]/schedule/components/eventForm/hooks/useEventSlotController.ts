import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { SetStateAction } from 'react';
import type { UseFormClearErrors, UseFormGetValues } from 'react-hook-form';

import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { eventService } from '@/lib/eventService';
import type { Event, Field, LeagueConfig, TimeSlot, TournamentConfig } from '@/types';

import { mergeSlotPayloadsForForm } from '../../slotPayloadMerge';
import { buildTournamentConfig } from '../configDefaults';
import type { SlotDivisionLookup } from '../divisionForm';
import { supportsScheduleSlotsForEvent } from '../eventRules';
import { leagueSlotsEqual, slotConflictsEqual } from '../formEquality';
import type { EventFormValues } from '../formTypes';
import { isRentalLockedTimeSlot } from '../rentalResources';
import { toFieldIdList } from '../resourceGroups';
import { buildLeagueScheduleWarning } from '../scheduleMessages';
import {
    buildAutoResolvedSlotUpdate,
    buildExternalSlotConflicts,
    buildSlotConflictCheckKey,
    buildSlotConflictContext,
    CONFLICT_LOOKUP_END,
    CONFLICT_LOOKUP_START,
    slotCanCheckExternalConflicts,
    snapshotToSlotForm,
    type SlotConflictContext,
    type SlotConflictPayload,
} from '../slotConflictHelpers';
import {
    createLeagueSlotForm,
    normalizeLeagueSlotDivisions,
    normalizeLeagueSlotFieldReferences,
    normalizeLeagueSlotUpdate,
    normalizeSlotFieldIds,
    slotMatchesLockedRental,
} from '../slotForm';
import { normalizeSlotState } from '../slotValidation';

type SetEventFormValue = (
    name: string,
    value: unknown,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type SetScheduleConfig<T> = (
    updater: SetStateAction<T>,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
) => void;

type UseEventSlotControllerOptions = {
    activeEditingEvent?: Event | null;
    clearErrors: UseFormClearErrors<EventFormValues>;
    eventEnd?: string | null;
    eventId?: string | null;
    eventStart?: string | null;
    eventSupportsScheduleSlots: boolean;
    eventTimeZone?: string | null;
    eventType: Event['eventType'];
    fields: Field[];
    getValues: UseFormGetValues<EventFormValues>;
    hasExternalRentalField: boolean;
    hasImmutableTimeSlots: boolean;
    immutableFields: Field[];
    immutableTimeSlots: TimeSlot[];
    isAffiliateEvent: boolean;
    isEditMode: boolean;
    leagueSlots: LeagueSlotForm[];
    parentEvent?: string | null;
    rentalLockedSlotsForDraft: TimeSlot[];
    resolvedOrganizationId: string;
    setLeagueData: SetScheduleConfig<LeagueConfig>;
    setPlayoffData: SetScheduleConfig<TournamentConfig>;
    setValue: SetEventFormValue;
    singleDivision: boolean;
    slotDivisionKeys: string[];
    slotDivisionLookup: SlotDivisionLookup;
};

const isDivisionOnlyUpdate = (updates: Partial<LeagueSlotForm>): boolean => (
    Object.keys(updates).every((key) => key === 'divisions')
);

const isResourceOnlyUpdate = (updates: Partial<LeagueSlotForm>): boolean => (
    Object.keys(updates).every((key) => (
        key === 'scheduledFieldId'
        || key === 'scheduledFieldIds'
        || key === 'sourceType'
        || key === 'rentalBookingId'
        || key === 'rentalBookingItemId'
        || key === 'rentalLocked'
        || key === 'price'
        || key === 'requiredTemplateIds'
        || key === 'hostRequiredTemplateIds'
        || key === 'error'
    ))
);

export const useEventSlotController = ({
    activeEditingEvent,
    clearErrors,
    eventEnd,
    eventId,
    eventStart,
    eventSupportsScheduleSlots,
    eventTimeZone,
    eventType,
    fields,
    getValues,
    hasExternalRentalField,
    hasImmutableTimeSlots,
    immutableFields,
    immutableTimeSlots,
    isAffiliateEvent,
    isEditMode,
    leagueSlots,
    parentEvent,
    rentalLockedSlotsForDraft,
    resolvedOrganizationId,
    setLeagueData,
    setPlayoffData,
    setValue,
    singleDivision,
    slotDivisionKeys,
    slotDivisionLookup,
}: UseEventSlotControllerOptions) => {
    const previousEditableScheduleModeRef = useRef<boolean | null>(null);
    const slotConflictRequestRef = useRef(0);
    const slotDivisionKeysRef = useRef<string[]>(slotDivisionKeys);

    useEffect(() => {
        slotDivisionKeysRef.current = slotDivisionKeys;
    }, [slotDivisionKeys]);

    const setLeagueSlots = useCallback((
        updater: SetStateAction<LeagueSlotForm[]>,
        options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
        const current = getValues('leagueSlots');
        const next = typeof updater === 'function'
            ? (updater as (previous: LeagueSlotForm[]) => LeagueSlotForm[])(current)
            : updater;
        if (leagueSlotsEqual(current, next)) {
            return;
        }
        setValue('leagueSlots', next, {
            shouldDirty: options.shouldDirty ?? true,
            shouldValidate: options.shouldValidate ?? true,
        });
    }, [getValues, setValue]);

    const updateLeagueSlots = useCallback((
        updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[],
        options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        setLeagueSlots(
            (previous) => normalizeSlotState(updater(previous), eventType),
            options,
        );
    }, [eventType, hasImmutableTimeSlots, setLeagueSlots]);

    const slotConflictEventId = activeEditingEvent?.$id ?? eventId ?? '';
    const slotConflictCheckKey = useMemo(() => buildSlotConflictCheckKey({
        eventId: slotConflictEventId,
        eventType,
        parentEvent,
        eventStart,
        eventEnd,
        slots: leagueSlots,
    }), [eventEnd, eventStart, eventType, leagueSlots, parentEvent, slotConflictEventId]);
    const slotConflictContext = useMemo<SlotConflictContext>(() => buildSlotConflictContext({
        eventId: slotConflictEventId,
        eventStart,
        eventEnd,
    }), [eventEnd, eventStart, slotConflictEventId]);
    const { hasPendingExternalConflictChecks, hasExternalSlotConflictWarnings } = useMemo(() => {
        if (isAffiliateEvent || !supportsScheduleSlotsForEvent(eventType, parentEvent)) {
            return {
                hasPendingExternalConflictChecks: false,
                hasExternalSlotConflictWarnings: false,
            };
        }

        let hasPending = false;
        let hasConflicts = false;
        for (const slot of leagueSlots) {
            if (!slotCanCheckExternalConflicts(slot, slotConflictContext)) {
                continue;
            }
            if (slot.checking) {
                hasPending = true;
            }
            if (slot.conflicts.length > 0) {
                hasConflicts = true;
            }
            if (hasPending && hasConflicts) {
                break;
            }
        }

        return {
            hasPendingExternalConflictChecks: hasPending,
            hasExternalSlotConflictWarnings: hasConflicts,
        };
    }, [eventType, isAffiliateEvent, leagueSlots, parentEvent, slotConflictContext]);

    useEffect(() => {
        const normalizedSlots = normalizeLeagueSlotDivisions(
            leagueSlots,
            slotDivisionKeys,
            slotDivisionLookup,
            singleDivision,
        );
        if (normalizedSlots === leagueSlots) {
            return;
        }
        updateLeagueSlots((previous) => normalizeLeagueSlotDivisions(
            previous,
            slotDivisionKeys,
            slotDivisionLookup,
            singleDivision,
        ), { shouldDirty: false });
    }, [leagueSlots, singleDivision, slotDivisionKeys, slotDivisionLookup, updateLeagueSlots]);

    useEffect(() => {
        const availableFieldIds = toFieldIdList(fields);
        const normalizedSlots = normalizeLeagueSlotFieldReferences(leagueSlots, availableFieldIds);
        if (normalizedSlots === leagueSlots) {
            return;
        }
        updateLeagueSlots(
            (previous) => normalizeLeagueSlotFieldReferences(previous, availableFieldIds),
            { shouldDirty: false },
        );
    }, [fields, leagueSlots, updateLeagueSlots]);

    useEffect(() => {
        if (hasImmutableTimeSlots) {
            return;
        }

        let payload: SlotConflictPayload;
        try {
            payload = JSON.parse(slotConflictCheckKey) as SlotConflictPayload;
        } catch {
            return;
        }

        const clearConflicts = () => {
            setLeagueSlots((previous) => {
                let changed = false;
                const next = previous.map((slot) => {
                    if (!slot.conflicts.length && slot.checking === false) {
                        return slot;
                    }
                    changed = true;
                    return { ...slot, conflicts: [], checking: false };
                });
                return changed ? next : previous;
            }, { shouldDirty: false });
        };

        if (!supportsScheduleSlotsForEvent(payload.eventType, payload.parentEvent) || payload.slots.length === 0) {
            clearConflicts();
            return;
        }

        const context: SlotConflictContext = {
            eventId: payload.eventId,
            eventStart: payload.eventStart,
            eventEnd: payload.eventEnd,
        };
        const slotForms = payload.slots.map(snapshotToSlotForm);
        const eligibleSlots = slotForms.filter((slot) => slotCanCheckExternalConflicts(slot, context));
        const fieldIds = Array.from(new Set(
            eligibleSlots.flatMap((slot) => normalizeSlotFieldIds(slot)),
        ));
        if (!fieldIds.length) {
            clearConflicts();
            return;
        }

        const requestId = slotConflictRequestRef.current + 1;
        slotConflictRequestRef.current = requestId;
        setLeagueSlots((previous) => {
            let changed = false;
            const next = previous.map((slot) => {
                const shouldCheck = slotCanCheckExternalConflicts(slot, context);
                if (slot.checking === shouldCheck) {
                    return slot;
                }
                changed = true;
                return { ...slot, checking: shouldCheck };
            });
            return changed ? next : previous;
        }, { shouldDirty: false });

        let cancelled = false;
        const loadConflicts = async () => {
            try {
                const blockingByFieldRows = await Promise.all(fieldIds.map(async (fieldId) => {
                    const blocking = await eventService.getBlockingForFieldInRange(
                        fieldId,
                        CONFLICT_LOOKUP_START,
                        CONFLICT_LOOKUP_END,
                        {
                            organizationId: resolvedOrganizationId || undefined,
                            excludeEventId: context.eventId || undefined,
                        },
                    );
                    return [fieldId, blocking] as const;
                }));
                if (cancelled || slotConflictRequestRef.current !== requestId) {
                    return;
                }

                const eventsByFieldId = new Map(
                    blockingByFieldRows.map(([fieldId, blocking]) => [fieldId, blocking.events]),
                );
                const conflictsBySlotKey = new Map(
                    slotForms.map((slot) => [
                        slot.key,
                        slotCanCheckExternalConflicts(slot, context)
                            ? buildExternalSlotConflicts(slot, eventsByFieldId, context)
                            : [],
                    ]),
                );
                setLeagueSlots((previous) => {
                    let changed = false;
                    const next = previous.map((slot) => {
                        const nextConflicts = conflictsBySlotKey.get(slot.key) ?? [];
                        if (slot.checking === false && slotConflictsEqual(slot.conflicts, nextConflicts)) {
                            return slot;
                        }
                        changed = true;
                        return { ...slot, conflicts: nextConflicts, checking: false };
                    });
                    return changed ? next : previous;
                }, { shouldDirty: false });
            } catch (error) {
                if (cancelled || slotConflictRequestRef.current !== requestId) {
                    return;
                }
                console.warn('Failed to load event scheduling conflicts:', error);
                setLeagueSlots((previous) => {
                    let changed = false;
                    const next = previous.map((slot) => {
                        if (slot.checking === false && slot.conflicts.length === 0) {
                            return slot;
                        }
                        changed = true;
                        return { ...slot, conflicts: [], checking: false };
                    });
                    return changed ? next : previous;
                }, { shouldDirty: false });
            }
        };

        void loadConflicts();
        return () => {
            cancelled = true;
        };
    }, [hasImmutableTimeSlots, resolvedOrganizationId, setLeagueSlots, slotConflictCheckKey]);

    const handleAddSlot = useCallback(() => {
        if (hasImmutableTimeSlots) {
            return;
        }
        clearErrors('leagueSlots');
        updateLeagueSlots((previous) => [
            ...previous,
            createLeagueSlotForm(undefined, slotDivisionKeys),
        ]);
    }, [clearErrors, hasImmutableTimeSlots, slotDivisionKeys, updateLeagueSlots]);

    const handleRemoveSlot = useCallback((index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        updateLeagueSlots((previous) => (
            previous.length <= 1 ? previous : previous.filter((_, slotIndex) => slotIndex !== index)
        ));
    }, [hasImmutableTimeSlots, updateLeagueSlots]);

    const handleUpdateSlot = useCallback((index: number, updates: Partial<LeagueSlotForm>) => {
        const allowRentalDivisionEditOnLockedSlots = hasExternalRentalField && !singleDivision;
        const allowRentalResourceEditOnLockedSlots = hasExternalRentalField && isResourceOnlyUpdate(updates);
        const allowUpdateOnLockedSlots = hasImmutableTimeSlots && (
            (allowRentalDivisionEditOnLockedSlots && isDivisionOnlyUpdate(updates))
            || allowRentalResourceEditOnLockedSlots
        );
        if (hasImmutableTimeSlots && !allowUpdateOnLockedSlots) {
            return;
        }

        const current = leagueSlots[index];
        if (!current) {
            return;
        }
        const updated = normalizeLeagueSlotUpdate({
            slot: current,
            updates,
            eventStart,
            eventEnd,
            singleDivision,
            slotDivisionKeys,
            slotDivisionLookup,
        });
        const replaceSlot = (previous: LeagueSlotForm[]) => {
            const next = [...previous];
            next[index] = updated;
            return next;
        };

        if (allowUpdateOnLockedSlots) {
            setLeagueSlots(
                (previous) => normalizeSlotState(replaceSlot(previous), eventType),
            );
        } else {
            updateLeagueSlots(replaceSlot);
        }
        clearErrors('leagueSlots');
    }, [
        clearErrors,
        eventEnd,
        eventStart,
        eventType,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        leagueSlots,
        setLeagueSlots,
        singleDivision,
        slotDivisionKeys,
        slotDivisionLookup,
        updateLeagueSlots,
    ]);

    const handleAutoResolveSlotConflict = useCallback((index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        const slot = leagueSlots[index];
        if (!slot || slot.conflicts.length === 0) {
            return;
        }
        const updates = buildAutoResolvedSlotUpdate(slot, slotConflictContext);
        if (updates) {
            handleUpdateSlot(index, updates);
        }
    }, [handleUpdateSlot, hasImmutableTimeSlots, leagueSlots, slotConflictContext]);

    useEffect(() => {
        if (isEditMode || hasImmutableTimeSlots) {
            return;
        }
        if (activeEditingEvent && supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)) {
            if (activeEditingEvent.eventType === 'LEAGUE' || activeEditingEvent.eventType === 'TOURNAMENT') {
                const source = activeEditingEvent.leagueConfig || activeEditingEvent;
                const includePlayoffsOrPools = Boolean(
                    (source as LeagueConfig & { includePlayoffsOrPools?: boolean }).includePlayoffsOrPools
                    ?? source?.includePlayoffs,
                );
                setLeagueData({
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: includePlayoffsOrPools,
                    playoffTeamCount: source?.playoffTeamCount ?? undefined,
                    usesSets: source?.usesSets ?? false,
                    restTimeMinutes: 0,
                    setDurationMinutes: undefined,
                    setsPerMatch: undefined,
                }, { shouldDirty: false });
                setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
            }

            const fallbackFieldId = activeEditingEvent.fields?.[0]?.$id;
            const editableSlots = (activeEditingEvent.timeSlots || []).filter((slot) => !isRentalLockedTimeSlot(slot));
            const slots = mergeSlotPayloadsForForm(editableSlots, fallbackFieldId)
                .map((slot) => createLeagueSlotForm(
                    slot,
                    slotDivisionKeysRef.current,
                    activeEditingEvent.start,
                    activeEditingEvent.end,
                ));
            const initialSlots = slots.length > 0
                ? slots
                : [createLeagueSlotForm(undefined, slotDivisionKeysRef.current)];
            setLeagueSlots(normalizeSlotState(initialSlots, activeEditingEvent.eventType), { shouldDirty: false });
        } else if (!activeEditingEvent) {
            setLeagueData({
                gamesPerOpponent: 1,
                includePlayoffs: false,
                playoffTeamCount: undefined,
                usesSets: false,
                matchDurationMinutes: 60,
                restTimeMinutes: 0,
                setDurationMinutes: undefined,
                setsPerMatch: undefined,
            }, { shouldDirty: false });
            setLeagueSlots(
                normalizeSlotState([createLeagueSlotForm(undefined, slotDivisionKeysRef.current)], 'EVENT'),
                { shouldDirty: false },
            );
            setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
        }
    }, [activeEditingEvent, hasImmutableTimeSlots, isEditMode, setLeagueData, setLeagueSlots, setPlayoffData]);

    useEffect(() => {
        if (!hasImmutableTimeSlots) {
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        const slotForms = mergeSlotPayloadsForForm(immutableTimeSlots, fallbackFieldId)
            .map((slot) => createLeagueSlotForm(
                slot,
                slotDivisionKeysRef.current,
                eventStart,
                eventEnd,
            ));
        const normalizedSlots = normalizeSlotState(slotForms, eventType);
        setLeagueSlots(
            (previous) => (leagueSlotsEqual(previous, normalizedSlots) ? previous : normalizedSlots),
            { shouldDirty: false },
        );
    }, [eventEnd, eventStart, eventType, hasImmutableTimeSlots, immutableFields, immutableTimeSlots, setLeagueSlots]);

    useEffect(() => {
        const previousMode = previousEditableScheduleModeRef.current;
        previousEditableScheduleModeRef.current = eventSupportsScheduleSlots;
        if (previousMode === null || previousMode === eventSupportsScheduleSlots || !eventSupportsScheduleSlots) {
            return;
        }
        if (!rentalLockedSlotsForDraft.length) {
            return;
        }

        setLeagueSlots((previousSlots) => {
            const seededFromRentalDefaults = previousSlots.length > 0
                && previousSlots.every((slot) => rentalLockedSlotsForDraft.some((lockedSlot) => (
                    slotMatchesLockedRental(slot, lockedSlot)
                )));
            if (!seededFromRentalDefaults) {
                return previousSlots;
            }
            return normalizeSlotState(
                [createLeagueSlotForm(undefined, slotDivisionKeysRef.current, eventStart, eventEnd, eventTimeZone)],
                eventType,
                parentEvent,
            );
        }, { shouldDirty: false });
    }, [
        eventEnd,
        eventStart,
        eventSupportsScheduleSlots,
        eventTimeZone,
        eventType,
        parentEvent,
        rentalLockedSlotsForDraft,
        setLeagueSlots,
    ]);

    useEffect(() => {
        updateLeagueSlots((previous) => previous, { shouldDirty: false });
    }, [eventType, updateLeagueSlots]);

    const leagueWarning = useMemo(() => buildLeagueScheduleWarning({
        hasPendingExternalConflictChecks,
        hasExternalSlotConflictWarnings,
    }), [hasExternalSlotConflictWarnings, hasPendingExternalConflictChecks]);

    return {
        handleAddSlot,
        handleAutoResolveSlotConflict,
        handleRemoveSlot,
        handleUpdateSlot,
        leagueWarning,
    };
};
