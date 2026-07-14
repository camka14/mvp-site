import {
    useCallback,
    useImperativeHandle,
    useRef,
} from 'react';
import type {
    ForwardedRef,
    MutableRefObject,
    SetStateAction,
} from 'react';
import type {
    FieldErrors,
    UseFormGetValues,
    UseFormTrigger,
} from 'react-hook-form';

import type { EventStaffDraft, EventStaffSnapshot } from '@/lib/eventStaffService';
import type { Event, RegistrationQuestionDraft } from '@/types';

import { buildEventDraft } from '../buildEventDraft';
import type { EventFormValues } from '../formTypes';
import { supportsScheduleSlotsForEvent } from '../eventRules';
import type { buildEventFormSchema } from '../schema';
import {
    normalizePendingStaffInvite,
    type PendingStaffInvite,
} from '../staffInvites';
import type { EventFormHandle } from '../types';
import {
    dedupeValidationErrors,
    flattenFormErrors,
    flattenZodIssues,
    type FlattenedFormError,
} from '../validationErrors';

type BuildEventDraftInput = Parameters<typeof buildEventDraft>[0];
type EventDraftContext = Omit<BuildEventDraftInput, 'previousEventFieldLocation' | 'source'>;
type EventFormStateSetter<T> = (
    updater: SetStateAction<T>,
    options?: Record<string, unknown>,
) => void;

type UseEventFormSubmissionControllerParams = EventDraftContext & {
    assignedActiveOfficialsForStaffing: number;
    commitDirtyBaseline: () => void;
    errors: FieldErrors<EventFormValues>;
    eventData: EventFormValues;
    eventValidationSchema: ReturnType<typeof buildEventFormSchema>;
    formRef: ForwardedRef<EventFormHandle>;
    getValues: UseFormGetValues<EventFormValues>;
    isAffiliateEvent: boolean;
    officialStaffingCoverageError: string | null;
    previousEventFieldLocationRef: MutableRefObject<string>;
    registrationQuestionDrafts: RegistrationQuestionDraft[];
    requiredOfficialSlotsPerMatch: number;
    setEventData: EventFormStateSetter<EventFormValues>;
    trigger: UseFormTrigger<EventFormValues>;
    validatePendingStaffAssignments: () => Promise<void>;
};

export const useEventFormSubmissionController = ({
    activeEditingEvent,
    assignedActiveOfficialsForStaffing,
    commitDirtyBaseline,
    currentUser,
    errors,
    eventData,
    eventValidationSchema,
    fieldCount,
    fields,
    fieldsReferencedInSlots,
    formRef,
    getValues,
    hasImmutableTimeSlots,
    hasRestrictedImmutableFields,
    hasStripeAccount,
    immutableFields,
    immutableTimeSlots,
    isAffiliateEvent,
    isEditMode,
    isOrganizationHostedEvent,
    isOrganizationManagedEvent,
    joinAsParticipant,
    officialStaffingCoverageError,
    organizationHostedEventId,
    organizationOfficialsById,
    previousEventFieldLocationRef,
    registrationQuestionDrafts,
    rentalLockedSlotsForDraft,
    rentalPurchase,
    requiredOfficialSlotsPerMatch,
    resolvedOrganization,
    selectedRentedFieldIds,
    setEventData,
    shouldManageLocalFields,
    shouldProvisionFields,
    sportsById,
    trigger,
    validatePendingStaffAssignments,
}: UseEventFormSubmissionControllerParams) => {
    const lastValidationErrorsRef = useRef<FlattenedFormError[]>([]);

    const buildDraftEvent = useCallback((formValues?: EventFormValues): Partial<Event> => (
        buildEventDraft({
            activeEditingEvent,
            currentUser,
            fieldCount,
            fields,
            fieldsReferencedInSlots,
            hasImmutableTimeSlots,
            hasRestrictedImmutableFields,
            hasStripeAccount,
            immutableFields,
            immutableTimeSlots,
            isEditMode,
            isOrganizationHostedEvent,
            isOrganizationManagedEvent,
            joinAsParticipant,
            organizationHostedEventId,
            organizationOfficialsById,
            previousEventFieldLocation: previousEventFieldLocationRef.current,
            rentalLockedSlotsForDraft,
            rentalPurchase,
            resolvedOrganization,
            selectedRentedFieldIds,
            shouldManageLocalFields,
            shouldProvisionFields,
            source: formValues ?? eventData,
            sportsById,
        })
    ), [
        activeEditingEvent,
        currentUser,
        eventData,
        fieldCount,
        fields,
        fieldsReferencedInSlots,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        joinAsParticipant,
        organizationHostedEventId,
        organizationOfficialsById,
        previousEventFieldLocationRef,
        rentalLockedSlotsForDraft,
        rentalPurchase,
        resolvedOrganization,
        selectedRentedFieldIds,
        shouldManageLocalFields,
        shouldProvisionFields,
        sportsById,
    ]);

    const getDraftSnapshot = useCallback((): EventStaffDraft => ({
        ...buildDraftEvent(getValues()),
        pendingStaffInvites: isAffiliateEvent
            ? []
            : ((getValues('pendingStaffInvites') ?? []) as PendingStaffInvite[])
                .map(normalizePendingStaffInvite),
    }), [buildDraftEvent, getValues, isAffiliateEvent]);

    const getRegistrationQuestionDrafts = useCallback((): RegistrationQuestionDraft[] => {
        if (isAffiliateEvent) {
            return [];
        }

        return registrationQuestionDrafts
            .map((question, index) => ({
                id: question.id,
                prompt: String(question.prompt ?? '').trim(),
                answerType: question.answerType ?? 'TEXT',
                required: Boolean(question.required),
                sortOrder: Number.isFinite(Number(question.sortOrder)) ? Number(question.sortOrder) : index,
            }))
            .filter((question) => question.prompt.length > 0);
    }, [isAffiliateEvent, registrationQuestionDrafts]);

    const validateDraft = useCallback(async () => {
        const isFormValid = await trigger();
        if (!isFormValid) {
            const currentValues = getValues();
            const schemaResult = eventValidationSchema.safeParse(currentValues);
            const flattenedErrors = dedupeValidationErrors([
                ...(schemaResult.success ? [] : flattenZodIssues(schemaResult.error.issues)),
                ...flattenFormErrors(errors),
            ]);
            lastValidationErrorsRef.current = flattenedErrors;
            console.warn('Event form validation failed.', {
                errorCount: flattenedErrors.length,
                errors: flattenedErrors,
            });
            return false;
        }

        if (!isAffiliateEvent && officialStaffingCoverageError) {
            lastValidationErrorsRef.current = [{
                path: 'officialSchedulingMode',
                message: officialStaffingCoverageError,
            }];
            console.warn('Event form submission blocked by official staffing requirements.', {
                requiredOfficialSlotsPerMatch,
                assignedActiveOfficialsForStaffing,
                mode: eventData.officialSchedulingMode,
            });
            return false;
        }

        if (!supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent)) {
            lastValidationErrorsRef.current = [];
            return true;
        }

        lastValidationErrorsRef.current = [];
        return true;
    }, [
        assignedActiveOfficialsForStaffing,
        errors,
        eventData.eventType,
        eventData.officialSchedulingMode,
        eventData.parentEvent,
        eventValidationSchema,
        getValues,
        isAffiliateEvent,
        officialStaffingCoverageError,
        requiredOfficialSlotsPerMatch,
        trigger,
    ]);

    const validatePendingStaffAssignmentsForSubmit = useCallback(async () => {
        if (isAffiliateEvent) {
            return;
        }
        await validatePendingStaffAssignments();
    }, [isAffiliateEvent, validatePendingStaffAssignments]);

    const applyCanonicalStaffState = useCallback((snapshot: EventStaffSnapshot) => {
        setEventData((previous) => ({
            ...previous,
            assistantHostIds: [...snapshot.assistantHostIds],
            officialPositions: snapshot.officialPositions.map((position) => ({ ...position })),
            eventOfficials: snapshot.eventOfficials.map((official) => ({
                ...official,
                positionIds: [...official.positionIds],
                fieldIds: [...official.fieldIds],
            })),
            officialIds: [...snapshot.officialIds],
            pendingStaffInvites: [],
        }), { shouldDirty: false, shouldValidate: true });
    }, [setEventData]);

    useImperativeHandle(
        formRef,
        () => ({
            getDraft: getDraftSnapshot,
            getRegistrationQuestionDrafts,
            validate: validateDraft,
            getValidationErrors: () => lastValidationErrorsRef.current,
            validatePendingStaffAssignments: validatePendingStaffAssignmentsForSubmit,
            commitDirtyBaseline,
            applyCanonicalStaffState,
        }),
        [applyCanonicalStaffState, commitDirtyBaseline, getDraftSnapshot, getRegistrationQuestionDrafts, validateDraft, validatePendingStaffAssignmentsForSubmit],
    );

    return { buildDraftEvent };
};
