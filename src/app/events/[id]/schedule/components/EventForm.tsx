import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { getEventImageUrl, Event, UserData, Team, LeagueConfig, Field, Organization, LeagueScoringConfig, MatchRulesConfig, TournamentConfig, EventTag } from '@/types';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Checkbox, Group, Button, Loader, Text, Collapse, Badge, Alert, Stack, Select as MantineSelect } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import {
    normalizeEntityId,
    sanitizeOrganizationEventAssignments,
} from '@/lib/organizationEventAccess';
import {
    formatLocalDateTime,
    getSystemTimeZone,
    normalizeTimeZone,
    nowLocalDateTimeString,
    parseLocalDateTime,
} from '@/lib/dateUtils';
import { createClientId } from '@/lib/clientId';
import { applyLeagueScoringConfigFieldChange } from './leagueScoringConfigForm';
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
    normalizeManualPaymentProvider,
} from '@/lib/manualRegistrationPayments';
import {
    buildDefaultDivisionDetailsForSport,
    buildDivisionTypeOptionsForEvent,
    buildDivisionTypeSelectOptions,
    buildPlayoffDivisionCapacityWarnings,
    buildPlayoffDivisionSelectOptions,
    buildSlotDivisionLookup,
    deriveScheduleParticipantCount,
    DIVISION_GENDER_OPTIONS,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionDetailEntry,
    normalizePlayoffDivisionDetailEntry,
    normalizePlayoffDivisionParticipantCount,
    parseCompositeDivisionTypeId,
} from './eventForm/divisionForm';
import {
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
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
import {
    getLockedEventTypeTagSlugs,
    syncEventTypeTagsForEventType,
} from './eventForm/eventTypeTags';
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
    buildTournamentConfig,
    derivePoolTeamCount,
    extractTournamentConfigFromEvent,
    normalizeNumber,
} from './eventForm/configDefaults';
import {
    buildMobileEditUnsupportedReasons,
    buildMobileEditUnsupportedWarning,
    sumInstallmentAmounts,
} from './eventForm/paymentPlanHelpers';
import { sanitizeMatchRulesOverrideForEditor } from './eventForm/matchRulesHelpers';
import {
    buildEventFormSectionNavigationItems,
    getVisibleSectionNavigationItems,
} from './eventForm/components/SectionNavigation';
import { EventFormShell } from './eventForm/components/EventFormShell';
import { BasicInformationSection } from './eventForm/sections/BasicInformationSection';
import { DivisionEditorActionsAndErrors } from './eventForm/sections/DivisionEditorActionsAndErrors';
import { DivisionEditorHeader } from './eventForm/sections/DivisionEditorHeader';
import { DivisionEditorLeaguePanel } from './eventForm/sections/DivisionEditorLeaguePanel';
import { DivisionEditorPlayoffDivisionControls } from './eventForm/sections/DivisionEditorPlayoffDivisionControls';
import { DivisionModeControls } from './eventForm/sections/DivisionModeControls';
import { DivisionSettingsSection } from './eventForm/sections/DivisionSettingsSection';
import { DivisionSummaryList } from './eventForm/sections/DivisionSummaryList';
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
import { useRegistrationQuestionDrafts } from './eventForm/hooks/useRegistrationQuestionDrafts';
import { useStaffOfficialController } from './eventForm/hooks/useStaffOfficialController';
import { useTemplateDocuments } from './eventForm/hooks/useTemplateDocuments';
import { EventDetailsPanel } from './eventForm/sections/EventDetailsPanel';
import { LeagueScoringConfigSection } from './eventForm/sections/LeagueScoringConfigSection';
import { MatchRulesConfigSection } from './eventForm/sections/MatchRulesConfigSection';
import { RegistrationQuestionsSection } from './eventForm/sections/RegistrationQuestionsSection';
import { ScheduleConfigBody } from './eventForm/sections/ScheduleConfigBody';
import { ScheduleConfigSection } from './eventForm/sections/ScheduleConfigSection';
import { SingleDivisionDefaultsPanel } from './eventForm/sections/SingleDivisionDefaultsPanel';
import { StaffManagementPanel } from './eventForm/sections/StaffManagementPanel';
import { StaffSection } from './eventForm/sections/StaffSection';
import { ManualPaymentsSection } from './eventForm/sections/ManualPaymentsSection';
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
const MAX_PRICE_NUMBER = 9_999_999;
const MAX_PRICE_CENTS = MAX_PRICE_NUMBER * 100;
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
    const [hydratedOrganization, setHydratedOrganization] = useState<Organization | null>(organization ?? null);
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
    const [eventTagOptions, setEventTagOptions] = useState<EventTag[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/event-tags', { signal: controller.signal })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('Failed to load tags')))
            .then((body) => {
                setEventTagOptions(Array.isArray(body?.tags) ? body.tags : []);
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    setEventTagOptions([]);
                }
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        setHydratedOrganization(organization ?? null);
    }, [organization]);

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
    const {
        addManualPaymentLink,
        automaticRefundsAvailable,
        connectStripe: handleConnectStripe,
        connectingStripe,
        eventTaxableForPreview,
        eventTaxPolicyForPreview,
        hasStripeAccount,
        manualPaymentLinks,
        manualPaymentsEnabled,
        organizationDefaultEventTaxHandling,
        organizerManualTaxSelected,
        organizerTaxCollectionAllowed,
        pricingControlsEnabled,
        removeInstallment,
        removeManualPaymentLink,
        setInstallmentAmount,
        setInstallmentDueDate,
        setInstallmentDueRelativeDay,
        setManualPaymentLinkValue,
        setManualPaymentsEnabled,
        syncInstallmentCount,
    } = useEventPaymentController({
        currentUser,
        eventData,
        getValues,
        isCreateMode,
        resolvedOrganization,
        setValue,
    });
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
    const skillDivisionTypeSelectOptions = useMemo(
        () => buildDivisionTypeSelectOptions(divisionTypeOptions, 'SKILL'),
        [divisionTypeOptions],
    );
    const ageDivisionTypeSelectOptions = useMemo(
        () => buildDivisionTypeSelectOptions(divisionTypeOptions, 'AGE'),
        [divisionTypeOptions],
    );
    const currentSportRequiresSets = useMemo(
        () => sportRequiresSets(resolveSelectedSport({
            sportId: eventData.sportId,
            sportConfig: eventData.sportConfig,
            sportsById,
        })),
        [eventData.sportConfig, eventData.sportId, sportsById],
    );

    const {
        createNextPlayoffDivision,
        defaultDivisionTypeSelections,
        divisionEditor,
        divisionEditorReady,
        divisionMaxParticipantsWarning,
        handleDivisionEditorKindChange,
        handleEditDivisionDetail,
        handleEditPlayoffDivisionDetail,
        handleRemoveDivisionDetail,
        handleRemovePlayoffDivision,
        removeDivisionInstallment,
        resetDivisionEditor,
        setDivisionEditor,
        setDivisionEditorLeagueConfig,
        setDivisionEditorPlayoffConfig,
        setDivisionInstallmentAmount,
        setDivisionInstallmentDueDate,
        setDivisionInstallmentDueRelativeDay,
        singleDivisionPoolPlayDefaults,
        splitDivisionEditorEnabled,
        syncDivisionInstallmentCount,
        updateDivisionEditorSelection,
        updateSingleDivisionTournamentPoolDefaults,
    } = useDivisionEditorController({
        eventData,
        leagueData,
        playoffData,
        currentSportRequiresSets,
        hasStripeAccount: pricingControlsEnabled,
        isCreateMode,
        setValue,
        getValues,
    });
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
    const playoffDivisionSelectOptions = useMemo(
        () => buildPlayoffDivisionSelectOptions(eventData.playoffDivisionDetails),
        [eventData.playoffDivisionDetails],
    );

    const playoffDivisionCapacityWarnings = useMemo(
        () => buildPlayoffDivisionCapacityWarnings({
            eventType: eventData.eventType,
            includePlayoffs: leagueData.includePlayoffs,
            splitLeaguePlayoffDivisions: eventData.splitLeaguePlayoffDivisions,
            divisionDetails: eventData.divisionDetails,
            playoffDivisionDetails: eventData.playoffDivisionDetails,
        }),
        [
            eventData.divisionDetails,
            eventData.eventType,
            eventData.playoffDivisionDetails,
            eventData.splitLeaguePlayoffDivisions,
            leagueData.includePlayoffs,
        ],
    );

    const selectedSportForOfficials = useMemo(
        () => resolveSelectedSport({
            sportId: eventData.sportId,
            sportConfig: eventData.sportConfig,
            sportsById,
        }),
        [eventData.sportConfig, eventData.sportId, sportsById],
    );

    const {
        assignedActiveOfficialsForStaffing,
        assignedHostCards,
        assignedOfficialCards,
        assignedUserIdSetByRole,
        assistantHostValue,
        availableOfficialFieldOptions,
        eventOfficialByUserId,
        filteredOrganizationStaffEntries,
        handleAddAssistantHost,
        handleAddOfficial,
        handleAddOfficialPosition,
        handleAssignedHostsScroll,
        handleAssignedOfficialsScroll,
        handleHostChange,
        handleInviteFieldChange,
        handleInviteRoleToggle,
        handleOrganizationStaffScroll,
        handleRemoveAssistantHost,
        handleRemoveOfficial,
        handleRemoveOfficialPosition,
        handleRemovePendingStaffInviteRole,
        handleResetOfficialPositionsFromSport,
        handleStagePendingStaffInvite,
        handleUpdateEventOfficialEligibility,
        handleUpdateOfficialPosition,
        hostCardVisibleCount,
        newStaffInvite,
        nonOrgStaffError,
        nonOrgStaffResults,
        nonOrgStaffSearch,
        nonOrgStaffSearchLoading,
        officialCardVisibleCount,
        officialStaffingCoverageError,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationOfficialsById,
        organizationStaffSearch,
        organizationStaffStatusFilter,
        organizationStaffTypeFilter,
        organizationStaffVisibleCount,
        requiredOfficialSlotsPerMatch,
        setNonOrgStaffSearch,
        setOrganizationStaffSearch,
        setOrganizationStaffStatusFilter,
        setOrganizationStaffTypeFilter,
        sportOfficialPositionTemplates,
        staffInviteError,
        validatePendingStaffAssignments,
    } = useStaffOfficialController({
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

    const handleLeagueScoringConfigChange = useCallback(
        (key: keyof LeagueScoringConfig, value: LeagueScoringConfig[keyof LeagueScoringConfig]) => {
            const currentConfig = (
                getValues('leagueScoringConfig') as LeagueScoringConfig | undefined
            ) ?? eventData.leagueScoringConfig;
            const nextConfig = applyLeagueScoringConfigFieldChange(
                currentConfig,
                key,
                value,
                (config) => setValue('leagueScoringConfig', config, { shouldDirty: true, shouldValidate: false }),
            );
            setEventData(prev => ({
                ...prev,
                leagueScoringConfig: nextConfig,
            }));
        },
        [eventData.leagueScoringConfig, getValues, setEventData, setValue]
    );

    const handleMatchRulesOverrideChange = useCallback((nextValue: MatchRulesConfig | null) => {
        const sanitized = sanitizeMatchRulesOverrideForEditor(nextValue);
        setValue('matchRulesOverride', sanitized, { shouldDirty: true, shouldValidate: false });
        const template = (selectedSportForOfficials?.matchRulesTemplate ?? null) as MatchRulesConfig | null;
        const templateTimekeeping = template?.timekeeping ?? null;
        const overrideTimekeeping = sanitized?.timekeeping ?? null;
        const timerMode = overrideTimekeeping?.timerMode ?? templateTimekeeping?.timerMode;
        const segmentDuration = normalizeNumber(
            overrideTimekeeping?.segmentDurationMinutes
            ?? templateTimekeeping?.segmentDurationMinutes,
        );
        const segmentCount = normalizeNumber(template?.segmentCount)
            ?? (eventData.eventType === 'TOURNAMENT'
                ? normalizeNumber(tournamentData.winnerSetCount)
                : normalizeNumber(leagueData.setsPerMatch))
            ?? 1;
        if (timerMode === 'COUNT_UP' && segmentDuration && segmentCount > 0) {
            const totalMatchDuration = Math.max(1, Math.trunc(segmentDuration * segmentCount));
            if (eventData.eventType === 'LEAGUE') {
                setLeagueData((previous) => ({
                    ...previous,
                    usesSets: false,
                    matchDurationMinutes: totalMatchDuration,
                    setDurationMinutes: undefined,
                }));
            } else if (eventData.eventType === 'TOURNAMENT') {
                setTournamentData((previous) => ({
                    ...previous,
                    matchDurationMinutes: totalMatchDuration,
                    setDurationMinutes: undefined,
                }));
            }
        }
    }, [
        eventData.eventType,
        leagueData.setsPerMatch,
        selectedSportForOfficials,
        setLeagueData,
        setTournamentData,
        setValue,
        tournamentData.winnerSetCount,
    ]);

    const handleIncludePlayoffsToggle = useCallback((checked: boolean) => {
        if (!checked) {
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: false,
                playoffTeamCount: undefined,
            }));
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
            return;
        }

        if (eventData.singleDivision) {
            const fallback = typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.maxParticipants || 2;
            setLeagueData((prev) => ({
                ...prev,
                includePlayoffs: true,
                playoffTeamCount: Math.max(2, Math.trunc(fallback)),
            }));
            return;
        }

        setLeagueData((prev) => ({
            ...prev,
            includePlayoffs: true,
            playoffTeamCount: typeof prev.playoffTeamCount === 'number'
                ? Math.max(2, Math.trunc(prev.playoffTeamCount))
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        }));
    }, [eventData.maxParticipants, eventData.singleDivision, leagueData.playoffTeamCount, setLeagueData, setValue]);

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
    const applyAffiliateEventSimplifications = useCallback((checked: boolean) => {
        setValue('isAffiliateEvent', checked, { shouldDirty: true, shouldValidate: true });
        if (!checked) {
            setValue('affiliateUrl', '', { shouldDirty: true, shouldValidate: true });
            return;
        }
        setValue('teamSignup', false, { shouldDirty: true, shouldValidate: true });
        setValue('registrationByDivisionType', false, { shouldDirty: true, shouldValidate: true });
        setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: true, shouldValidate: true });
        setValue('allowPaymentPlans', false, { shouldDirty: true, shouldValidate: true });
        setValue('installmentCount', 0, { shouldDirty: true, shouldValidate: true });
        setValue('installmentAmounts', [], { shouldDirty: true, shouldValidate: true });
        setValue('installmentDueDates', [], { shouldDirty: true, shouldValidate: true });
        setValue('installmentDueRelativeDays', [], { shouldDirty: true, shouldValidate: true });
        setValue('allowTeamSplitDefault', false, { shouldDirty: true, shouldValidate: true });
        setValue('requiredTemplateIds', [], { shouldDirty: true, shouldValidate: true });
        setValue('playoffDivisionDetails', [], { shouldDirty: true, shouldValidate: true });
        setValue('assistantHostIds', [], { shouldDirty: true, shouldValidate: true });
        setValue('officialIds', [], { shouldDirty: true, shouldValidate: true });
        setValue('eventOfficials', [], { shouldDirty: true, shouldValidate: true });
        setValue('pendingStaffInvites', [], { shouldDirty: true, shouldValidate: true });
        setValue('doTeamsOfficiate', false, { shouldDirty: true, shouldValidate: true });
        setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
        setValue('officialSchedulingMode', 'OFF', { shouldDirty: true, shouldValidate: true });
        setValue('officialPositions', [], { shouldDirty: true, shouldValidate: true });
        setValue('matchRulesOverride', null, { shouldDirty: true, shouldValidate: true });
        setValue('autoCreatePointMatchIncidents', false, { shouldDirty: true, shouldValidate: true });
        setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
    }, [setValue]);
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

    const handleAddRegistrationQuestion = useCallback(() => {
        expandSection('section-registration-questions');
        setRegistrationQuestionDrafts((current) => [
            ...current,
            {
                id: createClientId(),
                prompt: '',
                answerType: 'TEXT',
                required: false,
                sortOrder: current.length,
            },
        ]);
    }, [expandSection]);

    const handleRegistrationQuestionPromptChange = useCallback((index: number, prompt: string) => {
        setRegistrationQuestionDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, prompt, sortOrder: index }
                : entry
        )));
    }, []);

    const handleRegistrationQuestionRequiredChange = useCallback((index: number, required: boolean) => {
        setRegistrationQuestionDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, required, sortOrder: index }
                : entry
        )));
    }, []);

    const handleRemoveRegistrationQuestion = useCallback((index: number) => {
        setRegistrationQuestionDrafts((current) => current
            .filter((_, entryIndex) => entryIndex !== index)
            .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex })));
    }, []);

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
                            onEventTypeChange={(nextType, applyValue) => {
                                clearErrors('leagueSlots');
                                const enforcingTeamSettings = !isAffiliateEvent && (nextType === 'LEAGUE' || nextType === 'TOURNAMENT');
                                applyValue(nextType);
                                setValue(
                                    'tags',
                                    syncEventTypeTagsForEventType(getValues('tags'), nextType),
                                    { shouldDirty: true, shouldValidate: true },
                                );
                                if (enforcingTeamSettings) {
                                    setValue('teamSignup', true, { shouldDirty: true });
                                    setValue('singleDivision', true, { shouldDirty: true, shouldValidate: true });
                                    setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
                                } else {
                                    setValue('noFixedEndDateTime', false, { shouldDirty: true, shouldValidate: true });
                                    const parsedStart = parseLocalDateTime(getValues('start'));
                                    const parsedEnd = parseLocalDateTime(getValues('end'));
                                    if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                        const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                        setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                    }
                                }
                            }}
                            onAffiliateEventChange={(checked, applyValue) => {
                                applyValue(checked);
                                applyAffiliateEventSimplifications(checked);
                            }}
                            onIncludePlayoffsChange={handleIncludePlayoffsToggle}
                            onIncludePoolPlayChange={(checked) => {
                                setLeagueData((prev) => ({
                                    ...prev,
                                    includePlayoffs: checked,
                                    playoffTeamCount: checked ? prev.playoffTeamCount : undefined,
                                }));
                                if (!checked) {
                                    const currentDetails = Array.isArray(eventData.divisionDetails)
                                        ? eventData.divisionDetails
                                        : [];
                                    setValue(
                                        'divisionDetails',
                                        currentDetails.map((detail) => ({
                                            ...detail,
                                            playoffTeamCount: undefined,
                                            poolCount: undefined,
                                            poolTeamCount: undefined,
                                        })),
                                        { shouldDirty: true, shouldValidate: true },
                                    );
                                }
                            }}
                            onStartChange={(parsed) => {
                                setValue('start', formatLocalDateTime(parsed), { shouldDirty: true, shouldValidate: true });
                            }}
                            onEndChange={(parsed) => {
                                setValue('end', formatLocalDateTime(parsed), { shouldDirty: true, shouldValidate: true });
                            }}
                            onNoFixedEndDateTimeChange={(checked) => {
                                setValue('noFixedEndDateTime', checked, { shouldDirty: true, shouldValidate: true });
                                if (checked) return;
                                const parsedStart = parseLocalDateTime(getValues('start'));
                                const parsedEnd = parseLocalDateTime(getValues('end'));
                                if (parsedStart && (!parsedEnd || parsedEnd.getTime() <= parsedStart.getTime())) {
                                    const minimumEnd = new Date(parsedStart.getTime() + 60 * 60 * 1000);
                                    setValue('end', formatLocalDateTime(minimumEnd), { shouldDirty: true, shouldValidate: true });
                                }
                            }}
                            onManualPaymentsChange={handleManualPaymentsChange}
                            coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
                            defaultCoordinates={defaultLocation?.coordinates}
                            onSelectedAddressChange={(nextCoordinates, nextAddress) => {
                                setValue('coordinates', nextCoordinates, { shouldDirty: true, shouldValidate: true });
                                setValue('address', nextAddress, { shouldDirty: true, shouldValidate: true });
                            }}
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

                        {showManualPaymentsSection ? (
                            <ManualPaymentsSection
                                collapsed={collapsedSections['section-manual-payments']}
                                onToggle={() => toggleSectionCollapse('section-manual-payments')}
                            >
                                <Alert color="yellow" variant="light">
                                    Manual payments are handled outside BracketIQ. Stripe checkout, platform fees, refund requests, and automatic refunds are disabled for these registrations. The host is responsible for confirming payments and handling refunds.
                                </Alert>
                                <Stack gap="sm">
                                    {manualPaymentLinks.map((link, index) => (
                                        <Group key={link.id || index} align="flex-end" grow>
                                            <MantineSelect
                                                label={index === 0 ? 'Provider' : undefined}
                                                value={normalizeManualPaymentProvider(link.provider)}
                                                data={[
                                                    { value: 'CASH_APP', label: 'Cash App' },
                                                    { value: 'VENMO', label: 'Venmo' },
                                                    { value: 'PAYPAL', label: 'PayPal' },
                                                    { value: 'STRIPE', label: 'Stripe' },
                                                    { value: 'ZELLE', label: 'Zelle' },
                                                    { value: 'OTHER', label: 'Other' },
                                                ]}
                                                onChange={(value) => setManualPaymentLinkValue(index, 'provider', value ?? 'OTHER')}
                                            />
                                            <TextInput
                                                label={index === 0 ? 'Label' : undefined}
                                                value={link.label ?? ''}
                                                onChange={(event) => setManualPaymentLinkValue(index, 'label', event.currentTarget.value)}
                                            />
                                            <TextInput
                                                label={index === 0 ? 'Payment link' : undefined}
                                                value={link.url ?? ''}
                                                placeholder="https://..."
                                                onChange={(event) => setManualPaymentLinkValue(index, 'url', event.currentTarget.value)}
                                            />
                                            <Button variant="subtle" color="red" onClick={() => removeManualPaymentLink(index)}>
                                                Remove
                                            </Button>
                                        </Group>
                                    ))}
                                    <Group justify="flex-start">
                                        <Button variant="default" onClick={addManualPaymentLink}>Add payment link</Button>
                                    </Group>
                                </Stack>
                                <Controller
                                    name="manualPaymentInstructions"
                                    control={control}
                                    render={({ field }) => (
                                        <Textarea
                                            label="Manual payment instructions"
                                            autosize
                                            minRows={3}
                                            maxLength={2000}
                                            value={field.value ?? ''}
                                            onChange={field.onChange}
                                            placeholder="Tell registrants what to include in the payment note and how refunds are handled."
                                        />
                                    )}
                                />
                            </ManualPaymentsSection>
                        ) : null}

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

                        {showStaffSection ? (
                            <StaffSection
                                collapsed={collapsedSections['section-officials']}
                                onToggle={() => toggleSectionCollapse('section-officials')}
                            >
                                    <StaffManagementPanel
                                        control={control}
                                        eventData={eventData}
                                        isOrganizationHostedEvent={isOrganizationHostedEvent}
                                        officialStaffingCoverageError={officialStaffingCoverageError}
                                        sportDefaultPositionCount={sportOfficialPositionTemplates.length}
                                        maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                        maxShortTextLength={MAX_SHORT_TEXT_LENGTH}
                                        comboboxProps={sharedComboboxProps}
                                        organizationStaffSearch={organizationStaffSearch}
                                        organizationStaffTypeFilter={organizationStaffTypeFilter}
                                        organizationStaffStatusFilter={organizationStaffStatusFilter}
                                        filteredOrganizationStaffEntries={filteredOrganizationStaffEntries}
                                        organizationStaffVisibleCount={organizationStaffVisibleCount}
                                        nonOrgStaffSearch={nonOrgStaffSearch}
                                        nonOrgStaffResults={nonOrgStaffResults}
                                        nonOrgStaffSearchLoading={nonOrgStaffSearchLoading}
                                        nonOrgStaffError={nonOrgStaffError}
                                        newStaffInvite={newStaffInvite}
                                        assignedOfficialUserIds={assignedUserIdSetByRole.OFFICIAL}
                                        assistantHostIds={assistantHostValue}
                                        assignedOfficialCards={assignedOfficialCards}
                                        assignedHostCards={assignedHostCards}
                                        officialCardVisibleCount={officialCardVisibleCount}
                                        hostCardVisibleCount={hostCardVisibleCount}
                                        eventOfficialByUserId={eventOfficialByUserId}
                                        availableOfficialFieldOptions={availableOfficialFieldOptions}
                                        staffInviteError={staffInviteError}
                                        eventOfficialsDisabled={isImmutableField('eventOfficials')}
                                        assistantHostsDisabled={isImmutableField('assistantHostIds')}
                                        hostDisabled={isImmutableField('hostId')}
                                        onRosterEditsChange={(checked) => {
                                            if (!checked) {
                                                setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
                                            }
                                        }}
                                        onTeamsOfficiateChange={(checked) => {
                                            if (!checked) {
                                                setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
                                                if (eventData.officialSchedulingMode === 'TEAM_STAFFING') {
                                                    setValue('officialSchedulingMode', 'SCHEDULE', { shouldDirty: true, shouldValidate: true });
                                                }
                                            }
                                        }}
                                        onSchedulingModeChange={(value) => {
                                            const nextMode = normalizeOfficialSchedulingMode(value);
                                            setValue('officialSchedulingMode', nextMode, { shouldDirty: true, shouldValidate: true });
                                            if (nextMode === 'TEAM_STAFFING' && !eventData.doTeamsOfficiate) {
                                                setValue('doTeamsOfficiate', true, { shouldDirty: true, shouldValidate: true });
                                            }
                                        }}
                                        onLoadSportDefaults={handleResetOfficialPositionsFromSport}
                                        onAddPosition={handleAddOfficialPosition}
                                        onUpdatePosition={handleUpdateOfficialPosition}
                                        onRemovePosition={handleRemoveOfficialPosition}
                                        onOrganizationStaffSearchChange={setOrganizationStaffSearch}
                                        onOrganizationStaffTypeFilterChange={setOrganizationStaffTypeFilter}
                                        onOrganizationStaffStatusFilterChange={setOrganizationStaffStatusFilter}
                                        onOrganizationStaffScroll={handleOrganizationStaffScroll}
                                        onAddOfficial={handleAddOfficial}
                                        onAddAssistantHost={handleAddAssistantHost}
                                        onSetHost={handleHostChange}
                                        onNonOrgStaffSearchChange={setNonOrgStaffSearch}
                                        onInviteFieldChange={handleInviteFieldChange}
                                        onInviteRoleToggle={handleInviteRoleToggle}
                                        onStageInvite={handleStagePendingStaffInvite}
                                        onAssignedOfficialsScroll={handleAssignedOfficialsScroll}
                                        onAssignedHostsScroll={handleAssignedHostsScroll}
                                        onRemovePendingStaffInviteRole={handleRemovePendingStaffInviteRole}
                                        onRemoveOfficial={handleRemoveOfficial}
                                        onRemoveAssistantHost={handleRemoveAssistantHost}
                                        onUpdateEventOfficialEligibility={handleUpdateEventOfficialEligibility}
                                    />
                            </StaffSection>
                        ) : null}

                        <DivisionSettingsSection
                            collapsed={collapsedSections['section-division-settings']}
                            title="Divisions"
                            onToggle={() => toggleSectionCollapse('section-division-settings')}
                        >
                            <div id="section-division-settings-content" className="mt-4 space-y-4">
                                <DivisionModeControls
                                    control={control}
                                    supportsEditableTeamSignup={supportsEditableTeamSignup}
                                    showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                                    singleDivisionOnly={isAffiliateEvent}
                                    eventType={eventData.eventType}
                                    singleDivision={eventData.singleDivision}
                                    leagueIncludesPlayoffs={Boolean(leagueData.includePlayoffs)}
                                    splitLeaguePlayoffDivisionsLocked={splitLeaguePlayoffDivisionsLocked}
                                    hasExternalRentalField={hasExternalRentalField}
                                    isImmutableField={isImmutableField}
                                />
                                {!isAffiliateEvent && eventData.singleDivision ? (
                                    <SingleDivisionDefaultsPanel
                                        control={control}
                                        eventData={eventData}
                                        leagueData={leagueData}
                                        playoffData={playoffData}
                                        tournamentData={tournamentData}
                                        poolDefaults={singleDivisionPoolPlayDefaults}
                                        eventTaxableForPreview={eventTaxableForPreview}
                                        maxStandardNumber={MAX_STANDARD_NUMBER}
                                        maxPriceCents={MAX_PRICE_CENTS}
                                        numberInputStyles={alignedDetailsFieldStyles}
                                        hasStripeAccount={pricingControlsEnabled}
                                        organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                                        organizerResponsibilityMessage={eventTaxPolicyForPreview.organizerResponsibilityMessage}
                                        isOrganizationHostedEvent={isOrganizationHostedEvent}
                                        organizerManualTaxSelected={organizerManualTaxSelected}
                                        organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                                        connectingStripe={connectingStripe}
                                        isImmutableField={isImmutableField}
                                        playoffTeamCountError={errors.leagueData?.playoffTeamCount?.message as string | undefined}
                                        setLeagueData={setLeagueData}
                                        setPlayoffData={setPlayoffData}
                                        setTournamentData={setTournamentData}
                                        onPoolDefaultsChange={updateSingleDivisionTournamentPoolDefaults}
                                        onConnectStripe={handleConnectStripe}
                                        syncInstallmentCount={syncInstallmentCount}
                                        onAllowPaymentPlansChange={(next) => {
                                            setValue('allowPaymentPlans', next, { shouldDirty: true, shouldValidate: true });
                                            if (next && (!eventData.installmentAmounts?.length || eventData.installmentAmounts.length === 0)) {
                                                syncInstallmentCount(eventData.installmentCount || 1);
                                            } else if (next) {
                                                setValue('price', sumInstallmentAmounts(eventData.installmentAmounts), {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                });
                                            }
                                        }}
                                        onInstallmentDueRelativeDayChange={setInstallmentDueRelativeDay}
                                        onInstallmentDueDateChange={setInstallmentDueDate}
                                        onInstallmentAmountChange={setInstallmentAmount}
                                        onRemoveInstallment={removeInstallment}
                                        onTeamSplitDefaultChange={(checked) => setValue('allowTeamSplitDefault', checked, {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        })}
                                    />
                                ) : null}
                                <>
                                    <DivisionEditorHeader
                                        editing={Boolean(divisionEditor.editingId)}
                                        splitDivisionEditorEnabled={!isAffiliateEvent && splitDivisionEditorEnabled}
                                        divisionKind={divisionEditor.divisionKind}
                                        disabled={isImmutableField('divisions')}
                                        comboboxProps={sharedComboboxProps}
                                        onDivisionKindChange={handleDivisionEditorKindChange}
                                    />
                                    <DivisionEditorLeaguePanel
                                        divisionEditor={divisionEditor}
                                        eventData={isAffiliateEvent ? {
                                            ...eventData,
                                            teamSignup: false,
                                            allowPaymentPlans: false,
                                        } : eventData}
                                        leagueData={leagueData}
                                        eventTaxableForPreview={eventTaxableForPreview}
                                        splitDivisionEditorEnabled={!isAffiliateEvent && splitDivisionEditorEnabled}
                                        divisionEditorReady={divisionEditorReady}
                                        divisionMaxParticipantsWarning={isAffiliateEvent ? null : divisionMaxParticipantsWarning}
                                        hasStripeAccount={pricingControlsEnabled}
                                        maxStandardNumber={MAX_STANDARD_NUMBER}
                                        maxPriceCents={MAX_PRICE_CENTS}
                                        maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                        numberInputStyles={alignedDetailsFieldStyles}
                                        simplePriceInput={isAffiliateEvent}
                                        showCapacityForSingleDivision={isAffiliateEvent}
                                        showPriceForSingleDivision={isAffiliateEvent}
                                        showPaymentPlanControls={!isAffiliateEvent}
                                        showOperationalControls={!isAffiliateEvent}
                                        showSingleDivisionNotice={!isAffiliateEvent}
                                        genderOptions={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                        skillDivisionTypeOptions={skillDivisionTypeSelectOptions}
                                        ageDivisionTypeOptions={ageDivisionTypeSelectOptions}
                                        playoffDivisionOptions={playoffDivisionSelectOptions}
                                        comboboxProps={sharedComboboxProps}
                                        isImmutableField={isImmutableField}
                                        setDivisionEditor={setDivisionEditor}
                                        updateDivisionEditorSelection={updateDivisionEditorSelection}
                                        setDivisionEditorLeagueConfig={setDivisionEditorLeagueConfig}
                                        setDivisionEditorPlayoffConfig={setDivisionEditorPlayoffConfig}
                                        syncDivisionInstallmentCount={syncDivisionInstallmentCount}
                                        onInstallmentDueRelativeDayChange={setDivisionInstallmentDueRelativeDay}
                                        onInstallmentDueDateChange={setDivisionInstallmentDueDate}
                                        onInstallmentAmountChange={setDivisionInstallmentAmount}
                                        onRemoveInstallment={removeDivisionInstallment}
                                    />
                                    {!isAffiliateEvent ? (
                                        <>
                                        <DivisionEditorPlayoffDivisionControls
                                            visible={splitDivisionEditorEnabled && divisionEditor.divisionKind === 'PLAYOFF'}
                                            name={divisionEditor.name}
                                            maxParticipants={divisionEditor.maxParticipants}
                                            teamSignup={eventData.teamSignup}
                                            playoffConfig={buildTournamentConfig(divisionEditor.playoffConfig)}
                                            sport={eventData.sportConfig ?? undefined}
                                            maxStandardNumber={MAX_STANDARD_NUMBER}
                                            maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                            disabled={isImmutableField('divisions')}
                                            onNameChange={(name) => {
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    name,
                                                    nameTouched: true,
                                                    error: null,
                                                }));
                                            }}
                                            onMaxParticipantsChange={(value) => {
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    maxParticipants: normalizePlayoffDivisionParticipantCount(value),
                                                    error: null,
                                                }));
                                            }}
                                            onPlayoffConfigChange={setDivisionEditorPlayoffConfig}
                                        />
                                        <DivisionEditorActionsAndErrors
                                            isEditing={Boolean(divisionEditor.editingId)}
                                            disabled={isImmutableField('divisions')}
                                            editorError={divisionEditor.error}
                                            divisionsError={errors.divisions?.message as string | undefined}
                                            divisionDetailsError={errors.divisionDetails?.message as string | undefined}
                                            playoffDivisionDetailsError={errors.playoffDivisionDetails?.message as string | undefined}
                                            showMissingPlayoffDivisionWarning={splitDivisionEditorEnabled && (eventData.playoffDivisionDetails || []).length === 0}
                                            onSave={handleSaveDivisionDetail}
                                            onCancelEdit={resetDivisionEditor}
                                        />
                                        <DivisionSummaryList
                                            divisionDetails={eventData.divisionDetails || []}
                                            playoffDivisionDetails={eventData.playoffDivisionDetails || []}
                                            singleDivision={eventData.singleDivision}
                                            teamSignup={eventData.teamSignup}
                                            eventType={eventData.eventType}
                                            includePlayoffs={leagueData.includePlayoffs}
                                            splitDivisionEditorEnabled={splitDivisionEditorEnabled}
                                            eventPrice={eventData.price}
                                            eventMaxParticipants={eventData.maxParticipants}
                                            eventAllowPaymentPlans={Boolean(eventData.allowPaymentPlans)}
                                            eventInstallmentCount={eventData.installmentCount}
                                            eventInstallmentAmounts={eventData.installmentAmounts || []}
                                            leaguePlayoffTeamCount={leagueData.playoffTeamCount}
                                            disabled={isImmutableField('divisions')}
                                            playoffDivisionCapacityWarnings={playoffDivisionCapacityWarnings}
                                            derivePoolTeamCount={derivePoolTeamCount}
                                            buildTournamentConfig={buildTournamentConfig}
                                            onEditDivision={handleEditDivisionDetail}
                                            onRemoveDivision={handleRemoveDivisionDetail}
                                            onEditPlayoffDivision={handleEditPlayoffDivisionDetail}
                                            onRemovePlayoffDivision={handleRemovePlayoffDivision}
                                        />
                                        </>
                                    ) : (
                                        <>
                                            <DivisionEditorActionsAndErrors
                                                isEditing={Boolean(divisionEditor.editingId)}
                                                disabled={isImmutableField('divisions')}
                                                editorError={divisionEditor.error}
                                                divisionsError={errors.divisions?.message as string | undefined}
                                                divisionDetailsError={errors.divisionDetails?.message as string | undefined}
                                                playoffDivisionDetailsError={undefined}
                                                showMissingPlayoffDivisionWarning={false}
                                                onSave={handleSaveDivisionDetail}
                                                onCancelEdit={resetDivisionEditor}
                                            />
                                            <DivisionSummaryList
                                                divisionDetails={eventData.divisionDetails || []}
                                                playoffDivisionDetails={[]}
                                                singleDivision={eventData.singleDivision}
                                                teamSignup={false}
                                                eventType={eventData.eventType}
                                                includePlayoffs={false}
                                                splitDivisionEditorEnabled={false}
                                                eventPrice={eventData.price}
                                                eventMaxParticipants={eventData.maxParticipants}
                                                eventAllowPaymentPlans={false}
                                                eventInstallmentCount={0}
                                                eventInstallmentAmounts={[]}
                                                leaguePlayoffTeamCount={undefined}
                                                disabled={isImmutableField('divisions')}
                                                playoffDivisionCapacityWarnings={[]}
                                                useDivisionPriceForSingleDivision
                                                useDivisionCapacityForSingleDivision
                                                hidePaymentPlanDetails
                                                hideOperationalDetails
                                                derivePoolTeamCount={derivePoolTeamCount}
                                                buildTournamentConfig={buildTournamentConfig}
                                                onEditDivision={handleEditDivisionDetail}
                                                onRemoveDivision={handleRemoveDivisionDetail}
                                                onEditPlayoffDivision={handleEditPlayoffDivisionDetail}
                                                onRemovePlayoffDivision={handleRemovePlayoffDivision}
                                            />
                                        </>
                                    )}
                                </>
                            </div>

                        </DivisionSettingsSection>

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
