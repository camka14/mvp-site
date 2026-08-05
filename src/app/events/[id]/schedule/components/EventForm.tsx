import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { getEventImageUrl, Event, UserData, Team, Field, Division } from '@/types';
import { useSports } from '@/app/hooks/useSports';

import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import {
    buildEventTypeOptions,
    hasAffiliateUrl,
    supportsScheduleSlotsForEvent,
} from './eventForm/eventRules';
import { inferDivisionDetails } from '@/lib/divisionTypes';
import {
    buildDefaultDivisionDetailsForSport,
    buildTryoutDivisionSnapshot,
    buildDivisionTypeOptionsForEvent,
    buildSlotDivisionLookup,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizePlayoffDivisionDetailEntry,
    parseCompositeDivisionTypeId,
    type DivisionDetailForm,
} from './eventForm/divisionForm';
import { parseLocalDateTime } from '@/lib/dateUtils';
import {
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeSportOfficialPositionTemplates,
} from './eventForm/officials';
import { buildEventFormSchema } from './eventForm/schema';
import type {
    EventFormValues,
} from './eventForm/formTypes';
import {
    buildSportOptions,
    buildTemplateOptions,
    resolveSelectedSport,
    sportRequiresSets,
} from './eventForm/formOptions';
import { getLockedEventTypeTagSlugs } from './eventForm/eventTypeTags';
import {
    buildLeagueScheduleError,
} from './eventForm/scheduleMessages';
import {
    buildDivisionLeagueConfig,
    extractTournamentConfigFromEvent,
} from './eventForm/configDefaults';
import {
    buildMobileEditUnsupportedReasons,
    buildMobileEditUnsupportedWarning,
} from './eventForm/paymentPlanHelpers';
import { useDivisionCommitController } from './eventForm/hooks/useDivisionCommitController';
import { useDivisionEditorController } from './eventForm/hooks/useDivisionEditorController';
import { useEventDivisionNormalization } from './eventForm/hooks/useEventDivisionNormalization';
import {
    useEventFormDefaults,
    useEventFormLifecycle,
    useEventFormLifecycleStabilization,
} from './eventForm/hooks/useEventFormLifecycle';
import { useEventPaymentController } from './eventForm/hooks/useEventPaymentController';
import { useEventResourceController } from './eventForm/hooks/useEventResourceController';
import { useEventSlotController } from './eventForm/hooks/useEventSlotController';
import { useEventFormSubmissionController } from './eventForm/hooks/useEventFormSubmissionController';
import { useEventFormInvariantSynchronization } from './eventForm/hooks/useEventFormInvariantSynchronization';
import { useEventFormReferenceHydration } from './eventForm/hooks/useEventFormReferenceHydration';
import { useEventFormConfigurationActions } from './eventForm/hooks/useEventFormConfigurationActions';
import { useEventFormCatalogController } from './eventForm/hooks/useEventFormCatalogController';
import { useEventFormFieldWriters } from './eventForm/hooks/useEventFormFieldWriters';
import { useEventFormSectionsController } from './eventForm/hooks/useEventFormSectionsController';
import { useRegistrationQuestionDrafts } from './eventForm/hooks/useRegistrationQuestionDrafts';
import { useStaffOfficialController } from './eventForm/hooks/useStaffOfficialController';
import { useTemplateDocuments } from './eventForm/hooks/useTemplateDocuments';
import {
    EventFormSections,
    type EventFormSectionsProps,
} from './eventForm/sections/EventFormSections';
import {
    SetupModeControl,
    SimpleSetupPageFrame,
    SimpleSetupProgressRail,
} from './eventForm/simpleSetup/SimpleSetupNavigation';
import {
    describeEventSetupTransition,
    resolveEventSetupCapabilities,
    resolveEventSetupPages,
} from './eventForm/simpleSetup/resolveEventSetup';
import { SimpleSetupPlanningPage } from './eventForm/simpleSetup/SimpleSetupPlanningPage';
import { SimpleSetupFormPage } from './eventForm/simpleSetup/SimpleSetupFormPage';
import { SimpleSetupReviewPage } from './eventForm/simpleSetup/SimpleSetupReviewPage';
import { buildSimpleSetupReviewModel } from './eventForm/simpleSetup/reviewModel';
import {
    inferEventSetupScheduleStyle,
    isScheduleStyleAllowedForEventType,
    normalizeScheduleStyleForEventType,
    scheduleStyleChangeDiscardsConfiguredSlots,
} from './eventForm/simpleSetup/scheduleStyle';
import type {
    EventSetupChoices,
    EventSetupMode,
    EventSetupPageId,
    EventSetupResolverInput,
} from './eventForm/simpleSetup/types';
import type { EventFormHandle, EventFormProps } from './eventForm/types';
import {
    buildEventFormErrorIndex,
    type EventFormErrorLocation,
} from './eventForm/errorOwnership';
import {
    dedupeValidationErrors,
    flattenFormErrors,
    flattenZodIssues,
    type FlattenedFormError,
} from './eventForm/validationErrors';

const SECTION_SCROLL_OFFSET = 80;
const SECTION_COLLAPSE_DEFAULTS: Record<string, boolean> = {
    'section-basic-information': false,
    'section-event-details': true,
    'section-manual-payments': true,
    'section-registration-questions': true,
    'section-match-rules': true,
    'section-officials': true,
    'section-division-settings': true,
    'section-league-scoring-config': true,
    'section-schedule-config': true,
};
const SIMPLE_PLANNING_PAGE_IDS = new Set<EventSetupPageId>([
    'format',
]);

const normalizedOfficialPositionSignature = (positions: Array<{ name: string; count: number }> | undefined): string[] => (
    (positions ?? [])
        .map((position) => `${position.name.trim().toLocaleLowerCase()}:${Number(position.count)}`)
        .sort()
);

export const buildDefaultSetupChoices = (values?: Partial<EventFormValues>): EventSetupChoices => {
    const isExternal = Boolean(values?.isAffiliateEvent || hasAffiliateUrl(values?.affiliateUrl));
    const hasDivisionPrice = Array.isArray(values?.divisionDetails)
        && values.divisionDetails.some((division) => Number(division.price) > 0);
    const configuredOfficialPositions = normalizedOfficialPositionSignature(values?.officialPositions);
    const defaultOfficialPositions = normalizedOfficialPositionSignature(values?.sportConfig?.officialPositionTemplates);
    const hasCustomOfficialPositions = configuredOfficialPositions.length > 0
        && (
            defaultOfficialPositions.length === 0
            || configuredOfficialPositions.join('|') !== defaultOfficialPositions.join('|')
        );
    const inferredScheduleStyle = isExternal
        ? 'FIXED_WINDOW'
        : inferEventSetupScheduleStyle({
            eventType: values?.eventType,
            slots: values?.leagueSlots,
            eventStart: values?.start,
            eventEnd: values?.end,
        });
    return {
        scheduleStyle: normalizeScheduleStyleForEventType(values?.eventType, inferredScheduleStyle),
        paidRegistration: Number(values?.price) > 0 || hasDivisionPrice,
        useRequiredDocuments: Boolean(values?.requiredTemplateIds?.length),
        useRegistrationQuestions: false,
        useStaffAssignments: Boolean(values?.hostId || values?.assistantHostIds?.length || values?.pendingStaffInvites?.length),
        useDedicatedOfficials: Boolean(
            values?.officialIds?.length
            || values?.eventOfficials?.length
            || hasCustomOfficialPositions
            || values?.doTeamsOfficiate,
        ),
        useCustomOfficialPositions: hasCustomOfficialPositions,
        useTeamCheckInAndRosterOperations: Boolean(
            values?.teamCheckInMode && values.teamCheckInMode !== 'OFF'
            || values?.allowMatchRosterEdits
            || values?.allowTemporaryMatchPlayers,
        ),
    };
};
export type { EventFormHandle, EventFormProps, RentalPurchaseContext } from './eventForm/types';

const EventForm = React.forwardRef<EventFormHandle, EventFormProps>(({
    isOpen,
    currentUser,
    event: incomingEvent,
    organization,
    immutableDefaults,
    formId,
    defaultLocation,
    isCreateMode = false,
    initialSetupMode,
    rentalPurchase,
    templateOrganizationId: templateOrganizationIdProp,
    onDirtyStateChange,
    onDraftStateChange,
    onValidityChange,
    onSubmitRequest,
}, ref) => {
    const open = isOpen ?? true;
    const {
        eventTagOptions,
        hydratedOrganization,
        setHydratedOrganization,
    } = useEventFormCatalogController({ organization });
    const resolvedOrganization = hydratedOrganization ?? organization ?? null;
    const resolvedOrganizationId = (resolvedOrganization?.$id ?? '').trim();
    const resolvedOrganizationFields = resolvedOrganization?.fields;
    const activeEditingEvent = incomingEvent ?? null;

    const isEditMode = Boolean(activeEditingEvent && !isCreateMode);
    const isRentalCreateFlow = Boolean(!isEditMode && rentalPurchase);
    const eventValidationSchema = useMemo(
        () => buildEventFormSchema({
            allowMissingEventImage: isRentalCreateFlow,
            allowMissingEventDivisions: isRentalCreateFlow,
        }),
        [isRentalCreateFlow],
    );

    const {
        drafts: registrationQuestionDrafts,
        setDrafts: setRegistrationQuestionDrafts,
        loading: registrationQuestionsLoading,
        error: registrationQuestionsError,
    } = useRegistrationQuestionDrafts({
        eventId: activeEditingEvent?.$id,
        isCreateMode,
        open,
    });

    const { sports, sportsById, loading: sportsLoading, error: sportsError } = useSports();
    const sportOptions = useMemo(() => buildSportOptions(sports), [sports]);
    const {
        buildDefaultFormValues,
        hasImmutableFields,
        immutableFields,
        immutableTimeSlotsFromDefaults,
        isImmutableField,
    } = useEventFormDefaults({
        activeEditingEvent,
        defaultLocation,
        immutableDefaults,
        isCreateMode,
        resolvedOrganizationFields: Array.isArray(resolvedOrganizationFields)
            ? (resolvedOrganizationFields as Field[])
            : [],
        resolvedOrganizationId,
        sportsById,
    });
    const {
        control,
        watch,
        setValue: rawSetValue,
        getValues,
        reset,
        clearErrors,
        trigger,
        formState: { errors, isDirty, dirtyFields: formDirtyFields },
    } = useForm<EventFormValues>({
        resolver: zodResolver(eventValidationSchema) as Resolver<EventFormValues>,
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: buildDefaultFormValues(),
    });
    const setValue = useCallback((
        name: string,
        value: unknown,
        options?: Record<string, unknown>,
    ) => {
        (rawSetValue as (
            fieldName: string,
            fieldValue: unknown,
            fieldOptions?: Record<string, unknown>,
        ) => void)(name, value, options);
    }, [rawSetValue]);
    // React Hook Form intentionally remains the single persisted draft owner.
    // eslint-disable-next-line react-hooks/incompatible-library -- `watch` is the existing form subscription boundary.
    const formValues = watch();
    const {
        commitDirtyBaseline,
        previousEventFieldLocationRef,
        previousEventTypeRef,
        stabilization: formLifecycleStabilization,
    } = useEventFormLifecycle({
        activeEditingEvent,
        buildDefaultFormValues,
        formValues,
        getValues,
        isCreateMode,
        isDirty,
        onDirtyStateChange,
        onDraftStateChange,
        open,
        reset,
    });

    const eventData = formValues;
    const defaultSetupMode = initialSetupMode ?? (isCreateMode ? 'SIMPLE' : 'ADVANCED');
    const [setupMode, setSetupMode] = useState<EventSetupMode>(defaultSetupMode);
    const [currentSimplePageId, setCurrentSimplePageId] = useState<EventSetupPageId>('format');
    const [completedSimplePageIds, setCompletedSimplePageIds] = useState<Set<EventSetupPageId>>(() => new Set());
    const [simpleSetupChoices, setSimpleSetupChoices] = useState<EventSetupChoices>(
        () => buildDefaultSetupChoices(formValues),
    );
    const [reportedFormValidationErrors, setReportedFormValidationErrors] = useState<FlattenedFormError[]>([]);
    const [externalValidationErrors, setExternalValidationErrors] = useState<FlattenedFormError[]>([]);
    const [pendingValidationRecovery, setPendingValidationRecovery] = useState<EventFormErrorLocation | null>(null);
    const schemaValidationResult = useMemo(
        () => eventValidationSchema.safeParse(formValues),
        [eventValidationSchema, formValues],
    );
    const reviewSchemaValidationErrors = useMemo(
        () => currentSimplePageId === 'review-publish' && !schemaValidationResult.success
            ? flattenZodIssues(schemaValidationResult.error.issues)
            : [],
        [currentSimplePageId, schemaValidationResult],
    );
    const liveFormValidationErrors = useMemo(
        () => dedupeValidationErrors(flattenFormErrors(errors)),
        [errors],
    );

    useEffect(() => {
        setReportedFormValidationErrors(liveFormValidationErrors);
    }, [liveFormValidationErrors]);

    const reportValidationResult = useCallback((
        validationErrors: FlattenedFormError[],
        source: 'FORM' | 'EXTERNAL' | 'CLEAR',
    ) => {
        if (source === 'CLEAR') {
            setReportedFormValidationErrors([]);
            setExternalValidationErrors([]);
            setPendingValidationRecovery(null);
            return;
        }
        const normalizedErrors = dedupeValidationErrors(validationErrors);
        const nextIndex = buildEventFormErrorIndex(normalizedErrors);
        if (source === 'FORM') {
            setReportedFormValidationErrors(normalizedErrors);
            setExternalValidationErrors([]);
        } else {
            setReportedFormValidationErrors([]);
            setExternalValidationErrors(normalizedErrors);
        }
        setPendingValidationRecovery(nextIndex.ordered[0] ?? null);
    }, []);
    const displayedFormValidationErrors = schemaValidationResult.success
        ? []
        : currentSimplePageId === 'review-publish'
            ? reviewSchemaValidationErrors
            : reportedFormValidationErrors;
    const validationErrorIndex = useMemo(
        () => buildEventFormErrorIndex(dedupeValidationErrors([
            ...displayedFormValidationErrors,
            ...externalValidationErrors,
        ])),
        [displayedFormValidationErrors, externalValidationErrors],
    );
    const sectionErrorCounts = useMemo(() => Object.fromEntries(
        Object.entries(validationErrorIndex.byAdvancedSection)
            .map(([sectionId, sectionErrors]) => [sectionId, sectionErrors?.length ?? 0]),
    ), [validationErrorIndex.byAdvancedSection]);
    const setupSourceKey = open
        ? `${isCreateMode ? 'create' : `event:${activeEditingEvent?.$id ?? ''}`}:${defaultSetupMode}`
        : 'closed';
    const setupSourceRef = useRef(setupSourceKey);

    useEffect(() => {
        if (setupSourceRef.current === setupSourceKey) return;
        setupSourceRef.current = setupSourceKey;
        if (!open) return;
        setSetupMode(defaultSetupMode);
        setCurrentSimplePageId('format');
        setCompletedSimplePageIds(new Set());
        setSimpleSetupChoices(buildDefaultSetupChoices(getValues()));
    }, [defaultSetupMode, getValues, open, setupSourceKey]);

    useEffect(() => {
        if (registrationQuestionDrafts.length === 0) return;
        setSimpleSetupChoices((current) => current.useRegistrationQuestions
            ? current
            : { ...current, useRegistrationQuestions: true });
    }, [registrationQuestionDrafts.length]);

    const handleTryoutDivisionSelection = useCallback((sourceDivisions: Division[]) => {
        const existingDetails = eventData.divisionDetails ?? [];
        const existingBySourceId = new Map(
            existingDetails
                .filter((division) => Boolean(division.sourceDivisionId))
                .map((division) => [division.sourceDivisionId as string, division] as const),
        );
        const nextDetails: DivisionDetailForm[] = [];
        const usedIds: string[] = [];
        sourceDivisions.forEach((sourceDivision) => {
            const existing = existingBySourceId.get(sourceDivision.id);
            const detail = existing ?? buildTryoutDivisionSnapshot({
                sourceDivision,
                eventId: eventData.$id,
                existingDivisionIds: usedIds,
                referenceDate: parseLocalDateTime(eventData.start),
            });
            nextDetails.push(detail);
            usedIds.push(detail.id);
        });
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        setValue('divisions', nextDetails.map((division) => division.id), { shouldDirty: true, shouldValidate: true });
        setValue('singleDivision', false, { shouldDirty: true, shouldValidate: true });
        setValue('teamSignup', false, { shouldDirty: true, shouldValidate: true });
    }, [eventData.$id, eventData.divisionDetails, eventData.start, setValue]);
    const handleTryoutPriceChange = useCallback((sourceDivisionId: string, price: number) => {
        setValue('divisionDetails', (eventData.divisionDetails ?? []).map((division) => (
            division.sourceDivisionId === sourceDivisionId
                ? { ...division, price: Math.max(0, Math.trunc(price)) }
                : division
        )), { shouldDirty: true, shouldValidate: true });
    }, [eventData.divisionDetails, setValue]);
    const paymentController = useEventPaymentController({
        currentUser,
        eventData,
        getValues,
        isCreateMode,
        resolvedOrganization,
        setValue,
    });
    const {
        hasStripeAccount,
        manualPaymentsEnabled,
        pricingControlsEnabled,
    } = paymentController;
    const lockedEventTypeTagSlugs = useMemo(
        () => getLockedEventTypeTagSlugs(eventData.eventType),
        [eventData.eventType],
    );
    const isAffiliateEvent = Boolean(eventData.isAffiliateEvent || hasAffiliateUrl(eventData.affiliateUrl));
    const hasUnsetTeamCapacityLimits = eventData.teamSizeLimit == null
        || (eventData.singleDivision && eventData.maxParticipants == null);
    const leagueSlots = formValues.leagueSlots;
    const leagueData = formValues.leagueData;
    const tournamentData = formValues.tournamentData;
    const playoffData = formValues.playoffData;
    const joinAsParticipant = formValues.joinAsParticipant;
    const organizationId = resolvedOrganization?.$id ?? eventData.organizationId;
    const templateOrganizationId = templateOrganizationIdProp ?? organizationId;
    const {
        documents: templateDocuments,
        loading: templatesLoading,
        error: templatesError,
    } = useTemplateDocuments(templateOrganizationId);

    const templateOptions = useMemo(
        () => buildTemplateOptions(templateDocuments),
        [templateDocuments],
    );

    const fieldWriters = useEventFormFieldWriters({ getValues, setValue });
    const {
        setEventData,
        setJoinAsParticipant,
        setLeagueData,
        setPendingStaffInvites,
        setPlayoffData,
        setTournamentData,
    } = fieldWriters;

    useEventFormReferenceHydration({
        eventData,
        isEditMode,
        setEventData,
    });

    const slotDivisionLookup = useMemo(
        () => buildSlotDivisionLookup(
            eventData.divisionDetails || [],
            eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && eventData.splitLeaguePlayoffDivisions
                ? (eventData.playoffDivisionDetails || [])
                : [],
        ),
        [
            eventData.divisionDetails,
            eventData.eventType,
            eventData.playoffDivisionDetails,
            eventData.splitLeaguePlayoffDivisions,
            leagueData.includePlayoffs,
        ],
    );
    const slotDivisionKeys = slotDivisionLookup.keys;
    const resourceController = useEventResourceController({
        activeEditingEvent,
        eventData,
        fieldCountDirty: Boolean((formDirtyFields as Record<string, unknown>).fieldCount),
        fieldsDirty: Boolean((formDirtyFields as Record<string, unknown>).fields),
        getValues,
        hasImmutableFields,
        immutableFields,
        immutableTimeSlotsFromDefaults,
        isAffiliateEvent,
        isCreateMode,
        isEditMode,
        open,
        previousEventFieldLocationRef,
        previousEventTypeRef,
        rentalPurchaseFieldId: rentalPurchase?.fieldId,
        resolvedOrganization,
        setHydratedOrganization,
        setValue,
        slotDivisionKeys,
    });
    const {
        eventSupportsScheduleSlots,
        fieldCount,
        fields,
        fieldsLoading,
        fieldsReferencedInSlots,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        immutableTimeSlots,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        organizationHostedEventId,
        rentalLockedSlotsForDraft,
        selectedFieldIds,
        selectedRentedFieldIds,
        showLocalFieldCreationControls,
        showOrganizationFieldsInEventDetails,
        shouldManageLocalFields,
        shouldProvisionFields,
        usesRentalSlots,
    } = resourceController;
    const simpleFixedWindowFieldIds = useMemo(() => {
        if (showOrganizationFieldsInEventDetails) {
            return selectedFieldIds;
        }
        if (showLocalFieldCreationControls) {
            return fields.map((field) => field.$id);
        }
        return undefined;
    }, [
        fields,
        selectedFieldIds,
        showLocalFieldCreationControls,
        showOrganizationFieldsInEventDetails,
    ]);
    const slotController = useEventSlotController({
        activeEditingEvent,
        clearErrors,
        eventEnd: eventData.end,
        eventId: eventData.$id,
        eventStart: eventData.start,
        eventSupportsScheduleSlots,
        eventTimeZone: eventData.timeZone,
        eventType: eventData.eventType,
        fields,
        getValues,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        immutableFields,
        immutableTimeSlots,
        isAffiliateEvent,
        isEditMode,
        leagueSlots,
        parentEvent: eventData.parentEvent,
        rentalLockedSlotsForDraft,
        resolvedOrganizationId,
        simpleScheduleStyle: setupMode === 'SIMPLE' ? simpleSetupChoices.scheduleStyle : undefined,
        fixedWindowFieldIds: simpleFixedWindowFieldIds,
        setLeagueData,
        setPlayoffData,
        setValue,
        singleDivision: eventData.singleDivision,
        slotDivisionKeys,
        slotDivisionLookup,
    });
    const divisionOptions = useMemo(
        () => slotDivisionLookup.options,
        [slotDivisionLookup],
    );
    const divisionTypeOptions = useMemo(
        () => buildDivisionTypeOptionsForEvent(
            eventData.sportConfig ?? eventData.sportIds[0],
            eventData.divisionDetails,
        ),
        [eventData.divisionDetails, eventData.sportConfig, eventData.sportIds],
    );
    const currentSportRequiresSets = useMemo(
        () => sportRequiresSets(resolveSelectedSport({
            sportId: eventData.sportIds[0],
            sportConfig: eventData.sportConfig,
            sportsById,
        })),
        [eventData.sportConfig, eventData.sportIds, sportsById],
    );

    const divisionController = useDivisionEditorController({
        eventData,
        leagueData,
        playoffData,
        currentSportRequiresSets,
        hasStripeAccount: pricingControlsEnabled,
        isCreateMode,
        setValue,
        getValues,
    });
    const {
        createNextPlayoffDivision,
        defaultDivisionTypeSelections,
        divisionEditor,
        resetDivisionEditor,
        setDivisionEditor,
    } = divisionController;
    const mobileEditUnsupportedReasons = useMemo(() => buildMobileEditUnsupportedReasons({
        eventType: eventData.eventType,
        includePlayoffs: leagueData.includePlayoffs,
        splitLeaguePlayoffDivisions: eventData.splitLeaguePlayoffDivisions,
        eventPaymentPlanConfig: {
            allowPaymentPlans: eventData.allowPaymentPlans,
            installmentCount: eventData.installmentCount,
            installmentAmounts: eventData.installmentAmounts,
            installmentDueDates: eventData.installmentDueDates,
            installmentDueRelativeDays: eventData.installmentDueRelativeDays,
        },
        divisionPaymentPlanConfigs: eventData.divisionDetails || [],
        editorPaymentPlanConfig: divisionEditor,
    }), [
        divisionEditor,
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
    ]);
    const mobileEditUnsupportedWarning = useMemo(
        () => buildMobileEditUnsupportedWarning(mobileEditUnsupportedReasons),
        [mobileEditUnsupportedReasons],
    );

    const selectedSportForOfficials = useMemo(
        () => resolveSelectedSport({
            sportId: eventData.sportIds[0],
            sportConfig: eventData.sportConfig,
            sportsById,
        }),
        [eventData.sportConfig, eventData.sportIds, sportsById],
    );

    const staffController = useStaffOfficialController({
        eventData,
        activeEditingEvent,
        incomingEvent,
        currentUser,
        resolvedOrganization,
        isOrganizationHostedEvent,
        isCreateMode,
        selectedSportForOfficials,
        fields,
        selectedFieldIds,
        setValue,
        getValues,
        setEventData,
        setPendingStaffInvites,
    });
    const {
        assignedActiveOfficialsForStaffing,
        officialStaffingCoverageError,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationOfficialsById,
        requiredOfficialSlotsPerMatch,
        validatePendingStaffAssignments,
    } = staffController;
    const canSubmitEvent = useMemo(
        () => schemaValidationResult.success && !officialStaffingCoverageError,
        [officialStaffingCoverageError, schemaValidationResult.success],
    );

    useEffect(() => {
        onValidityChange?.(canSubmitEvent);
    }, [canSubmitEvent, onValidityChange]);

    const clearLeagueSlotErrors = useCallback(() => {
        clearErrors('leagueSlots');
    }, [clearErrors]);
    const configurationActions = useEventFormConfigurationActions({
        clearLeagueSlotErrors,
        eventData,
        getValues,
        isAffiliateEvent,
        leagueData,
        selectedSport: selectedSportForOfficials,
        setEventData,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData,
    });

    const { handleSaveDivisionDetail } = useDivisionCommitController({
        createNextPlayoffDivision,
        currentSportRequiresSets,
        defaultDivisionTypeSelections,
        divisionEditor,
        divisionTypeOptions,
        eventData,
        getValues,
        isAffiliateEvent,
        leagueData,
        resetDivisionEditor,
        setDivisionEditor,
        setLeagueData,
        setValue,
    });

    useEventDivisionNormalization({
        currentSportRequiresSets,
        eventData,
        getValues,
        hasExternalRentalField,
        leagueData,
        playoffData,
        setDivisionEditor,
        setLeagueData,
        setPlayoffData,
        setValue,
        sportsById,
        sportsLoading,
    });

    const selectedImageId = eventData.imageId;
    const selectedImageUrl = useMemo(
        () => (selectedImageId ? getEventImageUrl({ imageId: selectedImageId, width: 800 }) : ''),
        [selectedImageId],
    );

    const eventTypeOptions = useMemo(
        () => buildEventTypeOptions(isRentalCreateFlow, Boolean(resolvedOrganizationId)),
        [isRentalCreateFlow, resolvedOrganizationId],
    );
    const supportsNoFixedEndDateTime = !isAffiliateEvent && supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    useEventFormInvariantSynchronization({
        eventData,
        isRentalCreateFlow,
        joinAsParticipant,
        setEventData,
        setJoinAsParticipant,
        setValue,
    });

    const leagueError = buildLeagueScheduleError(errors.leagueSlots);

    const { buildDraftEvent } = useEventFormSubmissionController({
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
        formRef: ref,
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
        onValidationResult: reportValidationResult,
    });
    useEventFormLifecycleStabilization({
        buildDraftEvent,
        fieldsLoading,
        formValues,
        getValues,
        lifecycle: formLifecycleStabilization,
        open,
        reset,
        sportsLoading,
    });
    const allowImageEdit = !isImmutableField('imageId');
    const sectionsController = useEventFormSectionsController({
        collapseDefaults: SECTION_COLLAPSE_DEFAULTS,
        eventData,
        isAffiliateEvent,
        manualPaymentsEnabled,
        open,
        scrollOffset: SECTION_SCROLL_OFFSET,
        setManualPaymentsEnabled: paymentController.setManualPaymentsEnabled,
        setRegistrationQuestionDrafts,
        usesRentalSlots,
        sectionErrorCounts,
    });
    const scrollToAdvancedSection = sectionsController.scrollToSection;

    useEffect(() => {
        if (!pendingValidationRecovery || typeof document === 'undefined') return;
        if (setupMode === 'SIMPLE') {
            setCurrentSimplePageId(pendingValidationRecovery.simplePageId);
        } else {
            scrollToAdvancedSection(pendingValidationRecovery.advancedSectionId);
        }

        const focusTimer = window.setTimeout(() => {
            const fieldName = pendingValidationRecovery.focusFieldName;
            const field = fieldName ? document.getElementsByName(fieldName)[0] : null;
            if (field instanceof HTMLElement) {
                field.focus({ preventScroll: true });
            }
            setPendingValidationRecovery((current) => (
                current === pendingValidationRecovery ? null : current
            ));
        }, setupMode === 'ADVANCED' ? 250 : 0);
        return () => window.clearTimeout(focusTimer);
    }, [pendingValidationRecovery, scrollToAdvancedSection, setupMode]);

    const setupResolverInput = useMemo<EventSetupResolverInput>(() => ({
        eventType: eventData.eventType,
        isExternalRegistration: isAffiliateEvent,
        singleDivision: Boolean(eventData.singleDivision),
        teamSignup: Boolean(eventData.teamSignup),
        includePlayoffs: Boolean(leagueData.includePlayoffs),
        includePoolPlay: eventData.eventType === 'TOURNAMENT' && Boolean(leagueData.includePlayoffs),
        splitLeaguePlayoffDivisions: Boolean(eventData.splitLeaguePlayoffDivisions),
        hasImmutableRentalResources: usesRentalSlots,
        organizationFeatures: resolvedOrganization?.enabledFeatures,
        choices: simpleSetupChoices,
        currentPageId: currentSimplePageId,
        completePageIds: completedSimplePageIds,
    }), [
        completedSimplePageIds,
        currentSimplePageId,
        eventData.eventType,
        eventData.singleDivision,
        eventData.splitLeaguePlayoffDivisions,
        eventData.teamSignup,
        isAffiliateEvent,
        leagueData.includePlayoffs,
        resolvedOrganization?.enabledFeatures,
        simpleSetupChoices,
        usesRentalSlots,
    ]);
    const simpleSetupCapabilities = useMemo(
        () => resolveEventSetupCapabilities(setupResolverInput),
        [setupResolverInput],
    );
    const simpleSetupPages = useMemo(
        () => resolveEventSetupPages(setupResolverInput),
        [setupResolverInput],
    );
    const currentSimplePage = simpleSetupPages.find((page) => page.id === currentSimplePageId)
        ?? simpleSetupPages[0];
    const currentSimplePageIndex = simpleSetupPages.findIndex((page) => page.id === currentSimplePageId);
    const previousUsedSimplePage = simpleSetupPages
        .slice(0, Math.max(0, currentSimplePageIndex))
        .reverse()
        .find((page) => page.used);
    const nextUsedSimplePage = simpleSetupPages
        .slice(currentSimplePageIndex + 1)
        .find((page) => page.used);

    const confirmSimpleSetupTransition = useCallback((nextInput: EventSetupResolverInput): boolean => {
        const impact = describeEventSetupTransition(setupResolverInput, nextInput);
        const affectsConfiguredPage = impact.pageIds.some((pageId) => completedSimplePageIds.has(pageId));
        if (!affectsConfiguredPage || impact.categories.length === 0 || typeof window === 'undefined') {
            return true;
        }
        return window.confirm(
            `This change affects ${impact.categories.join(', ')}. Incompatible values may be cleared. Continue?`,
        );
    }, [completedSimplePageIds, setupResolverInput]);

    const invalidateSimpleSetupPages = useCallback((pageIds: Iterable<EventSetupPageId>) => {
        setCompletedSimplePageIds((current) => {
            const next = new Set(current);
            for (const pageId of pageIds) next.delete(pageId);
            return next;
        });
    }, []);

    const handleSimpleEventTypeChange = useCallback((
        nextType: Event['eventType'],
        applyValue: (eventType: Event['eventType']) => void,
    ) => {
        const nextInput = { ...setupResolverInput, eventType: nextType };
        if (!confirmSimpleSetupTransition(nextInput)) return;
        invalidateSimpleSetupPages(describeEventSetupTransition(setupResolverInput, nextInput).pageIds);
        if (!isScheduleStyleAllowedForEventType(nextType, simpleSetupChoices.scheduleStyle)) {
            setSimpleSetupChoices((current) => ({ ...current, scheduleStyle: 'WEEKLY_SLOTS' }));
        }
        configurationActions.handleEventTypeChange(nextType, applyValue);
    }, [
        configurationActions,
        confirmSimpleSetupTransition,
        invalidateSimpleSetupPages,
        setupResolverInput,
        simpleSetupChoices.scheduleStyle,
    ]);

    const handleSimpleExternalRegistrationChange = useCallback((
        checked: boolean,
        applyValue: (checked: boolean) => void,
    ) => {
        const nextInput = { ...setupResolverInput, isExternalRegistration: checked };
        if (!confirmSimpleSetupTransition(nextInput)) return;
        invalidateSimpleSetupPages(describeEventSetupTransition(setupResolverInput, nextInput).pageIds);
        configurationActions.handleAffiliateEventChange(checked, applyValue);
    }, [configurationActions, confirmSimpleSetupTransition, invalidateSimpleSetupPages, setupResolverInput]);

    const handleSimpleSingleDivisionChange = useCallback((
        singleDivision: boolean,
        applyValue: (singleDivision: boolean) => void,
    ) => {
        const nextInput = { ...setupResolverInput, singleDivision };
        if (!confirmSimpleSetupTransition(nextInput)) return;
        invalidateSimpleSetupPages(describeEventSetupTransition(setupResolverInput, nextInput).pageIds);
        applyValue(singleDivision);
    }, [confirmSimpleSetupTransition, invalidateSimpleSetupPages, setupResolverInput]);

    const handleSimplePlayoffPlanningChange = useCallback((
        updates: Pick<EventSetupResolverInput, 'includePlayoffs' | 'includePoolPlay' | 'splitLeaguePlayoffDivisions'>,
        applyValue: () => void,
    ) => {
        const nextInput = { ...setupResolverInput, ...updates };
        if (!confirmSimpleSetupTransition(nextInput)) return;
        invalidateSimpleSetupPages(describeEventSetupTransition(setupResolverInput, nextInput).pageIds);
        applyValue();
    }, [confirmSimpleSetupTransition, invalidateSimpleSetupPages, setupResolverInput]);

    const updateSimpleSetupChoices = useCallback((updates: Partial<EventSetupChoices>) => {
        const resolvedUpdates = updates.useDedicatedOfficials === false
            ? { ...updates, useCustomOfficialPositions: false }
            : updates;
        const nextScheduleStyle = resolvedUpdates.scheduleStyle;
        if (
            nextScheduleStyle
            && nextScheduleStyle !== simpleSetupChoices.scheduleStyle
            && scheduleStyleChangeDiscardsConfiguredSlots(eventData.leagueSlots ?? [], nextScheduleStyle)
            && typeof window !== 'undefined'
            && !window.confirm('Changing the schedule style removes timeslots that do not match the new style. Continue?')
        ) {
            return;
        }
        const turningOffConfiguredData = (
            resolvedUpdates.paidRegistration === false && (
                Number(eventData.price) > 0
                || (eventData.divisionDetails ?? []).some((division) => Number(division.price) > 0)
            )
        ) || (resolvedUpdates.useRequiredDocuments === false && Boolean(eventData.requiredTemplateIds?.length))
            || (resolvedUpdates.useRegistrationQuestions === false && registrationQuestionDrafts.length > 0)
            || (resolvedUpdates.useStaffAssignments === false && Boolean(
                eventData.assistantHostIds?.length
                || eventData.pendingStaffInvites?.some((invite) => invite.roles.includes('ASSISTANT_HOST')),
            ))
            || (resolvedUpdates.useDedicatedOfficials === false && Boolean(
                eventData.officialIds?.length
                || eventData.eventOfficials?.length
                || eventData.officialPositions?.length
                || eventData.doTeamsOfficiate
                || eventData.pendingStaffInvites?.some((invite) => invite.roles.includes('OFFICIAL')),
            ))
            || (resolvedUpdates.useTeamCheckInAndRosterOperations === false && Boolean(
                eventData.teamCheckInMode !== 'OFF'
                || eventData.allowMatchRosterEdits
                || eventData.allowTemporaryMatchPlayers,
            ));
        if (
            turningOffConfiguredData
            && typeof window !== 'undefined'
            && !window.confirm('Turning this option off clears its configured values. Continue?')
        ) {
            return;
        }
        if (resolvedUpdates.paidRegistration === false) {
            setValue('price', 0, { shouldDirty: true, shouldValidate: true });
            setValue('registrationPaymentMode', 'ONLINE', { shouldDirty: true, shouldValidate: true });
            setValue('manualPaymentLinks', [], { shouldDirty: true, shouldValidate: true });
            setValue('manualPaymentInstructions', '', { shouldDirty: true, shouldValidate: true });
            setValue('cancellationRefundHours', null, { shouldDirty: true, shouldValidate: true });
            setValue('allowPaymentPlans', false, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', 0, { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', [], { shouldDirty: true, shouldValidate: true });
            setValue('divisionDetails', (eventData.divisionDetails ?? []).map((division) => ({
                ...division,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            })), { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.scheduleStyle === 'FIXED_WINDOW' && !isImmutableField('noFixedEndDateTime')) {
            setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useRequiredDocuments === false) {
            setValue('requiredTemplateIds', [], { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useRegistrationQuestions === false) setRegistrationQuestionDrafts([]);
        if (resolvedUpdates.useStaffAssignments === false) {
            setValue('assistantHostIds', [], { shouldDirty: true, shouldValidate: true });
            setValue('pendingStaffInvites', (eventData.pendingStaffInvites ?? []).flatMap((invite) => {
                const roles = invite.roles.filter((role) => role !== 'ASSISTANT_HOST');
                return roles.length ? [{ ...invite, roles }] : [];
            }), { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useDedicatedOfficials === false) {
            setValue('officialIds', [], { shouldDirty: true, shouldValidate: true });
            setValue('eventOfficials', [], { shouldDirty: true, shouldValidate: true });
            setValue('officialSchedulingMode', 'OFF', { shouldDirty: true, shouldValidate: true });
            setValue('doTeamsOfficiate', false, { shouldDirty: true, shouldValidate: true });
            setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
            setValue('officialPositions', [], { shouldDirty: true, shouldValidate: true });
            setValue('pendingStaffInvites', (eventData.pendingStaffInvites ?? []).flatMap((invite) => {
                const roles = invite.roles.filter((role) => role !== 'OFFICIAL');
                return roles.length ? [{ ...invite, roles }] : [];
            }), { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useCustomOfficialPositions === false) {
            setValue('officialPositions', [], { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useTeamCheckInAndRosterOperations === true && eventData.teamSignup && eventData.teamCheckInMode === 'OFF') {
            setValue('teamCheckInMode', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
        if (resolvedUpdates.useTeamCheckInAndRosterOperations === false) {
            setValue('teamCheckInMode', 'OFF', { shouldDirty: true, shouldValidate: true });
            setValue('teamCheckInOpenMinutesBefore', 60, { shouldDirty: true, shouldValidate: true });
            setValue('allowMatchRosterEdits', false, { shouldDirty: true, shouldValidate: true });
            setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
        }
        setSimpleSetupChoices((current) => ({ ...current, ...resolvedUpdates }));
    }, [
        eventData,
        isImmutableField,
        registrationQuestionDrafts.length,
        setRegistrationQuestionDrafts,
        setValue,
        simpleSetupChoices.scheduleStyle,
    ]);

    useEffect(() => {
        if (
            setupMode === 'SIMPLE'
            && simpleSetupChoices.scheduleStyle === 'FIXED_WINDOW'
            && eventData.noFixedEndDateTime
            && !isImmutableField('noFixedEndDateTime')
        ) {
            setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
        }
    }, [
        eventData.noFixedEndDateTime,
        isImmutableField,
        setValue,
        setupMode,
        simpleSetupChoices.scheduleStyle,
    ]);

    const validateSimpleSetupPage = useCallback(async (pageId: EventSetupPageId): Promise<boolean> => {
        if (pageId === 'format') {
            return trigger([
                'eventType',
                'isAffiliateEvent',
                'teamSignup',
                'teamSizeLimit',
                'singleDivision',
                'registrationByDivisionType',
                'splitLeaguePlayoffDivisions',
                'registrationPaymentMode',
            ]);
        }
        if (pageId === 'basics') {
            return trigger(isAffiliateEvent
                ? ['name', 'sportIds', 'description', 'affiliateUrl']
                : ['name', 'sportIds', 'description']);
        }
        if (pageId === 'divisions') {
            return trigger(eventData.eventType === 'TRYOUT'
                ? ['divisions', 'divisionDetails']
                : [
                    'divisionDetails',
                    'playoffDivisionDetails',
                    'maxParticipants',
                    'leagueData',
                    'tournamentData',
                    'playoffData',
                ]);
        }
        if (pageId === 'schedule-location') {
            return trigger(['start', 'end', 'location', 'coordinates', 'selectedFieldIds', 'leagueSlots']);
        }
        if (pageId === 'pricing-registration') {
            return trigger([
                'price',
                'allowPaymentPlans',
                'installmentCount',
                'installmentAmounts',
                'installmentDueDates',
                'installmentDueRelativeDays',
                'divisionDetails',
                'registrationPaymentMode',
                ...(eventData.registrationPaymentMode === 'MANUAL'
                    ? ['manualPaymentLinks', 'manualPaymentInstructions'] as const
                    : []),
                'registrationCutoffHours',
                'cancellationRefundHours',
            ]);
        }
        if (pageId === 'documents-questions') return trigger(['requiredTemplateIds']);
        if (pageId === 'staff-operations') {
            return trigger([
                ...(simpleSetupChoices.useStaffAssignments
                    ? ['hostId', 'assistantHostIds'] as const
                    : []),
                ...(simpleSetupChoices.useDedicatedOfficials
                    ? ['officialIds', 'eventOfficials', 'officialSchedulingMode', 'doTeamsOfficiate', 'teamOfficialsMaySwap'] as const
                    : []),
                ...(simpleSetupChoices.useCustomOfficialPositions
                    ? ['officialPositions'] as const
                    : []),
                ...(simpleSetupChoices.useTeamCheckInAndRosterOperations
                    ? [
                        'teamCheckInMode',
                        'teamCheckInOpenMinutesBefore',
                        'allowMatchRosterEdits',
                        'allowTemporaryMatchPlayers',
                    ] as const
                    : []),
            ]);
        }
        if (pageId === 'review-publish') {
            const valid = await trigger();
            if (!valid) {
                const schemaResult = eventValidationSchema.safeParse(getValues());
                reportValidationResult(dedupeValidationErrors([
                    ...(schemaResult.success ? [] : flattenZodIssues(schemaResult.error.issues)),
                    ...flattenFormErrors(errors),
                ]), 'FORM');
            } else {
                reportValidationResult([], 'CLEAR');
            }
            return valid;
        }
        return true;
    }, [
        errors,
        eventData.eventType,
        eventData.registrationPaymentMode,
        eventValidationSchema,
        getValues,
        isAffiliateEvent,
        reportValidationResult,
        simpleSetupChoices.useCustomOfficialPositions,
        simpleSetupChoices.useDedicatedOfficials,
        simpleSetupChoices.useStaffAssignments,
        simpleSetupChoices.useTeamCheckInAndRosterOperations,
        trigger,
    ]);

    const selectSimpleSetupPage = useCallback((pageId: EventSetupPageId) => {
        const page = simpleSetupPages.find((candidate) => candidate.id === pageId);
        if (!page) return;
        setCurrentSimplePageId(page.status === 'locked' && page.prerequisitePageId
            ? page.prerequisitePageId
            : page.id);
    }, [simpleSetupPages]);
    const handleSimpleSetupBack = useCallback(() => {
        if (previousUsedSimplePage) setCurrentSimplePageId(previousUsedSimplePage.id);
    }, [previousUsedSimplePage]);
    const handleSimpleSetupNext = useCallback(async () => {
        if (!await validateSimpleSetupPage(currentSimplePageId)) return;
        setCompletedSimplePageIds((current) => new Set(current).add(currentSimplePageId));
        if (nextUsedSimplePage) setCurrentSimplePageId(nextUsedSimplePage.id);
    }, [currentSimplePageId, nextUsedSimplePage, validateSimpleSetupPage]);

    if (!open) {
        return null;
    }

    const formSectionsModel: EventFormSectionsProps = {
        catalog: {
            eventTagOptions,
            sportOptions,
            sportsById,
            sportsError,
            sportsLoading,
        },
        configurationActions,
        control,
        defaultCoordinates: defaultLocation?.coordinates,
        divisionController,
        divisionOptions,
        divisionTypeOptions,
        errors,
        eventData,
        fieldWriters,
        formId,
        handleSaveDivisionDetail,
        hasUnsetTeamCapacityLimits,
        hideSectionNavigation: false,
        isAffiliateEvent,
        isImmutableField,
        leagueError,
        onTryoutDivisionSelection: handleTryoutDivisionSelection,
        onTryoutPriceChange: handleTryoutPriceChange,
        organizationId,
        paymentController,
        presentation: {
            allowImageEdit,
            eventTypeOptions,
            lockedEventTypeTagSlugs,
            mobileEditUnsupportedWarning,
            selectedImageUrl,
            selectedSportForOfficials,
            supportsNoFixedEndDateTime,
        },
        registrationQuestions: {
            drafts: registrationQuestionDrafts,
            error: registrationQuestionsError,
            loading: registrationQuestionsLoading,
        },
        resourceController,
        sectionsController,
        setValue,
        slotController,
        slotDivisionKeys,
        staffController,
        templates: {
            error: templatesError,
            loading: templatesLoading,
            organizationId: templateOrganizationId,
            options: templateOptions,
        },
        validationErrorIndex,
    };
    const formSections = (
        <EventFormSections {...formSectionsModel} />
    );
    const simpleReviewModel = buildSimpleSetupReviewModel({
        eventData,
        choices: simpleSetupChoices,
        eventTypeOptions,
        selectedImageUrl,
        fields: resourceController.fields,
        resourceOptions: resourceController.leagueFieldOptions,
        templateOptions,
        registrationQuestions: registrationQuestionDrafts,
        assignedHostCards: staffController.assignedHostCards,
        assignedOfficialCards: staffController.assignedOfficialCards,
        validationErrorIndex,
    });
    const simplePageContent = currentSimplePageId === 'review-publish' ? (
        <SimpleSetupReviewPage model={simpleReviewModel} onEditPage={selectSimpleSetupPage} />
    ) : SIMPLE_PLANNING_PAGE_IDS.has(currentSimplePageId) ? (
        <SimpleSetupPlanningPage
            pageId={currentSimplePageId}
            control={control}
            eventData={eventData}
            eventTypeOptions={eventTypeOptions}
            capabilities={simpleSetupCapabilities}
            choices={simpleSetupChoices}
            includePlayoffs={Boolean(leagueData.includePlayoffs)}
            hasStripeAccount={hasStripeAccount}
            connectingStripe={paymentController.connectingStripe}
            onChoicesChange={updateSimpleSetupChoices}
            onEventTypeChange={handleSimpleEventTypeChange}
            onExternalRegistrationChange={handleSimpleExternalRegistrationChange}
            onSingleDivisionChange={handleSimpleSingleDivisionChange}
            onIncludePlayoffsChange={(checked) => handleSimplePlayoffPlanningChange({
                includePlayoffs: checked,
                includePoolPlay: false,
                splitLeaguePlayoffDivisions: checked
                    ? setupResolverInput.splitLeaguePlayoffDivisions
                    : false,
            }, () => configurationActions.handleIncludePlayoffsToggle(checked))}
            onIncludePoolPlayChange={(checked) => handleSimplePlayoffPlanningChange({
                includePlayoffs: checked,
                includePoolPlay: checked,
                splitLeaguePlayoffDivisions: false,
            }, () => configurationActions.handleIncludePoolPlayChange(checked))}
            onSplitLeaguePlayoffDivisionsChange={(checked, applyValue) => {
                handleSimplePlayoffPlanningChange({
                    includePlayoffs: setupResolverInput.includePlayoffs,
                    includePoolPlay: setupResolverInput.includePoolPlay,
                    splitLeaguePlayoffDivisions: checked,
                }, () => applyValue(checked));
            }}
            onConnectStripe={paymentController.connectStripe}
            onRegistrationPaymentModeChange={(mode) => {
                paymentController.setManualPaymentsEnabled(mode === 'MANUAL');
            }}
            isImmutableField={isImmutableField}
        />
    ) : (
        <SimpleSetupFormPage
            pageId={currentSimplePageId}
            choices={simpleSetupChoices}
            model={formSectionsModel}
        />
    );

    return (
        <div className="space-y-3">
            <div className="sticky top-0 z-30 space-y-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
                <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div>
                        <p className="font-semibold text-gray-950">Event setup</p>
                        <p className="text-xs text-gray-600">Both modes edit the same event draft.</p>
                    </div>
                    <SetupModeControl value={setupMode} onChange={setSetupMode} />
                </div>
                {setupMode === 'SIMPLE' ? (
                    <SimpleSetupProgressRail pages={simpleSetupPages} onSelectPage={selectSimpleSetupPage} />
                ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                {setupMode === 'SIMPLE' && validationErrorIndex.ordered.length > 0 ? (
                    <div
                        role="status"
                        aria-live="polite"
                        className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800"
                    >
                        {validationErrorIndex.ordered.length} {validationErrorIndex.ordered.length === 1
                            ? 'issue needs'
                            : 'issues need'} attention. {validationErrorIndex.ordered[0]?.message}
                    </div>
                ) : null}
                {setupMode === 'SIMPLE' ? (
                    <SimpleSetupPageFrame
                        page={currentSimplePage}
                        isFirstUsedPage={!previousUsedSimplePage}
                        isLastUsedPage={!nextUsedSimplePage}
                        canSubmit={canSubmitEvent}
                        onBack={handleSimpleSetupBack}
                        onNext={() => { void handleSimpleSetupNext(); }}
                        onSubmit={onSubmitRequest}
                        onOpenControllerPage={selectSimpleSetupPage}
                    >
                        {simplePageContent}
                    </SimpleSetupPageFrame>
                ) : formSections}
            </div>
        </div>
    );
});

EventForm.displayName = 'EventForm';

export default EventForm;
