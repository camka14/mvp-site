import { useCallback, useMemo } from 'react';

import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';
import {
    buildDivisionCapacityBreakdown,
    isDivisionAtCapacity,
    resolveDivisionCapacitySnapshot,
} from '@/lib/divisionCapacity';
import { buildDivisionDisplayNameIndex, resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import {
    evaluateDivisionAgeEligibility,
    extractDivisionTokenFromId,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { FamilyChild } from '@/lib/familyService';
import type { Event, Team, UserData } from '@/types';
import {
    buildDivisionOptionsForEvent,
    formatInstallmentDueDateLabel,
    formatInstallmentRelativeDueDayLabel,
    getDivisionIdFromEventEntry,
    isActiveFamilyChild,
    isDivisionOptionEligibleForRegistrant,
    normalizeDivisionKey,
    normalizeInstallmentAmountsCents,
    normalizeInstallmentDueDateValues,
    normalizeInstallmentDueRelativeDayValues,
    normalizePriceCents,
    type EventDivisionOption,
} from '../divisionRegistration';
import { buildPublicDivisionGroups } from '../eventDetailPresentation';
import type { ParticipantDivisionCapacityRow } from '../EventParticipantsSection';
import { parseDateValue, type WeeklySessionOption } from '../weeklySessions';

export type DivisionSelectionPayload = {
    divisionId?: string;
    divisionTypeId?: string;
    divisionTypeKey?: string;
    slotId?: string;
    occurrenceDate?: string;
};

type RegistrationProgressSelection = {
    selectedDivisionId?: string | null;
    selectedDivisionTypeKey?: string | null;
};

type UseEventDivisionRegistrationModelArgs = {
    event: Event;
    user: UserData | null | undefined;
    children: FamilyChild[];
    teams: Team[];
    selectedChildId: string;
    selectedDivisionId: string;
    selectedDivisionTypeKey: string;
    selectedWeeklyOccurrence?: WeeklyOccurrenceSelection;
    selectedWeeklyOccurrenceOption: WeeklySessionOption | null;
    isWeeklyParentEvent: boolean;
    saveRegistrationProgress: (selection: RegistrationProgressSelection) => void;
    onSelectedDivisionIdChange: (divisionId: string) => void;
    onSelectedDivisionTypeKeyChange: (divisionTypeKey: string) => void;
};

export function useEventDivisionRegistrationModel({
    event,
    user,
    children,
    teams,
    selectedChildId,
    selectedDivisionId,
    selectedDivisionTypeKey,
    selectedWeeklyOccurrence,
    selectedWeeklyOccurrenceOption,
    isWeeklyParentEvent,
    saveRegistrationProgress,
    onSelectedDivisionIdChange,
    onSelectedDivisionTypeKeyChange,
}: UseEventDivisionRegistrationModelArgs) {
    const eventStartDate = selectedWeeklyOccurrenceOption?.start ?? parseDateValue(event.start ?? null);
    const eventMinAge = typeof event.minAge === 'number' ? event.minAge : undefined;
    const eventMaxAge = typeof event.maxAge === 'number' ? event.maxAge : undefined;
    const hasAgeLimits = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    const eventHasStarted = Boolean(eventStartDate && new Date() >= eventStartDate);
    const joinClosedMessage = isWeeklyParentEvent && selectedWeeklyOccurrenceOption
        ? 'This weekly session has already started. Joining is closed.'
        : 'This event has already started. Joining is closed.';
    const userDob = parseDateValue(user?.dateOfBirth ?? null);
    const selectedChildForDivisionFilter = useMemo(() => {
        if (event.teamSignup || !selectedChildId) {
            return null;
        }
        return children.find((child) => (
            child.userId === selectedChildId && isActiveFamilyChild(child)
        )) ?? null;
    }, [children, event.teamSignup, selectedChildId]);
    const selectedChildDobForDivisionFilter = parseDateValue(
        selectedChildForDivisionFilter?.dateOfBirth ?? null,
    );
    const divisionRegistrantDob = selectedChildDobForDivisionFilter ?? userDob;
    const registrationByDivisionType = Boolean(event.registrationByDivisionType);
    const allDivisionOptions = useMemo(
        () => buildDivisionOptionsForEvent(event),
        [event],
    );
    const divisionOptions = useMemo(
        () => allDivisionOptions.filter((division) => (
            isDivisionOptionEligibleForRegistrant({
                division,
                dateOfBirth: divisionRegistrantDob,
                eventStartDate,
                eventMinAge,
                eventMaxAge,
            })
        )),
        [allDivisionOptions, divisionRegistrantDob, eventMaxAge, eventMinAge, eventStartDate],
    );
    const publicDivisionGroups = useMemo(
        () => buildPublicDivisionGroups(divisionOptions),
        [divisionOptions],
    );
    const divisionDisplayNameIndex = useMemo(
        () => buildDivisionDisplayNameIndex(event.divisionDetails),
        [event.divisionDetails],
    );
    const eventDivisionLabels = useMemo(() => {
        const nameById = new Map<string, string>();
        allDivisionOptions.forEach((option) => {
            const normalizedId = normalizeDivisionKey(option.id);
            if (normalizedId && !nameById.has(normalizedId)) {
                nameById.set(normalizedId, option.name);
            }
        });

        const labels: string[] = [];
        const seen = new Set<string>();
        const appendLabel = (value: string | null | undefined) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed.length) return;
            const dedupeKey = trimmed.toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            labels.push(trimmed);
        };

        if (!Array.isArray(event.divisions)) {
            return labels;
        }

        event.divisions.forEach((division) => {
            const divisionId = getDivisionIdFromEventEntry(division);
            const fromOptions = divisionId ? nameById.get(divisionId) : null;
            if (fromOptions) {
                appendLabel(fromOptions);
                return;
            }

            if (division && typeof division === 'object') {
                const explicitName = typeof division.name === 'string' ? division.name : null;
                if (explicitName) {
                    appendLabel(explicitName);
                    return;
                }
            }

            if (divisionId) {
                const inferred = inferDivisionDetails({
                    identifier: extractDivisionTokenFromId(divisionId) ?? divisionId,
                    sportInput:
                        typeof event.sport === 'string'
                            ? event.sport
                            : event.sport?.name ?? event.sportId ?? undefined,
                });
                appendLabel(inferred.defaultName || divisionId);
                return;
            }

            if (typeof division === 'string') {
                appendLabel(division);
            }
        });

        return labels;
    }, [allDivisionOptions, event.divisions, event.sport, event.sportId]);
    const selectedDivisionOption = useMemo(() => {
        if (!divisionOptions.length) {
            return null;
        }
        if (registrationByDivisionType) {
            const matchingByType = divisionOptions.filter(
                (option) => option.divisionTypeKey === selectedDivisionTypeKey,
            );
            if (matchingByType.length) {
                return [...matchingByType].sort((left, right) => left.name.localeCompare(right.name))[0];
            }
            return divisionOptions[0];
        }
        return divisionOptions.find((option) => option.id === selectedDivisionId) ?? divisionOptions[0];
    }, [divisionOptions, registrationByDivisionType, selectedDivisionId, selectedDivisionTypeKey]);
    const handlePublicDivisionSelect = useCallback((division: EventDivisionOption) => {
        if (registrationByDivisionType) {
            onSelectedDivisionTypeKeyChange(division.divisionTypeKey);
            saveRegistrationProgress({
                selectedDivisionTypeKey: division.divisionTypeKey,
            });
            return;
        }
        onSelectedDivisionIdChange(division.id);
        saveRegistrationProgress({
            selectedDivisionId: division.id,
        });
    }, [
        onSelectedDivisionIdChange,
        onSelectedDivisionTypeKeyChange,
        registrationByDivisionType,
        saveRegistrationProgress,
    ]);
    const divisionSelectionPayload = useMemo<DivisionSelectionPayload>(() => {
        if (!selectedDivisionOption) {
            return {};
        }
        if (registrationByDivisionType) {
            return {
                divisionTypeKey: selectedDivisionTypeKey || selectedDivisionOption.divisionTypeKey,
                divisionTypeId: selectedDivisionOption.divisionTypeId,
                divisionId: selectedDivisionOption.id,
            };
        }
        return {
            divisionId: selectedDivisionOption.id,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            divisionTypeKey: selectedDivisionOption.divisionTypeKey,
        };
    }, [registrationByDivisionType, selectedDivisionOption, selectedDivisionTypeKey]);
    const resolvedDivisionSelectionPayload = useMemo<DivisionSelectionPayload>(() => (
        selectedWeeklyOccurrence
            ? {
                ...divisionSelectionPayload,
                slotId: selectedWeeklyOccurrence.slotId ?? undefined,
                occurrenceDate: selectedWeeklyOccurrence.occurrenceDate ?? undefined,
            }
            : divisionSelectionPayload
    ), [divisionSelectionPayload, selectedWeeklyOccurrence]);
    const isDivisionSelectionMissing = useMemo(() => {
        if (!allDivisionOptions.length) {
            return false;
        }
        if (!divisionOptions.length) {
            return true;
        }
        if (registrationByDivisionType) {
            return !(selectedDivisionTypeKey || selectedDivisionOption?.divisionTypeKey);
        }
        return !(selectedDivisionId || selectedDivisionOption?.id);
    }, [
        allDivisionOptions.length,
        divisionOptions.length,
        registrationByDivisionType,
        selectedDivisionId,
        selectedDivisionOption,
        selectedDivisionTypeKey,
    ]);
    const selectedDivisionCapacitySnapshot = useMemo(
        () => resolveDivisionCapacitySnapshot({
            event,
            divisionId: selectedDivisionOption?.id,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [event, selectedDivisionOption?.id, teams],
    );
    const selectedDivisionAtCapacity = isDivisionAtCapacity(selectedDivisionCapacitySnapshot);
    const divisionCapacityBreakdown = useMemo(
        () => buildDivisionCapacityBreakdown({
            event,
            excludePlayoffs: true,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [event, teams],
    );
    const participantDivisionCapacityRows = useMemo<ParticipantDivisionCapacityRow[]>(() => {
        const sportInput = typeof event.sport === 'string'
            ? event.sport
            : event.sport?.name ?? event.sportId ?? null;
        return divisionCapacityBreakdown.map((row) => ({
            id: row.divisionId,
            label: resolveDivisionDisplayName({
                division: row.divisionId,
                divisionNameIndex: divisionDisplayNameIndex,
                sportInput,
            }) ?? row.name ?? 'Division',
            filled: row.filled,
            capacity: row.capacity,
            spotsLeft: row.capacity > 0 ? Math.max(0, row.capacity - row.filled) : 0,
            fillPercent: row.capacity > 0
                ? Math.min(100, Math.round((row.filled / row.capacity) * 100))
                : 0,
        }));
    }, [event.sport, event.sportId, divisionCapacityBreakdown, divisionDisplayNameIndex]);
    const selectedDivisionBilling = useMemo(() => {
        const eventPriceCents = normalizePriceCents(event.price);
        const eventAllowPaymentPlans = Boolean(event.allowPaymentPlans);
        const eventInstallmentAmounts = normalizeInstallmentAmountsCents(event.installmentAmounts);
        const eventInstallmentDueDates = normalizeInstallmentDueDateValues(event.installmentDueDates);
        const eventInstallmentDueRelativeDays = normalizeInstallmentDueRelativeDayValues(
            event.installmentDueRelativeDays,
        );
        const eventInstallmentCount = Number.isFinite(Number(event.installmentCount))
            ? Math.max(0, Math.trunc(Number(event.installmentCount)))
            : eventInstallmentAmounts.length;

        if (!selectedDivisionOption) {
            return {
                priceCents: eventPriceCents,
                allowPaymentPlans: eventAllowPaymentPlans,
                installmentCount: eventAllowPaymentPlans
                    ? (eventInstallmentCount || eventInstallmentAmounts.length || 0)
                    : 0,
                installmentAmounts: eventAllowPaymentPlans ? eventInstallmentAmounts : [],
                installmentDueDates: eventAllowPaymentPlans ? eventInstallmentDueDates : [],
                installmentDueRelativeDays: eventAllowPaymentPlans ? eventInstallmentDueRelativeDays : [],
            };
        }

        const divisionPriceCents = typeof selectedDivisionOption.priceCents === 'number'
            ? normalizePriceCents(selectedDivisionOption.priceCents)
            : eventPriceCents;
        const divisionAllowPaymentPlans = typeof selectedDivisionOption.allowPaymentPlans === 'boolean'
            ? selectedDivisionOption.allowPaymentPlans
            : eventAllowPaymentPlans;
        const divisionInstallmentAmounts = divisionAllowPaymentPlans
            ? (selectedDivisionOption.installmentAmounts?.length
                ? selectedDivisionOption.installmentAmounts
                : eventInstallmentAmounts).map((value) => normalizePriceCents(value))
            : [];
        const divisionInstallmentDueDates = divisionAllowPaymentPlans
            ? (selectedDivisionOption.installmentDueDates?.length
                ? selectedDivisionOption.installmentDueDates
                : eventInstallmentDueDates)
            : [];
        const divisionInstallmentDueRelativeDays = divisionAllowPaymentPlans
            ? (selectedDivisionOption.installmentDueRelativeDays?.length
                ? selectedDivisionOption.installmentDueRelativeDays
                : eventInstallmentDueRelativeDays)
            : [];
        const divisionInstallmentCount = divisionAllowPaymentPlans
            ? (typeof selectedDivisionOption.installmentCount === 'number'
                ? Math.max(0, Math.trunc(selectedDivisionOption.installmentCount))
                : (divisionInstallmentAmounts.length || eventInstallmentCount || 0))
            : 0;

        return {
            priceCents: divisionPriceCents,
            allowPaymentPlans: divisionAllowPaymentPlans,
            installmentCount: divisionInstallmentCount,
            installmentAmounts: divisionInstallmentAmounts,
            installmentDueDates: divisionInstallmentDueDates,
            installmentDueRelativeDays: divisionInstallmentDueRelativeDays,
        };
    }, [event, selectedDivisionOption]);
    const checkoutEvent = useMemo(() => ({
        ...event,
        price: selectedDivisionBilling.priceCents,
        allowPaymentPlans: selectedDivisionBilling.allowPaymentPlans,
        installmentCount: selectedDivisionBilling.installmentCount,
        installmentAmounts: selectedDivisionBilling.installmentAmounts,
        installmentDueDates: selectedDivisionBilling.installmentDueDates,
        installmentDueRelativeDays: selectedDivisionBilling.installmentDueRelativeDays,
    }), [event, selectedDivisionBilling]);
    const paymentPlanPreviewRows = useMemo(() => {
        const normalizedAmounts = normalizeInstallmentAmountsCents(selectedDivisionBilling.installmentAmounts);
        const normalizedDueDates = normalizeInstallmentDueDateValues(selectedDivisionBilling.installmentDueDates);
        const normalizedRelativeDueDays = normalizeInstallmentDueRelativeDayValues(
            selectedDivisionBilling.installmentDueRelativeDays,
        );
        const useRelativeDueDates = event.eventType === 'WEEKLY_EVENT' && !event.parentEvent;
        const rowCount = Math.max(
            selectedDivisionBilling.installmentCount || 0,
            normalizedAmounts.length,
            useRelativeDueDates ? normalizedRelativeDueDays.length : normalizedDueDates.length,
        );

        return Array.from({ length: rowCount }, (_, index) => ({
            id: `${index}-${normalizedAmounts[index] ?? 0}-${useRelativeDueDates ? normalizedRelativeDueDays[index] ?? '' : normalizedDueDates[index] ?? ''}`,
            installmentNumber: index + 1,
            amountCents: normalizedAmounts[index] ?? 0,
            dueDateLabel: useRelativeDueDates
                ? formatInstallmentRelativeDueDayLabel(normalizedRelativeDueDays[index] ?? 0)
                : formatInstallmentDueDateLabel(normalizedDueDates[index] ?? ''),
        }));
    }, [
        event.eventType,
        event.parentEvent,
        selectedDivisionBilling.installmentAmounts,
        selectedDivisionBilling.installmentCount,
        selectedDivisionBilling.installmentDueDates,
        selectedDivisionBilling.installmentDueRelativeDays,
    ]);
    const userAge = userDob ? calculateAgeOnDate(userDob, eventStartDate ?? new Date()) : undefined;
    const hasValidUserAge = typeof userAge === 'number' && Number.isFinite(userAge);
    const isMinor = typeof userAge === 'number' && Number.isFinite(userAge) && userAge < 18;
    const isAdult = typeof userAge === 'number' && Number.isFinite(userAge) && userAge >= 18;
    const ageWithinLimits = !hasAgeLimits
        || (typeof userAge === 'number'
            && Number.isFinite(userAge)
            && isAgeWithinRange(userAge, eventMinAge, eventMaxAge));
    const selectedDivisionAgeForUser = useMemo(() => {
        if (!selectedDivisionOption) {
            return null;
        }
        return evaluateDivisionAgeEligibility({
            dateOfBirth: userDob ?? undefined,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
    }, [eventStartDate, selectedDivisionOption, userDob]);
    const selfRegistrationBlockedReason = (() => {
        if (!user) return null;
        if (eventHasStarted) {
            return joinClosedMessage;
        }
        if (!hasValidUserAge) {
            return 'Add your date of birth to your profile to register for events.';
        }
        if (!ageWithinLimits) {
            return `This event is limited to ages ${formatAgeRange(eventMinAge, eventMaxAge)}.`;
        }
        if (selectedDivisionAgeForUser?.applies && selectedDivisionAgeForUser.eligible === false) {
            return selectedDivisionAgeForUser.message
                ? `Selected division age requirement: ${selectedDivisionAgeForUser.message}.`
                : 'You are not age-eligible for the selected division.';
        }
        return null;
    })();
    const canRegisterChild = isAdult && !eventHasStarted;
    const isEventHost = Boolean(user && user.$id === event.hostId);
    const isFreeEvent = selectedDivisionBilling.priceCents === 0;
    const shouldBypassHostPayment = Boolean(isEventHost && !event.teamSignup);
    const isFreeForUser = isFreeEvent || shouldBypassHostPayment;

    return {
        eventStartDate,
        eventMinAge,
        eventMaxAge,
        hasAgeLimits,
        eventHasStarted,
        joinClosedMessage,
        userDob,
        registrationByDivisionType,
        allDivisionOptions,
        divisionOptions,
        publicDivisionGroups,
        divisionDisplayNameIndex,
        eventDivisionLabels,
        selectedDivisionOption,
        handlePublicDivisionSelect,
        resolvedDivisionSelectionPayload,
        isDivisionSelectionMissing,
        selectedDivisionAtCapacity,
        participantDivisionCapacityRows,
        selectedDivisionBilling,
        checkoutEvent,
        paymentPlanPreviewRows,
        isMinor,
        isAdult,
        selfRegistrationBlockedReason,
        canRegisterChild,
        isEventHost,
        isFreeForUser,
    };
}
