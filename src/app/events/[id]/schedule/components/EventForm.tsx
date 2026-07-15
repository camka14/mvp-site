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
import { EventFormSections } from './eventForm/sections/EventFormSections';
import {
    SetupModeControl,
    SimpleSetupPageFrame,
    SimpleSetupProgressRail,
} from './eventForm/simpleSetup/SimpleSetupNavigation';
import {
    describeEventSetupTransition,
    resolveEventSetupCapabilities,
    resolveEventSetupPages,
    resolveValidationPage,
} from './eventForm/simpleSetup/resolveEventSetup';
import { SimpleSetupPlanningPage } from './eventForm/simpleSetup/SimpleSetupPlanningPage';
import type {
    EventSetupChoices,
    EventSetupMode,
    EventSetupPageId,
    EventSetupResolverInput,
} from './eventForm/simpleSetup/types';
import type { EventFormHandle, EventFormProps } from './eventForm/types';

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
    'participation-plan',
    'schedule-plan',
    'competition-plan',
    'registration-plan',
    'operations-plan',
    'review-publish',
]);

const buildDefaultSetupChoices = (values?: Partial<EventFormValues>): EventSetupChoices => {
    const isExternal = Boolean(values?.isAffiliateEvent || hasAffiliateUrl(values?.affiliateUrl));
    const hasDivisionPrice = Array.isArray(values?.divisionDetails)
        && values.divisionDetails.some((division) => Number(division.price) > 0);
    return {
        scheduleStyle: values?.eventType === 'EVENT' || isExternal ? 'FIXED_WINDOW' : 'WEEKLY_SLOTS',
        resourceSource: isExternal
            ? 'LOCATION_ONLY'
            : values?.selectedFieldIds?.length ? 'ORGANIZATION' : 'CUSTOM',
        customizeMatchRules: Boolean(values?.matchRulesOverride),
        customizeScoring: Boolean(values?.leagueScoringConfig),
        paidRegistration: Number(values?.price) > 0 || hasDivisionPrice,
        useRequiredDocuments: Boolean(values?.requiredTemplateIds?.length),
        useRegistrationQuestions: false,
        useStaffAssignments: Boolean(values?.hostId || values?.assistantHostIds?.length || values?.pendingStaffInvites?.length),
        useDedicatedOfficials: Boolean(values?.officialIds?.length || values?.eventOfficials?.length),
        useCustomOfficialPositions: Boolean(values?.officialPositions?.length),
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
        shouldManageLocalFields,
        shouldProvisionFields,
        usesRentalSlots,
    } = resourceController;
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
            eventData.sportConfig ?? eventData.sportId,
            eventData.divisionDetails,
        ),
        [eventData.divisionDetails, eventData.sportConfig, eventData.sportId],
    );
    const currentSportRequiresSets = useMemo(
        () => sportRequiresSets(resolveSelectedSport({
            sportId: eventData.sportId,
            sportConfig: eventData.sportConfig,
            sportsById,
        })),
        [eventData.sportConfig, eventData.sportId, sportsById],
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
            sportId: eventData.sportId,
            sportConfig: eventData.sportConfig,
            sportsById,
        }),
        [eventData.sportConfig, eventData.sportId, sportsById],
    );

    const staffController = useStaffOfficialController({
        eventData,
        activeEditingEvent,
        incomingEvent,
        currentUser,
        resolvedOrganization,
        isOrganizationHostedEvent,
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
        hasExternalRentalField,
        isEditMode,
        isRentalCreateFlow,
        joinAsParticipant,
        setEventData,
        setJoinAsParticipant,
        setValue,
        supportsNoFixedEndDateTime,
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
    });

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
        configurationActions.handleEventTypeChange(nextType, applyValue);
    }, [configurationActions, confirmSimpleSetupTransition, invalidateSimpleSetupPages, setupResolverInput]);

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
        const turningOffConfiguredData = (
            updates.paidRegistration === false && (
                Number(eventData.price) > 0
                || (eventData.divisionDetails ?? []).some((division) => Number(division.price) > 0)
            )
        ) || (updates.useRequiredDocuments === false && Boolean(eventData.requiredTemplateIds?.length))
            || (updates.useRegistrationQuestions === false && registrationQuestionDrafts.length > 0)
            || (updates.customizeMatchRules === false && Boolean(eventData.matchRulesOverride))
            || (updates.customizeScoring === false && Boolean(eventData.leagueScoringConfig))
            || (updates.useStaffAssignments === false && Boolean(
                eventData.assistantHostIds?.length || eventData.pendingStaffInvites?.length,
            ))
            || (updates.useDedicatedOfficials === false && Boolean(
                eventData.officialIds?.length || eventData.eventOfficials?.length,
            ));
        if (
            turningOffConfiguredData
            && typeof window !== 'undefined'
            && !window.confirm('Turning this option off clears its configured values. Continue?')
        ) {
            return;
        }
        if (updates.paidRegistration === false) {
            setValue('price', 0, { shouldDirty: true, shouldValidate: true });
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
        if (updates.useRequiredDocuments === false) {
            setValue('requiredTemplateIds', [], { shouldDirty: true, shouldValidate: true });
        }
        if (updates.useRegistrationQuestions === false) setRegistrationQuestionDrafts([]);
        if (updates.customizeMatchRules === false) {
            setValue('matchRulesOverride', null, { shouldDirty: true, shouldValidate: true });
            setValue('autoCreatePointMatchIncidents', false, { shouldDirty: true, shouldValidate: true });
        }
        if (updates.customizeScoring === false) {
            setValue('leagueScoringConfig', null, { shouldDirty: true, shouldValidate: true });
        }
        if (updates.useStaffAssignments === false) {
            setValue('assistantHostIds', [], { shouldDirty: true, shouldValidate: true });
            setValue('pendingStaffInvites', [], { shouldDirty: true, shouldValidate: true });
        }
        if (updates.useDedicatedOfficials === false) {
            setValue('officialIds', [], { shouldDirty: true, shouldValidate: true });
            setValue('eventOfficials', [], { shouldDirty: true, shouldValidate: true });
            setValue('officialSchedulingMode', 'OFF', { shouldDirty: true, shouldValidate: true });
        }
        if (updates.useCustomOfficialPositions === false) {
            setValue('officialPositions', [], { shouldDirty: true, shouldValidate: true });
        }
        setSimpleSetupChoices((current) => ({ ...current, ...updates }));
    }, [eventData, registrationQuestionDrafts.length, setRegistrationQuestionDrafts, setValue]);

    const validateSimpleSetupPage = useCallback(async (pageId: EventSetupPageId): Promise<boolean> => {
        if (pageId === 'format') return trigger(['eventType', 'isAffiliateEvent']);
        if (pageId === 'basics') {
            return trigger(isAffiliateEvent
                ? ['name', 'sportId', 'description', 'affiliateUrl']
                : ['name', 'sportId', 'description']);
        }
        if (pageId === 'participation-plan') {
            return trigger(['teamSignup', 'teamSizeLimit', 'singleDivision', 'registrationByDivisionType']);
        }
        if (pageId === 'divisions') {
            return trigger(eventData.eventType === 'TRYOUT'
                ? ['divisions', 'divisionDetails']
                : ['divisionDetails', 'playoffDivisionDetails', 'maxParticipants']);
        }
        if (pageId === 'schedule-location') {
            return trigger(['start', 'end', 'location', 'coordinates', 'selectedFieldIds', 'leagueSlots']);
        }
        if (pageId === 'competition-rules') {
            return trigger(['leagueData', 'tournamentData', 'playoffData', 'matchRulesOverride', 'leagueScoringConfig']);
        }
        if (pageId === 'pricing-registration') {
            return trigger(['price', 'allowPaymentPlans', 'registrationPaymentMode', 'registrationCutoffHours', 'cancellationRefundHours']);
        }
        if (pageId === 'documents-questions') return trigger(['requiredTemplateIds']);
        if (pageId === 'staff-operations') {
            return trigger(['hostId', 'assistantHostIds', 'officialIds', 'officialPositions', 'officialSchedulingMode']);
        }
        if (pageId === 'review-publish') {
            const valid = await trigger();
            if (!valid) {
                const firstField = Object.keys(errors)[0];
                if (firstField) setCurrentSimplePageId(resolveValidationPage(firstField));
            }
            return valid;
        }
        return true;
    }, [errors, eventData.eventType, isAffiliateEvent, trigger]);

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

    const formSections = (
        <EventFormSections
            catalog={{
                eventTagOptions,
                sportOptions,
                sportsById,
                sportsError,
                sportsLoading,
            }}
            configurationActions={configurationActions}
            control={control}
            defaultCoordinates={defaultLocation?.coordinates}
            divisionController={divisionController}
            divisionOptions={divisionOptions}
            divisionTypeOptions={divisionTypeOptions}
            errors={errors}
            eventData={eventData}
            fieldWriters={fieldWriters}
            formId={formId}
            handleSaveDivisionDetail={handleSaveDivisionDetail}
            hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
            hideSectionNavigation={setupMode === 'SIMPLE'}
            isAffiliateEvent={isAffiliateEvent}
            isImmutableField={isImmutableField}
            leagueError={leagueError}
            onTryoutDivisionSelection={handleTryoutDivisionSelection}
            onTryoutPriceChange={handleTryoutPriceChange}
            organizationId={organizationId}
            paymentController={paymentController}
            presentation={{
                allowImageEdit,
                eventTypeOptions,
                lockedEventTypeTagSlugs,
                mobileEditUnsupportedWarning,
                selectedImageUrl,
                selectedSportForOfficials,
                supportsNoFixedEndDateTime,
            }}
            registrationQuestions={{
                drafts: registrationQuestionDrafts,
                error: registrationQuestionsError,
                loading: registrationQuestionsLoading,
            }}
            resourceController={resourceController}
            sectionsController={sectionsController}
            setValue={setValue}
            slotController={slotController}
            slotDivisionKeys={slotDivisionKeys}
            staffController={staffController}
            templates={{
                error: templatesError,
                loading: templatesLoading,
                organizationId: templateOrganizationId,
                options: templateOptions,
            }}
        />
    );
    const simplePageContent = SIMPLE_PLANNING_PAGE_IDS.has(currentSimplePageId) ? (
        <SimpleSetupPlanningPage
            pageId={currentSimplePageId}
            control={control}
            eventData={eventData}
            eventTypeOptions={eventTypeOptions}
            capabilities={simpleSetupCapabilities}
            choices={simpleSetupChoices}
            includePlayoffs={Boolean(leagueData.includePlayoffs)}
            fieldCount={fieldCount}
            setFieldCount={resourceController.setFieldCount}
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
            isImmutableField={isImmutableField}
        />
    ) : formSections;

    return (
        <div className="space-y-3">
            <div className="sticky top-0 z-30 space-y-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
                <div className="flex items-center justify-between gap-4">
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
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {setupMode === 'SIMPLE' ? (
                    <SimpleSetupPageFrame
                        page={currentSimplePage}
                        isFirstUsedPage={!previousUsedSimplePage}
                        isLastUsedPage={!nextUsedSimplePage}
                        onBack={handleSimpleSetupBack}
                        onNext={() => { void handleSimpleSetupNext(); }}
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
