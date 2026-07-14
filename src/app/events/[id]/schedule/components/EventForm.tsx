import React, { useCallback, useMemo } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { getEventImageUrl, Event, UserData, Team, LeagueConfig, Field, TournamentConfig } from '@/types';
import { useSports } from '@/app/hooks/useSports';

import { NumberInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import {
    buildEventTypeOptions,
    hasAffiliateUrl,
    hasParentEventRef,
    isTournamentPoolPlayFormEnabled,
    supportsScheduleSlotsForEvent,
} from './eventForm/eventRules';
import {
    coordinatesAreSet,
} from './eventForm/locationHelpers';
import { inferDivisionDetails } from '@/lib/divisionTypes';
import {
    buildDefaultDivisionDetailsForSport,
    buildDivisionTypeOptionsForEvent,
    buildSlotDivisionLookup,
    deriveScheduleParticipantCount,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizePlayoffDivisionDetailEntry,
    parseCompositeDivisionTypeId,
} from './eventForm/divisionForm';
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
    normalizePendingStaffInvite,
    type PendingStaffInvite,
} from './eventForm/staffInvites';
import {
    leagueConfigEqual,
} from './eventForm/formEquality';
import {
    SECTION_ANIMATION_DURATION_MS,
} from './eventForm/constants';
import {
    buildDivisionLeagueConfig,
    extractTournamentConfigFromEvent,
    normalizeNumber,
} from './eventForm/configDefaults';
import {
    buildMobileEditUnsupportedReasons,
    buildMobileEditUnsupportedWarning,
} from './eventForm/paymentPlanHelpers';
import {
    buildEventFormSectionNavigationItems,
    getVisibleSectionNavigationItems,
} from './eventForm/components/SectionNavigation';
import { EventFormShell } from './eventForm/components/EventFormShell';
import { BasicInformationSection } from './eventForm/sections/BasicInformationSection';
import { useEventFormSectionNavigation } from './eventForm/hooks/useEventFormSectionNavigation';
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
import { useRegistrationQuestionEditorActions } from './eventForm/hooks/useRegistrationQuestionEditorActions';
import { useRegistrationQuestionDrafts } from './eventForm/hooks/useRegistrationQuestionDrafts';
import { useStaffOfficialController } from './eventForm/hooks/useStaffOfficialController';
import { useTemplateDocuments } from './eventForm/hooks/useTemplateDocuments';
import { EventDetailsPanel } from './eventForm/sections/EventDetailsPanel';
import { LeagueScoringConfigSection } from './eventForm/sections/LeagueScoringConfigSection';
import { MatchRulesConfigSection } from './eventForm/sections/MatchRulesConfigSection';
import { RegistrationQuestionsSection } from './eventForm/sections/RegistrationQuestionsSection';
import { ScheduleConfigBody } from './eventForm/sections/ScheduleConfigBody';
import { ScheduleConfigSection } from './eventForm/sections/ScheduleConfigSection';
import { ManualPaymentSettingsSection } from './eventForm/sections/ManualPaymentSettingsSection';
import { EventFormDivisionSection } from './eventForm/sections/EventFormDivisionSection';
import { EventFormStaffSection } from './eventForm/sections/EventFormStaffSection';
import type { EventFormHandle, EventFormProps } from './eventForm/types';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const alignedDetailsFieldStyles = {
    label: {
        minHeight: '3rem',
        display: 'flex',
        alignItems: 'flex-end',
        lineHeight: 1.25,
    },
} as const;
const MAX_STANDARD_NUMBER = 99_999;
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
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 80;
const MAX_MEDIUM_TEXT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;

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
    const paymentController = useEventPaymentController({
        currentUser,
        eventData,
        getValues,
        isCreateMode,
        resolvedOrganization,
        setValue,
    });
    const {
        addManualPaymentLink,
        automaticRefundsAvailable,
        hasStripeAccount,
        manualPaymentLinks,
        manualPaymentsEnabled,
        pricingControlsEnabled,
        removeManualPaymentLink,
        setManualPaymentLinkValue,
        setManualPaymentsEnabled,
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

    const setEventData = useCallback(
        (
            updater: React.SetStateAction<EventFormValues>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues();
            const next = typeof updater === 'function' ? (updater as (prev: EventFormValues) => EventFormValues)(current) : updater;
            if (next === current) {
                return;
            }
            const shouldDirty = options.shouldDirty ?? true;
            const shouldValidate = options.shouldValidate ?? true;
            (Object.keys(next) as (keyof EventFormValues)[]).forEach((key) => {
                const currentVal = current[key];
                const nextVal = next[key];
                if (Object.is(currentVal, nextVal)) return;
                setValue(key, nextVal, { shouldDirty, shouldValidate });
            });
        },
        [getValues, setValue],
    );

    const setLeagueData = useCallback(
        (
            updater: React.SetStateAction<LeagueConfig>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('leagueData');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueConfig) => LeagueConfig)(current) : updater;
            if (leagueConfigEqual(current, next)) {
                return;
            }
            setValue('leagueData', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setPendingStaffInvites = useCallback(
        (updater: React.SetStateAction<PendingStaffInvite[]>) => {
            const current = getValues('pendingStaffInvites') ?? [];
            const next = typeof updater === 'function'
                ? (updater as (prev: PendingStaffInvite[]) => PendingStaffInvite[])(current)
                : updater;
            setValue('pendingStaffInvites', next.map(normalizePendingStaffInvite), { shouldDirty: true, shouldValidate: false });
        },
        [getValues, setValue],
    );

    const setTournamentData = useCallback(
        (updater: React.SetStateAction<TournamentConfig>) => {
            const current = getValues('tournamentData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('tournamentData', next, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setPlayoffData = useCallback(
        (
            updater: React.SetStateAction<TournamentConfig>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('playoffData');
            const next = typeof updater === 'function' ? (updater as (prev: TournamentConfig) => TournamentConfig)(current) : updater;
            if (Object.is(current, next)) {
                return;
            }
            setValue('playoffData', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setJoinAsParticipant = useCallback(
        (value: boolean) => {
            if (Object.is(getValues('joinAsParticipant'), value)) {
                return;
            }
            (setValue as (name: string, value: unknown, options?: { shouldDirty?: boolean; shouldValidate?: boolean }) => void)(
                'joinAsParticipant',
                value,
                { shouldDirty: true, shouldValidate: true },
            );
        },
        [getValues, setValue],
    );

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
    const {
        eventLocalFields,
        eventSupportsScheduleSlots,
        fieldCount,
        fields,
        fieldsLoading,
        fieldsReferencedInSlots,
        handleLocalFieldNameChange,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        hasRestrictedImmutableFields,
        immutableTimeSlots,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        leagueFieldOptions,
        organizationHostedEventId,
        organizationResourcePool,
        rentalLockedSlotsForDraft,
        rentalResourcesError,
        resourceSelectorLoading,
        selectedFieldIds,
        selectedFields,
        selectedRentedFieldIds,
        setFieldCount,
        shouldManageLocalFields,
        shouldProvisionFields,
        showLocalFieldCreationControls,
        showOrganizationFieldsInEventDetails,
        usesRentalSlots,
    } = useEventResourceController({
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
        handleAddSlot,
        handleAutoResolveSlotConflict,
        handleRemoveSlot,
        handleUpdateSlot,
        leagueWarning,
    } = useEventSlotController({
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
    const {
        handleAffiliateEventChange,
        handleEndChange,
        handleEventTypeChange,
        handleIncludePlayoffsToggle,
        handleIncludePoolPlayChange,
        handleLeagueScoringConfigChange,
        handleMatchRulesOverrideChange,
        handleNoFixedEndDateTimeChange,
        handleSelectedAddressChange,
        handleStartChange,
    } = useEventFormConfigurationActions({
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

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));

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
    // Syncs the selected event image with component state after uploads or picker changes.
    const handleImageChange = (fileId: string, _url: string) => {
        if (isImmutableField('imageId')) {
            return;
        }
        setValue('imageId', fileId, { shouldDirty: true, shouldValidate: true });
    };

    const allowImageEdit = !isImmutableField('imageId');
    const isLocationImmutable = isImmutableField('location') || isImmutableField('coordinates') || hasExternalRentalField;
    const splitLeaguePlayoffDivisionsLocked = isImmutableField('splitLeaguePlayoffDivisions') && !hasExternalRentalField;
    const isSchedulableEventType = !isAffiliateEvent && supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    const isWeeklyChildEvent = eventData.eventType === 'WEEKLY_EVENT' && hasParentEventRef(eventData.parentEvent);
    const supportsEditableTeamSignup = !isAffiliateEvent && (eventData.eventType === 'EVENT' || eventData.eventType === 'WEEKLY_EVENT');
    const showsFixedTeamEventToggle = !isAffiliateEvent && (eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT');
    const showScheduleConfig = !isAffiliateEvent && (isSchedulableEventType || usesRentalSlots || isWeeklyChildEvent);
    const localFieldCreationControl = showLocalFieldCreationControls ? (
        <NumberInput
            label="Count"
            min={isOrganizationHostedEvent ? 0 : 1}
            max={12}
            value={fieldCount}
            w="100%"
            clampBehavior="blur"
            onChange={(value) => {
                const parsed = typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : Number(value);
                const minimum = isOrganizationHostedEvent ? 0 : 1;
                setFieldCount(Number.isFinite(parsed) ? Math.max(minimum, Math.trunc(parsed)) : minimum);
            }}
            error={errors.fieldCount?.message as string | undefined}
        />
    ) : null;
    const showMatchRulesSection = !isAffiliateEvent && eventData.eventType !== 'EVENT' && eventData.eventType !== 'WEEKLY_EVENT';
    const showStaffSection = !isAffiliateEvent;
    const showScoringConfigSection = !isAffiliateEvent && (
        eventData.eventType === 'LEAGUE'
        || isTournamentPoolPlayFormEnabled(eventData.eventType, leagueData.includePlayoffs)
    );
    const scoringConfigSectionLabel = eventData.eventType === 'TOURNAMENT'
        ? 'Pool Scoring Config'
        : 'League Scoring Config';
    const showManualPaymentsSection = !isAffiliateEvent && manualPaymentsEnabled;
    const sectionNavItems = useMemo(
        () => buildEventFormSectionNavigationItems({
            showMatchRulesSection,
            showStaffSection,
            showManualPaymentsSection,
            scoringConfigSectionLabel,
            divisionSettingsSectionLabel: 'Divisions',
            showScoringConfigSection,
            showScheduleConfig,
        }),
        [scoringConfigSectionLabel, showManualPaymentsSection, showMatchRulesSection, showScheduleConfig, showScoringConfigSection, showStaffSection],
    );
    const visibleSectionNavItems = useMemo(
        () => getVisibleSectionNavigationItems(sectionNavItems),
        [sectionNavItems],
    );
    const {
        activeSectionId,
        collapsedSections,
        fieldNamesCollapsed,
        setFieldNamesCollapsed,
        toggleSectionCollapse,
        expandSection,
        scrollToSection,
    } = useEventFormSectionNavigation({
        open,
        visibleItems: visibleSectionNavItems,
        collapseDefaults: SECTION_COLLAPSE_DEFAULTS,
        defaultSectionId: 'section-basic-information',
        scrollOffset: SECTION_SCROLL_OFFSET,
    });

    const {
        addQuestion: handleAddRegistrationQuestion,
        changePrompt: handleRegistrationQuestionPromptChange,
        changeRequired: handleRegistrationQuestionRequiredChange,
        removeQuestion: handleRemoveRegistrationQuestion,
    } = useRegistrationQuestionEditorActions({
        expandSection,
        setDrafts: setRegistrationQuestionDrafts,
    });

    const registrationQuestionsEditor = (
        <RegistrationQuestionsSection
            collapsed={collapsedSections['section-registration-questions']}
            questions={registrationQuestionDrafts}
            loading={registrationQuestionsLoading}
            error={registrationQuestionsError}
            onToggle={() => toggleSectionCollapse('section-registration-questions')}
            onAddQuestion={handleAddRegistrationQuestion}
            onPromptChange={handleRegistrationQuestionPromptChange}
            onRequiredChange={handleRegistrationQuestionRequiredChange}
            onRemoveQuestion={handleRemoveRegistrationQuestion}
        />
    );

    const handleManualPaymentsChange = useCallback((checked: boolean) => {
        setManualPaymentsEnabled(checked);
        if (checked) {
            expandSection('section-manual-payments');
        }
    }, [expandSection, setManualPaymentsEnabled]);

    const sheetContent = (
        <EventFormShell
            formId={formId}
            sectionNavItems={visibleSectionNavItems}
            activeSectionId={activeSectionId}
            mobileEditUnsupportedWarning={mobileEditUnsupportedWarning}
            leagueWarning={leagueWarning}
            leagueError={leagueError}
            onSelectSection={scrollToSection}
        >
                        <BasicInformationSection
                            collapsed={collapsedSections['section-basic-information']}
                            control={control}
                            errors={errors}
                            selectedImageUrl={selectedImageUrl}
                            allowImageEdit={allowImageEdit}
                            sportsLoading={sportsLoading}
                            sportOptions={sportOptions}
                            sportsById={sportsById}
                            sportsError={sportsError}
                            eventTagOptions={eventTagOptions}
                            lockedTagSlugs={lockedEventTypeTagSlugs}
                            comboboxProps={sharedComboboxProps}
                            maxEventNameLength={MAX_EVENT_NAME_LENGTH}
                            maxDescriptionLength={MAX_DESCRIPTION_LENGTH}
                            isImmutableField={isImmutableField}
                            setValue={setValue}
                            onToggle={() => toggleSectionCollapse('section-basic-information')}
                            onImageChange={handleImageChange}
                        />

                        <EventDetailsPanel
                            collapsed={collapsedSections['section-event-details']}
                            control={control}
                            eventData={eventData}
                            leagueData={leagueData}
                            isAffiliateEvent={isAffiliateEvent}
                            eventTypeOptions={eventTypeOptions}
                            supportsEditableTeamSignup={supportsEditableTeamSignup}
                            showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                            supportsNoFixedEndDateTime={supportsNoFixedEndDateTime}
                            automaticRefundsAvailable={automaticRefundsAvailable}
                            manualPaymentsEnabled={manualPaymentsEnabled}
                            todaysDate={todaysDate}
                            maxStandardNumber={MAX_STANDARD_NUMBER}
                            maxResourceNameLength={MAX_MEDIUM_TEXT_LENGTH}
                            selectStyles={alignedDetailsFieldStyles}
                            numberInputStyles={alignedDetailsFieldStyles}
                            dateTimePickerStyles={alignedDetailsFieldStyles}
                            popoverProps={sharedPopoverProps}
                            comboboxProps={sharedComboboxProps}
                            isImmutableField={isImmutableField}
                            onToggle={() => toggleSectionCollapse('section-event-details')}
                            onEventTypeChange={handleEventTypeChange}
                            onAffiliateEventChange={handleAffiliateEventChange}
                            onIncludePlayoffsChange={handleIncludePlayoffsToggle}
                            onIncludePoolPlayChange={handleIncludePoolPlayChange}
                            onStartChange={handleStartChange}
                            onEndChange={handleEndChange}
                            onNoFixedEndDateTimeChange={handleNoFixedEndDateTimeChange}
                            onManualPaymentsChange={handleManualPaymentsChange}
                            coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
                            defaultCoordinates={defaultLocation?.coordinates}
                            onSelectedAddressChange={handleSelectedAddressChange}
                            isLocationImmutable={isLocationImmutable}
                            templatesLoading={templatesLoading}
                            templatesError={templatesError}
                            templateOrganizationId={templateOrganizationId}
                            templateOptions={templateOptions}
                            normalizeNumberValue={normalizeNumber}
                            showAffiliateListingControls={isAffiliateEvent}
                            showRequiredDocumentControls={!isAffiliateEvent}
                            localFieldCreationControl={isAffiliateEvent ? null : localFieldCreationControl}
                            registrationQuestionsEditor={isAffiliateEvent ? null : registrationQuestionsEditor}
                            hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
                            showOrganizationFields={isAffiliateEvent ? false : showOrganizationFieldsInEventDetails}
                            organizationResourcePool={organizationResourcePool}
                            resourceSelectorLoading={resourceSelectorLoading}
                            organizationHostedEventId={organizationHostedEventId}
                            rentalResourcesError={rentalResourcesError}
                            showLocalFieldCreationControls={isAffiliateEvent ? false : showLocalFieldCreationControls}
                            eventLocalFields={eventLocalFields}
                            fieldNamesCollapsed={fieldNamesCollapsed}
                            setFieldNamesCollapsed={setFieldNamesCollapsed}
                            onLocalFieldNameChange={handleLocalFieldNameChange}
                        />

                        <ManualPaymentSettingsSection
                            visible={showManualPaymentsSection}
                            collapsed={collapsedSections['section-manual-payments']}
                            control={control}
                            links={manualPaymentLinks}
                            onToggle={() => toggleSectionCollapse('section-manual-payments')}
                            onAddLink={addManualPaymentLink}
                            onLinkChange={setManualPaymentLinkValue}
                            onRemoveLink={removeManualPaymentLink}
                        />

                        <MatchRulesConfigSection
                            visible={showMatchRulesSection}
                            collapsed={collapsedSections['section-match-rules']}
                            sport={selectedSportForOfficials}
                            usesSets={eventData.eventType === 'LEAGUE'
                                ? Boolean(leagueData.usesSets)
                                : eventData.eventType === 'TOURNAMENT'
                                    ? Boolean(tournamentData.usesSets)
                                    : Boolean(selectedSportForOfficials?.usePointsPerSetWin)}
                            setsPerMatch={eventData.eventType === 'LEAGUE' ? leagueData.setsPerMatch : undefined}
                            winnerSetCount={eventData.eventType === 'TOURNAMENT' ? tournamentData.winnerSetCount : undefined}
                            officialPositions={eventData.officialPositions}
                            value={eventData.matchRulesOverride}
                            onChange={handleMatchRulesOverrideChange}
                            autoCreatePointMatchIncidents={eventData.autoCreatePointMatchIncidents}
                            onAutoCreatePointMatchIncidentsChange={(checked) => setValue('autoCreatePointMatchIncidents', checked, { shouldDirty: true, shouldValidate: false })}
                            disabled={isImmutableField('matchRulesOverride')}
                            incidentToggleDisabled={isImmutableField('matchRulesOverride') || isImmutableField('autoCreatePointMatchIncidents')}
                            comboboxProps={sharedComboboxProps}
                            onToggle={() => toggleSectionCollapse('section-match-rules')}
                        />

                        <EventFormStaffSection
                            visible={showStaffSection}
                            collapsed={collapsedSections['section-officials']}
                            control={control}
                            eventData={eventData}
                            isOrganizationHostedEvent={isOrganizationHostedEvent}
                            maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                            maxShortTextLength={MAX_SHORT_TEXT_LENGTH}
                            comboboxProps={sharedComboboxProps}
                            isImmutableField={isImmutableField}
                            setValue={setValue}
                            staffController={staffController}
                            onToggle={() => toggleSectionCollapse('section-officials')}
                        />

                        <EventFormDivisionSection
                            collapsed={collapsedSections['section-division-settings']}
                            onToggle={() => toggleSectionCollapse('section-division-settings')}
                            control={control}
                            comboboxProps={sharedComboboxProps}
                            divisionController={divisionController}
                            divisionTypeOptions={divisionTypeOptions}
                            errors={errors}
                            eventData={eventData}
                            hasExternalRentalField={hasExternalRentalField}
                            isAffiliateEvent={isAffiliateEvent}
                            isImmutableField={isImmutableField}
                            isOrganizationHostedEvent={isOrganizationHostedEvent}
                            maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                            maxPriceCents={9_999_999 * 100}
                            maxStandardNumber={MAX_STANDARD_NUMBER}
                            numberInputStyles={alignedDetailsFieldStyles}
                            onSaveDivision={handleSaveDivisionDetail}
                            paymentController={paymentController}
                            playoffData={playoffData}
                            setLeagueData={setLeagueData}
                            setPlayoffData={setPlayoffData}
                            setTournamentData={setTournamentData}
                            setValue={setValue}
                            showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                            splitLeaguePlayoffDivisionsLocked={splitLeaguePlayoffDivisionsLocked}
                            supportsEditableTeamSignup={supportsEditableTeamSignup}
                            tournamentData={tournamentData}
                        />

                        <LeagueScoringConfigSection
                            visible={showScoringConfigSection}
                            collapsed={collapsedSections['section-league-scoring-config']}
                            title={scoringConfigSectionLabel}
                            value={eventData.leagueScoringConfig}
                            sport={eventData.sportConfig ?? undefined}
                            editable={!isImmutableField('leagueScoringConfig')}
                            onToggle={() => toggleSectionCollapse('section-league-scoring-config')}
                            onChange={handleLeagueScoringConfigChange}
                        />

                        <ScheduleConfigSection
                            visible={showScheduleConfig}
                            collapsed={collapsedSections['section-schedule-config']}
                            onToggle={() => toggleSectionCollapse('section-schedule-config')}
                        >
                            <ScheduleConfigBody
                                control={control}
                                usesRentalSlots={usesRentalSlots}
                                immutableTimeSlotCount={immutableTimeSlots.length}
                                isWeeklyChildEvent={isWeeklyChildEvent}
                                isSchedulableEventType={isSchedulableEventType}
                                isOrganizationManagedEvent={isOrganizationManagedEvent}
                                organizationHostedEventId={organizationHostedEventId}
                                selectedFields={selectedFields}
                                resourceSelectorLoading={resourceSelectorLoading}
                                rentalResourcesError={rentalResourcesError}
                                isImmutableField={isImmutableField}
                                leagueData={leagueData}
                                sport={eventData.sportConfig ?? undefined}
                                participantCount={deriveScheduleParticipantCount({
                                    singleDivision: eventData.singleDivision,
                                    maxParticipants: eventData.maxParticipants,
                                    divisionDetails: eventData.divisionDetails,
                                })}
                                leagueSlots={leagueSlots}
                                leagueFieldOptions={leagueFieldOptions}
                                divisionOptions={divisionOptions}
                                eventStartDate={eventData.start}
                                lockSlotDivisions={Boolean(eventData.singleDivision)}
                                lockedDivisionKeys={slotDivisionKeys}
                                readOnly={hasImmutableTimeSlots}
                                allowDivisionEditsWhenReadOnly={hasExternalRentalField && !eventData.singleDivision}
                                allowResourceEditsWhenReadOnly={hasExternalRentalField}
                                onLeagueDataChange={(updates) => setLeagueData(prev => ({ ...prev, ...updates }))}
                                onAddSlot={handleAddSlot}
                                onUpdateSlot={handleUpdateSlot}
                                onRemoveSlot={handleRemoveSlot}
                                onAutoResolveSlotConflict={handleAutoResolveSlotConflict}
                            />
                        </ScheduleConfigSection>
        </EventFormShell>
    );

    if (!open) {
        return null;
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            {sheetContent}
        </div>
    );
});

EventForm.displayName = 'EventForm';

export default EventForm;
