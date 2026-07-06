import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { eventService } from '@/lib/eventService';
import { getEventImageUrl, Event, UserData, Team, LeagueConfig, Field, TimeSlot, Organization, LeagueScoringConfig, MatchRulesConfig, Sport, TournamentConfig, RegistrationQuestionDraft } from '@/types';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Checkbox, Group, Button, Loader, Text, Collapse, Badge, Alert, Stack, Select as MantineSelect } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { isStripeConnectMfaRequiredError, paymentService } from '@/lib/paymentService';
import { resolveClientPublicOrigin } from '@/lib/clientPublicOrigin';
import { locationService } from '@/lib/locationService';
import { userService } from '@/lib/userService';
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
import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import { applyLeagueScoringConfigFieldChange } from './leagueScoringConfigForm';
import { resolveTournamentSetMode } from './tournamentSetMode';
import { mergeSlotPayloadsForForm } from './slotPayloadMerge';
import { hasExternalRentalFieldForEvent } from './externalRentalField';
import {
    buildEventTypeOptions,
    hasAffiliateUrl,
    hasParentEventRef,
    isTournamentPoolPlayFormEnabled,
    shouldShowOrganizationFieldsInEventDetails,
    supportsFieldCountForEvent,
    supportsOrganizationFieldSelectionForEvent,
    supportsScheduleSlotsForEvent,
} from './eventForm/eventRules';
import {
    coordinatesAreSet,
    formatLatLngLabel,
    getLatitudeFromCoordinates,
    getLongitudeFromCoordinates,
} from './eventForm/locationHelpers';
import {
    defaultFieldLocationForEvent,
    sanitizeFieldsForForm,
    withEventFieldLocationDefault,
} from './eventForm/fieldDefaults';
import {
    buildDivisionName,
    buildDivisionToken,
    getDivisionTypeById,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import { canOrganizationUsePaidBilling } from '@/lib/organizationVerification';
import { getFieldDisplayName, sortFieldsByCreatedAt } from '@/lib/fieldUtils';
import { normalizePriceCents } from '@/lib/priceUtils';
import {
    normalizeOrganizerManualTaxRateBps,
    normalizeEventTaxHandling,
    normalizeOrganizationDefaultEventTaxHandling,
    resolvePurchaseTaxPolicy,
    taxPolicyRequiresStripeTaxCalculation,
} from '@/lib/taxPolicy';
import {
    normalizeManualPaymentProvider,
} from '@/lib/manualRegistrationPayments';
import {
    buildCompositeDivisionTypeId,
    buildDefaultDivisionDetailsForSport,
    buildDivisionTypeOptionsForEvent,
    buildDivisionTypeSelectOptions,
    buildPlayoffDivisionCapacityWarnings,
    buildPlayoffDivisionSelectOptions,
    buildSlotDivisionLookup,
    buildUniqueDivisionIdForToken,
    deriveScheduleParticipantCount,
    DIVISION_GENDER_OPTIONS,
    type DivisionDetailForm,
    divisionFieldIdsEqual,
    getDefaultDivisionTypeSelectionsForSport,
    normalizeDivisionFieldIds,
    normalizeDivisionKeys,
    normalizeDivisionDetailEntry,
    normalizeDivisionNameKey,
    normalizeDivisionTokenPart,
    normalizePlacementDivisionIds,
    normalizePlayoffDivisionDetailEntry,
    normalizePlayoffDivisionParticipantCount,
    normalizeSlotDivisionIdsWithLookup,
    normalizeSlotDivisionKeysWithLookup,
    parseCompositeDivisionTypeId,
    type PlayoffDivisionDetailForm,
    resolveSportInput,
    applyDivisionAgeCutoff,
} from './eventForm/divisionForm';
import {
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
    normalizeSportOfficialPositionTemplates,
} from './eventForm/officials';
import {
    buildFieldById,
    buildOrganizationResourcePool,
    buildResolvedOrganizationFieldSignature,
    fieldsEqual,
    isEventLocalField,
    isGeneratedLocalFieldPlaceholder,
    isRentedResourceForOrganization,
    isSelectableOrganizationResource,
    mergeFieldsById,
    resolveFieldsReferencedInSlots,
    resolveSelectedRentedFieldIds,
    toFieldIdList,
} from './eventForm/resourceGroups';
import {
    buildRentalBookingTimeSlot,
    buildRentalLeagueFieldOptions,
    buildRentalResourceFields,
    buildRentalResourceOptionsByFieldId,
    buildRentalResourceOptionsBySelectorId,
    buildRentalResourceSelectorFields,
    buildSelectedRentalFieldIds,
    isRentalBookingSelectorId,
    isRentalLockedTimeSlot,
    mergeRentalLockedTimeSlots,
    resolveSelectedRentalResourceOptions,
} from './eventForm/rentalResources';
import { buildEventFormSchema } from './eventForm/schema';
import {
    dedupeValidationErrors,
    flattenFormErrors,
    flattenZodIssues,
    type FlattenedFormError,
} from './eventForm/validationErrors';
import type {
    EventFormState,
    EventFormValues,
} from './eventForm/formTypes';
import {
    buildSportOptions,
    buildTemplateOptions,
    resolveSelectedSport,
    sportRequiresSets,
} from './eventForm/formOptions';
import { buildEventFormDefaultValues } from './eventForm/defaultValues';
import {
    getLockedEventTypeTagSlugs,
    syncEventTypeTagsForEventType,
} from './eventForm/eventTypeTags';
import { buildEventDraft } from './eventForm/buildEventDraft';
import {
    applyImmutableEventDefaults,
    normalizeImmutableFields,
    normalizeImmutableTimeSlots,
} from './eventForm/immutableDefaults';
import {
    createLeagueSlotForm,
    normalizeFieldIds,
    normalizeSlotFieldIds,
    normalizeWeekdays,
    timeSlotsEqual,
} from './eventForm/slotForm';
import {
    normalizeSlotState,
} from './eventForm/slotValidation';
import {
    buildAutoResolvedSlotUpdate,
    buildExternalSlotConflicts,
    buildSlotConflictCheckKey,
    buildSlotConflictContext,
    CONFLICT_LOOKUP_END,
    CONFLICT_LOOKUP_START,
    normalizeSlotBoundaryOverrideForForm,
    slotCanCheckExternalConflicts,
    snapshotToSlotForm,
    type SlotConflictContext,
    type SlotConflictPayload,
} from './eventForm/slotConflictHelpers';
import {
    buildLeagueScheduleError,
    buildLeagueScheduleWarning,
} from './eventForm/scheduleMessages';
import {
    normalizePendingStaffInvite,
    type PendingStaffInvite,
} from './eventForm/staffInvites';
import {
    normalizeResourceText,
    stringArraysEqual,
    stringSetsEqual,
} from './eventForm/shared';
import {
    leagueConfigEqual,
    leagueSlotsEqual,
    slotConflictsEqual,
    tournamentConfigEqual,
} from './eventForm/formEquality';
import {
    SECTION_ANIMATION_DURATION_MS,
} from './eventForm/constants';
import {
    buildDivisionLeagueConfig,
    buildTournamentConfig,
    derivePoolTeamCount,
    extractTournamentConfigFromEvent,
    leagueConfigToDivisionFields,
    normalizeLeagueConfigForSetMode,
    normalizeNumber,
    normalizeTournamentConfigForSetMode,
} from './eventForm/configDefaults';
import {
    buildMobileEditUnsupportedReasons,
    buildMobileEditUnsupportedWarning,
    canUseAutomaticRefunds,
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from './eventForm/paymentPlanHelpers';
import { sanitizeMatchRulesOverrideForEditor } from './eventForm/matchRulesHelpers';
import {
    parseDateValue,
} from './eventForm/dateHelpers';
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
import { useDivisionEditorController } from './eventForm/hooks/useDivisionEditorController';
import { useOrganizationFieldHydration } from './eventForm/hooks/useOrganizationFieldHydration';
import { useRegistrationQuestionDrafts } from './eventForm/hooks/useRegistrationQuestionDrafts';
import { useRentalBookingResources } from './eventForm/hooks/useRentalBookingResources';
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

type EventType = Event['eventType'];

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
const createSlotForm = createLeagueSlotForm;

export type { EventFormHandle, EventFormProps, RentalPurchaseContext } from './eventForm/types';

const minutesFromDate = (value: Date): number => value.getHours() * 60 + value.getMinutes();

const withMinutesOnDate = (date: Date, minutes: number): Date => {
    const normalized = Math.max(0, Math.trunc(minutes));
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Math.floor(normalized / 60),
        normalized % 60,
        0,
        0,
    );
};

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
    const lastResetSourceRef = useRef<string | null>(null);
    const dirtyBaselineValuesRef = useRef<EventFormValues | null>(null);
    const pendingInitialDirtyRebaseRef = useRef(false);
    const pendingInitialDirtyRebaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastValidationErrorsRef = useRef<FlattenedFormError[]>([]);
    const buildDraftForDirtyTrackingRef = useRef<(values: EventFormValues) => Partial<Event>>(
        () => ({}),
    );
    const previousEventTypeRef = useRef<EventType | null>(null);
    const previousEditableScheduleModeRef = useRef<boolean | null>(null);
    const previousEventFieldLocationRef = useRef<string>('');
    const slotConflictRequestRef = useRef(0);
    const [hydratedOrganization, setHydratedOrganization] = useState<Organization | null>(organization ?? null);
    // Reflects whether the Stripe onboarding call is running to disable repeated clicks.
    const [connectingStripe, setConnectingStripe] = useState(false);
    const resolvedOrganization = hydratedOrganization ?? organization ?? null;
    const resolvedOrganizationId = (resolvedOrganization?.$id ?? '').trim();
    const resolvedOrganizationFields = resolvedOrganization?.fields;
    // Organization events must use org billing; personal events use the current user billing account.
    const hasStripeAccount = resolvedOrganization
        ? canOrganizationUsePaidBilling(resolvedOrganization)
        : Boolean(currentUser?.hasStripeAccount);
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

    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);

    useEffect(() => {
        setHydratedOrganization(organization ?? null);
    }, [organization]);

    const immutableFields = useMemo(
        () => normalizeImmutableFields(immutableDefaultsMemo.fields),
        [immutableDefaultsMemo.fields],
    );

    const hasImmutableFields = immutableFields.length > 0;

    const immutableTimeSlotsFromDefaults = useMemo(
        () => normalizeImmutableTimeSlots(immutableDefaultsMemo.timeSlots, immutableFields),
        [immutableDefaultsMemo.timeSlots, immutableFields],
    );

    const isImmutableField = useCallback(
        (key: keyof Event) => immutableDefaultsMemo[key] !== undefined,
        [immutableDefaultsMemo]
    );

    const applyImmutableDefaults = useCallback((state: EventFormState): EventFormState => (
        applyImmutableEventDefaults({
            state,
            defaults: immutableDefaultsMemo,
            sportsById,
        })
    ), [immutableDefaultsMemo, sportsById]);

    const buildDefaultFormValues = useCallback((): EventFormValues => (
        buildEventFormDefaultValues({
            activeEditingEvent,
            applyImmutableDefaults,
            defaultLocation: {
                location: defaultLocation?.location,
                address: defaultLocation?.address,
                coordinates: defaultLocation?.coordinates,
            },
            hasImmutableFields,
            immutableDefaults,
            immutableFields,
            isCreateMode,
            resolvedOrganizationFields: Array.isArray(resolvedOrganizationFields)
                ? (resolvedOrganizationFields as Field[])
                : [],
            resolvedOrganizationId,
            sportsById,
        })
    ), [
        activeEditingEvent,
        applyImmutableDefaults,
        defaultLocation?.address,
        defaultLocation?.coordinates,
        defaultLocation?.location,
        hasImmutableFields,
        immutableDefaults,
        immutableFields,
        isCreateMode,
        resolvedOrganizationFields,
        resolvedOrganizationId,
        sportsById,
    ]);

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
    const [isDirtyTrackingReady, setIsDirtyTrackingReady] = useState(false);
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
    const formValues = watch();

    useEffect(() => {
        if (!open) {
            setIsDirtyTrackingReady(false);
            lastResetSourceRef.current = null;
            previousEventTypeRef.current = null;
            previousEventFieldLocationRef.current = '';
            dirtyBaselineValuesRef.current = null;
            pendingInitialDirtyRebaseRef.current = false;
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            onDirtyStateChange?.(false);
            onDraftStateChange?.({
                draft: {},
                baselineDraft: {},
            });
            return;
        }
        const sourceKey = isCreateMode
            ? 'create'
            : `event:${String(activeEditingEvent?.$id ?? '')}`;
        const sourceChanged = lastResetSourceRef.current !== sourceKey;
        if (!sourceChanged) {
            return;
        }
        lastResetSourceRef.current = sourceKey;
        setIsDirtyTrackingReady(false);
        pendingInitialDirtyRebaseRef.current = true;
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
            pendingInitialDirtyRebaseTimeoutRef.current = null;
        }
        onDirtyStateChange?.(false);
        const nextDefaults = buildDefaultFormValues();
        previousEventTypeRef.current = nextDefaults.eventType;
        previousEventFieldLocationRef.current = defaultFieldLocationForEvent(nextDefaults.location);
        dirtyBaselineValuesRef.current = null;
        reset(nextDefaults);
    }, [
        activeEditingEvent,
        buildDefaultFormValues,
        isCreateMode,
        onDirtyStateChange,
        onDraftStateChange,
        reset,
        open,
    ]);

    useEffect(() => {
        const baselineValues = dirtyBaselineValuesRef.current ?? formValues;
        onDraftStateChange?.({
            draft: buildDraftForDirtyTrackingRef.current(formValues),
            baselineDraft: buildDraftForDirtyTrackingRef.current(baselineValues),
        });
        if (!isDirtyTrackingReady) {
            onDirtyStateChange?.(false);
            return;
        }
        onDirtyStateChange?.(isDirty);
    }, [formValues, isDirty, isDirtyTrackingReady, onDirtyStateChange, onDraftStateChange]);

    const eventData = formValues;
    const lockedEventTypeTagSlugs = useMemo(
        () => getLockedEventTypeTagSlugs(eventData.eventType),
        [eventData.eventType],
    );
    const isAffiliateEvent = Boolean(eventData.isAffiliateEvent || hasAffiliateUrl(eventData.affiliateUrl));
    const pricingControlsEnabled = hasStripeAccount || eventData.registrationPaymentMode === 'MANUAL';
    const [rentalLockedTimeSlots, setRentalLockedTimeSlots] = useState<TimeSlot[]>([]);
    const eventSupportsScheduleSlots = !isAffiliateEvent && supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    const hasRestrictedImmutableFields = hasImmutableFields && !eventSupportsScheduleSlots;
    const immutableDefaultRentalTimeSlots = useMemo(
        () => immutableTimeSlotsFromDefaults.filter(isRentalLockedTimeSlot),
        [immutableTimeSlotsFromDefaults],
    );
    const immutableTimeSlots = useMemo(() => {
        if (eventSupportsScheduleSlots) {
            return [];
        }
        if (rentalLockedTimeSlots.length) {
            return rentalLockedTimeSlots;
        }
        return immutableTimeSlotsFromDefaults;
    }, [eventSupportsScheduleSlots, immutableTimeSlotsFromDefaults, rentalLockedTimeSlots]);
    const hasImmutableTimeSlots = immutableTimeSlots.length > 0;
    const rentalLockedSlotsForDraft = useMemo(
        () => eventSupportsScheduleSlots
            ? mergeRentalLockedTimeSlots([...immutableDefaultRentalTimeSlots, ...rentalLockedTimeSlots])
            : rentalLockedTimeSlots,
        [eventSupportsScheduleSlots, immutableDefaultRentalTimeSlots, rentalLockedTimeSlots],
    );
    const automaticRefundsAvailable = useMemo(
        () => canUseAutomaticRefunds({
            hasStripeAccount,
            singleDivision: eventData.singleDivision,
            price: eventData.price,
            divisionDetails: eventData.divisionDetails,
        }),
        [
            eventData.divisionDetails,
            eventData.price,
            eventData.singleDivision,
            hasStripeAccount,
        ],
    );
    const hasUnsetTeamCapacityLimits = eventData.teamSizeLimit == null
        || (eventData.singleDivision && eventData.maxParticipants == null);
    const leagueSlots = formValues.leagueSlots;
    const leagueData = formValues.leagueData;
    const tournamentData = formValues.tournamentData;
    const playoffData = formValues.playoffData;
    const fields = formValues.fields;
    const fieldCount = formValues.fieldCount;
    const selectedFieldIds = useMemo(
        () => (Array.isArray(formValues.selectedFieldIds) ? formValues.selectedFieldIds : []),
        [formValues.selectedFieldIds],
    );
    const resolvedOrganizationFieldSignature = useMemo(
        () => buildResolvedOrganizationFieldSignature(resolvedOrganization?.fields as Field[] | undefined),
        [resolvedOrganization?.fields],
    );
    const divisionFieldIds = useMemo(
        () => (
            formValues.divisionFieldIds && typeof formValues.divisionFieldIds === 'object'
                ? formValues.divisionFieldIds
                : {}
        ),
        [formValues.divisionFieldIds],
    );
    const joinAsParticipant = formValues.joinAsParticipant;
    const organizationId = resolvedOrganization?.$id ?? eventData.organizationId;
    const templateOrganizationId = templateOrganizationIdProp ?? organizationId;
    const {
        documents: templateDocuments,
        loading: templatesLoading,
        error: templatesError,
    } = useTemplateDocuments(templateOrganizationId);

    useEffect(() => {
        const manualPaymentsEnabled = eventData.registrationPaymentMode === 'MANUAL';
        if (!isCreateMode || hasStripeAccount || manualPaymentsEnabled) {
            return;
        }

        const currentPrice = Number.isFinite(Number(eventData.price))
            ? Number(eventData.price)
            : 0;
        if (currentPrice !== 0) {
            setValue('price', 0, { shouldDirty: false, shouldValidate: true });
        }

        if (eventData.allowPaymentPlans) {
            setValue('allowPaymentPlans', false, { shouldDirty: false, shouldValidate: true });
        }

        const currentInstallmentCount = Number.isFinite(Number(eventData.installmentCount))
            ? Number(eventData.installmentCount)
            : 0;
        if (currentInstallmentCount !== 0) {
            setValue('installmentCount', 0, { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentAmounts = Array.isArray(eventData.installmentAmounts)
            && eventData.installmentAmounts.length > 0;
        if (hasInstallmentAmounts) {
            setValue('installmentAmounts', [], { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentDueDates = Array.isArray(eventData.installmentDueDates)
            && eventData.installmentDueDates.length > 0;
        if (hasInstallmentDueDates) {
            setValue('installmentDueDates', [], { shouldDirty: false, shouldValidate: true });
        }

        const hasInstallmentDueRelativeDays = Array.isArray(eventData.installmentDueRelativeDays)
            && eventData.installmentDueRelativeDays.length > 0;
        if (hasInstallmentDueRelativeDays) {
            setValue('installmentDueRelativeDays', [], { shouldDirty: false, shouldValidate: true });
        }

        const currentDivisionDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDivisionDetails = currentDivisionDetails.map((detail) => {
            const detailPrice = Number.isFinite(Number(detail.price))
                ? Number(detail.price)
                : 0;
            const detailInstallmentCount = Number.isFinite(Number(detail.installmentCount))
                ? Number(detail.installmentCount)
                : 0;
            const hasDetailInstallmentAmounts = Array.isArray(detail.installmentAmounts)
                && detail.installmentAmounts.length > 0;
            const hasDetailInstallmentDueDates = Array.isArray(detail.installmentDueDates)
                && detail.installmentDueDates.length > 0;
            const hasDetailInstallmentDueRelativeDays = Array.isArray(detail.installmentDueRelativeDays)
                && detail.installmentDueRelativeDays.length > 0;
            const hasPaidSettings = detailPrice !== 0
                || Boolean(detail.allowPaymentPlans)
                || detailInstallmentCount !== 0
                || hasDetailInstallmentAmounts
                || hasDetailInstallmentDueDates
                || hasDetailInstallmentDueRelativeDays;
            if (!hasPaidSettings) {
                return detail;
            }
            return {
                ...detail,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
            };
        });
        const divisionPricingChanged = nextDivisionDetails.some(
            (detail, index) => detail !== currentDivisionDetails[index],
        );
        if (divisionPricingChanged) {
            setValue('divisionDetails', nextDivisionDetails, { shouldDirty: false, shouldValidate: true });
        }

    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.price,
        eventData.registrationPaymentMode,
        hasStripeAccount,
        isCreateMode,
        setValue,
    ]);

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

    const setLeagueSlots = useCallback(
        (
            updater: React.SetStateAction<LeagueSlotForm[]>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('leagueSlots');
            const next = typeof updater === 'function' ? (updater as (prev: LeagueSlotForm[]) => LeagueSlotForm[])(current) : updater;
            if (leagueSlotsEqual(current, next)) {
                return;
            }
            setValue('leagueSlots', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setFields = useCallback(
        (
            updater: React.SetStateAction<Field[]>,
            options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
        ) => {
            const current = getValues('fields');
            const next = typeof updater === 'function' ? (updater as (prev: Field[]) => Field[])(current) : updater;
            if (fieldsEqual(current, next)) {
                return;
            }
            setValue('fields', next, {
                shouldDirty: options.shouldDirty ?? true,
                shouldValidate: options.shouldValidate ?? true,
            });
        },
        [getValues, setValue],
    );

    const setFieldCount = useCallback(
        (value: number) => {
            if (Object.is(getValues('fieldCount'), value)) {
                return;
            }
            setValue('fieldCount', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setSelectedFieldIds = useCallback(
        (value: string[]) => {
            if (Object.is(getValues('selectedFieldIds'), value)) {
                return;
            }
            setValue('selectedFieldIds', value, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setDivisionFieldIds = useCallback(
        (value: Record<string, string[]>) => {
            if (Object.is(getValues('divisionFieldIds'), value)) {
                return;
            }
            setValue('divisionFieldIds', value, { shouldDirty: true, shouldValidate: true });
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

    const syncInstallmentCount = useCallback(
        (count: number) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            const price = getValues('price') || 0;
            const startDate = getValues('start');
            const useRelativeDueDates = getValues('eventType') === 'WEEKLY_EVENT' && !getValues('parentEvent');
            while (amounts.length < safeCount) {
                amounts.push(amounts.length === 0 ? price : 0);
                dueDates.push(startDate);
                relativeDueDays.push(0);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
                relativeDueDays.pop();
            }
            setValue('installmentCount', safeCount, { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', useRelativeDueDates ? [] : dueDates, { shouldDirty: true, shouldValidate: true });
            setValue(
                'installmentDueRelativeDays',
                useRelativeDueDates ? relativeDueDays : [],
                { shouldDirty: true, shouldValidate: true },
            );
        },
        [getValues, setValue],
    );

    const setInstallmentAmount = useCallback(
        (index: number, value: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            if (index >= amounts.length) return;
            amounts[index] = normalizePriceCents(value);
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentDueDate = useCallback(
        (index: number, value: Date | string | null) => {
            const dueDates = [...(getValues('installmentDueDates') || [])];
            if (index >= dueDates.length) return;
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const setInstallmentDueRelativeDay = useCallback(
        (index: number, value: number | string) => {
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            const amounts = getValues('installmentAmounts') || [];
            if (index < 0 || index >= amounts.length) return;
            while (relativeDueDays.length < amounts.length) {
                relativeDueDays.push(0);
            }
            const parsed = typeof value === 'number' ? value : Number(value);
            relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
            setValue('installmentDueRelativeDays', relativeDueDays, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', [], { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    const removeInstallment = useCallback(
        (index: number) => {
            const amounts = [...(getValues('installmentAmounts') || [])];
            const dueDates = [...(getValues('installmentDueDates') || [])];
            const relativeDueDays = [...(getValues('installmentDueRelativeDays') || [])];
            if (amounts.length <= 1) return;
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            relativeDueDays.splice(index, 1);
            setValue('installmentAmounts', amounts, { shouldDirty: true, shouldValidate: true });
            setValue('price', sumInstallmentAmounts(amounts), { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', dueDates, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', relativeDueDays, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', amounts.length, { shouldDirty: true, shouldValidate: true });
        },
        [getValues, setValue],
    );

    useEffect(() => {
        if (isEditMode) {
            return;
        }
        const ids = getEventOfficialUserIds(eventData.eventOfficials);
        const refs = eventData.officials || [];
        const missingIds = ids.filter((id) => !refs.some((ref) => ref.$id === id));
        if (!missingIds.length) {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (!cancelled && fetched.length) {
                    setEventData((prev) => ({
                        ...prev,
                        officials: [...(prev.officials || []), ...fetched.filter((ref) => ref.$id)],
                    }), { shouldDirty: false, shouldValidate: false });
                }
            } catch (error) {
                console.warn('Failed to hydrate officials for event:', error);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [eventData.eventOfficials, eventData.officials, isEditMode, setEventData]);

    const organizationHostedEventId = (
        resolvedOrganization?.$id
        || eventData.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    );
    const isOrganizationHostedEvent = organizationHostedEventId.length > 0;
    const supportsOrganizationFieldSelection = !isAffiliateEvent && supportsOrganizationFieldSelectionForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const shouldLoadRentalResources = !isAffiliateEvent && (supportsOrganizationFieldSelection || eventSupportsScheduleSlots);
    const shouldManageLocalFields = !isAffiliateEvent && !hasRestrictedImmutableFields && supportsFieldCountForEvent(eventData.eventType);
    const shouldProvisionFields = shouldManageLocalFields;
    const isOrganizationManagedEvent = isOrganizationHostedEvent && !shouldManageLocalFields;
    const organizationDefaultEventTaxHandling = normalizeOrganizationDefaultEventTaxHandling(
        resolvedOrganization?.defaultEventTaxHandling,
    );
    const { fieldsLoading } = useOrganizationFieldHydration({
        hasRestrictedImmutableFields,
        isEditMode,
        organizationFieldSignature: resolvedOrganizationFieldSignature,
        organizationId: organizationHostedEventId,
        resolvedOrganizationFields: Array.isArray(resolvedOrganizationFields)
            ? (resolvedOrganizationFields as Field[])
            : null,
        resolvedOrganizationId: resolvedOrganization?.$id,
        sanitizeFields: sanitizeFieldsForForm,
        setFields,
        setHydratedOrganization,
    });

    const {
        options: rentalResourceOptions,
        loading: rentalResourcesLoading,
        error: rentalResourcesError,
    } = useRentalBookingResources({
        eventId: activeEditingEvent?.$id,
        isEditMode,
        open,
        organizationId: organizationHostedEventId,
        shouldLoad: shouldLoadRentalResources,
        setFields,
    });

    useEffect(() => {
        if (
            !isCreateMode
            || rentalResourcesLoading
            || rentalResourceOptions.length === 0
            || hasRestrictedImmutableFields
            || (formDirtyFields as Record<string, unknown>).fieldCount
            || (formDirtyFields as Record<string, unknown>).fields
        ) {
            return;
        }

        const currentFieldCount = Number(getValues('fieldCount'));
        if (!Number.isFinite(currentFieldCount) || currentFieldCount <= 0) {
            return;
        }

        const currentLocalFields = (getValues('fields') ?? []).filter((field) => isEventLocalField(field as Field));
        const onlyGeneratedLocalFields = currentLocalFields.every((field, index) => (
            isGeneratedLocalFieldPlaceholder(field as Field, index)
        ));
        if (!onlyGeneratedLocalFields) {
            return;
        }

        setValue('fieldCount', 0, { shouldDirty: false, shouldValidate: true });
    }, [
        formDirtyFields,
        getValues,
        hasRestrictedImmutableFields,
        isCreateMode,
        rentalResourceOptions.length,
        rentalResourcesLoading,
        setValue,
    ]);

    useEffect(() => {
        const previousEventType = previousEventTypeRef.current;
        previousEventTypeRef.current = eventData.eventType;

        if (!previousEventType || previousEventType === eventData.eventType) {
            return;
        }
        if (!isCreateMode || !isOrganizationHostedEvent || hasRestrictedImmutableFields) {
            return;
        }
        if (!supportsFieldCountForEvent(eventData.eventType) || supportsFieldCountForEvent(previousEventType)) {
            return;
        }

        setFieldCount(0);
    }, [
        eventData.eventType,
        hasRestrictedImmutableFields,
        isCreateMode,
        isOrganizationHostedEvent,
        setFieldCount,
    ]);

    const eventTaxPolicyForPreview = resolvePurchaseTaxPolicy({
        purchaseType: 'event',
        taxCategory: 'EVENT_PARTICIPANT',
        event: {
            address: eventData.address,
            location: eventData.location,
            organizationId: eventData.organizationId || resolvedOrganizationId || undefined,
            taxHandling: eventData.taxHandling,
            organizerManualTaxRateBps: eventData.organizerManualTaxRateBps,
        },
        organization: resolvedOrganization
            ? {
                defaultEventTaxHandling: organizationDefaultEventTaxHandling,
                taxResponsibilityAcceptedAt: resolvedOrganization.taxResponsibilityAcceptedAt,
            }
            : null,
    });
    const eventTaxableForPreview = hasStripeAccount && taxPolicyRequiresStripeTaxCalculation(eventTaxPolicyForPreview);
    const organizerTaxCollectionAllowed = eventTaxPolicyForPreview.liabilityParty === 'ORGANIZER';
    const organizerManualTaxSelected = organizerTaxCollectionAllowed
        && eventTaxPolicyForPreview.collectionStrategy === 'ORGANIZER_MANUAL_TAX';
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
    const slotDivisionKeysRef = useRef<string[]>(slotDivisionKeys);
    useEffect(() => {
        slotDivisionKeysRef.current = slotDivisionKeys;
    }, [slotDivisionKeys]);
    const divisionOptions = useMemo(
        () => slotDivisionLookup.options,
        [slotDivisionLookup],
    );
    const slotConflictEventId = activeEditingEvent?.$id ?? eventData.$id ?? '';
    const slotConflictCheckKey = useMemo(() => buildSlotConflictCheckKey({
        eventId: slotConflictEventId,
        eventType: eventData.eventType,
        parentEvent: eventData.parentEvent,
        eventStart: eventData.start,
        eventEnd: eventData.end,
        slots: leagueSlots,
    }), [
        eventData.end,
        eventData.eventType,
        eventData.parentEvent,
        eventData.start,
        leagueSlots,
        slotConflictEventId,
    ]);
    const slotConflictContext = useMemo<SlotConflictContext>(() => buildSlotConflictContext({
        eventId: slotConflictEventId,
        eventStart: eventData.start,
        eventEnd: eventData.end,
    }), [eventData.end, eventData.start, slotConflictEventId]);
    const { hasPendingExternalConflictChecks, hasExternalSlotConflictWarnings } = useMemo(() => {
        if (isAffiliateEvent || !supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent)) {
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
    }, [eventData.eventType, eventData.parentEvent, leagueSlots, slotConflictContext]);
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
        submitPendingStaffInvites,
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

    // Normalizes slot state every time LeagueFields mutates the slot array so errors stay in sync.
    const updateLeagueSlots = useCallback((
        updater: (slots: LeagueSlotForm[]) => LeagueSlotForm[],
        options: { shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        setLeagueSlots(prev => normalizeSlotState(updater(prev), eventData.eventType), options);
    }, [eventData.eventType, hasImmutableTimeSlots, setLeagueSlots]);

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

    const getDivisionTypeNameForEditor = useCallback(
        (ratingType: 'AGE' | 'SKILL', divisionTypeId: string): string => {
            if (!divisionTypeId) {
                return '';
            }
            const fromCatalog = divisionTypeOptions.find((option) =>
                option.id === divisionTypeId && option.ratingType === ratingType,
            );
            if (fromCatalog) {
                return fromCatalog.name;
            }
            return getDivisionTypeById(
                resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                divisionTypeId,
                ratingType,
            )?.name ?? divisionTypeId.toUpperCase();
        },
        [divisionTypeOptions, eventData.sportConfig, eventData.sportId],
    );

    const handleSaveDivisionDetail = useCallback(() => {
        if (divisionEditor.divisionKind === 'PLAYOFF') {
            const name = divisionEditor.name.trim();
            const normalizedMaxParticipants = normalizePlayoffDivisionParticipantCount(divisionEditor.maxParticipants);

            if (!name.length) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Playoff division name is required.' }));
                return;
            }
            if (typeof normalizedMaxParticipants !== 'number' || normalizedMaxParticipants < 2) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: eventData.teamSignup
                        ? 'Playoff division teams count must be at least 2.'
                        : 'Playoff division participants count must be at least 2.',
                }));
                return;
            }

            const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
                ? [...eventData.playoffDivisionDetails]
                : [];
            const normalizedName = normalizeDivisionNameKey(name);
            const duplicateByName = currentPlayoffDivisions.find((detail) =>
                detail.id !== divisionEditor.editingId
                && normalizeDivisionNameKey(detail.name) === normalizedName,
            );
            if (duplicateByName) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division name must be unique within this event.',
                }));
                return;
            }

            const existingDetail = divisionEditor.editingId
                ? currentPlayoffDivisions.find((detail) => detail.id === divisionEditor.editingId)
                : null;
            const defaultDetail = existingDetail ?? createNextPlayoffDivision(
                currentPlayoffDivisions,
                divisionEditor.playoffConfig,
            );
            const nextDetail: PlayoffDivisionDetailForm = {
                ...defaultDetail,
                name,
                maxParticipants: normalizedMaxParticipants,
                playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            };
            const nextPlayoffDivisions = existingDetail
                ? currentPlayoffDivisions.map((detail) => (
                    detail.id === existingDetail.id ? nextDetail : detail
                ))
                : [...currentPlayoffDivisions, nextDetail];

            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });
            resetDivisionEditor();
            return;
        }

        const gender = divisionEditor.gender;
        const skillDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.skillDivisionTypeId);
        const ageDivisionTypeId = normalizeDivisionTokenPart(divisionEditor.ageDivisionTypeId);
        const ratingType: 'SKILL' = 'SKILL';
        const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
        const skillDivisionTypeName = getDivisionTypeNameForEditor('SKILL', skillDivisionTypeId);
        const ageDivisionTypeName = getDivisionTypeNameForEditor('AGE', ageDivisionTypeId);
        const name = divisionEditor.name.trim();
        const usesEventLevelDivisionDefaults = eventData.singleDivision && !isAffiliateEvent;
        const rawNormalizedDivisionPrice = usesEventLevelDivisionDefaults
            ? Math.max(0, eventData.price || 0)
            : Math.max(0, divisionEditor.price || 0);
        const rawDivisionMaxParticipants = usesEventLevelDivisionDefaults
            ? eventData.maxParticipants
            : divisionEditor.maxParticipants;
        const isDivisionMaxParticipantsMissing = (!eventData.singleDivision || isAffiliateEvent)
            && typeof rawDivisionMaxParticipants !== 'number';
        const normalizedDivisionMaxParticipants = typeof rawDivisionMaxParticipants === 'number'
            ? Math.max(0, Math.trunc(rawDivisionMaxParticipants))
            : Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const rawDivisionPlayoffTeamCount = (() => {
            if (
                (eventData.eventType !== 'LEAGUE' && eventData.eventType !== 'TOURNAMENT')
                || !leagueData.includePlayoffs
            ) {
                return undefined;
            }
            if (eventData.eventType === 'LEAGUE' && eventData.singleDivision) {
                return typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants;
            }
            return divisionEditor.playoffTeamCount;
        })();
        const normalizedDivisionPlayoffTeamCount = typeof rawDivisionPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(rawDivisionPlayoffTeamCount))
            : undefined;
        const normalizedDivisionPoolCount = (
            eventData.eventType === 'TOURNAMENT'
            && leagueData.includePlayoffs
            && typeof divisionEditor.poolCount === 'number'
        )
            ? Math.max(1, Math.trunc(divisionEditor.poolCount))
            : undefined;
        const normalizedDivisionPoolTeamCount = eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs
            ? derivePoolTeamCount(normalizedDivisionMaxParticipants, normalizedDivisionPoolCount)
            : undefined;
        const normalizedDivisionAllowPaymentPlans = !isAffiliateEvent && eventData.singleDivision
            ? Boolean(eventData.allowPaymentPlans)
            : !isAffiliateEvent && Boolean(divisionEditor.allowPaymentPlans);
        const normalizedDivisionInstallmentAmounts = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? normalizeInstallmentAmounts(eventData.installmentAmounts)
                : normalizeInstallmentAmounts(divisionEditor.installmentAmounts))
            : [];
        const normalizedDivisionInstallmentDueDates = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? [...(eventData.installmentDueDates || [])]
                : [...(divisionEditor.installmentDueDates || [])])
            : [];
        const normalizedDivisionInstallmentDueRelativeDays = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
                : normalizeInstallmentRelativeDays(divisionEditor.installmentDueRelativeDays))
            : [];
        const normalizedDivisionInstallmentCount = normalizedDivisionAllowPaymentPlans
            ? (usesEventLevelDivisionDefaults
                ? (eventData.installmentCount || normalizedDivisionInstallmentAmounts.length || 0)
                : (divisionEditor.installmentCount || normalizedDivisionInstallmentAmounts.length || 0))
            : 0;
        const normalizedDivisionPrice = normalizedDivisionAllowPaymentPlans
            ? sumInstallmentAmounts(normalizedDivisionInstallmentAmounts)
            : rawNormalizedDivisionPrice;

        if (!gender || !skillDivisionTypeId || !ageDivisionTypeId) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Select gender, skill division, and age division before adding.',
            }));
            return;
        }
        const divisionTypeName = buildDivisionName({
            gender,
            sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
            skillDivisionTypeId,
            ageDivisionTypeId,
        });
        if (!name.length) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division name is required.' }));
            return;
        }
        if (isDivisionMaxParticipantsMissing) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: eventData.teamSignup
                    ? 'Division max teams is required.'
                    : 'Division max participants is required.',
            }));
            return;
        }
        if ((!eventData.singleDivision || isAffiliateEvent) && normalizedDivisionMaxParticipants < 2) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: eventData.teamSignup
                    ? 'Division max teams must be at least 2.'
                    : 'Division max participants must be at least 2.',
            }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && typeof rawDivisionPlayoffTeamCount !== 'number'
        ) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division playoff team count is required.' }));
            return;
        }
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)
        ) {
            setDivisionEditor((prev) => ({ ...prev, error: 'Division playoff team count must be at least 2.' }));
            return;
        }
        if (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs) {
            if (!(typeof normalizedDivisionPoolCount === 'number' && normalizedDivisionPoolCount >= 1)) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Pool count is required.' }));
                return;
            }
            if (!(typeof normalizedDivisionPlayoffTeamCount === 'number' && normalizedDivisionPlayoffTeamCount >= 2)) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Bracket team count is required.' }));
                return;
            }
            if (normalizedDivisionMaxParticipants % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Division max teams must divide evenly by pool count.' }));
                return;
            }
            if (normalizedDivisionPlayoffTeamCount % normalizedDivisionPoolCount !== 0) {
                setDivisionEditor((prev) => ({ ...prev, error: 'Bracket team count must divide evenly by pool count.' }));
                return;
            }
        }
        if (!eventData.singleDivision && normalizedDivisionAllowPaymentPlans) {
            if (!normalizedDivisionInstallmentAmounts.length) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Add at least one installment amount for this division.',
                }));
                return;
            }
            if (
                normalizedDivisionInstallmentCount > 0
                && normalizedDivisionInstallmentAmounts.length !== normalizedDivisionInstallmentCount
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Division installment count must match number of installment rows.',
                }));
                return;
            }
            if (
                eventData.eventType === 'WEEKLY_EVENT'
                && !eventData.parentEvent
                && normalizedDivisionInstallmentDueRelativeDays.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Each division installment amount needs a due date offset.',
                }));
                return;
            }
            if (
                !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                && normalizedDivisionInstallmentDueDates.length
                && normalizedDivisionInstallmentDueDates.length !== normalizedDivisionInstallmentAmounts.length
            ) {
                setDivisionEditor((prev) => ({
                    ...prev,
                    error: 'Each division installment amount needs a due date.',
                }));
                return;
            }
        }

        const token = buildDivisionToken({ gender, ratingType, divisionTypeId });
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId) || undefined;
        const referenceDate = parseDateValue(eventData.start ?? null);

        const currentDetails = Array.isArray(eventData.divisionDetails) ? [...eventData.divisionDetails] : [];
        const existingDetail = divisionEditor.editingId
            ? currentDetails.find((detail) => detail.id === divisionEditor.editingId)
            : null;
        const normalizedName = normalizeDivisionNameKey(name);
        const duplicateByName = currentDetails.find((detail) =>
            detail.id !== divisionEditor.editingId
            && normalizeDivisionNameKey(detail.name) === normalizedName,
        );
        if (duplicateByName) {
            setDivisionEditor((prev) => ({
                ...prev,
                error: 'Division name must be unique within this event.',
            }));
            return;
        }
        const nextId = existingDetail?.id ?? buildUniqueDivisionIdForToken({
            eventId: eventData.$id,
            token,
            existingDivisionIds: currentDetails.map((detail) => detail.id),
        });
        const normalizedPlacementMapping = (() => {
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && eventData.splitLeaguePlayoffDivisions
                && !eventData.singleDivision
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                const mapping = normalizePlacementDivisionIds(divisionEditor.playoffPlacementDivisionIds)
                    .slice(0, normalizedDivisionPlayoffTeamCount);
                while (mapping.length < normalizedDivisionPlayoffTeamCount) {
                    mapping.push('');
                }
                return mapping;
            }
            return Array.isArray(existingDetail?.playoffPlacementDivisionIds)
                ? [...existingDetail.playoffPlacementDivisionIds]
                : [];
        })();
        const storesLeagueDivisionPlayoffConfig = (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && !eventData.singleDivision
            && !eventData.splitLeaguePlayoffDivisions
        );
        const storesTournamentDivisionConfig = (
            eventData.eventType === 'TOURNAMENT'
            && !eventData.singleDivision
        );
        const normalizedDivisionPlayoffConfig = storesLeagueDivisionPlayoffConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;
        const normalizedDivisionTournamentConfig = storesTournamentDivisionConfig
            ? normalizeTournamentConfigForSetMode(
                divisionEditor.playoffConfig,
                resolveTournamentSetMode(currentSportRequiresSets, divisionEditor.playoffConfig),
            )
            : undefined;

        const nextDetail = applyDivisionAgeCutoff({
            id: nextId,
            key: token,
            kind: 'LEAGUE',
            name,
            divisionTypeId,
            divisionTypeName,
            ratingType,
            gender,
            skillDivisionTypeId,
            skillDivisionTypeName,
            ageDivisionTypeId,
            ageDivisionTypeName,
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: normalizedDivisionPlayoffTeamCount,
            poolCount: normalizedDivisionPoolCount,
            poolTeamCount: normalizedDivisionPoolTeamCount,
            playoffPlacementDivisionIds: normalizedPlacementMapping,
            ...((eventData.eventType === 'LEAGUE' || (eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets))
                : {}),
            ...((normalizedDivisionPlayoffConfig || normalizedDivisionTournamentConfig)
                ? { playoffConfig: normalizedDivisionPlayoffConfig ?? normalizedDivisionTournamentConfig }
                : {}),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans && !(eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent)
                ? normalizedDivisionInstallmentDueDates
                : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans && eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent
                ? normalizedDivisionInstallmentDueRelativeDays
                : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            sportId: sportInput,
            fieldIds: [],
        }, sportInput, referenceDate);

        let nextDetails: DivisionDetailForm[] = [];
        if (divisionEditor.editingId) {
            nextDetails = currentDetails.map((detail) =>
                detail.id === divisionEditor.editingId ? nextDetail : detail,
            );
        } else {
            nextDetails = [...currentDetails, nextDetail];
        }
        const nextDivisionIds = nextDetails.map((detail) => detail.id);

        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const remappedFieldMap: Record<string, string[]> = {};
        Object.entries(currentFieldMap).forEach(([divisionKey, fieldIds]) => {
            if (divisionEditor.editingId && divisionKey === divisionEditor.editingId) {
                remappedFieldMap[nextId] = Array.isArray(fieldIds) ? [...fieldIds] : [];
                return;
            }
            if (nextDivisionIds.includes(divisionKey)) {
                remappedFieldMap[divisionKey] = Array.isArray(fieldIds) ? [...fieldIds] : [];
            }
        });
        setValue('divisionFieldIds', remappedFieldMap, { shouldDirty: true, shouldValidate: true });
        if (!eventData.singleDivision) {
            setValue('price', normalizedDivisionPrice, { shouldDirty: true, shouldValidate: false });
            setValue('maxParticipants', normalizedDivisionMaxParticipants, { shouldDirty: true, shouldValidate: true });
            setValue('allowPaymentPlans', normalizedDivisionAllowPaymentPlans, { shouldDirty: true, shouldValidate: true });
            setValue('installmentCount', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0, { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueDates', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentDueRelativeDays', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [], { shouldDirty: true, shouldValidate: true });
            setValue('installmentAmounts', normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [], { shouldDirty: true, shouldValidate: true });
            if (
                eventData.eventType === 'LEAGUE'
                && leagueData.includePlayoffs
                && typeof normalizedDivisionPlayoffTeamCount === 'number'
            ) {
                setLeagueData((prev) => ({
                    ...prev,
                    playoffTeamCount: normalizedDivisionPlayoffTeamCount,
                }), { shouldDirty: true, shouldValidate: true });
            }
        }
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: normalizedDivisionPrice,
            maxParticipants: normalizedDivisionMaxParticipants,
            playoffTeamCount: typeof normalizedDivisionPlayoffTeamCount === 'number'
                ? normalizedDivisionPlayoffTeamCount
                : Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            poolCount: typeof normalizedDivisionPoolCount === 'number'
                ? normalizedDivisionPoolCount
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(divisionEditor.leagueConfig, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(divisionEditor.playoffConfig),
            allowPaymentPlans: normalizedDivisionAllowPaymentPlans,
            installmentCount: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentCount : 0,
            installmentDueDates: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueDates : [],
            installmentDueRelativeDays: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentDueRelativeDays : [],
            installmentAmounts: normalizedDivisionAllowPaymentPlans ? normalizedDivisionInstallmentAmounts : [],
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        divisionEditor,
        eventData.$id,
        eventData.divisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        eventData.start,
        eventData.singleDivision,
        eventData.splitLeaguePlayoffDivisions,
        eventData.teamSignup,
        eventData.eventType,
        eventData.allowPaymentPlans,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.parentEvent,
        eventData.price,
        eventData.maxParticipants,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        playoffData,
        createNextPlayoffDivision,
        getDivisionTypeNameForEditor,
        getValues,
        isAffiliateEvent,
        resetDivisionEditor,
        setLeagueData,
        setValue,
        splitDivisionEditorEnabled,
    ]);

    useEffect(() => {
        if (sportsLoading) {
            return;
        }
        const selectedSportId = String(getValues('sportId') ?? '').trim();
        const currentSportConfig = getValues('sportConfig') as Sport | null | undefined;
        const currentSportConfigId = currentSportConfig && typeof currentSportConfig === 'object'
            ? String((currentSportConfig as any).$id ?? '')
            : '';

        if (!selectedSportId) {
            if (currentSportConfig) {
                setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
            }
            return;
        }

        const selected = sportsById.get(selectedSportId) ?? null;
        if (selected && currentSportConfigId !== selected.$id) {
            setValue('sportConfig', selected, { shouldDirty: false, shouldValidate: false });
            return;
        }
        if (!selected && currentSportConfig) {
            setValue('sportConfig', null, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.sportId, getValues, setValue, sportsLoading, sportsById]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
            if (currentDivisionIds.length) {
                setValue('divisions', [], { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        const idsFromDetails = normalizeDivisionKeys(currentDetails.map((detail) => detail.id));
        const currentDivisionIds = normalizeDivisionKeys(getValues('divisions'));
        if (!stringArraysEqual(idsFromDetails, currentDivisionIds)) {
            setValue('divisions', idsFromDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [eventData.$id, eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, getValues, setValue]);

    useEffect(() => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const referenceDate = parseDateValue(eventData.start ?? null);
        const nextDetails = currentDetails.map((detail) => applyDivisionAgeCutoff({
            ...detail,
            sportId: detail.sportId ?? (sportInput || undefined),
        }, sportInput, referenceDate));

        const changed = nextDetails.some((detail, index) => {
            const current = currentDetails[index];
            if (!current) {
                return true;
            }
            return detail.ageCutoffDate !== current.ageCutoffDate
                || detail.ageCutoffLabel !== current.ageCutoffLabel
                || detail.ageCutoffSource !== current.ageCutoffSource
                || detail.sportId !== current.sportId;
        });

        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: false });
        }
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId, eventData.start, setValue]);

    useEffect(() => {
        const selectedDivisionKeys = slotDivisionKeys;
        if (!selectedDivisionKeys.length) {
            return;
        }
        const selectedDivisionSet = new Set(selectedDivisionKeys);
        const enforceAllSlotDivisions = Boolean(eventData.singleDivision);
        const hasMismatch = leagueSlots.some((slot) => {
            const currentRaw = normalizeDivisionKeys(slot.divisions);
            const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
            if (!stringArraysEqual(currentRaw, current)) {
                return true;
            }
            if (enforceAllSlotDivisions) {
                return !stringSetsEqual(current, selectedDivisionKeys);
            }
            const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
            return filtered.length === 0 || !stringArraysEqual(current, filtered);
        });
        if (!hasMismatch) {
            return;
        }
        updateLeagueSlots(
            (prev) =>
                prev.map((slot) => {
                    const current = normalizeSlotDivisionKeysWithLookup(slot.divisions, slotDivisionLookup);
                    const filtered = current.filter((divisionKey) => selectedDivisionSet.has(divisionKey));
                    return {
                        ...slot,
                        divisions: enforceAllSlotDivisions
                            ? selectedDivisionKeys
                            : (filtered.length ? filtered : selectedDivisionKeys),
                    };
                }),
            { shouldDirty: false },
        );
    }, [eventData.singleDivision, leagueSlots, slotDivisionKeys, slotDivisionLookup, updateLeagueSlots]);

    useEffect(() => {
        if (eventData.eventType === 'LEAGUE') {
            return;
        }

        if (eventData.splitLeaguePlayoffDivisions) {
            setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
        }
        if ((eventData.playoffDivisionDetails || []).length > 0) {
            setValue('playoffDivisionDetails', [], { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        setValue,
    ]);

    useEffect(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                : 0;
            if (playoffTeamCount <= 0) {
                if (!Array.isArray(detail.playoffPlacementDivisionIds) || detail.playoffPlacementDivisionIds.length === 0) {
                    return detail;
                }
                changed = true;
                return {
                    ...detail,
                    playoffPlacementDivisionIds: [],
                };
            }
            const currentMapping = Array.isArray(detail.playoffPlacementDivisionIds)
                ? detail.playoffPlacementDivisionIds
                : [];
            const nextMapping = currentMapping.slice(0, playoffTeamCount);
            while (nextMapping.length < playoffTeamCount) {
                nextMapping.push('');
            }
            if (stringArraysEqual(currentMapping, nextMapping)) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || !eventData.singleDivision) {
            return;
        }
        if (typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2) {
            return;
        }
        const fallbackFromDivision = eventData.divisionDetails?.[0]?.playoffTeamCount
            ?? eventData.divisionDetails?.[0]?.maxParticipants
            ?? eventData.maxParticipants
            ?? 2;
        setLeagueData((prev) => ({
            ...prev,
            playoffTeamCount: Math.max(2, Math.trunc(fallbackFromDivision)),
        }), { shouldDirty: false });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        setLeagueData,
    ]);

    useEffect(() => {
        if (eventData.eventType !== 'LEAGUE' || !leagueData.includePlayoffs || eventData.singleDivision) {
            return;
        }
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }
        let changed = false;
        const nextDetails = currentDetails.map((detail) => {
            if (typeof detail.playoffTeamCount === 'number' && detail.playoffTeamCount >= 2) {
                return detail;
            }
            changed = true;
            return {
                ...detail,
                playoffTeamCount: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            };
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
    ]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        setLeagueData((prev) => {
            const normalized = normalizeLeagueConfigForSetMode(prev, requiresSets);
            return leagueConfigEqual(prev, normalized) ? prev : normalized;
        }, { shouldDirty: false });
    }, [eventData.sportConfig, eventData.sportId, setLeagueData, sportsById]);

    useEffect(() => {
        setDivisionEditor((prev) => {
            if (prev.divisionKind !== 'LEAGUE') {
                return prev;
            }
            const normalized = normalizeLeagueConfigForSetMode(prev.leagueConfig, currentSportRequiresSets);
            if (leagueConfigEqual(prev.leagueConfig, normalized)) {
                return prev;
            }
            return {
                ...prev,
                leagueConfig: normalized,
            };
        });
    }, [currentSportRequiresSets]);

    useEffect(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        const requiresSets = Boolean(selectedSport?.usePointsPerSetWin);
        if (requiresSets) {
            return;
        }

        const normalizedPlayoff = normalizeTournamentConfigForSetMode(playoffData, false);
        if (!tournamentConfigEqual(playoffData, normalizedPlayoff)) {
            setPlayoffData(normalizedPlayoff, { shouldDirty: false });
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        if (!currentPlayoffDivisions.length) {
            const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
                ? eventData.divisionDetails
                : [];
            let leagueChanged = false;
            const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
                if (!division.playoffConfig) {
                    return division;
                }
                const previousConfig = buildTournamentConfig(division.playoffConfig);
                const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
                if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                    return division;
                }
                leagueChanged = true;
                return {
                    ...division,
                    playoffConfig: normalizedConfig,
                };
            });

            if (leagueChanged) {
                setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
            }
            return;
        }

        let changed = false;
        const nextPlayoffDivisions = currentPlayoffDivisions.map((division) => {
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            changed = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (changed) {
            setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: false, shouldValidate: true });
        }

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails)
            ? eventData.divisionDetails
            : [];
        let leagueChanged = false;
        const nextLeagueDivisions = currentLeagueDivisions.map((division) => {
            if (!division.playoffConfig) {
                return division;
            }
            const previousConfig = buildTournamentConfig(division.playoffConfig);
            const normalizedConfig = normalizeTournamentConfigForSetMode(previousConfig, false);
            if (tournamentConfigEqual(previousConfig, normalizedConfig)) {
                return division;
            }
            leagueChanged = true;
            return {
                ...division,
                playoffConfig: normalizedConfig,
            };
        });

        if (leagueChanged) {
            setValue('divisionDetails', nextLeagueDivisions, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        eventData.divisionDetails,
        eventData.playoffDivisionDetails,
        eventData.sportConfig,
        eventData.sportId,
        playoffData,
        setPlayoffData,
        setValue,
        sportsById,
    ]);

    useEffect(() => {
        if (!hasRestrictedImmutableFields) {
            return;
        }
        setFields(sanitizeFieldsForForm(immutableFields), { shouldDirty: false });
    }, [hasRestrictedImmutableFields, immutableFields, setFields]);

    // When provisioning local fields, mirror count changes into the generated list.
    useEffect(() => {
        const previousEventLocation = previousEventFieldLocationRef.current;
        const eventFieldLocation = defaultFieldLocationForEvent(eventData.location);
        previousEventFieldLocationRef.current = eventFieldLocation;

        if (!shouldManageLocalFields) {
            return;
        }
        setFields(prev => {
            const retainedFields = prev.filter((field) => !isEventLocalField(field));
            const normalizedLocalFields: Field[] = prev
                .filter(isEventLocalField)
                .slice(0, fieldCount)
                .map((field) => withEventFieldLocationDefault(
                    field,
                    eventFieldLocation,
                    previousEventLocation,
                ));

            if (normalizedLocalFields.length < fieldCount) {
                for (let index = normalizedLocalFields.length; index < fieldCount; index += 1) {
                    normalizedLocalFields.push({
                        $id: createClientId(),
                        name: `Field ${index + 1}`,
                        location: eventFieldLocation,
                        lat: 0,
                        long: 0,
                    } as Field);
                }
            }

            return [...retainedFields, ...normalizedLocalFields];
        }, { shouldDirty: false });
    }, [eventData.location, fieldCount, shouldManageLocalFields, setFields]);

    // For non-organization events with existing facilities, seed the field list with event ordering.
    useEffect(() => {
        if (shouldManageLocalFields || isOrganizationManagedEvent || !activeEditingEvent?.fields?.length) {
            return;
        }
        const sorted = sortFieldsByCreatedAt(sanitizeFieldsForForm(activeEditingEvent.fields));
        setFields(sorted, { shouldDirty: false });
    }, [activeEditingEvent?.fields, isOrganizationManagedEvent, setFields, shouldManageLocalFields]);

    useEffect(() => {
        const availableFields = isOrganizationHostedEvent && supportsOrganizationFieldSelection
            ? fields.filter((field) => isSelectableOrganizationResource(field, organizationHostedEventId))
            : fields;
        const availableFieldIds = toFieldIdList(availableFields);
        const rentalSelectorFieldIds = rentalResourceOptions
            .map((option) => normalizeResourceText(option.selectorId))
            .filter(Boolean);
        const pendingRentalSelectorFieldIds = rentalResourcesLoading || rentalResourceOptions.length === 0
            ? selectedFieldIds.filter(isRentalBookingSelectorId)
            : [];
        const allowed = new Set([...availableFieldIds, ...rentalSelectorFieldIds, ...pendingRentalSelectorFieldIds]);
        const normalizedSelected = Array.from(
            new Set(
                selectedFieldIds
                    .map((fieldId) => String(fieldId))
                    .filter((fieldId) => allowed.has(fieldId)),
            ),
        );
        if (!stringArraysEqual(selectedFieldIds, normalizedSelected)) {
            setValue('selectedFieldIds', normalizedSelected, { shouldDirty: false, shouldValidate: true });
        }
    }, [fields, isOrganizationHostedEvent, organizationHostedEventId, rentalResourceOptions, rentalResourcesLoading, selectedFieldIds, setValue, supportsOrganizationFieldSelection]);

    useEffect(() => {
        const divisionKeys = normalizeDivisionKeys(eventData.divisions);
        const availableFieldIds = toFieldIdList(fields);

        const nextDivisionFieldIds = normalizeDivisionFieldIds(
            divisionFieldIds,
            divisionKeys,
            availableFieldIds,
        );

        if (!divisionFieldIdsEqual(divisionFieldIds, nextDivisionFieldIds)) {
            setValue('divisionFieldIds', nextDivisionFieldIds, { shouldDirty: false, shouldValidate: true });
        }
    }, [
        divisionFieldIds,
        eventData.divisions,
        fields,
        setValue,
    ]);

    // Clear slot field references that point to fields no longer selected/available.
    useEffect(() => {
        const availableFieldIds = toFieldIdList(fields);
        if (!availableFieldIds.length) {
            return;
        }
        const validIds = new Set(availableFieldIds);

        const hasInvalidSlots = leagueSlots.some((slot) => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            return slotFieldIds.some((fieldId) => !validIds.has(fieldId));
        });
        if (!hasInvalidSlots) {
            return;
        }

        updateLeagueSlots(prev => prev.map(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            const nextFieldIds = slotFieldIds.filter((fieldId) => validIds.has(fieldId));
            if (stringSetsEqual(slotFieldIds, nextFieldIds)) {
                return slot;
            }
            return {
                ...slot,
                scheduledFieldId: nextFieldIds[0],
                scheduledFieldIds: nextFieldIds,
            };
        }), { shouldDirty: false });
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
            setLeagueSlots((prev) => {
                let changed = false;
                const next = prev.map((slot) => {
                    if (!slot.conflicts.length && slot.checking === false) {
                        return slot;
                    }
                    changed = true;
                    return {
                        ...slot,
                        conflicts: [],
                        checking: false,
                    };
                });
                return changed ? next : prev;
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
        const slotForms = payload.slots.map((slot) => snapshotToSlotForm(slot));
        const eligibleSlots = slotForms.filter((slot) => slotCanCheckExternalConflicts(slot, context));
        const fieldIds = Array.from(
            new Set(
                eligibleSlots.flatMap((slot) => normalizeSlotFieldIds(slot)),
            ),
        );
        if (!fieldIds.length) {
            clearConflicts();
            return;
        }

        const requestId = slotConflictRequestRef.current + 1;
        slotConflictRequestRef.current = requestId;
        setLeagueSlots((prev) => {
            let changed = false;
            const next = prev.map((slot) => {
                const shouldCheck = slotCanCheckExternalConflicts(slot, context);
                if (slot.checking === shouldCheck) {
                    return slot;
                }
                changed = true;
                return {
                    ...slot,
                    checking: shouldCheck,
                };
            });
            return changed ? next : prev;
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

                setLeagueSlots((prev) => {
                    let changed = false;
                    const next = prev.map((slot) => {
                        const nextConflicts = conflictsBySlotKey.get(slot.key) ?? [];
                        if (slot.checking === false && slotConflictsEqual(slot.conflicts, nextConflicts)) {
                            return slot;
                        }
                        changed = true;
                        return {
                            ...slot,
                            conflicts: nextConflicts,
                            checking: false,
                        };
                    });
                    return changed ? next : prev;
                }, { shouldDirty: false });
            } catch (error) {
                if (cancelled || slotConflictRequestRef.current !== requestId) {
                    return;
                }
                console.warn('Failed to load event scheduling conflicts:', error);
                setLeagueSlots((prev) => {
                    let changed = false;
                    const next = prev.map((slot) => {
                        if (slot.checking === false && slot.conflicts.length === 0) {
                            return slot;
                        }
                        changed = true;
                        return {
                            ...slot,
                            conflicts: [],
                            checking: false,
                        };
                    });
                    return changed ? next : prev;
                }, { shouldDirty: false });
            }
        };

        void loadConflicts();

        return () => {
            cancelled = true;
        };
    }, [hasImmutableTimeSlots, resolvedOrganizationId, setLeagueSlots, slotConflictCheckKey]);

    // Adds a blank slot row in the LeagueFields list when the user taps "Add Timeslot".
    const handleAddSlot = () => {
        if (hasImmutableTimeSlots) {
            return;
        }
        clearErrors('leagueSlots');
        updateLeagueSlots(prev => [...prev, createSlotForm(undefined, slotDivisionKeys)]);
    };

    // Drops a specific slot by index, leaving at least one slot for the scheduler UI to edit.
    const handleRemoveSlot = (index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }
        updateLeagueSlots(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, idx) => idx !== index);
        });
    };

    // Applies granular updates coming back from LeagueFields inputs before revalidating the array.
    const handleUpdateSlot = (index: number, updates: Partial<LeagueSlotForm>) => {
        const isDivisionOnlyUpdate = Object.keys(updates).every((key) => key === 'divisions');
        const isResourceOnlyUpdate = Object.keys(updates).every((key) => (
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
        ));
        const allowRentalDivisionEditOnLockedSlots = hasExternalRentalField && !eventData.singleDivision;
        const allowRentalResourceEditOnLockedSlots = hasExternalRentalField && isResourceOnlyUpdate;
        const allowUpdateOnLockedSlots = hasImmutableTimeSlots && (
            (allowRentalDivisionEditOnLockedSlots && isDivisionOnlyUpdate)
            || allowRentalResourceEditOnLockedSlots
        );
        if (hasImmutableTimeSlots && !allowUpdateOnLockedSlots) {
            return;
        }
        const current = leagueSlots[index];
        if (!current) return;

        const updated: LeagueSlotForm = {
            ...current,
            ...updates,
        };
        const normalizedDays = normalizeWeekdays(updated);
        const normalizedFieldIds = normalizeSlotFieldIds(updated);
        const selectedDivisionKeys = slotDivisionKeys;
        const normalizedDivisions = normalizeSlotDivisionKeysWithLookup(updated.divisions, slotDivisionLookup);
        const normalizedStartDate = formatLocalDateTime(updated.startDate ?? null);
        const normalizedEndDate = formatLocalDateTime(updated.endDate ?? null);
        updated.scheduledFieldId = normalizedFieldIds[0];
        updated.scheduledFieldIds = normalizedFieldIds;
        updated.divisions = eventData.singleDivision
            ? selectedDivisionKeys
            : (normalizedDivisions.length ? normalizedDivisions : selectedDivisionKeys);
        updated.startDate = normalizedStartDate || undefined;
        updated.endDate = normalizedEndDate || undefined;

        const repeating = updated.repeating !== false;
        if (repeating) {
            const parsedStart = parseLocalDateTime(updated.startDate ?? null);
            const parsedEnd = parseLocalDateTime(updated.endDate ?? null);
            const nextDays = normalizedDays.length
                ? normalizedDays
                : parsedStart
                    ? [((parsedStart.getDay() + 6) % 7)]
                    : [];
            if (nextDays.length) {
                updated.dayOfWeek = nextDays[0] as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = nextDays as LeagueSlotForm['daysOfWeek'];
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
            }

            if (!Number.isFinite(updated.startTimeMinutes) && parsedStart) {
                updated.startTimeMinutes = parsedStart.getHours() * 60 + parsedStart.getMinutes();
            }
            if (!Number.isFinite(updated.endTimeMinutes) && parsedEnd) {
                updated.endTimeMinutes = parsedEnd.getHours() * 60 + parsedEnd.getMinutes();
            }
        } else {
            let slotStart = parseLocalDateTime(updated.startDate ?? null);
            let slotEnd = parseLocalDateTime(updated.endDate ?? null);
            let startMinutes = Number.isFinite(updated.startTimeMinutes) ? Number(updated.startTimeMinutes) : null;
            let endMinutes = Number.isFinite(updated.endTimeMinutes) ? Number(updated.endTimeMinutes) : null;
            if (!slotStart) {
                const fallbackEventStart = parseLocalDateTime(eventData.start ?? null);
                if (fallbackEventStart) {
                    slotStart = fallbackEventStart;
                }
            }
            if (startMinutes === null && slotStart) {
                startMinutes = minutesFromDate(slotStart);
            }
            if (!slotEnd && slotStart) {
                const fallbackEventEnd = parseLocalDateTime(eventData.end ?? null);
                if (fallbackEventEnd && fallbackEventEnd.getTime() > slotStart.getTime()) {
                    slotEnd = fallbackEventEnd;
                } else {
                    const durationMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                        ? endMinutes - startMinutes
                        : 60;
                    slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
                }
            }
            if (!slotEnd && slotStart) {
                slotEnd = new Date(slotStart);
            }
            if (endMinutes === null && slotEnd) {
                endMinutes = minutesFromDate(slotEnd);
            }

            if (slotStart && startMinutes !== null) {
                const normalizedStart = withMinutesOnDate(slotStart, startMinutes);
                const dayOfWeek = ((normalizedStart.getDay() + 6) % 7);
                updated.dayOfWeek = dayOfWeek as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = [dayOfWeek] as LeagueSlotForm['daysOfWeek'];
                updated.startDate = formatLocalDateTime(normalizedStart);
                updated.startTimeMinutes = startMinutes;
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
                updated.startDate = undefined;
                updated.startTimeMinutes = undefined;
            }

            if (slotEnd && endMinutes !== null) {
                const normalizedEnd = withMinutesOnDate(slotEnd, endMinutes);
                updated.endDate = formatLocalDateTime(normalizedEnd);
                updated.endTimeMinutes = endMinutes;
            } else {
                updated.endDate = undefined;
                updated.endTimeMinutes = undefined;
            }
        }

        if (allowUpdateOnLockedSlots) {
            setLeagueSlots(prev => {
                const next = [...prev];
                next[index] = updated;
                return normalizeSlotState(next, eventData.eventType);
            });
        } else {
            updateLeagueSlots(prev => {
                const next = [...prev];
                next[index] = updated;
                return next;
            });
        }

        clearErrors('leagueSlots');
    };

    const handleAutoResolveSlotConflict = (index: number) => {
        if (hasImmutableTimeSlots) {
            return;
        }

        const slot = leagueSlots[index];
        if (!slot || slot.conflicts.length === 0) {
            return;
        }

        const context: SlotConflictContext = {
            eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
            eventStart: eventData.start ?? undefined,
            eventEnd: eventData.end ?? undefined,
        };
        const updates = buildAutoResolvedSlotUpdate(slot, context);
        if (!updates) {
            return;
        }

        handleUpdateSlot(index, updates);
    };

    // Updates locally managed event fields without mutating reusable organization fields.
    const handleLocalFieldNameChange = useCallback((fieldId: string, name: string) => {
        if (!shouldManageLocalFields || hasRestrictedImmutableFields) {
            return;
        }
        setFields(prev => {
            return prev.map((field) => (
                field.$id === fieldId && isEventLocalField(field)
                    ? { ...field, name }
                    : field
            ));
        });
    }, [hasRestrictedImmutableFields, setFields, shouldManageLocalFields]);

    // Hydrate schedule state and slots when opening the modal for an existing event.
    useEffect(() => {
        if (isEditMode) {
            return;
        }
        if (hasImmutableTimeSlots) {
            return;
        }
        if (activeEditingEvent && supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)) {
            if (activeEditingEvent.eventType === 'LEAGUE' || activeEditingEvent.eventType === 'TOURNAMENT') {
                const source = activeEditingEvent.leagueConfig || activeEditingEvent;
                const includePlayoffsOrPools = Boolean((source as any)?.includePlayoffsOrPools ?? source?.includePlayoffs);
                setLeagueData({
                    gamesPerOpponent: source?.gamesPerOpponent ?? 1,
                    includePlayoffs: includePlayoffsOrPools,
                    playoffTeamCount: source?.playoffTeamCount ?? undefined,
                    usesSets: source?.usesSets ?? false,
                    matchDurationMinutes: normalizeNumber(source?.matchDurationMinutes),
                    restTimeMinutes: normalizeNumber(source?.restTimeMinutes, 0) ?? 0,
                    setDurationMinutes: normalizeNumber(source?.setDurationMinutes),
                    setsPerMatch: normalizeNumber(source?.setsPerMatch),
                    pointsToVictory: Array.isArray(source?.pointsToVictory) ? source.pointsToVictory as number[] : undefined,
                }, { shouldDirty: false });

                if (activeEditingEvent.eventType === 'LEAGUE' && activeEditingEvent.includePlayoffs) {
                    const extractedPlayoff = extractTournamentConfigFromEvent(activeEditingEvent);
                    if (extractedPlayoff) {
                        setPlayoffData(extractedPlayoff, { shouldDirty: false });
                    } else {
                        setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
                    }
                } else {
                    setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
                }
            } else {
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
                setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
            }

            const fallbackFieldId = activeEditingEvent.fields?.[0]?.$id;
            const activeEventSlotsForEditor = supportsScheduleSlotsForEvent(activeEditingEvent.eventType, activeEditingEvent.parentEvent)
                ? (activeEditingEvent.timeSlots || []).filter((slot) => !isRentalLockedTimeSlot(slot))
                : (activeEditingEvent.timeSlots || []);
            const slots = mergeSlotPayloadsForForm(activeEventSlotsForEditor, fallbackFieldId)
                .map((slot) => createSlotForm(
                    slot,
                    slotDivisionKeysRef.current,
                    activeEditingEvent.start,
                    activeEditingEvent.end,
                ));

            const initialSlots = slots.length > 0
                ? slots
                : [createSlotForm(undefined, slotDivisionKeysRef.current)];
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
            setLeagueSlots(normalizeSlotState([createSlotForm(undefined, slotDivisionKeysRef.current)], 'EVENT'), { shouldDirty: false });
            setPlayoffData(buildTournamentConfig(), { shouldDirty: false });
        }
    }, [activeEditingEvent, createSlotForm, hasImmutableTimeSlots, isEditMode, setLeagueData, setLeagueSlots, setPlayoffData]);

    useEffect(() => {
        if (!hasImmutableTimeSlots) {
            return;
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        const slotForms = mergeSlotPayloadsForForm(immutableTimeSlots, fallbackFieldId)
            .map((slot) => createSlotForm(
                slot,
                slotDivisionKeysRef.current,
                eventData.start,
                eventData.end,
            ));
        const normalizedSlots = normalizeSlotState(slotForms, eventData.eventType);
        setLeagueSlots((prev) => (leagueSlotsEqual(prev, normalizedSlots) ? prev : normalizedSlots), { shouldDirty: false });
    }, [
        hasImmutableTimeSlots,
        immutableTimeSlots,
        immutableFields,
        createSlotForm,
        eventData.eventType,
        eventData.start,
        eventData.end,
        setLeagueSlots,
    ]);

    useEffect(() => {
        const previousMode = previousEditableScheduleModeRef.current;
        previousEditableScheduleModeRef.current = eventSupportsScheduleSlots;
        if (previousMode === null || previousMode === eventSupportsScheduleSlots || !eventSupportsScheduleSlots) {
            return;
        }
        if (!rentalLockedSlotsForDraft.length) {
            return;
        }

        const dateValuesMatch = (left?: string | null, right?: string | null): boolean => {
            const parsedLeft = parseLocalDateTime(left ?? null);
            const parsedRight = parseLocalDateTime(right ?? null);
            if (!parsedLeft && !parsedRight) {
                return true;
            }
            return Boolean(parsedLeft && parsedRight && parsedLeft.getTime() === parsedRight.getTime());
        };

        const slotMatchesLockedRental = (slot: LeagueSlotForm, lockedSlot: TimeSlot): boolean => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            const lockedFieldIds = normalizeSlotFieldIds(lockedSlot);
            if (!slotFieldIds.length || !stringSetsEqual(slotFieldIds, lockedFieldIds)) {
                return false;
            }
            if (dateValuesMatch(slot.startDate, lockedSlot.startDate) && dateValuesMatch(slot.endDate, lockedSlot.endDate)) {
                return true;
            }
            return slot.startTimeMinutes === lockedSlot.startTimeMinutes
                && slot.endTimeMinutes === lockedSlot.endTimeMinutes
                && normalizeWeekdays(slot).some((day) => normalizeWeekdays(lockedSlot).includes(day));
        };

        setLeagueSlots((previousSlots) => {
            const seededFromRentalDefaults = previousSlots.length > 0
                && previousSlots.every((slot) => rentalLockedSlotsForDraft.some((lockedSlot) => (
                    slotMatchesLockedRental(slot, lockedSlot)
                )));
            if (!seededFromRentalDefaults) {
                return previousSlots;
            }
            return normalizeSlotState(
                [createSlotForm(undefined, slotDivisionKeysRef.current, eventData.start, eventData.end, eventData.timeZone)],
                eventData.eventType,
                eventData.parentEvent,
            );
        }, { shouldDirty: false });
    }, [
        createSlotForm,
        eventData.end,
        eventData.eventType,
        eventData.parentEvent,
        eventData.start,
        eventData.timeZone,
        eventSupportsScheduleSlots,
        rentalLockedSlotsForDraft,
        setLeagueSlots,
    ]);

    // Merge any newly loaded fields from the event into local state without losing existing edits.
    useEffect(() => {
        if (isEditMode) {
            return;
        }
        if (hasRestrictedImmutableFields) {
            return;
        }
        if (activeEditingEvent?.fields) {
            setFields(prev => {
                const map = new Map<string, Field>();
                const incoming = sanitizeFieldsForForm(activeEditingEvent.fields as Field[]);
                [...prev, ...incoming].forEach(field => {
                    if (field?.$id) {
                        map.set(field.$id, field);
                    }
                });
                return Array.from(map.values());
            }, { shouldDirty: false });
        }
    }, [activeEditingEvent?.fields, hasRestrictedImmutableFields, isEditMode, setFields]);

    // Re-run slot normalization when the modal switches event types (e.g., league -> tournament).
    useEffect(() => {
        updateLeagueSlots(prev => prev, { shouldDirty: false });
    }, [eventData.eventType, updateLeagueSlots]);

    const todaysDate = new Date(new Date().setHours(0, 0, 0, 0));
    const rentalResourceFields = useMemo(
        () => buildRentalResourceFields(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const rentalResourceSelectorFields = useMemo(
        () => buildRentalResourceSelectorFields(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const rentalResourceOptionsBySelectorId = useMemo(() => (
        buildRentalResourceOptionsBySelectorId(rentalResourceOptions)
    ), [rentalResourceOptions]);
    const rentalResourceOptionsByFieldId = useMemo(
        () => buildRentalResourceOptionsByFieldId(rentalResourceOptions),
        [rentalResourceOptions],
    );
    const selectedRentalResourceOptions = useMemo(() => (
        resolveSelectedRentalResourceOptions({
            selectedFieldIds,
            optionsBySelectorId: rentalResourceOptionsBySelectorId,
            optionsByFieldId: rentalResourceOptionsByFieldId,
        })
    ), [rentalResourceOptionsByFieldId, rentalResourceOptionsBySelectorId, selectedFieldIds]);
    const selectedRentalFieldIds = useMemo(
        () => buildSelectedRentalFieldIds(selectedRentalResourceOptions),
        [selectedRentalResourceOptions],
    );
    const selectedRentedFieldIds = useMemo(
        () => resolveSelectedRentedFieldIds({
            organizationHostedEventId,
            selectedFieldIds,
            selectedRentalFieldIds,
            fields,
            activeEventFields: Array.isArray(activeEditingEvent?.fields) ? activeEditingEvent.fields : [],
            immutableFields,
            rentalResourceFields,
        }),
        [
            activeEditingEvent?.fields,
            fields,
            immutableFields,
            organizationHostedEventId,
            rentalResourceFields,
            selectedFieldIds,
            selectedRentalFieldIds,
        ],
    );
    const fieldById = useMemo(() => (
        buildFieldById(fields)
    ), [fields]);
    const hasSelectedRentalResource = useMemo(() => (
        selectedFieldIds.some((fieldId) => {
            if (isRentalBookingSelectorId(fieldId)) {
                return true;
            }
            const field = fieldById.get(normalizeResourceText(fieldId));
            return field ? isRentedResourceForOrganization(field, organizationHostedEventId) : false;
        })
    ), [fieldById, organizationHostedEventId, selectedFieldIds]);
    const selectedRentalLockedSlots = useMemo(() => (
        selectedRentalResourceOptions
            .map((option) => buildRentalBookingTimeSlot(option, slotDivisionKeys, eventData.timeZone))
            .filter((slot): slot is TimeSlot => Boolean(slot))
    ), [eventData.timeZone, selectedRentalResourceOptions, slotDivisionKeys]);
    const selectedFields = useMemo(() => {
        return fields;
    }, [fields]);
    const organizationResourcePool = useMemo(
        () => buildOrganizationResourcePool({
            organizationHostedEventId,
            fields,
            rentalResourceFields,
            rentalResourceSelectorFields,
            selectedFieldIds,
        }),
        [fields, organizationHostedEventId, rentalResourceFields, rentalResourceSelectorFields, selectedFieldIds],
    );
    const eventLocalFields = useMemo(
        () => fields.filter(isEventLocalField),
        [fields],
    );
    const leagueFieldOptions = useMemo(
        () => buildRentalLeagueFieldOptions({ rentalResourceOptions, selectedFields }),
        [rentalResourceOptions, selectedFields],
    );

    const eventOrganizationId = organizationHostedEventId;

    const hasExternalRentalField = useMemo(() => {
        const sourceFields = fields.length ? fields : (activeEditingEvent?.fields ?? []);
        const referencedFieldIds = new Set<string>();
        sourceFields.forEach((field) => {
            if (typeof field?.$id === 'string' && field.$id.trim().length > 0) {
                referencedFieldIds.add(field.$id.trim());
            }
        });
        normalizeFieldIds(activeEditingEvent?.fieldIds).forEach((fieldId) => referencedFieldIds.add(fieldId));
        normalizeFieldIds(eventData.selectedFieldIds).forEach((fieldId) => referencedFieldIds.add(fieldId));
        immutableFields.forEach((field) => {
            if (typeof field?.$id === 'string' && field.$id.trim().length > 0) {
                referencedFieldIds.add(field.$id.trim());
            }
        });
        (activeEditingEvent?.timeSlots ?? []).forEach((slot) => {
            normalizeSlotFieldIds(slot).forEach((fieldId) => referencedFieldIds.add(fieldId));
        });

        return hasExternalRentalFieldForEvent({
            eventOrganizationId,
            sourceFields,
            organizationFieldIds: [
                ...normalizeFieldIds((resolvedOrganization?.fields ?? []).map((field) => field?.$id)),
            ],
            referencedFieldIds: Array.from(referencedFieldIds),
            isEditMode,
        });
    }, [
        activeEditingEvent?.fieldIds,
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        eventData.selectedFieldIds,
        eventOrganizationId,
        fields,
        immutableFields,
        isEditMode,
        resolvedOrganization?.fields,
    ]);
    const restrictLocalFieldCreationForRentalEvent = eventData.eventType === 'EVENT' && (
        hasSelectedRentalResource
        || hasImmutableTimeSlots
        || Boolean(rentalPurchase?.fieldId)
        || (activeEditingEvent?.timeSlots ?? []).some(isRentalLockedTimeSlot)
    );
    const showLocalFieldCreationControls = shouldManageLocalFields && !restrictLocalFieldCreationForRentalEvent;

    useEffect(() => {
        const fallbackFieldId = immutableFields[0]?.$id || (activeEditingEvent?.fields?.[0] as Field | undefined)?.$id;
        const existingLockedSlots = hasExternalRentalField
            ? (activeEditingEvent?.timeSlots ?? [])
                .map((slot) => {
                    if (!slot || slot.rentalLocked !== true) return null;
                    const { event: _ignored, ...rest } = slot as any;
                    const normalized: TimeSlot = {
                        ...rest,
                        sourceType: rest.sourceType ?? 'RENTAL_BOOKING',
                        rentalLocked: true,
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: normalizeSlotFieldIds({
                            scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                            scheduledFieldIds: rest.scheduledFieldIds,
                        }),
                    };
                    return normalized;
                })
                .filter((slot): slot is TimeSlot => Boolean(slot))
            : [];
        const mergedByKey = new Map<string, TimeSlot>();
        [...existingLockedSlots, ...selectedRentalLockedSlots].forEach((slot) => {
            const key = slot.rentalBookingItemId
                || `${slot.rentalBookingId ?? ''}:${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}`
                || slot.$id;
            mergedByKey.set(key, slot);
        });
        const nextSlots = Array.from(mergedByKey.values()).sort((left, right) => {
            const startCompare = String(left.startDate ?? '').localeCompare(String(right.startDate ?? ''));
            if (startCompare !== 0) return startCompare;
            return normalizeSlotFieldIds(left).join('|').localeCompare(normalizeSlotFieldIds(right).join('|'));
        });
        setRentalLockedTimeSlots((previous) => (timeSlotsEqual(previous, nextSlots) ? previous : nextSlots));
    }, [
        activeEditingEvent?.fields,
        activeEditingEvent?.timeSlots,
        hasExternalRentalField,
        immutableFields,
        selectedRentalLockedSlots,
    ]);

    useEffect(() => {
        if (!eventData.singleDivision || hasExternalRentalField) {
            return;
        }
        if (!eventData.splitLeaguePlayoffDivisions) {
            return;
        }
        setValue('splitLeaguePlayoffDivisions', false, { shouldDirty: false, shouldValidate: true });
    }, [eventData.singleDivision, eventData.splitLeaguePlayoffDivisions, hasExternalRentalField, setValue]);

    const fieldsReferencedInSlots = useMemo(
        () => resolveFieldsReferencedInSlots({
            selectedFields,
            immutableFields,
            slots: leagueSlots,
            hasRestrictedImmutableFields,
        }),
        [hasRestrictedImmutableFields, immutableFields, leagueSlots, selectedFields],
    );

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
    useEffect(() => {
        if (!isRentalCreateFlow) {
            return;
        }
        if (eventData.eventType === 'WEEKLY_EVENT') {
            setValue('eventType', 'EVENT', { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, isRentalCreateFlow, setValue]);
    useEffect(() => {
        if (isEditMode || hasExternalRentalField) {
            return;
        }
        if (!supportsNoFixedEndDateTime) {
            return;
        }
        if (!eventData.noFixedEndDateTime) {
            setValue('noFixedEndDateTime', true, { shouldDirty: true, shouldValidate: true });
        }
    }, [eventData.eventType, eventData.parentEvent, hasExternalRentalField, isEditMode, setValue, supportsNoFixedEndDateTime]);

    useEffect(() => {
        if ((eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT') &&
            !eventData.teamSignup) {
            setEventData(prev => {
                if (prev.teamSignup) {
                    return prev;
                }
                return {
                    ...prev,
                    teamSignup: true,
                };
            }, { shouldDirty: false });
        }
    }, [eventData.eventType, eventData.teamSignup, setEventData]);

    useEffect(() => {
        if (eventData.teamSignup) {
            if (!eventData.allowMatchRosterEdits && eventData.allowTemporaryMatchPlayers) {
                setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
            }
            return;
        }
        if (
            eventData.teamCheckInMode !== 'OFF' ||
            eventData.allowMatchRosterEdits ||
            eventData.allowTemporaryMatchPlayers
        ) {
            setValue('teamCheckInMode', 'OFF', { shouldDirty: true, shouldValidate: true });
            setValue('allowMatchRosterEdits', false, { shouldDirty: true, shouldValidate: true });
            setValue('allowTemporaryMatchPlayers', false, { shouldDirty: true, shouldValidate: true });
        }
    }, [
        eventData.allowMatchRosterEdits,
        eventData.allowTemporaryMatchPlayers,
        eventData.teamCheckInMode,
        eventData.teamSignup,
        setValue,
    ]);

    

    // Prevents the creator from joining twice when they toggle team-based registration on.
    useEffect(() => {
        if (eventData.teamSignup && joinAsParticipant) {
            setJoinAsParticipant(false);
        }
    }, [eventData.teamSignup, joinAsParticipant, setJoinAsParticipant]);

    // Populate human-readable location if empty
    // Converts coordinates into a city/state label when the user hasn't typed an address manually.
    useEffect(() => {
        const lat = getLatitudeFromCoordinates(eventData.coordinates);
        const lng = getLongitudeFromCoordinates(eventData.coordinates);
        const hasCoords = coordinatesAreSet(eventData.coordinates);

        if (!isEditMode && eventData.location.trim().length === 0 && hasCoords && typeof lat === 'number' && typeof lng === 'number') {
            locationService.reverseGeocode(lat, lng)
                .then(info => {
                    const label = [info.city, info.state].filter(Boolean).join(', ')
                        || `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}`;
                    setEventData(prev => ({ ...prev, location: label }));
                })
                .catch(() => { /* ignore */ });
        }
    }, [isEditMode, eventData.location, eventData.coordinates, setEventData]);

    const leagueWarning = buildLeagueScheduleWarning({
        hasPendingExternalConflictChecks,
        hasExternalSlotConflictWarnings,
    });

    const leagueError = buildLeagueScheduleError(errors.leagueSlots);

    // Launches the Stripe onboarding flow before allowing event owners to set paid pricing.
    const handleConnectStripe = async () => {
        if (!currentUser) return;
        if (typeof window === 'undefined') return;
        try {
            setConnectingStripe(true);
            const origin = resolveClientPublicOrigin();
            if (!origin) {
                console.error('Unable to determine public URL for Stripe onboarding.');
                return;
            }
            const refreshUrl = `${origin}/discover?stripe=refresh`;
            const returnUrl = `${origin}/discover?stripe=return`;
            const result = await paymentService.connectStripeAccount({
                user: currentUser,
                refreshUrl,
                returnUrl,
            });
            if (result?.onboardingUrl) {
                window.location.href = result.onboardingUrl;
            }
        } catch (error) {
            if (isStripeConnectMfaRequiredError(error)) {
                window.location.href = error.mfaSetupPath;
                return;
            }
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    };

    // Builds the event payload used for draft updates.
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
        pricingControlsEnabled,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        joinAsParticipant,
        organizationHostedEventId,
        organizationOfficialsById,
        rentalLockedSlotsForDraft,
        rentalPurchase,
        resolvedOrganization,
        selectedRentedFieldIds,
        shouldManageLocalFields,
        shouldProvisionFields,
        sportsById,
    ]);
    buildDraftForDirtyTrackingRef.current = buildDraftEvent;

    useEffect(() => {
        if (!open || !pendingInitialDirtyRebaseRef.current || sportsLoading || fieldsLoading) {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
            return;
        }

        const expectedDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
        if (pendingInitialDirtyRebaseTimeoutRef.current) {
            clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
        }

        // Rebase only after normalization effects stop mutating draft-backed values.
        pendingInitialDirtyRebaseTimeoutRef.current = setTimeout(() => {
            pendingInitialDirtyRebaseTimeoutRef.current = null;
            if (!pendingInitialDirtyRebaseRef.current) {
                return;
            }

            const latestDraftFingerprint = JSON.stringify(buildDraftEvent(getValues()));
            if (latestDraftFingerprint !== expectedDraftFingerprint) {
                return;
            }

            const stabilizedValues = getValues();
            dirtyBaselineValuesRef.current = stabilizedValues;
            pendingInitialDirtyRebaseRef.current = false;
            reset(stabilizedValues);
            setIsDirtyTrackingReady(true);
            onDirtyStateChange?.(false);
        }, 0);

        return () => {
            if (pendingInitialDirtyRebaseTimeoutRef.current) {
                clearTimeout(pendingInitialDirtyRebaseTimeoutRef.current);
                pendingInitialDirtyRebaseTimeoutRef.current = null;
            }
        };
    }, [
        buildDraftEvent,
        fieldsLoading,
        formValues,
        getValues,
        onDirtyStateChange,
        open,
        reset,
        sportsLoading,
    ]);

    const getDraftSnapshot = useCallback(
        () => buildDraftEvent(getValues()),
        [buildDraftEvent, getValues],
    );
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
            lastValidationErrorsRef.current = [
                {
                    path: 'officialSchedulingMode',
                    message: officialStaffingCoverageError,
                },
            ];
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
        eventData.eventType,
        eventData.officialSchedulingMode,
        eventData.parentEvent,
        errors,
        eventValidationSchema,
        getValues,
        isAffiliateEvent,
        officialStaffingCoverageError,
        requiredOfficialSlotsPerMatch,
        trigger,
    ]);

    const commitDirtyBaseline = useCallback(() => {
        const currentValues = getValues();
        dirtyBaselineValuesRef.current = currentValues;
        reset(currentValues);
        onDirtyStateChange?.(false);
    }, [getValues, onDirtyStateChange, reset]);

    const validatePendingStaffAssignmentsForSubmit = useCallback(async () => {
        if (isAffiliateEvent) {
            return;
        }
        await validatePendingStaffAssignments();
    }, [isAffiliateEvent, validatePendingStaffAssignments]);

    const submitPendingStaffInvitesForSubmit = useCallback(async (eventId: string) => {
        if (isAffiliateEvent) {
            return;
        }
        await submitPendingStaffInvites(eventId);
    }, [isAffiliateEvent, submitPendingStaffInvites]);

    useImperativeHandle(
        ref,
        () => ({
            getDraft: getDraftSnapshot,
            getRegistrationQuestionDrafts,
            validate: validateDraft,
            getValidationErrors: () => lastValidationErrorsRef.current,
            validatePendingStaffAssignments: validatePendingStaffAssignmentsForSubmit,
            commitDirtyBaseline,
            submitPendingStaffInvites: submitPendingStaffInvitesForSubmit,
        }),
        [commitDirtyBaseline, getDraftSnapshot, getRegistrationQuestionDrafts, submitPendingStaffInvitesForSubmit, validateDraft, validatePendingStaffAssignmentsForSubmit],
    );

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
    const usesRentalSlots = hasExternalRentalField || hasImmutableTimeSlots || Boolean(rentalPurchase?.fieldId);
    const showScheduleConfig = !isAffiliateEvent && (isSchedulableEventType || usesRentalSlots || isWeeklyChildEvent);
    const resourceSelectorLoading = fieldsLoading || rentalResourcesLoading;
    const showOrganizationFieldsInEventDetails = shouldShowOrganizationFieldsInEventDetails({
        isOrganizationHostedEvent,
        hasRentalResourceOptions: rentalResourceOptions.length > 0,
        supportsOrganizationFieldSelection,
    });
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
    const manualPaymentsEnabled = eventData.registrationPaymentMode === 'MANUAL';
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

    const manualPaymentLinks = Array.isArray(eventData.manualPaymentLinks)
        ? eventData.manualPaymentLinks
        : [];
    const setManualPaymentLinkValue = (
        index: number,
        field: 'provider' | 'label' | 'url',
        value: string,
    ) => {
        const nextLinks = [...manualPaymentLinks];
        const current = nextLinks[index];
        if (!current) return;
        nextLinks[index] = {
            ...current,
            [field]: field === 'provider' ? normalizeManualPaymentProvider(value) : value,
        };
        setValue('manualPaymentLinks', nextLinks, { shouldDirty: true, shouldValidate: true });
    };
    const addManualPaymentLink = () => {
        setValue('manualPaymentLinks', [
            ...manualPaymentLinks,
            {
                id: createClientId(),
                provider: 'VENMO',
                label: 'Venmo',
                url: '',
            },
        ], { shouldDirty: true, shouldValidate: true });
    };
    const removeManualPaymentLink = (index: number) => {
        setValue(
            'manualPaymentLinks',
            manualPaymentLinks.filter((_, linkIndex) => linkIndex !== index),
            { shouldDirty: true, shouldValidate: true },
        );
    };
    const handleManualPaymentsChange = useCallback((checked: boolean) => {
        setValue('registrationPaymentMode', checked ? 'MANUAL' : 'ONLINE', { shouldDirty: true, shouldValidate: true });
        if (checked) {
            setValue('cancellationRefundHours', null, { shouldDirty: true, shouldValidate: true });
            expandSection('section-manual-payments');
            return;
        }
        setValue('manualPaymentLinks', [], { shouldDirty: true, shouldValidate: true });
        setValue('manualPaymentInstructions', '', { shouldDirty: true, shouldValidate: true });
    }, [expandSection, setValue]);

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
