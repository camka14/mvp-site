import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { Controller, useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';

import { eventService } from '@/lib/eventService';
import TournamentFields from '@/app/discover/components/TournamentFields';
import { getEventImageUrl, Event, UserData, Team, LeagueConfig, Field, TimeSlot, Organization, LeagueScoringConfig, MatchRulesConfig, Sport, TournamentConfig, StaffMemberType, EventOfficial, EventOfficialPosition, RegistrationQuestionDraft } from '@/types';
import { useSports } from '@/app/hooks/useSports';

import { TextInput, Textarea, NumberInput, Select as MantineSelect, Switch, Checkbox, Group, Button, Alert, Loader, Paper, Text, Title, Stack, SimpleGrid, Collapse, Badge } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { paymentService } from '@/lib/paymentService';
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
import LeagueFields, { LeagueSlotForm } from '@/app/discover/components/LeagueFields';
import {
    resolveOrganizationEventFieldIds,
} from './eventFieldSelection';
import { applyLeagueScoringConfigFieldChange } from './leagueScoringConfigForm';
import { resolveDraftSportForScoring } from './eventDraftSport';
import { resolveTournamentSetMode } from './tournamentSetMode';
import { applyEventDefaultsToDivisionDetails } from './divisionDefaults';
import { mergeSlotPayloadsForForm } from './slotPayloadMerge';
import { getFieldOrganizationId, hasExternalRentalFieldForEvent } from './externalRentalField';
import {
    hasParentEventRef,
    isTournamentPoolPlayFormEnabled,
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
import CentsInput from '@/components/ui/CentsInput';
import PriceWithFeesPreview from '@/components/ui/PriceWithFeesPreview';
import {
    buildDivisionName,
    buildDivisionToken,
    buildEventDivisionId,
    getDivisionTypeById,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import {
    getRequiredSignerTypeLabel,
} from '@/lib/templateSignerTypes';
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
    buildCompositeDivisionTypeId,
    buildDefaultDivisionDetailsForSport,
    buildSlotDivisionLookup,
    buildUniqueDivisionIdForToken,
    DIVISION_GENDER_OPTIONS,
    type DivisionDetailForm,
    type DivisionEditorKind,
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
    normalizeDirtyTrackedPendingStaffInvites,
} from './eventForm/dirtyDraft';
import {
    buildOfficialStaffingCoverageError,
    buildOfficialPositionsFromTemplates,
    countAssignedActiveOfficialsForStaffing,
    countRequiredOfficialSlotsPerMatch,
    getEventOfficialUserIds,
    normalizeEventOfficialPositions,
    normalizeEventOfficials,
    normalizeOfficialSchedulingMode,
    normalizeSportOfficialPositionTemplates,
} from './eventForm/officials';
import {
    fieldsEqual,
    isEventLocalField,
    isGeneratedLocalFieldPlaceholder,
    isRentedResourceForOrganization,
    isSelectableOrganizationResource,
    mergeFieldsById,
    toFieldIdList,
} from './eventForm/resourceGroups';
import {
    buildRentalBookingTimeSlot,
    isRentalBookingSelectorId,
    isRentalLockedTimeSlot,
    mergeRentalLockedTimeSlots,
    type RentalBookingResourceOption,
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
import { buildEventFormDefaultValues } from './eventForm/defaultValues';
import { applyImmutableEventDefaults } from './eventForm/immutableDefaults';
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
    CONFLICT_LOOKUP_END,
    CONFLICT_LOOKUP_START,
    normalizeSlotBoundaryOverrideForForm,
    slotCanCheckExternalConflicts,
    snapshotToSlotForm,
    type SlotConflictContext,
    type SlotConflictPayload,
    type SlotConflictSnapshot,
} from './eventForm/slotConflictHelpers';
import {
    type AssignedStaffCard,
    buildAssignedStaffUserIds,
    buildAssignedHostCards,
    buildAssignedOfficialCards,
    buildAssignedUserIdsByRole,
    buildAssignedUserIdSetsByRole,
    buildCurrentEventStaffInvites,
    buildExistingAssignedStaffUserIds,
    buildOrganizationStaffAssignmentIds,
    buildOrganizationStaffRosterEntries,
    buildStaffInviteByUserId,
    buildStaffInviteSubmissionPayload,
    createEmptyStaffInvite,
    filterOrganizationStaffRosterEntries,
    formatStaffRoleLabel,
    getUserEmail,
    mapInviteStaffTypeToRole,
    normalizeInviteEmail,
    normalizePendingStaffInvite,
    type PendingStaffInvite,
    type StaffAssignmentRole,
    type StaffRosterEntry,
    type StaffRosterStatus,
    userMatchesSearch,
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
    DIVISION_LAYOUT_TRANSITION,
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
    formatMobileEditUnsupportedReasons,
    hasMobileBlockingPaymentPlanConfig,
    normalizeInstallmentAmounts,
    normalizeInstallmentRelativeDays,
    sumInstallmentAmounts,
} from './eventForm/paymentPlanHelpers';
import { sanitizeMatchRulesOverrideForEditor } from './eventForm/matchRulesHelpers';
import {
    parseDateValue,
} from './eventForm/dateHelpers';
import { AnimatedLayoutSection, AnimatedSection } from './eventForm/components/AnimatedSection';
import { SectionNavigation } from './eventForm/components/SectionNavigation';
import { BasicInformationSection } from './eventForm/sections/BasicInformationSection';
import { DivisionEditorActionsAndErrors } from './eventForm/sections/DivisionEditorActionsAndErrors';
import { DivisionEditorCoreControls } from './eventForm/sections/DivisionEditorCoreControls';
import { DivisionEditorLeagueConfigControls } from './eventForm/sections/DivisionEditorLeagueConfigControls';
import { DivisionEditorPaymentPlanControls } from './eventForm/sections/DivisionEditorPaymentPlanControls';
import { DivisionEditorPlayoffDivisionControls } from './eventForm/sections/DivisionEditorPlayoffDivisionControls';
import { DivisionEditorPlayoffPlacementControls } from './eventForm/sections/DivisionEditorPlayoffPlacementControls';
import { DivisionEditorTournamentConfigControls } from './eventForm/sections/DivisionEditorTournamentConfigControls';
import { DivisionEditorTournamentPoolControls } from './eventForm/sections/DivisionEditorTournamentPoolControls';
import { DivisionModeControls } from './eventForm/sections/DivisionModeControls';
import { DivisionSettingsSection } from './eventForm/sections/DivisionSettingsSection';
import { DivisionSummaryList } from './eventForm/sections/DivisionSummaryList';
import { useEventFormSectionNavigation } from './eventForm/hooks/useEventFormSectionNavigation';
import { useOrganizationFieldHydration } from './eventForm/hooks/useOrganizationFieldHydration';
import { useRegistrationQuestionDrafts } from './eventForm/hooks/useRegistrationQuestionDrafts';
import { useRentalBookingResources } from './eventForm/hooks/useRentalBookingResources';
import { useTemplateDocuments } from './eventForm/hooks/useTemplateDocuments';
import { EventDetailsLocationControls } from './eventForm/sections/EventDetailsLocationControls';
import { EventDetailsResourceControls } from './eventForm/sections/EventDetailsResourceControls';
import { EventDetailsSection } from './eventForm/sections/EventDetailsSection';
import { EventDetailsTimingControls } from './eventForm/sections/EventDetailsTimingControls';
import { EventDetailsTypeControls } from './eventForm/sections/EventDetailsTypeControls';
import { LeagueScoringConfigSection } from './eventForm/sections/LeagueScoringConfigSection';
import { MatchRulesConfigSection } from './eventForm/sections/MatchRulesConfigSection';
import { RegistrationQuestionsSection } from './eventForm/sections/RegistrationQuestionsSection';
import { ScheduleConfigBody } from './eventForm/sections/ScheduleConfigBody';
import { ScheduleConfigSection } from './eventForm/sections/ScheduleConfigSection';
import { SingleDivisionPaymentPlanControls } from './eventForm/sections/SingleDivisionPaymentPlanControls';
import { SingleDivisionPoolControls } from './eventForm/sections/SingleDivisionPoolControls';
import { SingleDivisionPricingControls } from './eventForm/sections/SingleDivisionPricingControls';
import { StaffAssignedHostsList } from './eventForm/sections/StaffAssignedHostsList';
import { StaffAssignedOfficialsList } from './eventForm/sections/StaffAssignedOfficialsList';
import { StaffNonOrganizationInvitePanel } from './eventForm/sections/StaffNonOrganizationInvitePanel';
import { StaffSection } from './eventForm/sections/StaffSection';
import { StaffOrganizationRosterPicker } from './eventForm/sections/StaffOrganizationRosterPicker';
import { StaffOfficialPositionEditor } from './eventForm/sections/StaffOfficialPositionEditor';

// UI state will track divisions as string[] of skill keys (e.g., 'beginner')

interface EventFormProps {
    isOpen?: boolean;
    onClose?: () => void;
    currentUser: UserData;
    event: Event;
    organization: Organization | null;
    immutableDefaults?: Partial<Event>;
    formId?: string;
    defaultLocation?: DefaultLocation;
    isCreateMode?: boolean;
    rentalPurchase?: RentalPurchaseContext;
    templateOrganizationId?: string;
    onDirtyStateChange?: (hasChanges: boolean) => void;
    onDraftStateChange?: (state: {
        draft: Partial<Event>;
        baselineDraft: Partial<Event>;
    }) => void;
}

export type EventFormHandle = {
    getDraft: () => Partial<Event>;
    getRegistrationQuestionDrafts: () => RegistrationQuestionDraft[];
    validate: () => Promise<boolean>;
    getValidationErrors: () => Array<{ path: string; message: string }>;
    validatePendingStaffAssignments: () => Promise<void>;
    commitDirtyBaseline: () => void;
    submitPendingStaffInvites: (eventId: string) => Promise<void>;
};

type RentalPurchaseContext = {
    start: string;
    end: string;
    fieldId?: string;
    organization?: Organization | null;
    organizationEmail?: string | null;
    priceCents?: number;
    requiredTemplateIds?: string[];
};

type EventType = Event['eventType'];

type DefaultLocation = {
    location?: string;
    address?: string;
    coordinates?: [number, number];
};

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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_PRICE_NUMBER = 9_999_999;
const MAX_PRICE_CENTS = MAX_PRICE_NUMBER * 100;
const SECTION_SCROLL_OFFSET = 80;
const SECTION_COLLAPSE_DEFAULTS: Record<string, boolean> = {
    'section-basic-information': false,
    'section-event-details': true,
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
const maybeExtendVisibleCountOnScroll = (
    event: React.UIEvent<HTMLDivElement>,
    total: number,
    setVisibleCount: React.Dispatch<React.SetStateAction<number>>,
) => {
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining > 24) {
        return;
    }
    setVisibleCount((prev) => (
        prev >= total ? prev : Math.min(prev + 5, total)
    ));
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
    const sportOptions = useMemo(() => sports.map((sport) => ({ value: sport.$id, label: sport.name })), [sports]);

    const immutableDefaultsMemo = useMemo(() => immutableDefaults ?? {}, [immutableDefaults]);

    useEffect(() => {
        setHydratedOrganization(organization ?? null);
    }, [organization]);

    const immutableFields = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.fields)) {
            return [] as Field[];
        }
        return sanitizeFieldsForForm(
            (immutableDefaultsMemo.fields as Field[]).filter((field): field is Field => Boolean(field && field.$id))
        );
    }, [immutableDefaultsMemo.fields]);

    const hasImmutableFields = immutableFields.length > 0;

    const immutableTimeSlotsFromDefaults = useMemo(() => {
        if (!Array.isArray(immutableDefaultsMemo.timeSlots)) {
            return [] as TimeSlot[];
        }
        const fallbackFieldId = immutableFields[0]?.$id;
        return (immutableDefaultsMemo.timeSlots as TimeSlot[])
            .map((slot) => {
                if (!slot) {
                    return null;
                }
                const { event: _ignoredEvent, ...rest } = slot;
                const normalized: TimeSlot = {
                    ...rest,
                    scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                    scheduledFieldIds: normalizeSlotFieldIds({
                        scheduledFieldId: rest.scheduledFieldId ?? fallbackFieldId,
                        scheduledFieldIds: rest.scheduledFieldIds,
                    }),
                };
                return normalized;
            })
            .filter((slot): slot is TimeSlot => Boolean(slot));
    }, [immutableDefaultsMemo.timeSlots, immutableFields]);

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
    const [rentalLockedTimeSlots, setRentalLockedTimeSlots] = useState<TimeSlot[]>([]);
    const eventSupportsScheduleSlots = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
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
    const automaticRefundsAvailable = useMemo(() => {
        if (!hasStripeAccount) {
            return false;
        }
        if (eventData.singleDivision) {
            return Math.max(0, Number(eventData.price) || 0) > 0;
        }
        const details = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        return details.some((detail) => Math.max(0, Number(detail.price) || 0) > 0);
    }, [
        eventData.divisionDetails,
        eventData.price,
        eventData.singleDivision,
        hasStripeAccount,
    ]);
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
        () => (
            Array.isArray(resolvedOrganization?.fields)
                ? resolvedOrganization.fields
                    .map((field) => {
                        const fieldId = normalizeEntityId((field as Field | undefined)?.$id) ?? '';
                        const fieldCreatedAt = String((field as Field | undefined)?.$createdAt ?? (field as Field | undefined)?.createdAt ?? '').trim();
                        const fieldName = String((field as Field | undefined)?.name ?? '').trim();
                        return `${fieldId}:${fieldCreatedAt}:${fieldName}`;
                    })
                    .sort()
                    .join('|')
                : ''
        ),
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
        if (!isCreateMode || hasStripeAccount) {
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
        hasStripeAccount,
        isCreateMode,
        setValue,
    ]);

    const templateOptions = useMemo(
        () => templateDocuments.map((template) => {
            const templateType = template.type ?? 'PDF';
            const signerLabel = getRequiredSignerTypeLabel(template.requiredSignerType);
            return {
                value: template.$id,
                label: `${template.title || 'Untitled Template'} (${templateType}, ${signerLabel})`,
            };
        }),
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

    const syncDivisionInstallmentCount = useCallback((count: number) => {
        setDivisionEditor((prev) => {
            const safeCount = Math.max(1, Math.floor(Number(count) || 0));
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            const price = Math.max(0, Number(prev.price) || 0);
            const fallbackDueDate = eventData.start;
            const useRelativeDueDates = eventData.eventType === 'WEEKLY_EVENT' && !eventData.parentEvent;

            while (amounts.length < safeCount) {
                amounts.push(amounts.length === 0 ? price : 0);
                dueDates.push(fallbackDueDate);
                relativeDueDays.push(0);
            }
            while (amounts.length > safeCount) {
                amounts.pop();
                dueDates.pop();
                relativeDueDays.pop();
            }

            return {
                ...prev,
                installmentCount: safeCount,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: useRelativeDueDates ? [] : dueDates,
                installmentDueRelativeDays: useRelativeDueDates ? relativeDueDays : [],
                error: null,
            };
        });
    }, [eventData.eventType, eventData.parentEvent, eventData.start]);

    const setDivisionInstallmentAmount = useCallback((index: number, value: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts[index] = normalizePriceCents(value);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueDate = useCallback((index: number, value: Date | string | null) => {
        setDivisionEditor((prev) => {
            const dueDates = [...(prev.installmentDueDates || [])];
            if (index < 0 || index >= dueDates.length) {
                return prev;
            }
            if (value instanceof Date) {
                dueDates[index] = value.toISOString();
            } else if (typeof value === 'string') {
                dueDates[index] = value;
            } else {
                dueDates[index] = '';
            }
            return {
                ...prev,
                installmentDueDates: dueDates,
                error: null,
            };
        });
    }, []);

    const setDivisionInstallmentDueRelativeDay = useCallback((index: number, value: number | string) => {
        setDivisionEditor((prev) => {
            const amounts = prev.installmentAmounts || [];
            if (index < 0 || index >= amounts.length) {
                return prev;
            }
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            while (relativeDueDays.length < amounts.length) {
                relativeDueDays.push(0);
            }
            const parsed = typeof value === 'number' ? value : Number(value);
            relativeDueDays[index] = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
            return {
                ...prev,
                installmentDueRelativeDays: relativeDueDays,
                installmentDueDates: [],
                error: null,
            };
        });
    }, []);

    const removeDivisionInstallment = useCallback((index: number) => {
        setDivisionEditor((prev) => {
            const amounts = [...(prev.installmentAmounts || [])];
            const dueDates = [...(prev.installmentDueDates || [])];
            const relativeDueDays = [...(prev.installmentDueRelativeDays || [])];
            if (amounts.length <= 1 || index < 0 || index >= amounts.length) {
                return prev;
            }
            amounts.splice(index, 1);
            dueDates.splice(index, 1);
            relativeDueDays.splice(index, 1);
            return {
                ...prev,
                installmentAmounts: amounts,
                price: prev.allowPaymentPlans ? sumInstallmentAmounts(amounts) : prev.price,
                installmentDueDates: dueDates,
                installmentDueRelativeDays: relativeDueDays,
                installmentCount: amounts.length,
                error: null,
            };
        });
    }, []);

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

    const [assistantHostUsers, setAssistantHostUsers] = useState<UserData[]>([]);
    const [staffInviteError, setStaffInviteError] = useState<string | null>(null);
    const [organizationStaffSearch, setOrganizationStaffSearch] = useState('');
    const [organizationStaffTypeFilter, setOrganizationStaffTypeFilter] = useState<'all' | StaffMemberType>('all');
    const [organizationStaffStatusFilter, setOrganizationStaffStatusFilter] = useState<'all' | StaffRosterStatus>('all');
    const [nonOrgStaffSearch, setNonOrgStaffSearch] = useState('');
    const [nonOrgStaffResults, setNonOrgStaffResults] = useState<UserData[]>([]);
    const [nonOrgStaffSearchLoading, setNonOrgStaffSearchLoading] = useState(false);
    const [nonOrgStaffError, setNonOrgStaffError] = useState<string | null>(null);
    const [newStaffInvite, setNewStaffInvite] = useState<PendingStaffInvite>(createEmptyStaffInvite());
    const [organizationStaffVisibleCount, setOrganizationStaffVisibleCount] = useState(5);
    const [officialCardVisibleCount, setOfficialCardVisibleCount] = useState(5);
    const [hostCardVisibleCount, setHostCardVisibleCount] = useState(5);

    const organizationHostedEventId = (
        resolvedOrganization?.$id
        || eventData.organizationId
        || (activeEditingEvent?.organization as Organization | undefined)?.$id
        || activeEditingEvent?.organizationId
        || ''
    );
    const isOrganizationHostedEvent = organizationHostedEventId.length > 0;
    const supportsOrganizationFieldSelection = supportsOrganizationFieldSelectionForEvent(
        eventData.eventType,
        eventData.parentEvent,
    );
    const shouldLoadRentalResources = supportsOrganizationFieldSelection || eventSupportsScheduleSlots;
    const shouldManageLocalFields = !hasRestrictedImmutableFields && supportsFieldCountForEvent(eventData.eventType);
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
    const organizationStaffAssignmentIds = useMemo(
        () => buildOrganizationStaffAssignmentIds(resolvedOrganization),
        [resolvedOrganization],
    );
    const organizationAllowedHostIds = useMemo(
        () => organizationStaffAssignmentIds.hostUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedHostIdSet = useMemo(
        () => new Set(organizationAllowedHostIds),
        [organizationAllowedHostIds],
    );
    const organizationAllowedOfficialIds = useMemo(
        () => organizationStaffAssignmentIds.officialUserIds,
        [organizationStaffAssignmentIds],
    );
    const organizationAllowedOfficialIdSet = useMemo(
        () => new Set(organizationAllowedOfficialIds),
        [organizationAllowedOfficialIds],
    );
    const organizationUsersById = useMemo(() => {
        const map = new Map<string, Partial<UserData>>();
        const addUser = (candidate?: UserData | null) => {
            if (candidate?.$id) {
                map.set(candidate.$id, candidate);
            }
        };
        addUser(resolvedOrganization?.owner);
        (resolvedOrganization?.hosts || []).forEach((host) => addUser(host));
        addUser(currentUser);
        return map;
    }, [currentUser, resolvedOrganization?.hosts, resolvedOrganization?.owner]);
    const organizationOfficialsById = useMemo(() => {
        const map = new Map<string, UserData>();
        (resolvedOrganization?.officials || []).forEach((official) => {
            if (official?.$id && organizationAllowedOfficialIdSet.has(official.$id)) {
                map.set(official.$id, official);
            }
        });
        (eventData.officials || []).forEach((official) => {
            if (!official?.$id) {
                return;
            }
            if (!organizationAllowedOfficialIdSet.has(official.$id)) {
                return;
            }
            if (!map.has(official.$id)) {
                map.set(official.$id, official);
            }
        });
        return map;
    }, [eventData.officials, resolvedOrganization?.officials, organizationAllowedOfficialIdSet]);
    const assistantHostValue = useMemo(
        () => Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== eventData.hostId),
            ),
        ),
        [eventData.assistantHostIds, eventData.hostId],
    );
    const hostStaffUserIds = useMemo(
        () => Array.from(
            new Set(
                [
                    normalizeEntityId(eventData.hostId),
                    ...assistantHostValue,
                ].filter((id): id is string => Boolean(id)),
            ),
        ),
        [assistantHostValue, eventData.hostId],
    );
    const assistantHostUsersById = useMemo(() => {
        const map = new Map<string, UserData>();
        assistantHostUsers.forEach((userEntry) => {
            if (userEntry?.$id) {
                map.set(userEntry.$id, userEntry);
            }
        });
        return map;
    }, [assistantHostUsers]);
    const currentEventStaffInvites = useMemo(
        () => buildCurrentEventStaffInvites({
            activeStaffInvites: activeEditingEvent?.staffInvites,
            incomingStaffInvites: incomingEvent?.staffInvites,
            eventId: activeEditingEvent?.$id ?? incomingEvent?.$id,
        }),
        [activeEditingEvent?.$id, activeEditingEvent?.staffInvites, incomingEvent?.$id, incomingEvent?.staffInvites],
    );
    const currentEventStaffInviteByUserId = useMemo(
        () => buildStaffInviteByUserId(currentEventStaffInvites),
        [currentEventStaffInvites],
    );
    const existingAssignedStaffUserIds = useMemo(() => {
        const source = activeEditingEvent ?? incomingEvent;
        return buildExistingAssignedStaffUserIds({
            preferredOfficialIds: getEventOfficialUserIds(source?.eventOfficials),
            fallbackOfficialIds: source?.officialIds,
            assistantHostIds: source?.assistantHostIds,
        });
    }, [activeEditingEvent, incomingEvent]);
    const organizationStaffRosterEntries = useMemo<StaffRosterEntry[]>(
        () => buildOrganizationStaffRosterEntries(resolvedOrganization),
        [resolvedOrganization],
    );
    const filteredOrganizationStaffEntries = useMemo(
        () => filterOrganizationStaffRosterEntries(organizationStaffRosterEntries, {
            search: organizationStaffSearch,
            statusFilter: organizationStaffStatusFilter,
            typeFilter: organizationStaffTypeFilter,
        }),
        [
            organizationStaffRosterEntries,
            organizationStaffSearch,
            organizationStaffStatusFilter,
            organizationStaffTypeFilter,
        ],
    );
    useEffect(() => {
        if (!isOrganizationHostedEvent) {
            return;
        }
        const sanitized = sanitizeOrganizationEventAssignments(
            {
                hostId: eventData.hostId,
                assistantHostIds: eventData.assistantHostIds || [],
                officialIds: [],
            },
            {
                ownerId: resolvedOrganization?.ownerId,
                staffMembers: resolvedOrganization?.staffMembers,
                staffInvites: resolvedOrganization?.staffInvites,
            },
        );
        const normalizedCurrentHostId = normalizeEntityId(eventData.hostId) ?? null;
        const normalizedCurrentAssistantHostIds = Array.from(
            new Set(
                (eventData.assistantHostIds || [])
                    .map((id) => normalizeEntityId(id))
                    .filter((id): id is string => Boolean(id) && id !== normalizedCurrentHostId),
            ),
        );
        const nextHostId = sanitized.hostId;
        if (
            normalizedCurrentHostId === nextHostId
            && stringArraysEqual(normalizedCurrentAssistantHostIds, sanitized.assistantHostIds)
        ) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: nextHostId ?? prev.hostId,
            assistantHostIds: sanitized.assistantHostIds,
        }), { shouldDirty: false });
    }, [
        eventData.assistantHostIds,
        eventData.hostId,
        isOrganizationHostedEvent,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.staffInvites,
        resolvedOrganization?.staffMembers,
        setEventData,
    ]);
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
        setEventData((prev) => ({
            ...prev,
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
        if (!hostStaffUserIds.length) {
            setAssistantHostUsers((prev) => (prev.length > 0 ? [] : prev));
            return;
        }
        const knownIds = new Set([
            ...assistantHostUsers.map((userEntry) => userEntry.$id).filter(Boolean),
            ...organizationUsersById.keys(),
        ]);
        const missingIds = hostStaffUserIds.filter((id) => !knownIds.has(id));
        if (!missingIds.length) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const fetched = await userService.getUsersByIds(missingIds);
                if (cancelled || !fetched.length) {
                    return;
                }
                setAssistantHostUsers((prev) => {
                    const byId = new Map(prev.map((entry) => [entry.$id, entry]));
                    fetched.forEach((entry) => {
                        if (entry?.$id) {
                            byId.set(entry.$id, entry);
                        }
                    });
                    return hostStaffUserIds
                        .map((id) => byId.get(id))
                        .filter((entry): entry is UserData => Boolean(entry));
                });
            } catch (error) {
                console.warn('Failed to hydrate host staff for event:', error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assistantHostUsers, hostStaffUserIds, organizationUsersById]);
    useEffect(() => {
        if (isOrganizationHostedEvent) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        const query = nonOrgStaffSearch.trim();
        if (query.length < 2) {
            setNonOrgStaffResults([]);
            setNonOrgStaffError(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setNonOrgStaffSearchLoading(true);
                setNonOrgStaffError(null);
                const results = await userService.searchUsers(query);
                if (!cancelled) {
                    setNonOrgStaffResults(results.filter((candidate) => Boolean(candidate?.$id)));
                }
            } catch (error) {
                console.error('Failed to search staff:', error);
                if (!cancelled) {
                    setNonOrgStaffError('Failed to search staff. Try again.');
                }
            } finally {
                if (!cancelled) {
                    setNonOrgStaffSearchLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOrganizationHostedEvent, nonOrgStaffSearch]);
    const handleHostChange = useCallback((value: string | null) => {
        if (!value) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(value)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            hostId: value,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== value),
        }));
    }, [isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);
    const cacheAssistantHostUser = useCallback((assistantHost?: UserData | null) => {
        if (!assistantHost?.$id) {
            return;
        }
        setAssistantHostUsers((prev) => {
            if (prev.some((candidate) => candidate.$id === assistantHost.$id)) {
                return prev;
            }
            return [...prev, assistantHost];
        });
    }, []);
    const handleAddAssistantHost = useCallback((assistantHost: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const assistantHostId = normalizeEntityId(assistantHost.$id ?? assistantHost.userId);
        if (!assistantHostId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedHostIdSet.has(assistantHostId)) {
            return;
        }
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: Array.from(
                new Set(
                    [...(prev.assistantHostIds || []), assistantHostId]
                        .map((id) => String(id).trim())
                        .filter((id) => id.length > 0 && id !== prev.hostId),
                ),
            ),
        }));
        cacheAssistantHostUser(assistantHost.$id ? (assistantHost as UserData) : null);
    }, [cacheAssistantHostUser, isOrganizationHostedEvent, organizationAllowedHostIdSet, setEventData]);
    const handleRemoveAssistantHost = useCallback((assistantHostId: string) => {
        setEventData((prev) => ({
            ...prev,
            assistantHostIds: (prev.assistantHostIds || []).filter((id) => id !== assistantHostId),
        }));
    }, [setEventData]);
    const fieldCountOptions = useMemo(
        () => {
            const start = isOrganizationHostedEvent ? 0 : 1;
            return Array.from({ length: 13 - start }, (_, idx) => {
                const value = start + idx;
                return { value: String(value), label: String(value) };
            });
        },
        [isOrganizationHostedEvent],
    );
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
    const slotConflictCheckKey = useMemo(() => JSON.stringify({
        eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
        eventType: eventData.eventType,
        parentEvent: eventData.parentEvent ?? null,
        eventStart: eventData.start ?? undefined,
        eventEnd: eventData.end ?? undefined,
        slots: leagueSlots.map((slot) => {
            const normalizedDays = normalizeWeekdays(slot);
            const normalizedFieldIds = normalizeSlotFieldIds(slot);
            return {
                key: slot.key,
                $id: slot.$id,
                scheduledFieldId: normalizedFieldIds[0],
                scheduledFieldIds: normalizedFieldIds,
                dayOfWeek: normalizedDays[0],
                daysOfWeek: normalizedDays,
                divisions: normalizeDivisionKeys(slot.divisions),
                startDate: formatLocalDateTime(slot.startDate ?? null) || undefined,
                endDate: formatLocalDateTime(slot.endDate ?? null) || undefined,
                startTimeMinutes: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : undefined,
                endTimeMinutes: typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : undefined,
                repeating: slot.repeating !== false,
            } satisfies SlotConflictSnapshot;
        }),
    } satisfies SlotConflictPayload), [
        activeEditingEvent?.$id,
        eventData.$id,
        eventData.end,
        eventData.eventType,
        eventData.parentEvent,
        eventData.start,
        leagueSlots,
    ]);
    const slotConflictContext = useMemo<SlotConflictContext>(() => ({
        eventId: activeEditingEvent?.$id ?? eventData.$id ?? '',
        eventStart: eventData.start ?? undefined,
        eventEnd: eventData.end ?? undefined,
    }), [activeEditingEvent?.$id, eventData.$id, eventData.end, eventData.start]);
    const { hasPendingExternalConflictChecks, hasExternalSlotConflictWarnings } = useMemo(() => {
        if (!supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent)) {
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
    const divisionTypeOptions = useMemo(() => {
        const sportInput = resolveSportInput(eventData.sportConfig ?? eventData.sportId);
        const catalogOptions = getDivisionTypeOptionsForSport(sportInput);
        const detailSkillOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.skillDivisionTypeId || detail.divisionTypeId,
            name: detail.skillDivisionTypeName || detail.divisionTypeName,
            ratingType: 'SKILL' as const,
            sportKey: sportInput || 'event',
        }));
        const detailAgeOptions = (eventData.divisionDetails || []).map((detail) => ({
            id: detail.ageDivisionTypeId || detail.divisionTypeId,
            name: detail.ageDivisionTypeName || detail.divisionTypeName,
            ratingType: 'AGE' as const,
            sportKey: sportInput || 'event',
        }));
        const merged = [...catalogOptions, ...detailSkillOptions, ...detailAgeOptions];
        const seen = new Set<string>();
        return merged.filter((option) => {
            const key = `${option.ratingType}:${option.id}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }, [eventData.divisionDetails, eventData.sportConfig, eventData.sportId]);
    const skillDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'SKILL')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const ageDivisionTypeSelectOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'AGE')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const defaultDivisionTypeSelections = useMemo(
        () => getDefaultDivisionTypeSelectionsForSport(resolveSportInput(eventData.sportConfig ?? eventData.sportId)),
        [eventData.sportConfig, eventData.sportId],
    );

    const [divisionEditor, setDivisionEditor] = useState<{
        editingId: string | null;
        divisionKind: DivisionEditorKind;
        gender: '' | 'M' | 'F' | 'C';
        skillDivisionTypeId: string;
        ageDivisionTypeId: string;
        name: string;
        price: number;
        maxParticipants: number | null;
        playoffTeamCount: number | null;
        poolCount: number | null;
        playoffPlacementDivisionIds: string[];
        leagueConfig: LeagueConfig;
        playoffConfig: TournamentConfig;
        allowPaymentPlans: boolean;
        installmentCount: number;
        installmentDueDates: string[];
        installmentDueRelativeDays: number[];
        installmentAmounts: number[];
        nameTouched: boolean;
        error: string | null;
    }>({
        editingId: null,
        divisionKind: 'LEAGUE',
        gender: '',
        skillDivisionTypeId: '',
        ageDivisionTypeId: '',
        name: '',
        price: Math.max(0, eventData.price || 0),
        maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
        playoffTeamCount: Math.max(
            2,
            Math.trunc(
                typeof leagueData.playoffTeamCount === 'number'
                    ? leagueData.playoffTeamCount
                    : eventData.maxParticipants || 2,
            ),
        ),
        poolCount: null,
        playoffPlacementDivisionIds: [],
        leagueConfig: normalizeLeagueConfigForSetMode(leagueData, Boolean(eventData.sportConfig?.usePointsPerSetWin)),
        playoffConfig: buildTournamentConfig(),
        allowPaymentPlans: false,
        installmentCount: 0,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
        nameTouched: false,
        error: null,
    });
    const previousSingleDivisionRef = useRef<boolean | null>(null);
    const firstDivisionDetailForDefaults = useMemo(
        () => (Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails[0] : undefined),
        [eventData.divisionDetails],
    );
    const singleDivisionPoolPlayDefaults = useMemo(() => {
        const bracketTeams = typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(firstDivisionDetailForDefaults.playoffTeamCount))
            : divisionEditor.playoffTeamCount;
        const poolCount = typeof firstDivisionDetailForDefaults?.poolCount === 'number'
            ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
            : divisionEditor.poolCount;
        return {
            bracketTeams,
            poolCount,
            poolTeamCount: derivePoolTeamCount(eventData.maxParticipants, poolCount),
        };
    }, [
        divisionEditor.playoffTeamCount,
        divisionEditor.poolCount,
        eventData.maxParticipants,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
    ]);
    const splitDivisionEditorEnabled = Boolean(
        eventData.eventType === 'LEAGUE'
        && leagueData.includePlayoffs
        && eventData.splitLeaguePlayoffDivisions
        && !eventData.singleDivision,
    );
    const mobileEditUnsupportedReasons = useMemo(() => {
        const reasons: string[] = [];
        if (
            eventData.eventType === 'LEAGUE'
            && leagueData.includePlayoffs
            && eventData.splitLeaguePlayoffDivisions
        ) {
            reasons.push('split league/playoff divisions');
        }
        const hasEventPaymentPlans = hasMobileBlockingPaymentPlanConfig({
            allowPaymentPlans: eventData.allowPaymentPlans,
            installmentCount: eventData.installmentCount,
            installmentAmounts: eventData.installmentAmounts,
            installmentDueDates: eventData.installmentDueDates,
            installmentDueRelativeDays: eventData.installmentDueRelativeDays,
        });
        const hasDivisionPaymentPlans = (eventData.divisionDetails || [])
            .some((detail) => hasMobileBlockingPaymentPlanConfig(detail));
        const hasEditorPaymentPlans = hasMobileBlockingPaymentPlanConfig(divisionEditor);
        if (hasEventPaymentPlans || hasDivisionPaymentPlans || hasEditorPaymentPlans) {
            reasons.push('payment plans/installments');
        }
        return reasons;
    }, [
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
    const mobileEditUnsupportedWarning = mobileEditUnsupportedReasons.length > 0
        ? `This event is not editable on mobile because it uses ${formatMobileEditUnsupportedReasons(mobileEditUnsupportedReasons)}. Teams and matches can still be managed from mobile.`
        : null;
    const currentSportRequiresSets = useMemo(() => {
        const selectedSport = (
            eventData.sportId ? sportsById.get(eventData.sportId) : null
        ) ?? eventData.sportConfig;
        return Boolean(selectedSport?.usePointsPerSetWin);
    }, [eventData.sportConfig, eventData.sportId, sportsById]);

    useEffect(() => {
        if (!isCreateMode || hasStripeAccount) {
            return;
        }
        setDivisionEditor((prev) => {
            const hasEditorPaidSettings = prev.price !== 0
                || prev.allowPaymentPlans
                || (prev.installmentCount || 0) !== 0
                || (prev.installmentAmounts?.length || 0) > 0
                || (prev.installmentDueDates?.length || 0) > 0
                || (prev.installmentDueRelativeDays?.length || 0) > 0;
            if (!hasEditorPaidSettings) {
                return prev;
            }
            return {
                ...prev,
                price: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [],
                installmentDueDates: [],
                installmentDueRelativeDays: [],
                error: null,
            };
        });
    }, [hasStripeAccount, isCreateMode]);

    const createNextPlayoffDivision = useCallback((
        existing: PlayoffDivisionDetailForm[],
        configTemplate?: TournamentConfig,
    ): PlayoffDivisionDetailForm => {
        let index = Math.max(1, existing.length + 1);
        while (index < 500) {
            const key = `playoff_${index}`;
            const id = buildEventDivisionId(eventData.$id, key);
            if (!existing.some((division) => division.id === id || division.key === key)) {
                return {
                    id,
                    key,
                    kind: 'PLAYOFF',
                    name: `Playoff Division ${index}`,
                    maxParticipants: 2,
                    playoffConfig: buildTournamentConfig(configTemplate),
                };
            }
            index += 1;
        }
        const fallbackKey = `playoff_${Date.now()}`;
        return {
            id: buildEventDivisionId(eventData.$id, fallbackKey),
            key: fallbackKey,
            kind: 'PLAYOFF',
            name: 'Playoff Division',
            maxParticipants: 2,
            playoffConfig: buildTournamentConfig(configTemplate),
        };
    }, [eventData.$id]);

    const handleRemovePlayoffDivision = useCallback((playoffDivisionId: string) => {
        const normalizedPlayoffDivisionId = normalizeDivisionKeys([playoffDivisionId])[0];
        if (!normalizedPlayoffDivisionId) {
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivisions = currentPlayoffDivisions.filter((division) => (
            normalizeDivisionKeys([division.id])[0] !== normalizedPlayoffDivisionId
        ));
        setValue('playoffDivisionDetails', nextPlayoffDivisions, { shouldDirty: true, shouldValidate: true });

        const currentLeagueDivisions = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const remappedLeagueDivisions = currentLeagueDivisions.map((division) => {
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            const nextMapping = mapping.map((entry) => {
                const normalizedEntry = normalizeDivisionKeys([entry])[0];
                return normalizedEntry === normalizedPlayoffDivisionId ? '' : entry;
            });
            if (stringArraysEqual(mapping, nextMapping)) {
                return division;
            }
            return {
                ...division,
                playoffPlacementDivisionIds: nextMapping,
            };
        });
        setValue('divisionDetails', remappedLeagueDivisions, { shouldDirty: true, shouldValidate: true });
        setDivisionEditor((prev) => {
            if (prev.editingId === normalizedPlayoffDivisionId && prev.divisionKind === 'PLAYOFF') {
                return {
                    ...prev,
                    editingId: null,
                    divisionKind: 'LEAGUE',
                    error: null,
                };
            }
            if (!prev.playoffPlacementDivisionIds.some((entry) => normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId)) {
                return prev;
            }
            return {
                ...prev,
                playoffPlacementDivisionIds: prev.playoffPlacementDivisionIds.map((entry) => (
                    normalizeDivisionKeys([entry])[0] === normalizedPlayoffDivisionId ? '' : entry
                )),
                error: null,
            };
        });
    }, [eventData.divisionDetails, eventData.playoffDivisionDetails, setValue]);

    const playoffDivisionSelectOptions = useMemo(
        () => (eventData.playoffDivisionDetails || []).map((division) => ({
            value: division.id,
            label: division.name,
        })),
        [eventData.playoffDivisionDetails],
    );

    const playoffDivisionCapacityWarnings = useMemo(() => {
        if (
            eventData.eventType !== 'LEAGUE'
            || !leagueData.includePlayoffs
            || !eventData.splitLeaguePlayoffDivisions
        ) {
            return [] as string[];
        }

        const assignmentCounts = new Map<string, number>();
        const playoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];

        (eventData.divisionDetails || []).forEach((division) => {
            const playoffTeamCount = Number.isFinite(division.playoffTeamCount)
                ? Math.max(0, Math.trunc(division.playoffTeamCount as number))
                : 0;
            const mapping = Array.isArray(division.playoffPlacementDivisionIds)
                ? division.playoffPlacementDivisionIds
                : [];
            for (let index = 0; index < playoffTeamCount; index += 1) {
                const mappedDivisionId = normalizeDivisionKeys([mapping[index]])[0];
                if (!mappedDivisionId) {
                    continue;
                }
                assignmentCounts.set(mappedDivisionId, (assignmentCounts.get(mappedDivisionId) ?? 0) + 1);
            }
        });

        return playoffDivisions
            .map((division) => {
                const normalizedId = normalizeDivisionKeys([division.id])[0];
                if (!normalizedId) {
                    return null;
                }
                const assigned = assignmentCounts.get(normalizedId) ?? 0;
                const capacity = normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? 0;
                if (assigned > capacity) {
                    return `${division.name} has ${assigned} mapped teams but only ${capacity} slots.`;
                }
                return null;
            })
            .filter((message): message is string => Boolean(message));
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.playoffDivisionDetails,
        eventData.splitLeaguePlayoffDivisions,
        leagueData.includePlayoffs,
    ]);

    const selectedSportForOfficials = useMemo(
        () => (
            (eventData.sportId ? sportsById.get(eventData.sportId) : null)
            ?? eventData.sportConfig
            ?? null
        ),
        [eventData.sportConfig, eventData.sportId, sportsById],
    );
    const sportOfficialPositionTemplates = useMemo(
        () => normalizeSportOfficialPositionTemplates(selectedSportForOfficials?.officialPositionTemplates),
        [selectedSportForOfficials],
    );
    const availableOfficialFieldOptions = useMemo(() => {
        const localFieldIds = toFieldIdList(fields.filter(isEventLocalField));
        const allowedFieldIdSet = selectedFieldIds.length > 0
            ? new Set([...selectedFieldIds, ...localFieldIds])
            : null;
        return fields
            .filter((field) => {
                const fieldId = String(field?.$id ?? '').trim();
                if (!fieldId) {
                    return false;
                }
                return allowedFieldIdSet ? allowedFieldIdSet.has(fieldId) : true;
            })
            .map((field) => ({
                value: field.$id,
                label: getFieldDisplayName(field),
            }));
    }, [fields, selectedFieldIds]);
    const eventOfficialByUserId = useMemo(
        () => new Map((eventData.eventOfficials || []).map((official) => [official.userId, official] as const)),
        [eventData.eventOfficials],
    );

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
        setEventData((prev) => ({
            ...prev,
            officialPositions: nextPositions,
            eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
            officialIds: getEventOfficialUserIds(prev.eventOfficials),
        }));
    }, [setEventData, sportOfficialPositionTemplates]);

    const handleAddOfficialPosition = useCallback(() => {
        setEventData((prev) => {
            const nextPositions = [
                ...(prev.officialPositions || []),
                {
                    id: createClientId(),
                    name: '',
                    count: 1,
                    order: (prev.officialPositions || []).length,
                } satisfies EventOfficialPosition,
            ];
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateOfficialPosition = useCallback((
        positionId: string,
        updates: Partial<Pick<EventOfficialPosition, 'name' | 'count'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || []).map((position, index) => (
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
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleRemoveOfficialPosition = useCallback((positionId: string) => {
        setEventData((prev) => {
            const nextPositions = (prev.officialPositions || [])
                .filter((position) => position.id !== positionId)
                .map((position, index) => ({ ...position, order: index }));
            return {
                ...prev,
                officialPositions: nextPositions,
                eventOfficials: normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(prev.eventOfficials),
            };
        });
    }, [setEventData]);

    const handleUpdateEventOfficialEligibility = useCallback((
        userId: string,
        updates: Partial<Pick<EventOfficial, 'positionIds' | 'fieldIds'>>,
    ) => {
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const nextOfficials = normalizeEventOfficials(prev.eventOfficials, getEventOfficialUserIds(prev.eventOfficials), nextPositions).map((official) => {
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
                ...prev,
                eventOfficials: normalizeEventOfficials(nextOfficials, getEventOfficialUserIds(nextOfficials), nextPositions),
                officialIds: getEventOfficialUserIds(nextOfficials),
            };
        });
    }, [setEventData]);

    const handleAddOfficial = useCallback((official: { $id?: string; userId?: string | null } & Partial<UserData>) => {
        const officialId = normalizeEntityId(official.$id ?? official.userId);
        if (!officialId) {
            return;
        }
        if (isOrganizationHostedEvent && !organizationAllowedOfficialIdSet.has(officialId)) {
            return;
        }
        setEventData((prev) => {
            const nextPositions = prev.officialPositions || [];
            const existingOfficials = normalizeEventOfficials(
                prev.eventOfficials,
                getEventOfficialUserIds(prev.eventOfficials),
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
            const nextRefs = official.$id && !(prev.officials || []).some((ref) => ref.$id === official.$id)
                ? [...(prev.officials || []), official as UserData]
                : prev.officials || [];
            return {
                ...prev,
                officialIds: nextIds,
                eventOfficials: nextEventOfficials,
                officials: nextRefs,
            };
        });
    }, [isOrganizationHostedEvent, organizationAllowedOfficialIdSet, setEventData]);

    const handleRemoveOfficial = useCallback((officialId: string) => {
        setEventData((prev) => ({
            ...prev,
            eventOfficials: normalizeEventOfficials(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
                [],
                prev.officialPositions || [],
            ),
            officialIds: getEventOfficialUserIds(
                (prev.eventOfficials || []).filter((official) => official.userId !== officialId),
            ),
            officials: (prev.officials || []).filter((ref) => ref.$id !== officialId),
        }));
    }, [setEventData]);

    const assignedUserIdsByRole = useMemo(
        () => buildAssignedUserIdsByRole({
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            hostId: eventData.hostId,
            assistantHostIds: assistantHostValue,
        }),
        [assistantHostValue, eventData.eventOfficials, eventData.hostId],
    );

    const assignedUserIdSetByRole = useMemo(
        () => buildAssignedUserIdSetsByRole(assignedUserIdsByRole),
        [assignedUserIdsByRole],
    );

    const assignedStaffUserIds = useMemo(
        () => buildAssignedStaffUserIds(assignedUserIdsByRole),
        [assignedUserIdsByRole],
    );
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

    const lookupPendingStaffInviteMembership = useCallback(async (pendingInvites: PendingStaffInvite[]) => {
        const pendingEmails = Array.from(new Set(
            pendingInvites
                .map((invite) => normalizeInviteEmail(invite.email))
                .filter((email) => email.length > 0),
        ));
        if (!pendingEmails.length || !assignedStaffUserIds.length) {
            return new Map<string, Set<string>>();
        }

        const matches = await userService.lookupEmailMembership(pendingEmails, assignedStaffUserIds);
        const membershipByEmail = new Map<string, Set<string>>();
        matches.forEach((match) => {
            const email = normalizeInviteEmail(match.email);
            const userId = normalizeEntityId(match.userId);
            if (!email || !userId) {
                return;
            }
            const matchedUserIds = membershipByEmail.get(email) ?? new Set<string>();
            matchedUserIds.add(userId);
            membershipByEmail.set(email, matchedUserIds);
        });
        return membershipByEmail;
    }, [assignedStaffUserIds]);

    const findPendingStaffInviteConflictMessage = useCallback((
        pendingInvites: PendingStaffInvite[],
        membershipByEmail: Map<string, Set<string>>,
    ): string | null => {
        for (const invite of pendingInvites) {
            const matchedUserIds = membershipByEmail.get(invite.email);
            if (!matchedUserIds || matchedUserIds.size === 0) {
                continue;
            }
            for (const role of invite.roles) {
                if (Array.from(matchedUserIds).some((userId) => assignedUserIdSetByRole[role].has(userId))) {
                    return `${invite.email} is already added as ${formatStaffRoleLabel(role).toLowerCase()} for this event.`;
                }
            }
        }
        return null;
    }, [assignedUserIdSetByRole]);


    const validatePendingStaffInvites = useCallback(async (pendingInvitesInput: PendingStaffInvite[]) => {
        if (isOrganizationHostedEvent) {
            setStaffInviteError(null);
            return new Map<string, Set<string>>();
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(pendingInvitesInput);
        for (const invite of pendingInvites) {
            if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email) || invite.roles.length === 0) {
                const message = 'Enter first name, last name, valid email, and at least one role for every email invite before saving.';
                setStaffInviteError(message);
                throw new Error(message);
            }
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership(pendingInvites);
        const conflictMessage = findPendingStaffInviteConflictMessage(pendingInvites, membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            throw new Error(conflictMessage);
        }

        setStaffInviteError(null);
        return membershipByEmail;
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership]);

    const validatePendingStaffAssignments = useCallback(async () => {
        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(getValues('pendingStaffInvites') ?? []);
        await validatePendingStaffInvites(pendingInvites);
    }, [getValues, validatePendingStaffInvites]);

    const handleStagePendingStaffInvite = useCallback(async () => {
        if (isOrganizationHostedEvent) {
            return;
        }

        const nextInvite = normalizePendingStaffInvite(newStaffInvite);
        if (!nextInvite.firstName || !nextInvite.lastName || !EMAIL_REGEX.test(nextInvite.email) || nextInvite.roles.length === 0) {
            setStaffInviteError('Enter first name, last name, valid email, and at least one role before adding an email invite.');
            return;
        }

        const membershipByEmail = await lookupPendingStaffInviteMembership([nextInvite]);
        const conflictMessage = findPendingStaffInviteConflictMessage([nextInvite], membershipByEmail);
        if (conflictMessage) {
            setStaffInviteError(conflictMessage);
            return;
        }

        setPendingStaffInvites((prev) => {
            const existingIndex = prev.findIndex((invite) => normalizeInviteEmail(invite.email) === nextInvite.email);
            if (existingIndex === -1) {
                return [...prev, nextInvite];
            }
            const updated = [...prev];
            updated[existingIndex] = normalizePendingStaffInvite({
                ...updated[existingIndex],
                firstName: nextInvite.firstName,
                lastName: nextInvite.lastName,
                email: nextInvite.email,
                roles: [...updated[existingIndex].roles, ...nextInvite.roles],
            });
            return updated;
        });
        setNewStaffInvite(createEmptyStaffInvite());
        setStaffInviteError(null);
    }, [findPendingStaffInviteConflictMessage, isOrganizationHostedEvent, lookupPendingStaffInviteMembership, newStaffInvite, setPendingStaffInvites]);


    const submitPendingStaffInvites = useCallback(async (eventId: string) => {
        if (isOrganizationHostedEvent) {
            return;
        }
        if (!currentUser?.$id) {
            const message = 'You must be signed in to manage staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const pendingInvites = normalizeDirtyTrackedPendingStaffInvites(getValues('pendingStaffInvites') ?? []);
        const pendingInviteMembershipByEmail = await validatePendingStaffInvites(pendingInvites);
        const {
            payload,
            unresolvedEmailInvites,
        } = buildStaffInviteSubmissionPayload({
            eventId,
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            assistantHostIds: assistantHostValue,
            pendingInvites,
            pendingInviteMembershipByEmail,
            currentEventStaffInviteByUserId,
            existingAssignedStaffUserIds,
        });

        const result = payload.length > 0
            ? await userService.inviteUsersByEmail(currentUser.$id, payload)
            : { sent: [], not_sent: [], failed: [] };
        if ((result.failed || []).length > 0) {
            const message = 'Failed to create one or more staff invites.';
            setStaffInviteError(message);
            throw new Error(message);
        }

        const resolvedUserIds = new Set<string>();
        const inviteRolesByEmail = new Map(unresolvedEmailInvites.map((invite) => [invite.email, invite.roles] as const));
        const fetchedInvites = [...(result.sent || []), ...(result.not_sent || [])];
        fetchedInvites.forEach((invite) => {
            if (invite.userId) {
                resolvedUserIds.add(invite.userId);
            }
        });

        if (resolvedUserIds.size > 0) {
            try {
                const fetchedUsers = await userService.getUsersByIds(Array.from(resolvedUserIds));
                setEventData((prev) => {
                    const nextPositions = prev.officialPositions || [];
                    let nextEventOfficials = normalizeEventOfficials(
                        prev.eventOfficials,
                        getEventOfficialUserIds(prev.eventOfficials),
                        nextPositions,
                    );
                    const nextAssistantHostIds = new Set(prev.assistantHostIds || []);
                    const nextOfficials = [...(prev.officials || [])];
                    fetchedUsers.forEach((userEntry) => {
                        const matchingInvite = fetchedInvites.find((invite) => invite.userId === userEntry.$id || normalizeInviteEmail(invite.email) === getUserEmail(userEntry));
                        const roles = matchingInvite
                            ? (matchingInvite.staffTypes || [])
                                .map(mapInviteStaffTypeToRole)
                                .filter((role): role is StaffAssignmentRole => Boolean(role))
                            : inviteRolesByEmail.get(getUserEmail(userEntry) ?? '') || [];
                        if (roles.includes('OFFICIAL')) {
                            nextEventOfficials = normalizeEventOfficials(
                                nextEventOfficials.some((official) => official.userId === userEntry.$id)
                                    ? nextEventOfficials
                                    : [
                                        ...nextEventOfficials,
                                        {
                                            id: createClientId(),
                                            userId: userEntry.$id,
                                            positionIds: nextPositions.map((position) => position.id),
                                            fieldIds: [],
                                            isActive: true,
                                        } satisfies EventOfficial,
                                    ],
                                [],
                                nextPositions,
                            );
                            if (!nextOfficials.some((official) => official.$id === userEntry.$id)) {
                                nextOfficials.push(userEntry);
                            }
                        }
                        if (roles.includes('ASSISTANT_HOST') && userEntry.$id !== prev.hostId) {
                            nextAssistantHostIds.add(userEntry.$id);
                            cacheAssistantHostUser(userEntry);
                        }
                    });
                    return {
                        ...prev,
                        officials: nextOfficials,
                        eventOfficials: nextEventOfficials,
                        officialIds: getEventOfficialUserIds(nextEventOfficials),
                        assistantHostIds: Array.from(nextAssistantHostIds),
                    };
                });
            } catch (error) {
                console.warn('Failed to hydrate staff invite users:', error);
            }
        }

        const finalTargetUserIds = new Set<string>([
            ...getEventOfficialUserIds(eventData.eventOfficials),
            ...assistantHostValue,
            ...Array.from(resolvedUserIds),
        ]);
        const invitesToDelete = currentEventStaffInvites.filter((invite) => invite.userId && !finalTargetUserIds.has(invite.userId));
        if (invitesToDelete.length > 0) {
            const inviteIdsToDelete = invitesToDelete
                .map((invite) => normalizeEntityId(invite.$id))
                .filter((inviteId): inviteId is string => Boolean(inviteId));
            await Promise.all(inviteIdsToDelete.map((inviteId) => userService.deleteInviteById(inviteId)));
        }

        setPendingStaffInvites([]);
        setStaffInviteError(null);
    }, [
        assistantHostValue,
        cacheAssistantHostUser,
        currentEventStaffInvites,
        currentUser,
        eventData.eventOfficials,
        getValues,
        isOrganizationHostedEvent,
        setEventData,
        setPendingStaffInvites,
        validatePendingStaffInvites,
        existingAssignedStaffUserIds,
        currentEventStaffInviteByUserId,
    ]);
    const assignedOfficialCards = useMemo<AssignedStaffCard[]>(
        () => buildAssignedOfficialCards({
            officialIds: getEventOfficialUserIds(eventData.eventOfficials),
            assignedOfficials: eventData.officials || [],
            organizationOfficialsById,
            nonOrgStaffResults,
            currentEventStaffInviteByUserId,
            pendingStaffInvites: eventData.pendingStaffInvites || [],
        }),
        [currentEventStaffInviteByUserId, eventData.eventOfficials, eventData.pendingStaffInvites, eventData.officials, nonOrgStaffResults, organizationOfficialsById],
    );
    const assignedHostCards = useMemo<AssignedStaffCard[]>(
        () => buildAssignedHostCards({
            hostId: eventData.hostId,
            assistantHostIds: assistantHostValue,
            assistantHostUsersById,
            organizationUsersById,
            currentEventStaffInviteByUserId,
            pendingStaffInvites: eventData.pendingStaffInvites || [],
        }),
        [assistantHostUsersById, assistantHostValue, currentEventStaffInviteByUserId, eventData.hostId, eventData.pendingStaffInvites, organizationUsersById],
    );
    useEffect(() => {
        setOrganizationStaffVisibleCount(5);
    }, [filteredOrganizationStaffEntries.length, organizationStaffSearch, organizationStaffStatusFilter, organizationStaffTypeFilter]);
    useEffect(() => {
        setOfficialCardVisibleCount(5);
    }, [assignedOfficialCards.length]);
    useEffect(() => {
        setHostCardVisibleCount(5);
    }, [assignedHostCards.length]);

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

    const updateSingleDivisionTournamentPoolDefaults = useCallback((
        updates: Partial<Pick<typeof divisionEditor, 'playoffTeamCount' | 'poolCount'>>,
    ) => {
        setDivisionEditor((prev) => ({
            ...prev,
            ...updates,
            error: null,
        }));

        if (!eventData.singleDivision || eventData.eventType !== 'TOURNAMENT' || !leagueData.includePlayoffs) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            return;
        }

        const nextPlayoffTeamCount = Object.prototype.hasOwnProperty.call(updates, 'playoffTeamCount')
            ? updates.playoffTeamCount
            : singleDivisionPoolPlayDefaults.bracketTeams;
        const nextPoolCount = Object.prototype.hasOwnProperty.call(updates, 'poolCount')
            ? updates.poolCount
            : singleDivisionPoolPlayDefaults.poolCount;
        const normalizedMaxParticipants = Math.max(2, Math.trunc(eventData.maxParticipants || 2));
        const normalizedPlayoffTeamCount = typeof nextPlayoffTeamCount === 'number'
            ? Math.max(2, Math.trunc(nextPlayoffTeamCount))
            : undefined;
        const normalizedPoolCount = typeof nextPoolCount === 'number'
            ? Math.max(1, Math.trunc(nextPoolCount))
            : undefined;
        const normalizedPoolTeamCount = derivePoolTeamCount(normalizedMaxParticipants, normalizedPoolCount);

        const nextDetails = currentDetails.map((detail) => ({
            ...detail,
            maxParticipants: normalizedMaxParticipants,
            playoffTeamCount: normalizedPlayoffTeamCount,
            poolCount: normalizedPoolCount,
            poolTeamCount: normalizedPoolTeamCount,
        }));
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.singleDivision,
        leagueData.includePlayoffs,
        setValue,
        singleDivisionPoolPlayDefaults.bracketTeams,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

    const resetDivisionEditor = useCallback(() => {
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: null,
            divisionKind: 'LEAGUE',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: '',
            price: Math.max(0, eventData.price || 0),
            maxParticipants: Math.max(2, Math.trunc(eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                        ? firstDivisionDetailForDefaults.playoffTeamCount
                        : typeof leagueData.playoffTeamCount === 'number'
                        ? leagueData.playoffTeamCount
                        : eventData.maxParticipants || 2,
                ),
            ),
            poolCount: eventData.eventType === 'TOURNAMENT'
                && leagueData.includePlayoffs
                && typeof firstDivisionDetailForDefaults?.poolCount === 'number'
                ? Math.max(1, Math.trunc(firstDivisionDetailForDefaults.poolCount))
                : null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(playoffData),
            allowPaymentPlans: Boolean(eventData.allowPaymentPlans),
            installmentCount: eventData.allowPaymentPlans
                ? (eventData.installmentCount || defaultInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: defaultInstallmentDueDates,
            installmentDueRelativeDays: defaultInstallmentDueRelativeDays,
            installmentAmounts: defaultInstallmentAmounts,
            nameTouched: false,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.eventType,
        eventData.installmentAmounts,
        eventData.installmentCount,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.price,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        currentSportRequiresSets,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        leagueData,
        playoffData,
    ]);

    const handleDivisionEditorKindChange = useCallback((value: string | null) => {
        const nextKind: DivisionEditorKind = value === 'PLAYOFF' ? 'PLAYOFF' : 'LEAGUE';
        if (nextKind === 'LEAGUE') {
            resetDivisionEditor();
            return;
        }

        const currentPlayoffDivisions = Array.isArray(eventData.playoffDivisionDetails)
            ? eventData.playoffDivisionDetails
            : [];
        const nextPlayoffDivision = createNextPlayoffDivision(currentPlayoffDivisions, playoffData);
        setDivisionEditor({
            editingId: null,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: nextPlayoffDivision.name,
            price: 0,
            maxParticipants: nextPlayoffDivision.maxParticipants,
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(nextPlayoffDivision.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        createNextPlayoffDivision,
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
        playoffData,
        resetDivisionEditor,
    ]);

    const setDivisionEditorPlayoffConfig = useCallback((updater: React.SetStateAction<TournamentConfig>) => {
        setDivisionEditor((prev) => {
            const previousConfig = buildTournamentConfig(prev.playoffConfig);
            const resolved = typeof updater === 'function'
                ? (updater as (previous: TournamentConfig) => TournamentConfig)(previousConfig)
                : updater;
            return {
                ...prev,
                playoffConfig: buildTournamentConfig(resolved),
                error: null,
            };
        });
    }, []);

    const setDivisionEditorLeagueConfig = useCallback((updates: Partial<LeagueConfig>) => {
        setDivisionEditor((prev) => ({
            ...prev,
            leagueConfig: normalizeLeagueConfigForSetMode(
                {
                    ...prev.leagueConfig,
                    ...updates,
                    includePlayoffs: prev.leagueConfig.includePlayoffs,
                    playoffTeamCount: prev.leagueConfig.playoffTeamCount,
                },
                currentSportRequiresSets,
            ),
            error: null,
        }));
    }, [currentSportRequiresSets]);

    useEffect(() => {
        if (splitDivisionEditorEnabled || divisionEditor.divisionKind !== 'PLAYOFF') {
            return;
        }
        resetDivisionEditor();
    }, [divisionEditor.divisionKind, resetDivisionEditor, splitDivisionEditorEnabled]);

    useEffect(() => {
        const isSingleDivision = Boolean(eventData.singleDivision);
        if (previousSingleDivisionRef.current === null) {
            previousSingleDivisionRef.current = isSingleDivision;
            return;
        }
        const wasSingleDivision = previousSingleDivisionRef.current;
        previousSingleDivisionRef.current = isSingleDivision;
        if (!wasSingleDivision || isSingleDivision) {
            return;
        }

        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        if (!currentDetails.length) {
            resetDivisionEditor();
            return;
        }

        const { details: nextDetails, changed } = applyEventDefaultsToDivisionDetails({
            details: currentDetails,
            defaultPrice: Number(eventData.price) || 0,
            defaultMaxParticipants: Number(eventData.maxParticipants) || 2,
            includePlayoffs: eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs,
            defaultPlayoffTeamCount: typeof leagueData.playoffTeamCount === 'number'
                ? leagueData.playoffTeamCount
                : eventData.eventType === 'TOURNAMENT' && typeof firstDivisionDetailForDefaults?.playoffTeamCount === 'number'
                    ? firstDivisionDetailForDefaults.playoffTeamCount
                    : typeof eventData.maxParticipants === 'number'
                    ? eventData.maxParticipants
                    : undefined,
            includeTournamentPoolPlay: eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs,
            defaultPoolCount: eventData.eventType === 'TOURNAMENT'
                ? firstDivisionDetailForDefaults?.poolCount ?? singleDivisionPoolPlayDefaults.poolCount
                : undefined,
        });
        if (changed) {
            setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: true });
        }
        resetDivisionEditor();
    }, [
        eventData.divisionDetails,
        eventData.eventType,
        eventData.maxParticipants,
        eventData.price,
        eventData.singleDivision,
        firstDivisionDetailForDefaults?.playoffTeamCount,
        firstDivisionDetailForDefaults?.poolCount,
        leagueData.includePlayoffs,
        leagueData.playoffTeamCount,
        resetDivisionEditor,
        setValue,
        singleDivisionPoolPlayDefaults.poolCount,
    ]);

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

    const updateDivisionEditorSelection = useCallback((
        updates: Partial<Pick<typeof divisionEditor, 'gender' | 'skillDivisionTypeId' | 'ageDivisionTypeId'>>,
    ) => {
        setDivisionEditor((prev) => {
            const next = { ...prev, ...updates, error: null };
            if (Object.prototype.hasOwnProperty.call(updates, 'skillDivisionTypeId') && !updates.skillDivisionTypeId) {
                next.skillDivisionTypeId = '';
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'ageDivisionTypeId') && !updates.ageDivisionTypeId) {
                next.ageDivisionTypeId = '';
            }

            const hasRequiredFields = Boolean(next.gender && next.skillDivisionTypeId && next.ageDivisionTypeId);
            if (!hasRequiredFields) {
                next.name = '';
                next.nameTouched = false;
                return next;
            }

            next.name = buildDivisionName({
                gender: next.gender as 'M' | 'F' | 'C',
                sportInput: resolveSportInput(eventData.sportConfig ?? eventData.sportId),
                skillDivisionTypeId: next.skillDivisionTypeId,
                ageDivisionTypeId: next.ageDivisionTypeId,
            });
            next.nameTouched = false;
            return next;
        });
    }, [eventData.sportConfig, eventData.sportId]);

    const handleEditDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.divisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        const composite = parseCompositeDivisionTypeId(detail.divisionTypeId);
        const fallbackSelections = getDefaultDivisionTypeSelectionsForSport(
            resolveSportInput(eventData.sportConfig ?? eventData.sportId),
        );
        const defaultInstallmentAmounts = eventData.allowPaymentPlans
            ? normalizeInstallmentAmounts(eventData.installmentAmounts)
            : [];
        const defaultInstallmentDueDates = eventData.allowPaymentPlans
            ? [...(eventData.installmentDueDates || [])]
            : [];
        const defaultInstallmentDueRelativeDays = eventData.allowPaymentPlans
            ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
            : [];
        const detailAllowPaymentPlans = typeof detail.allowPaymentPlans === 'boolean'
            ? detail.allowPaymentPlans
            : Boolean(eventData.allowPaymentPlans);
        const detailInstallmentAmounts = detailAllowPaymentPlans
            ? ((detail.installmentAmounts?.length
                ? detail.installmentAmounts
                : defaultInstallmentAmounts).map((value) => normalizePriceCents(value)))
            : [];
        const detailInstallmentDueDates = detailAllowPaymentPlans
            ? (detail.installmentDueDates?.length
                ? [...detail.installmentDueDates]
                : defaultInstallmentDueDates)
            : [];
        const detailInstallmentDueRelativeDays = detailAllowPaymentPlans
            ? (detail.installmentDueRelativeDays?.length
                ? normalizeInstallmentRelativeDays(detail.installmentDueRelativeDays)
                : defaultInstallmentDueRelativeDays)
            : [];
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'LEAGUE',
            gender: detail.gender,
            skillDivisionTypeId: detail.skillDivisionTypeId
                || composite?.skillDivisionTypeId
                || (detail.ratingType === 'SKILL' ? detail.divisionTypeId : fallbackSelections.skillDivisionTypeId),
            ageDivisionTypeId: detail.ageDivisionTypeId
                || composite?.ageDivisionTypeId
                || (detail.ratingType === 'AGE' ? detail.divisionTypeId : fallbackSelections.ageDivisionTypeId),
            name: detail.name,
            price: Math.max(0, detail.price || 0),
            maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || eventData.maxParticipants || 2)),
            playoffTeamCount: Math.max(
                2,
                Math.trunc(
                    detail.playoffTeamCount
                        || detail.maxParticipants
                        || eventData.maxParticipants
                        || 2,
                ),
            ),
            poolCount: typeof detail.poolCount === 'number'
                ? Math.max(1, Math.trunc(detail.poolCount))
                : null,
            playoffPlacementDivisionIds: normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds),
            leagueConfig: buildDivisionLeagueConfig(detail, leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig ?? playoffData),
            allowPaymentPlans: detailAllowPaymentPlans,
            installmentCount: detailAllowPaymentPlans
                ? (detail.installmentCount || detailInstallmentAmounts.length || 0)
                : 0,
            installmentDueDates: detailInstallmentDueDates,
            installmentDueRelativeDays: detailInstallmentDueRelativeDays,
            installmentAmounts: detailInstallmentAmounts,
            nameTouched: true,
            error: null,
        });
    }, [
        eventData.allowPaymentPlans,
        eventData.divisionDetails,
        eventData.installmentAmounts,
        eventData.installmentDueDates,
        eventData.installmentDueRelativeDays,
        eventData.maxParticipants,
        eventData.sportConfig,
        eventData.sportId,
        currentSportRequiresSets,
        leagueData,
        playoffData,
    ]);

    const handleEditPlayoffDivisionDetail = useCallback((divisionId: string) => {
        const detail = (eventData.playoffDivisionDetails || []).find((entry) => entry.id === divisionId);
        if (!detail) {
            return;
        }
        setDivisionEditor({
            editingId: detail.id,
            divisionKind: 'PLAYOFF',
            gender: '',
            skillDivisionTypeId: defaultDivisionTypeSelections.skillDivisionTypeId,
            ageDivisionTypeId: defaultDivisionTypeSelections.ageDivisionTypeId,
            name: detail.name,
            price: 0,
            maxParticipants: normalizePlayoffDivisionParticipantCount(detail.maxParticipants),
            playoffTeamCount: null,
            poolCount: null,
            playoffPlacementDivisionIds: [],
            leagueConfig: normalizeLeagueConfigForSetMode(leagueData, currentSportRequiresSets),
            playoffConfig: buildTournamentConfig(detail.playoffConfig),
            allowPaymentPlans: false,
            installmentCount: 0,
            installmentDueDates: [],
            installmentDueRelativeDays: [],
            installmentAmounts: [],
            nameTouched: true,
            error: null,
        });
    }, [
        defaultDivisionTypeSelections.ageDivisionTypeId,
        defaultDivisionTypeSelections.skillDivisionTypeId,
        eventData.playoffDivisionDetails,
        currentSportRequiresSets,
        leagueData,
    ]);

    const handleRemoveDivisionDetail = useCallback((divisionId: string) => {
        const currentDetails = Array.isArray(eventData.divisionDetails) ? eventData.divisionDetails : [];
        const nextDetails = currentDetails.filter((detail) => detail.id !== divisionId);
        const nextDivisionIds = nextDetails.map((detail) => detail.id);
        setValue('divisionDetails', nextDetails, { shouldDirty: true, shouldValidate: false });
        setValue('divisions', nextDivisionIds, { shouldDirty: true, shouldValidate: true });

        const currentFieldMap = getValues('divisionFieldIds') ?? {};
        const cleanedFieldMap = Object.fromEntries(
            Object.entries(currentFieldMap).filter(([divisionKey]) => nextDivisionIds.includes(divisionKey)),
        );
        setValue('divisionFieldIds', cleanedFieldMap, { shouldDirty: true, shouldValidate: true });

        if (divisionEditor.editingId === divisionId) {
            resetDivisionEditor();
        }
    }, [
        divisionEditor.editingId,
        eventData.divisionDetails,
        getValues,
        resetDivisionEditor,
        setValue,
    ]);

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
        const rawNormalizedDivisionPrice = eventData.singleDivision
            ? Math.max(0, eventData.price || 0)
            : Math.max(0, divisionEditor.price || 0);
        const rawDivisionMaxParticipants = eventData.singleDivision
            ? eventData.maxParticipants
            : divisionEditor.maxParticipants;
        const isDivisionMaxParticipantsMissing = !eventData.singleDivision
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
        const normalizedDivisionAllowPaymentPlans = eventData.singleDivision
            ? Boolean(eventData.allowPaymentPlans)
            : Boolean(divisionEditor.allowPaymentPlans);
        const normalizedDivisionInstallmentAmounts = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? normalizeInstallmentAmounts(eventData.installmentAmounts)
                : normalizeInstallmentAmounts(divisionEditor.installmentAmounts))
            : [];
        const normalizedDivisionInstallmentDueDates = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? [...(eventData.installmentDueDates || [])]
                : [...(divisionEditor.installmentDueDates || [])])
            : [];
        const normalizedDivisionInstallmentDueRelativeDays = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
                ? normalizeInstallmentRelativeDays(eventData.installmentDueRelativeDays)
                : normalizeInstallmentRelativeDays(divisionEditor.installmentDueRelativeDays))
            : [];
        const normalizedDivisionInstallmentCount = normalizedDivisionAllowPaymentPlans
            ? (eventData.singleDivision
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
        if (!eventData.singleDivision && normalizedDivisionMaxParticipants < 2) {
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
        resetDivisionEditor,
        setLeagueData,
        setValue,
        splitDivisionEditorEnabled,
    ]);

    const leagueDivisionEditorReady = Boolean(
        divisionEditor.gender
        && divisionEditor.skillDivisionTypeId
        && divisionEditor.ageDivisionTypeId,
    );
    const divisionEditorReady = leagueDivisionEditorReady;
    const divisionMaxParticipantsWarning = !eventData.singleDivision
        && typeof divisionEditor.maxParticipants === 'number'
        && divisionEditor.maxParticipants < 2
        ? (eventData.teamSignup
            ? 'Warning: make division max teams at least 2.'
            : 'Warning: make division max participants at least 2.')
        : null;

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
            if (!slotStart) {
                const fallbackEventStart = parseLocalDateTime(eventData.start ?? null);
                if (fallbackEventStart) {
                    slotStart = fallbackEventStart;
                }
            }
            if (!slotEnd && slotStart) {
                const fallbackEventEnd = parseLocalDateTime(eventData.end ?? null);
                if (fallbackEventEnd && fallbackEventEnd.getTime() > slotStart.getTime()) {
                    slotEnd = fallbackEventEnd;
                } else {
                    const startMinutes = Number.isFinite(updated.startTimeMinutes) ? Number(updated.startTimeMinutes) : null;
                    const endMinutes = Number.isFinite(updated.endTimeMinutes) ? Number(updated.endTimeMinutes) : null;
                    const durationMinutes = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
                        ? endMinutes - startMinutes
                        : 60;
                    slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
                }
            }

            if (slotStart) {
                const dayOfWeek = ((slotStart.getDay() + 6) % 7);
                updated.dayOfWeek = dayOfWeek as LeagueSlotForm['dayOfWeek'];
                updated.daysOfWeek = [dayOfWeek] as LeagueSlotForm['daysOfWeek'];
                updated.startDate = formatLocalDateTime(slotStart);
                updated.startTimeMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
            } else {
                updated.dayOfWeek = undefined;
                updated.daysOfWeek = [];
                updated.startDate = undefined;
                updated.startTimeMinutes = undefined;
            }

            if (slotEnd) {
                updated.endDate = formatLocalDateTime(slotEnd);
                updated.endTimeMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
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
        () => mergeFieldsById([], rentalResourceOptions.map((option) => option.field)),
        [rentalResourceOptions],
    );
    const rentalResourceSelectorFields = useMemo(
        () => mergeFieldsById([], rentalResourceOptions.map((option) => option.selectorField)),
        [rentalResourceOptions],
    );
    const rentalResourceOptionsBySelectorId = useMemo(() => (
        new Map(rentalResourceOptions.map((option) => [option.selectorId, option] as const))
    ), [rentalResourceOptions]);
    const rentalResourceOptionsByFieldId = useMemo(() => {
        const byFieldId = new Map<string, RentalBookingResourceOption[]>();
        rentalResourceOptions.forEach((option) => {
            const fieldId = normalizeResourceText(option.fieldId);
            if (!fieldId) {
                return;
            }
            byFieldId.set(fieldId, [...(byFieldId.get(fieldId) ?? []), option]);
        });
        return byFieldId;
    }, [rentalResourceOptions]);
    const selectedRentalResourceOptions = useMemo(() => (
        Array.from(
            new Map(
                selectedFieldIds
                    .flatMap((fieldId) => {
                        const selectorOption = rentalResourceOptionsBySelectorId.get(fieldId);
                        if (selectorOption) {
                            return [selectorOption];
                        }
                        return rentalResourceOptionsByFieldId.get(fieldId) ?? [];
                    })
                    .map((option) => [option.id, option] as const),
            ).values(),
        )
    ), [rentalResourceOptionsByFieldId, rentalResourceOptionsBySelectorId, selectedFieldIds]);
    const selectedRentalFieldIds = useMemo(
        () => Array.from(new Set(selectedRentalResourceOptions.map((option) => option.fieldId))),
        [selectedRentalResourceOptions],
    );
    const selectedRentedFieldIds = useMemo(() => {
        if (!organizationHostedEventId || selectedFieldIds.length === 0) {
            return selectedRentalFieldIds;
        }
        const selectedFieldIdSet = new Set(selectedFieldIds.map(normalizeResourceText).filter(Boolean));
        const sourceFields = mergeFieldsById(
            mergeFieldsById(fields, Array.isArray(activeEditingEvent?.fields) ? activeEditingEvent.fields : []),
            mergeFieldsById(immutableFields, rentalResourceFields),
        );
        const externalSelectedIds = sourceFields
            .filter((field): field is Field & { $id: string } => (
                typeof field?.$id === 'string'
                && selectedFieldIdSet.has(normalizeResourceText(field.$id))
                && isRentedResourceForOrganization(field, organizationHostedEventId)
            ))
            .map((field) => field.$id);
        return Array.from(new Set([...selectedRentalFieldIds, ...externalSelectedIds]));
    }, [
        activeEditingEvent?.fields,
        fields,
        immutableFields,
        organizationHostedEventId,
        rentalResourceFields,
        selectedFieldIds,
        selectedRentalFieldIds,
    ]);
    const fieldById = useMemo(() => (
        new Map(fields.map((field) => [normalizeResourceText(field.$id), field] as const))
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
    const organizationResourcePool = useMemo(() => {
        const selectedResourceIds = new Set(selectedFieldIds.map(normalizeResourceText).filter(Boolean));
        const baseFields = organizationHostedEventId
            ? fields.filter((field) => isSelectableOrganizationResource(field, organizationHostedEventId))
                .filter((field) => {
                    if (!isRentedResourceForOrganization(field, organizationHostedEventId)) {
                        return true;
                    }
                    return selectedResourceIds.has(normalizeResourceText(field.$id));
                })
            : [];
        return rentalResourceFields.length
            ? mergeFieldsById(baseFields, rentalResourceSelectorFields)
            : baseFields;
    }, [fields, organizationHostedEventId, rentalResourceFields.length, rentalResourceSelectorFields, selectedFieldIds]);
    const eventLocalFields = useMemo(
        () => fields.filter(isEventLocalField),
        [fields],
    );
    const leagueFieldOptions = useMemo(() => {
        const rentalResourceFieldIds = new Set(
            rentalResourceOptions.map((option) => normalizeResourceText(option.fieldId)).filter(Boolean),
        );
        const regularOptions = selectedFields
            .filter((field): field is Field & { $id: string } => {
                if (typeof field.$id !== 'string' || field.$id.length === 0) {
                    return false;
                }
                const marker = field as { rentalResource?: boolean; _rentalResource?: boolean };
                return !marker.rentalResource
                    && !marker._rentalResource
                    && !rentalResourceFieldIds.has(field.$id);
            })
            .map((field) => ({
                value: field.$id,
                fieldId: field.$id,
                label: getFieldDisplayName(field, 'Resource'),
            }));
        const rentalOptions = rentalResourceOptions
            .map((option) => {
                return {
                    value: option.selectorId,
                    fieldId: option.fieldId,
                    label: option.label,
                    rentalBookingId: option.bookingId,
                    rentalBookingItemId: option.bookingItemId,
                    rentalStart: option.start,
                    rentalEnd: option.end,
                    rentalTimeZone: option.timeZone ?? null,
                    rentalPriceCents: option.priceCents ?? null,
                    rentalRequiredTemplateIds: option.requiredTemplateIds ?? [],
                    rentalHostRequiredTemplateIds: option.hostRequiredTemplateIds ?? [],
                };
            });
        return [...regularOptions, ...rentalOptions];
    }, [rentalResourceOptions, selectedFields]);

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

    const fieldsReferencedInSlots = useMemo(() => {
        const availableFields = selectedFields;
        if (!leagueSlots.length) {
            if (availableFields.length) {
                return availableFields;
            }
            return hasRestrictedImmutableFields ? immutableFields : ([] as Field[]);
        }

        const fieldMap = new Map<string, Field>();
        availableFields.forEach(field => {
            if (field?.$id) {
                fieldMap.set(field.$id, field);
            }
        });

        const seen = new Set<string>();
        const picked: Field[] = [];

        leagueSlots.forEach(slot => {
            const slotFieldIds = normalizeSlotFieldIds(slot);
            slotFieldIds.forEach((slotFieldId) => {
                if (seen.has(slotFieldId)) {
                    return;
                }
                const resolved = fieldMap.get(slotFieldId);
                if (resolved) {
                    picked.push(resolved);
                }
                seen.add(slotFieldId);
            });
        });

        if (!picked.length && availableFields.length) {
            return availableFields;
        }

        if (!picked.length && hasRestrictedImmutableFields) {
            return immutableFields;
        }

        return picked;
    }, [hasRestrictedImmutableFields, immutableFields, leagueSlots, selectedFields]);

    const selectedImageId = eventData.imageId;
    const selectedImageUrl = useMemo(
        () => (selectedImageId ? getEventImageUrl({ imageId: selectedImageId, width: 800 }) : ''),
        [selectedImageId],
    );

    const eventTypeOptions = useMemo(
        () => [
            { value: 'EVENT', label: 'Event' },
            { value: 'TOURNAMENT', label: 'Tournament' },
            { value: 'LEAGUE', label: 'League' },
            ...(isRentalCreateFlow ? [] : [{ value: 'WEEKLY_EVENT', label: 'Weekly Event' }]),
        ],
        [isRentalCreateFlow],
    );
    const supportsNoFixedEndDateTime = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
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

    const leagueWarning = (() => {
        if (hasPendingExternalConflictChecks) {
            return 'Checking field conflicts for timeslots. You can still save while this warning check finishes.';
        }
        if (hasExternalSlotConflictWarnings) {
            return 'Timeslot field conflicts are warnings. The scheduler will avoid overlaps when building matches, but review or auto resolve the affected slots if needed.';
        }
        return null;
    })();

    const leagueError = (() => {
        const issue = errors.leagueSlots;
        if (!issue) {
            return null;
        }
        const message = typeof issue.message === 'string' ? issue.message : null;
        return message && message.trim().length > 0
            ? message
            : 'Please resolve schedule timeslot issues before submitting.';
    })();

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
            console.error('Failed to connect Stripe account:', error);
        } finally {
            setConnectingStripe(false);
        }
    };

    // Builds the event payload used for draft updates.
    const buildDraftEvent = useCallback((formValues?: EventFormValues): Partial<Event> => {
        const source = formValues ?? eventData;
        const finalImageId = source.imageId;
        const sportSelection = source.sportConfig;
        const selectedSportId = source.sportId?.trim() || '';
        const fallbackSportId = (sportSelection?.$id && String(sportSelection.$id)) || '';
        const sportId = selectedSportId || fallbackSportId;
        const resolvedSport = resolveDraftSportForScoring({
            sportId,
            sportConfig: sportSelection,
            sportsById,
        });
        const baseCoordinates: [number, number] = source.coordinates;
        const toIdList = <T extends { $id?: string | undefined }>(items: T[] | undefined): string[] => {
            if (!Array.isArray(items)) {
                return [];
            }
            return items
                .map((item) => {
                    if (item && typeof item === 'object' && item.$id) {
                        return String(item.$id);
                    }
                    return '';
                })
                .filter((id): id is string => id.length > 0);
        };

        const pricingEnabled = hasStripeAccount;
        const eventAllowPaymentPlans = pricingEnabled ? Boolean(source.allowPaymentPlans) : false;
        const installmentAmountsCents = eventAllowPaymentPlans
            ? normalizeInstallmentAmounts(source.installmentAmounts)
            : [];
        const eventPriceCents = pricingEnabled
            ? (eventAllowPaymentPlans ? sumInstallmentAmounts(installmentAmountsCents) : normalizePriceCents(source.price))
            : 0;
        const minAge = normalizeNumber(source.minAge);
        const maxAge = normalizeNumber(source.maxAge);
        const sportInput = resolveSportInput(resolvedSport ?? sportId);
        const divisionReferenceDate = parseDateValue(source.start ?? null);
        const normalizedDivisionDetails = (() => {
            const fromDetails = Array.isArray(source.divisionDetails)
                ? source.divisionDetails
                    .map((entry) => normalizeDivisionDetailEntry(
                        entry,
                        source.$id,
                        sportInput,
                        divisionReferenceDate,
                    ))
                    .filter((entry): entry is DivisionDetailForm => Boolean(entry))
                : [];
            if (fromDetails.length) {
                return fromDetails;
            }
            const fromIds = normalizeDivisionKeys(source.divisions).map((divisionId) => {
                const inferred = inferDivisionDetails({
                    identifier: divisionId,
                    sportInput,
                });
                const defaultsForSport = getDefaultDivisionTypeSelectionsForSport(sportInput);
                const composite = parseCompositeDivisionTypeId(inferred.divisionTypeId);
                const skillDivisionTypeId = composite?.skillDivisionTypeId
                    ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaultsForSport.skillDivisionTypeId);
                const ageDivisionTypeId = composite?.ageDivisionTypeId
                    ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaultsForSport.ageDivisionTypeId);
                const skillDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    skillDivisionTypeId,
                    'SKILL',
                )?.name ?? defaultsForSport.skillDivisionTypeName;
                const ageDivisionTypeName = getDivisionTypeById(
                    sportInput,
                    ageDivisionTypeId,
                    'AGE',
                )?.name ?? defaultsForSport.ageDivisionTypeName;
                const divisionTypeId = buildCompositeDivisionTypeId(skillDivisionTypeId, ageDivisionTypeId);
                const divisionTypeName = buildDivisionName({
                    gender: inferred.gender,
                    sportInput,
                    skillDivisionTypeId,
                    ageDivisionTypeId,
                });
                const token = buildDivisionToken({
                    gender: inferred.gender,
                    ratingType: 'SKILL',
                    divisionTypeId,
                });
                return applyDivisionAgeCutoff({
                    id: divisionId,
                    key: token,
                    kind: 'LEAGUE',
                    name: divisionTypeName,
                    divisionTypeId,
                    divisionTypeName,
                    ratingType: 'SKILL',
                    gender: inferred.gender,
                    skillDivisionTypeId,
                    skillDivisionTypeName,
                    ageDivisionTypeId,
                    ageDivisionTypeName,
                    price: eventPriceCents,
                    maxParticipants: Math.max(2, Math.trunc(source.maxParticipants || 2)),
                    playoffTeamCount: Number.isFinite(source.leagueData?.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined,
                    playoffPlacementDivisionIds: [],
                    allowPaymentPlans: eventAllowPaymentPlans,
                    installmentCount: eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0,
                    installmentDueDates: eventAllowPaymentPlans && !(source.eventType === 'WEEKLY_EVENT' && !source.parentEvent)
                        ? [...(source.installmentDueDates || [])]
                        : [],
                    installmentDueRelativeDays: eventAllowPaymentPlans && source.eventType === 'WEEKLY_EVENT' && !source.parentEvent
                        ? normalizeInstallmentRelativeDays(source.installmentDueRelativeDays)
                        : [],
                    installmentAmounts: eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [],
                    sportId: sportInput || undefined,
                    fieldIds: [],
                } satisfies DivisionDetailForm, sportInput, divisionReferenceDate);
            });
            if (fromIds.length) {
                return fromIds;
            }
            return [];
        })();
        const normalizedDivisionKeys = (() => {
            const normalized = normalizeDivisionKeys(normalizedDivisionDetails.map((detail) => detail.id));
            if (normalized.length) {
                return normalized;
            }
            return normalizeDivisionKeys(source.divisions);
        })();
        const sportRequiresSets = Boolean(resolvedSport?.usePointsPerSetWin);
        const tournamentRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.tournamentData,
        );
        const playoffRequiresSets = resolveTournamentSetMode(
            sportRequiresSets,
            source.playoffData,
        );
        const splitLeaguePlayoffDivisions = Boolean(
            source.eventType === 'LEAGUE'
            && source.leagueData.includePlayoffs
            && source.splitLeaguePlayoffDivisions,
        );
        const tournamentPoolPlayEnabled = isTournamentPoolPlayFormEnabled(
            source.eventType,
            Boolean(source.leagueData.includePlayoffs),
        );
        const singleDivisionEnabled = Boolean(source.singleDivision);
        const tournamentBracketConfig = normalizeTournamentConfigForSetMode(
            source.tournamentData,
            tournamentRequiresSets,
        );
        const normalizedTournamentPoolBracketDetails: PlayoffDivisionDetailForm[] = tournamentPoolPlayEnabled
            ? normalizedDivisionDetails.map((detail) => {
                const maxParticipants = singleDivisionEnabled
                    ? Math.max(2, Math.trunc(source.maxParticipants || detail.maxParticipants || 2))
                    : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2));
                const poolCount = Number.isFinite(detail.poolCount)
                    ? Math.max(1, Math.trunc(detail.poolCount as number))
                    : undefined;
                return {
                    ...detail,
                    kind: 'PLAYOFF' as const,
                    maxParticipants,
                    playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                        ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                        : undefined,
                    poolCount,
                    poolTeamCount: derivePoolTeamCount(maxParticipants, poolCount),
                    playoffPlacementDivisionIds: [],
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? tournamentBracketConfig,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? tournamentBracketConfig,
                        ),
                    ),
                };
            })
            : [];
        const normalizedPlayoffDivisionDetails = splitLeaguePlayoffDivisions
            ? (source.playoffDivisionDetails || [])
                .map((entry) => normalizePlayoffDivisionDetailEntry(
                    entry,
                    source.$id,
                    source.playoffData,
                    sportInput,
                    divisionReferenceDate,
                ))
                .filter((entry): entry is PlayoffDivisionDetailForm => Boolean(entry))
            : tournamentPoolPlayEnabled
                ? normalizedTournamentPoolBracketDetails
            : [];
        const slotDivisionLookupForDraft = buildSlotDivisionLookup(
            normalizedDivisionDetails,
            splitLeaguePlayoffDivisions ? normalizedPlayoffDivisionDetails : [],
        );
        const normalizedDivisionDetailsForPayload = normalizedDivisionDetails.map((detail) => ({
            ...detail,
            kind: 'LEAGUE' as const,
            price: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventPriceCents
                        : Boolean(detail.allowPaymentPlans)
                            ? sumInstallmentAmounts(detail.installmentAmounts)
                            : normalizePriceCents(detail.price)
                )
                : 0,
            maxParticipants: singleDivisionEnabled
                ? Math.max(2, Math.trunc(source.maxParticipants || 2))
                : Math.max(2, Math.trunc(detail.maxParticipants || source.maxParticipants || 2)),
            playoffTeamCount: (() => {
                if (source.eventType !== 'LEAGUE' || !source.leagueData.includePlayoffs) {
                    return undefined;
                }
                if (singleDivisionEnabled && !splitLeaguePlayoffDivisions) {
                    return Number.isFinite(source.leagueData.playoffTeamCount)
                        ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                        : undefined;
                }
                return Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined;
            })(),
            playoffPlacementDivisionIds: (() => {
                if (!splitLeaguePlayoffDivisions) {
                    return [] as string[];
                }
                const playoffTeamCount = Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(0, Math.trunc(detail.playoffTeamCount as number))
                    : 0;
                const mapping = normalizePlacementDivisionIds(detail.playoffPlacementDivisionIds);
                if (playoffTeamCount <= 0) {
                    return mapping;
                }
                return mapping.slice(0, playoffTeamCount);
            })(),
            ...((source.eventType === 'LEAGUE' || (source.eventType === 'TOURNAMENT' && source.leagueData.includePlayoffs))
                ? leagueConfigToDivisionFields(
                    singleDivisionEnabled
                        ? normalizeLeagueConfigForSetMode(source.leagueData, sportRequiresSets)
                        : buildDivisionLeagueConfig(detail, source.leagueData, sportRequiresSets),
                )
                : {}),
            ...(source.eventType === 'LEAGUE'
                && source.leagueData.includePlayoffs
                && !singleDivisionEnabled
                && !splitLeaguePlayoffDivisions
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.playoffData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.playoffData,
                        ),
                    ),
                }
                : {}),
            ...(source.eventType === 'TOURNAMENT' && !singleDivisionEnabled
                ? {
                    playoffConfig: normalizeTournamentConfigForSetMode(
                        detail.playoffConfig ?? source.tournamentData,
                        resolveTournamentSetMode(
                            sportRequiresSets,
                            detail.playoffConfig ?? source.tournamentData,
                        ),
                    ),
                }
                : {}),
            allowPaymentPlans: pricingEnabled
                ? (
                    singleDivisionEnabled
                        ? eventAllowPaymentPlans
                        : Boolean(detail.allowPaymentPlans)
                )
                : false,
            installmentCount: (() => {
                if (!pricingEnabled) {
                    return 0;
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? (source.installmentCount || source.installmentAmounts.length || 0)
                        : 0;
                }
                if (!detail.allowPaymentPlans) {
                    return 0;
                }
                return detail.installmentCount || detail.installmentAmounts.length || 0;
            })(),
            installmentAmounts: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans
                        ? normalizeInstallmentAmounts(source.installmentAmounts)
                        : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return normalizeInstallmentAmounts(detail.installmentAmounts);
            })(),
            installmentDueDates: (() => {
                if (!pricingEnabled) {
                    return [];
                }
                if (singleDivisionEnabled) {
                    return eventAllowPaymentPlans ? [...(source.installmentDueDates || [])] : [];
                }
                if (!detail.allowPaymentPlans) {
                    return [];
                }
                return Array.isArray(detail.installmentDueDates) ? [...detail.installmentDueDates] : [];
            })(),
        }));

        const organizationAssignments = isOrganizationHostedEvent
            ? sanitizeOrganizationEventAssignments(
                {
                    hostId: source.hostId || currentUser?.$id || null,
                    assistantHostIds: source.assistantHostIds || [],
                    officialIds: getEventOfficialUserIds(source.eventOfficials),
                },
                {
                    ownerId: resolvedOrganization?.ownerId,
                    staffMembers: resolvedOrganization?.staffMembers,
                    staffInvites: resolvedOrganization?.staffInvites,
                },
            )
            : null;
        const normalizedHostId = (
            organizationAssignments?.hostId
            || normalizeEntityId(source.hostId)
            || normalizeEntityId(currentUser?.$id)
            || ''
        );
        const normalizedAssistantHostIds = organizationAssignments
            ? organizationAssignments.assistantHostIds
            : Array.from(
                new Set(
                    (source.assistantHostIds || [])
                        .map((id) => String(id))
                    .filter((id) => id.length > 0 && id !== normalizedHostId),
                ),
            );
        const normalizedOfficialPositionsForPayload = normalizeEventOfficialPositions(
            source.officialPositions,
            normalizeSportOfficialPositionTemplates(resolvedSport?.officialPositionTemplates),
        );
        const normalizedEventOfficials = normalizeEventOfficials(
            source.eventOfficials,
            Array.isArray(source.eventOfficials) ? [] : source.officialIds || [],
            normalizedOfficialPositionsForPayload,
        ).filter((official) => (
            organizationAssignments ? organizationAssignments.officialIds.includes(official.userId) : true
        ));
        const normalizedOfficialIds = getEventOfficialUserIds(normalizedEventOfficials);
        const officialPoolById = new Map<string, UserData>();
        (source.officials || []).forEach((official) => {
            if (official?.$id) {
                officialPoolById.set(official.$id, official);
            }
        });
        if (isOrganizationHostedEvent) {
            organizationOfficialsById.forEach((official, id) => {
                officialPoolById.set(id, official);
            });
        }
        const normalizedOfficials = normalizedOfficialIds
            .map((id) => officialPoolById.get(id))
            .filter((official): official is UserData => Boolean(official));
        const normalizedEnd = (() => {
            if (typeof source.end === 'string') {
                const trimmed = source.end.trim();
                return trimmed.length > 0 ? trimmed : null;
            }
            return source.end ?? null;
        })();
        const eventFieldLocation = defaultFieldLocationForEvent(source.location);
        const previousEventFieldLocation = previousEventFieldLocationRef.current;

        const draft: Partial<Event> = {
            $id: activeEditingEvent?.$id,
            hostId: normalizedHostId,
            name: (source.name ?? '').trim(),
            description: source.description,
            location: source.location,
            address: source.address?.trim() || undefined,
            start: source.start,
            end: normalizedEnd,
            timeZone: normalizeTimeZone(source.timeZone, getSystemTimeZone()),
            eventType: source.eventType,
            parentEvent: source.parentEvent || undefined,
            noFixedEndDateTime: supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)
                ? Boolean(source.noFixedEndDateTime)
                : false,
            state: isEditMode ? activeEditingEvent?.state ?? 'PUBLISHED' : 'UNPUBLISHED',
            sportId: sportId || undefined,
            price: eventPriceCents,
            taxHandling: normalizeEventTaxHandling(source.taxHandling),
            organizerManualTaxRateBps: normalizeOrganizerManualTaxRateBps(source.organizerManualTaxRateBps),
            minAge,
            maxAge,
            allowPaymentPlans: eventAllowPaymentPlans,
            installmentCount: eventAllowPaymentPlans
                ? source.installmentCount || installmentAmountsCents.length || 0
                : undefined,
            installmentAmounts: eventAllowPaymentPlans ? installmentAmountsCents : [],
            installmentDueDates: eventAllowPaymentPlans ? source.installmentDueDates : [],
            allowTeamSplitDefault: source.allowTeamSplitDefault,
            maxParticipants: source.maxParticipants ?? undefined,
            teamSizeLimit: source.teamSizeLimit ?? undefined,
            teamSignup: source.teamSignup,
            singleDivision: source.singleDivision,
            splitLeaguePlayoffDivisions,
            registrationByDivisionType: source.registrationByDivisionType,
            divisions: normalizedDivisionKeys,
            divisionDetails: (tournamentPoolPlayEnabled ? [] : normalizedDivisionDetailsForPayload).map((detail) => ({
                ...detail,
                price: normalizePriceCents(detail.price),
                maxParticipants: Math.max(2, Math.trunc(detail.maxParticipants || 2)),
                playoffTeamCount: Number.isFinite(detail.playoffTeamCount)
                    ? Math.max(2, Math.trunc(detail.playoffTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(detail.allowPaymentPlans),
                installmentCount: detail.allowPaymentPlans
                    ? (detail.installmentCount || detail.installmentAmounts.length || 0)
                    : 0,
                installmentAmounts: detail.allowPaymentPlans
                    ? normalizeInstallmentAmounts(detail.installmentAmounts)
                    : [],
                installmentDueDates: detail.allowPaymentPlans
                    ? (Array.isArray(detail.installmentDueDates)
                        ? detail.installmentDueDates
                        : [])
                    : [],
            })),
            playoffDivisionDetails: normalizedPlayoffDivisionDetails.map((division) => ({
                id: division.id,
                key: division.key,
                kind: 'PLAYOFF' as const,
                name: division.name,
                divisionTypeId: division.divisionTypeId,
                divisionTypeName: division.divisionTypeName,
                ratingType: division.ratingType,
                gender: division.gender,
                sportId: division.sportId,
                price: Number.isFinite(division.price)
                    ? normalizePriceCents(division.price as number)
                    : undefined,
                maxParticipants: normalizePlayoffDivisionParticipantCount(division.maxParticipants) ?? undefined,
                playoffTeamCount: Number.isFinite(division.playoffTeamCount)
                    ? Math.max(2, Math.trunc(division.playoffTeamCount as number))
                    : undefined,
                poolCount: Number.isFinite(division.poolCount)
                    ? Math.max(1, Math.trunc(division.poolCount as number))
                    : undefined,
                poolTeamCount: Number.isFinite(division.poolTeamCount)
                    ? Math.max(1, Math.trunc(division.poolTeamCount as number))
                    : undefined,
                allowPaymentPlans: Boolean(division.allowPaymentPlans),
                installmentCount: division.allowPaymentPlans
                    ? (division.installmentCount || division.installmentAmounts?.length || 0)
                    : 0,
                installmentAmounts: division.allowPaymentPlans
                    ? normalizeInstallmentAmounts(division.installmentAmounts)
                    : [],
                installmentDueDates: division.allowPaymentPlans && Array.isArray(division.installmentDueDates)
                    ? division.installmentDueDates
                    : [],
                installmentDueRelativeDays: division.allowPaymentPlans
                    ? normalizeInstallmentRelativeDays(division.installmentDueRelativeDays)
                    : [],
                playoffConfig: normalizeTournamentConfigForSetMode(
                    division.playoffConfig,
                    resolveTournamentSetMode(
                        sportRequiresSets,
                        division.playoffConfig,
                    ),
                ),
            })),
            cancellationRefundHours: source.cancellationRefundHours,
            registrationCutoffHours: source.registrationCutoffHours,
            requiredTemplateIds: source.requiredTemplateIds,
            imageId: finalImageId,
            seedColor: source.seedColor,
            waitListIds: source.waitList,
            freeAgentIds: source.freeAgents,
            teams: source.teams,
            players: source.players,
            officials: normalizedOfficials,
            officialIds: normalizedOfficialIds,
            officialSchedulingMode: normalizeOfficialSchedulingMode(source.officialSchedulingMode),
            officialPositions: normalizedOfficialPositionsForPayload,
            eventOfficials: normalizedEventOfficials,
            assistantHostIds: normalizedAssistantHostIds,
            doTeamsOfficiate: source.doTeamsOfficiate,
            teamOfficialsMaySwap: source.doTeamsOfficiate ? Boolean(source.teamOfficialsMaySwap) : false,
            matchRulesOverride: source.matchRulesOverride ?? null,
            autoCreatePointMatchIncidents: Boolean(source.autoCreatePointMatchIncidents),
            coordinates: baseCoordinates,
        };

        const organizationId = source.organizationId || organizationHostedEventId || undefined;
        const sourceFields = hasRestrictedImmutableFields ? immutableFields : fields;
        const organizationFieldIds = organizationHostedEventId
            ? toFieldIdList(sourceFields.filter((field) => getFieldOrganizationId(field) === organizationHostedEventId))
            : [];
        const selectedOrganizationFieldIds = isOrganizationHostedEvent && supportsOrganizationFieldSelectionForEvent(
            source.eventType,
            source.parentEvent,
        )
            ? resolveOrganizationEventFieldIds(source.selectedFieldIds, organizationFieldIds)
            : [];

        if (!shouldManageLocalFields) {
            let fieldsToInclude = fieldsReferencedInSlots;
            if (!fieldsToInclude.length && hasRestrictedImmutableFields) {
                fieldsToInclude = immutableFields;
            }
            if (isOrganizationManagedEvent) {
                const defaultOrganizationFieldIds = toIdList(fields.length ? fields : fieldsToInclude);
                const fieldIds = supportsOrganizationFieldSelectionForEvent(source.eventType, source.parentEvent)
                    ? resolveOrganizationEventFieldIds(source.selectedFieldIds, defaultOrganizationFieldIds)
                    : toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            } else if (fieldsToInclude.length) {
                draft.fields = fieldsToInclude.map(field => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
                const fieldIds = toIdList(fieldsToInclude);
                selectedRentedFieldIds.forEach((fieldId) => {
                    if (!fieldIds.includes(fieldId)) {
                        fieldIds.push(fieldId);
                    }
                });
                if (fieldIds.length) {
                    draft.fieldIds = fieldIds;
                }
            }
            if ((!draft.fieldIds || draft.fieldIds.length === 0) && rentalPurchase?.fieldId) {
                draft.fieldIds = [rentalPurchase.fieldId];
            } else if ((!draft.fieldIds || draft.fieldIds.length === 0) && selectedRentedFieldIds.length) {
                draft.fieldIds = selectedRentedFieldIds;
            }
        } else {
            const localFields = sourceFields.filter(isEventLocalField);
            if (localFields.length) {
                draft.fields = localFields.map((field) => withEventFieldLocationDefault(
                    { ...field },
                    eventFieldLocation,
                    previousEventFieldLocation,
                ));
            }
            const fieldIds = Array.from(new Set([
                ...selectedOrganizationFieldIds,
                ...selectedRentedFieldIds,
                ...toIdList(localFields),
            ]));
            if (fieldIds.length) {
                draft.fieldIds = fieldIds;
            }
        }

        const normalizedFieldIds = Array.isArray(draft.fieldIds)
            ? Array.from(new Set(draft.fieldIds.map((fieldId) => String(fieldId)).filter(Boolean)))
            : [];
        if (normalizedFieldIds.length) {
            draft.fieldIds = normalizedFieldIds;
        }
        delete (draft as Partial<Event>).divisionFieldIds;

        if (organizationId) {
            draft.organizationId = organizationId;
        }

        if (!isEditMode) {
            if (currentUser?.$id) {
                draft.hostId = currentUser.$id;
            }
            draft.waitListIds = [];
            draft.freeAgentIds = [];
            draft.players = joinAsParticipant && currentUser ? [currentUser] : [];
            draft.userIds = joinAsParticipant && currentUser?.$id ? [currentUser.$id] : [];
            if (shouldProvisionFields) {
                draft.fieldCount = fieldCount;
            }
        }

        if (hasImmutableTimeSlots) {
            draft.timeSlots = immutableTimeSlots.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const slotIds = toIdList(immutableTimeSlots);
            if (slotIds.length) {
                draft.timeSlotIds = slotIds;
            }
        }

        const teamIds = toIdList(draft.teams as Team[] | undefined);
        if (teamIds.length) {
            draft.teamIds = teamIds;
        }

        const userIds = toIdList(draft.players as UserData[] | undefined);
        if (userIds.length && !draft.userIds?.length) {
            draft.userIds = userIds;
        }

        const sourceUsesStandingsScoring = source.eventType === 'LEAGUE'
            || isTournamentPoolPlayFormEnabled(source.eventType, Boolean(source.leagueData.includePlayoffs));

        if (sourceUsesStandingsScoring) {
            if (source.leagueScoringConfig?.$id) {
                draft.leagueScoringConfigId = source.leagueScoringConfig.$id;
            }
            if (source.leagueScoringConfig) {
                draft.leagueScoringConfig = source.leagueScoringConfig;
            }
        } else {
            draft.leagueScoringConfigId = undefined;
            draft.leagueScoringConfig = undefined;
        }

        if (source.eventType === 'LEAGUE') {
            const restTime = normalizeNumber(source.leagueData.restTimeMinutes);
            const setsPerMatchValue = source.leagueData.setsPerMatch ?? 1;
            const normalizedPoints = sportRequiresSets
                ? (() => {
                    const base = Array.isArray(source.leagueData.pointsToVictory)
                        ? source.leagueData.pointsToVictory.slice(0, setsPerMatchValue)
                    : [];
                    while (base.length < setsPerMatchValue) base.push(21);
                    return base;
                })()
                : undefined;

            draft.gamesPerOpponent = source.leagueData.gamesPerOpponent;
            draft.includePlayoffs = source.leagueData.includePlayoffs;
            (draft as any).includePlayoffsOrPools = source.leagueData.includePlayoffs;
            draft.playoffTeamCount = source.leagueData.includePlayoffs
                ? (Number.isFinite(source.leagueData.playoffTeamCount)
                    ? Math.max(2, Math.trunc(source.leagueData.playoffTeamCount as number))
                    : undefined)
                : undefined;

            if (sportRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(source.leagueData.setDurationMinutes);
                draft.setsPerMatch = setsPerMatchValue;
                draft.pointsToVictory = normalizedPoints;
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(source.leagueData.matchDurationMinutes);
                if (restTime !== undefined) {
                    draft.restTimeMinutes = restTime;
                }
            }

            if (source.leagueData.includePlayoffs && source.playoffData && !splitLeaguePlayoffDivisions) {
                const normalizedPlayoffConfig = normalizeTournamentConfigForSetMode(
                    source.playoffData,
                    playoffRequiresSets,
                );
                draft.doubleElimination = normalizedPlayoffConfig.doubleElimination;
                draft.winnerSetCount = normalizedPlayoffConfig.winnerSetCount;
                draft.loserSetCount = normalizedPlayoffConfig.loserSetCount;
                draft.winnerBracketPointsToVictory = normalizedPlayoffConfig.winnerBracketPointsToVictory;
                draft.loserBracketPointsToVictory = normalizedPlayoffConfig.loserBracketPointsToVictory;
                draft.restTimeMinutes = normalizeNumber(normalizedPlayoffConfig.restTimeMinutes, 0) ?? 0;
            }

        }

        if (source.eventType === 'TOURNAMENT') {
            const normalizedTournamentConfig = normalizeTournamentConfigForSetMode(
                source.tournamentData,
                tournamentRequiresSets,
            );
            draft.includePlayoffs = Boolean(source.leagueData.includePlayoffs);
            (draft as any).includePlayoffsOrPools = Boolean(source.leagueData.includePlayoffs);
            draft.playoffTeamCount = undefined;
            draft.doubleElimination = normalizedTournamentConfig.doubleElimination;
            draft.winnerSetCount = normalizedTournamentConfig.winnerSetCount;
            draft.loserSetCount = normalizedTournamentConfig.loserSetCount;
            draft.winnerBracketPointsToVictory = normalizedTournamentConfig.winnerBracketPointsToVictory;
            draft.loserBracketPointsToVictory = normalizedTournamentConfig.loserBracketPointsToVictory;
            draft.prize = normalizedTournamentConfig.prize;
            draft.fieldCount = fieldCount;
            draft.restTimeMinutes = normalizeNumber(normalizedTournamentConfig.restTimeMinutes, 0) ?? 0;
            if (tournamentRequiresSets) {
                draft.usesSets = true;
                draft.setDurationMinutes = normalizeNumber(normalizedTournamentConfig.setDurationMinutes);
                draft.matchDurationMinutes = undefined;
            } else {
                draft.usesSets = false;
                draft.matchDurationMinutes = normalizeNumber(normalizedTournamentConfig.matchDurationMinutes);
                draft.setDurationMinutes = undefined;
            }
        }

        if (!hasImmutableTimeSlots && supportsScheduleSlotsForEvent(source.eventType, source.parentEvent)) {
            const rentalLockedSlotDocuments = rentalLockedSlotsForDraft.map((slot) => {
                const slotDivisions = normalizeSlotDivisionIdsWithLookup(slot.divisions, slotDivisionLookupForDraft);
                return {
                    ...slot,
                    divisions: singleDivisionEnabled
                        ? normalizedDivisionKeys
                        : slotDivisions,
                };
            });
            const editableSlotDocuments = source.leagueSlots
                .filter((slot) => {
                    if (!normalizeSlotFieldIds(slot).length) {
                        return false;
                    }
                    if (slot.repeating === false) {
                        const slotStart = parseLocalDateTime(slot.startDate ?? null);
                        const slotEnd = parseLocalDateTime(slot.endDate ?? null);
                        return Boolean(slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime());
                    }
                    return normalizeWeekdays(slot).length > 0
                        && typeof slot.startTimeMinutes === 'number'
                        && typeof slot.endTimeMinutes === 'number';
                })
                .map((slot) => {
                    const slotId = slot.$id || slot.key;
                    const repeating = slot.repeating !== false;
                    const slotTimeZone = normalizeTimeZone(slot.timeZone, source.timeZone);
                    const slotFieldIds = normalizeSlotFieldIds(slot);
                    const slotDivisionKeys = normalizeSlotDivisionIdsWithLookup(
                        slot.divisions,
                        slotDivisionLookupForDraft,
                    );
                    const explicitStart = parseLocalDateTime(slot.startDate ?? null);
                    const explicitEnd = parseLocalDateTime(slot.endDate ?? null);
                    const fallbackStart = parseLocalDateTime(source.start ?? null);
                    const nonRepeatingDay = explicitStart
                        ? ((explicitStart.getDay() + 6) % 7)
                        : fallbackStart
                            ? ((fallbackStart.getDay() + 6) % 7)
                            : 0;
                    const normalizedDays = repeating
                        ? normalizeWeekdays(slot)
                        : [nonRepeatingDay];
                    const startTimeMinutes = repeating
                        ? Number(slot.startTimeMinutes)
                        : (explicitStart
                            ? explicitStart.getHours() * 60 + explicitStart.getMinutes()
                            : Number(slot.startTimeMinutes));
                    const endTimeMinutes = repeating
                        ? Number(slot.endTimeMinutes)
                        : (explicitEnd
                            ? explicitEnd.getHours() * 60 + explicitEnd.getMinutes()
                            : Number(slot.endTimeMinutes));
                    const serialized: TimeSlot = {
                        $id: slotId,
                        dayOfWeek: normalizedDays[0] as TimeSlot['dayOfWeek'],
                        daysOfWeek: normalizedDays as TimeSlot['daysOfWeek'],
                        scheduledFieldId: slotFieldIds[0],
                        scheduledFieldIds: slotFieldIds,
                        divisions: singleDivisionEnabled
                            ? normalizedDivisionKeys
                            : slotDivisionKeys,
                        timeZone: slotTimeZone,
                        startTimeMinutes,
                        endTimeMinutes,
                        repeating,
                        price: typeof slot.price === 'number' && Number.isFinite(slot.price) ? slot.price : undefined,
                        requiredTemplateIds: normalizeFieldIds(slot.requiredTemplateIds),
                        hostRequiredTemplateIds: normalizeFieldIds(slot.hostRequiredTemplateIds),
                        sourceType: typeof slot.sourceType === 'string' && slot.sourceType.trim().length > 0
                            ? slot.sourceType
                            : (slot.rentalLocked ? 'RENTAL_BOOKING' : undefined),
                        rentalBookingId: typeof slot.rentalBookingId === 'string' && slot.rentalBookingId.trim().length > 0
                            ? slot.rentalBookingId
                            : undefined,
                        rentalBookingItemId: typeof slot.rentalBookingItemId === 'string' && slot.rentalBookingItemId.trim().length > 0
                            ? slot.rentalBookingItemId
                            : undefined,
                        rentalLocked: Boolean(slot.rentalLocked),
                    };

                    if (!repeating) {
                        if (explicitStart) {
                            serialized.startDate = formatLocalDateTime(explicitStart);
                        }
                        if (explicitEnd) {
                            serialized.endDate = formatLocalDateTime(explicitEnd);
                        }
                    } else {
                        const slotStartDateOverride = normalizeSlotBoundaryOverrideForForm(
                            slot.startDate ?? null,
                            activeEditingEvent?.start ?? null,
                            slotTimeZone,
                        );
                        if (slotStartDateOverride) {
                            serialized.startDate = slotStartDateOverride;
                        } else if (source.start) {
                            serialized.startDate = source.start;
                        }
                        // Open-ended scheduling should not force recurring slot end bounds.
                        if (!source.noFixedEndDateTime && source.end) {
                            serialized.endDate = source.end;
                        }
                    }

                    return serialized;
                });
            const editableSlotIds = new Set(
                editableSlotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id.trim() : ''))
                    .filter((slotId) => slotId.length > 0),
            );
            const retainedRentalLockedSlotDocuments = rentalLockedSlotDocuments.filter((slot) => {
                const slotId = typeof slot.$id === 'string' ? slot.$id.trim() : '';
                return !slotId || !editableSlotIds.has(slotId);
            });
            const slotDocumentsByKey = new Map<string, TimeSlot>();
            [...retainedRentalLockedSlotDocuments, ...editableSlotDocuments].forEach((slot) => {
                const key = slot.rentalBookingItemId
                    || slot.$id
                    || `${normalizeSlotFieldIds(slot).join(',')}:${slot.startDate ?? ''}:${slot.endDate ?? ''}:${slot.startTimeMinutes ?? ''}:${slot.endTimeMinutes ?? ''}`;
                slotDocumentsByKey.set(key, slot);
            });
            const slotDocuments = Array.from(slotDocumentsByKey.values());

            if (slotDocuments.length) {
                draft.timeSlots = slotDocuments;
                const slotIds = slotDocuments
                    .map((slot) => (typeof slot.$id === 'string' ? slot.$id : null))
                    .filter((id): id is string => Boolean(id));
                if (slotIds.length) {
                    draft.timeSlotIds = slotIds;
                }
                const slotFieldIds = Array.from(
                    new Set(
                        slotDocuments.flatMap((slot) => normalizeSlotFieldIds(slot)),
                    ),
                );
                if (slotFieldIds.length) {
                    draft.fieldIds = slotFieldIds;
                }
            }
        }

        return draft;
    }, [
        activeEditingEvent?.state,
        activeEditingEvent?.$id,
        activeEditingEvent?.start,
        eventData,
        fields,
        fieldsReferencedInSlots,
        hasRestrictedImmutableFields,
        hasImmutableTimeSlots,
        hasStripeAccount,
        immutableFields,
        immutableTimeSlots,
        isEditMode,
        isOrganizationManagedEvent,
        isOrganizationHostedEvent,
        organizationHostedEventId,
        resolvedOrganization?.ownerId,
        resolvedOrganization?.officials,
        organizationAllowedHostIds,
        organizationAllowedOfficialIds,
        organizationOfficialsById,
        currentUser,
        joinAsParticipant,
        rentalPurchase,
        rentalLockedSlotsForDraft,
        selectedRentedFieldIds,
        sportsById,
        shouldManageLocalFields,
        shouldProvisionFields,
        fieldCount,
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
    const getRegistrationQuestionDrafts = useCallback((): RegistrationQuestionDraft[] => (
        registrationQuestionDrafts
            .map((question, index) => ({
                id: question.id,
                prompt: String(question.prompt ?? '').trim(),
                answerType: question.answerType ?? 'TEXT',
                required: Boolean(question.required),
                sortOrder: Number.isFinite(Number(question.sortOrder)) ? Number(question.sortOrder) : index,
            }))
            .filter((question) => question.prompt.length > 0)
    ), [registrationQuestionDrafts]);

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

        if (officialStaffingCoverageError) {
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

    useImperativeHandle(
        ref,
        () => ({
            getDraft: getDraftSnapshot,
            getRegistrationQuestionDrafts,
            validate: validateDraft,
            getValidationErrors: () => lastValidationErrorsRef.current,
            validatePendingStaffAssignments,
            commitDirtyBaseline,
            submitPendingStaffInvites,
        }),
        [commitDirtyBaseline, getDraftSnapshot, getRegistrationQuestionDrafts, submitPendingStaffInvites, validateDraft, validatePendingStaffAssignments],
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
    const isSchedulableEventType = supportsScheduleSlotsForEvent(eventData.eventType, eventData.parentEvent);
    const isWeeklyChildEvent = eventData.eventType === 'WEEKLY_EVENT' && hasParentEventRef(eventData.parentEvent);
    const supportsEditableTeamSignup = eventData.eventType === 'EVENT' || eventData.eventType === 'WEEKLY_EVENT';
    const showsFixedTeamEventToggle = eventData.eventType === 'LEAGUE' || eventData.eventType === 'TOURNAMENT';
    const usesRentalSlots = hasExternalRentalField || hasImmutableTimeSlots || Boolean(rentalPurchase?.fieldId);
    const showScheduleConfig = isSchedulableEventType || usesRentalSlots || isWeeklyChildEvent;
    const resourceSelectorLoading = fieldsLoading || rentalResourcesLoading;
    const showOrganizationFieldsInEventDetails = (
        isOrganizationHostedEvent || rentalResourceOptions.length > 0
    ) && supportsOrganizationFieldSelection;
    const localFieldCreationControl = showLocalFieldCreationControls ? (
        <MantineSelect
            label="Number of Resources"
            placeholder="Select resource count"
            data={fieldCountOptions}
            value={String(fieldCount)}
            w="100%"
            styles={alignedDetailsFieldStyles}
            onChange={(val) => {
                const parsed = Number(val);
                setFieldCount(Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0);
            }}
            error={errors.fieldCount?.message as string | undefined}
            comboboxProps={sharedComboboxProps}
        />
    ) : null;
    const showMatchRulesSection = eventData.eventType !== 'EVENT' && eventData.eventType !== 'WEEKLY_EVENT';
    const showScoringConfigSection = eventData.eventType === 'LEAGUE'
        || isTournamentPoolPlayFormEnabled(eventData.eventType, leagueData.includePlayoffs);
    const scoringConfigSectionLabel = eventData.eventType === 'TOURNAMENT'
        ? 'Pool Scoring Config'
        : 'League Scoring Config';
    const sectionNavItems = useMemo(
        () => [
            { id: 'section-basic-information', label: 'Basic Information', visible: true },
            { id: 'section-event-details', label: 'Event Details', visible: true },
            { id: 'section-match-rules', label: 'Match Rules', visible: showMatchRulesSection },
            { id: 'section-officials', label: 'Officials', visible: true },
            { id: 'section-division-settings', label: 'Divisions', visible: true },
            { id: 'section-league-scoring-config', label: scoringConfigSectionLabel, visible: showScoringConfigSection },
            { id: 'section-schedule-config', label: 'Schedule', visible: showScheduleConfig },
        ],
        [scoringConfigSectionLabel, showMatchRulesSection, showScheduleConfig, showScoringConfigSection],
    );
    const visibleSectionNavItems = useMemo(
        () => sectionNavItems.filter((item) => item.visible),
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

    const sheetContent = (
        <div className="w-full space-y-6">
            <div className="p-4">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <SectionNavigation
                        items={visibleSectionNavItems}
                        activeSectionId={activeSectionId}
                        variant="desktop"
                        onSelectSection={scrollToSection}
                    />

                    <div className="min-w-0">
                        <SectionNavigation
                            items={visibleSectionNavItems}
                            activeSectionId={activeSectionId}
                            variant="mobile"
                            onSelectSection={scrollToSection}
                        />
                        <div className="w-full">
                            <form id={formId} className="space-y-8">
                        {mobileEditUnsupportedWarning && (
                            <Alert color="yellow" variant="light" radius="md">
                                {mobileEditUnsupportedWarning}
                            </Alert>
                        )}
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
                            comboboxProps={sharedComboboxProps}
                            maxEventNameLength={MAX_EVENT_NAME_LENGTH}
                            maxDescriptionLength={MAX_DESCRIPTION_LENGTH}
                            isImmutableField={isImmutableField}
                            setValue={setValue}
                            onToggle={() => toggleSectionCollapse('section-basic-information')}
                            onImageChange={handleImageChange}
                        />

                        <EventDetailsSection
                            collapsed={collapsedSections['section-event-details']}
                            onToggle={() => toggleSectionCollapse('section-event-details')}
                        >
                            <div id="section-event-details-content" className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 md:items-start">
                                <EventDetailsTypeControls
                                    control={control}
                                    eventType={eventData.eventType}
                                    eventTypeOptions={eventTypeOptions}
                                    includePlayoffs={Boolean(leagueData.includePlayoffs)}
                                    supportsEditableTeamSignup={supportsEditableTeamSignup}
                                    showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                                    maxStandardNumber={MAX_STANDARD_NUMBER}
                                    selectStyles={alignedDetailsFieldStyles}
                                    numberInputStyles={alignedDetailsFieldStyles}
                                    comboboxProps={sharedComboboxProps}
                                    isImmutableField={isImmutableField}
                                    onEventTypeChange={(nextType, applyValue) => {
                                        clearErrors('leagueSlots');
                                        const enforcingTeamSettings = nextType === 'LEAGUE' || nextType === 'TOURNAMENT';
                                        applyValue(nextType);
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
                                />
                                <EventDetailsTimingControls
                                    control={control}
                                    eventType={eventData.eventType}
                                    startValue={eventData.start}
                                    noFixedEndDateTime={Boolean(eventData.noFixedEndDateTime)}
                                    supportsNoFixedEndDateTime={supportsNoFixedEndDateTime}
                                    automaticRefundsAvailable={automaticRefundsAvailable}
                                    todaysDate={todaysDate}
                                    maxStandardNumber={MAX_STANDARD_NUMBER}
                                    dateTimePickerStyles={alignedDetailsFieldStyles}
                                    numberInputStyles={alignedDetailsFieldStyles}
                                    popoverProps={sharedPopoverProps}
                                    isImmutableField={isImmutableField}
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
                                />
                            </div>

                            <EventDetailsLocationControls
                                control={control}
                                coordinates={eventData.coordinates}
                                defaultCoordinates={defaultLocation?.coordinates}
                                coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
                                onSelectedAddressChange={(nextCoordinates, nextAddress) => {
                                    setValue('coordinates', nextCoordinates, { shouldDirty: true, shouldValidate: true });
                                    setValue('address', nextAddress, { shouldDirty: true, shouldValidate: true });
                                }}
                                isLocationImmutable={isLocationImmutable}
                                isImmutableField={isImmutableField}
                                templatesLoading={templatesLoading}
                                templatesError={templatesError}
                                templateOrganizationId={templateOrganizationId}
                                templateOptions={templateOptions}
                                comboboxProps={sharedComboboxProps}
                                multiSelectStyles={alignedDetailsFieldStyles}
                                numberInputStyles={alignedDetailsFieldStyles}
                                maxStandardNumber={MAX_STANDARD_NUMBER}
                                normalizeNumberValue={normalizeNumber}
                                minAge={eventData.minAge}
                                maxAge={eventData.maxAge}
                                localFieldCreationControl={localFieldCreationControl}
                                registrationQuestionsEditor={registrationQuestionsEditor}
                                hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
                                teamSignup={Boolean(eventData.teamSignup)}
                            />

                            <EventDetailsResourceControls
                                control={control}
                                showOrganizationFields={showOrganizationFieldsInEventDetails}
                                organizationResourcePool={organizationResourcePool}
                                resourceSelectorLoading={resourceSelectorLoading}
                                organizationHostedEventId={organizationHostedEventId}
                                isImmutableField={isImmutableField}
                                rentalResourcesError={rentalResourcesError}
                                showLocalFieldCreationControls={showLocalFieldCreationControls}
                                eventLocalFields={eventLocalFields}
                                fieldNamesCollapsed={fieldNamesCollapsed}
                                setFieldNamesCollapsed={setFieldNamesCollapsed}
                                maxResourceNameLength={MAX_MEDIUM_TEXT_LENGTH}
                                onLocalFieldNameChange={handleLocalFieldNameChange}
                            />
                        </EventDetailsSection>

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

                        <StaffSection
                            collapsed={collapsedSections['section-officials']}
                            onToggle={() => toggleSectionCollapse('section-officials')}
                        >
                                    <Controller
                                        name="doTeamsOfficiate"
                                        control={control}
                                        render={({ field }) => (
                                            <Switch
                                                label="Teams provide officials"
                                                description="Allow assigning team officials alongside dedicated staff refs."
                                                checked={field.value}
                                                onChange={(e) => {
                                                    const checked = e?.currentTarget?.checked ?? false;
                                                    field.onChange(checked);
                                                    if (!checked) {
                                                        setValue('teamOfficialsMaySwap', false, { shouldDirty: true, shouldValidate: true });
                                                        if (eventData.officialSchedulingMode === 'TEAM_STAFFING') {
                                                            setValue('officialSchedulingMode', 'SCHEDULE', { shouldDirty: true, shouldValidate: true });
                                                        }
                                                    }
                                                }}
                                            />
                                        )}
                                    />
                                    {eventData.doTeamsOfficiate && (
                                        <Controller
                                            name="teamOfficialsMaySwap"
                                            control={control}
                                            render={({ field }) => (
                                                <Switch
                                                    label="Team officials may swap"
                                                    description="Allow any participating team to take over officiating a match."
                                                    checked={field.value}
                                                    onChange={(e) => field.onChange(e?.currentTarget?.checked ?? false)}
                                                />
                                            )}
                                        />
                                    )}
                                    <StaffOfficialPositionEditor
                                        officialSchedulingMode={eventData.officialSchedulingMode}
                                        officialPositions={eventData.officialPositions || []}
                                        sportDefaultPositionCount={sportOfficialPositionTemplates.length}
                                        coverageError={officialStaffingCoverageError}
                                        maxShortTextLength={MAX_SHORT_TEXT_LENGTH}
                                        comboboxProps={sharedComboboxProps}
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
                                    />

                                    {isOrganizationHostedEvent ? (
                                        <StaffOrganizationRosterPicker
                                            search={organizationStaffSearch}
                                            typeFilter={organizationStaffTypeFilter}
                                            statusFilter={organizationStaffStatusFilter}
                                            entries={filteredOrganizationStaffEntries}
                                            visibleCount={organizationStaffVisibleCount}
                                            assignedOfficialUserIds={assignedUserIdSetByRole.OFFICIAL}
                                            assistantHostIds={assistantHostValue}
                                            hostId={eventData.hostId}
                                            maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                            eventOfficialsDisabled={isImmutableField('eventOfficials')}
                                            assistantHostsDisabled={isImmutableField('assistantHostIds')}
                                            hostDisabled={isImmutableField('hostId')}
                                            comboboxProps={sharedComboboxProps}
                                            onSearchChange={setOrganizationStaffSearch}
                                            onTypeFilterChange={setOrganizationStaffTypeFilter}
                                            onStatusFilterChange={setOrganizationStaffStatusFilter}
                                            onScrollRoster={(event) => maybeExtendVisibleCountOnScroll(event, filteredOrganizationStaffEntries.length, setOrganizationStaffVisibleCount)}
                                            onAddOfficial={handleAddOfficial}
                                            onAddAssistantHost={handleAddAssistantHost}
                                            onSetHost={handleHostChange}
                                        />
                                    ) : (
                                        <StaffNonOrganizationInvitePanel
                                            search={nonOrgStaffSearch}
                                            searchResults={nonOrgStaffResults}
                                            searchLoading={nonOrgStaffSearchLoading}
                                            searchError={nonOrgStaffError}
                                            inviteDraft={newStaffInvite}
                                            assignedOfficialUserIds={assignedUserIdSetByRole.OFFICIAL}
                                            assistantHostIds={assistantHostValue}
                                            hostId={eventData.hostId}
                                            maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                            maxShortTextLength={MAX_SHORT_TEXT_LENGTH}
                                            eventOfficialsDisabled={isImmutableField('eventOfficials')}
                                            assistantHostsDisabled={isImmutableField('assistantHostIds')}
                                            onSearchChange={setNonOrgStaffSearch}
                                            onAddOfficial={handleAddOfficial}
                                            onAddAssistantHost={handleAddAssistantHost}
                                            onInviteFieldChange={(field, value) => setNewStaffInvite((prev) => ({ ...prev, [field]: value }))}
                                            onInviteRoleToggle={(role) => setNewStaffInvite((prev) => ({
                                                ...prev,
                                                roles: prev.roles.includes(role)
                                                    ? prev.roles.filter((existingRole) => existingRole !== role)
                                                    : [...prev.roles, role],
                                            }))}
                                            onStageInvite={handleStagePendingStaffInvite}
                                        />
                                    )}

                                    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                                        <StaffAssignedOfficialsList
                                            cards={assignedOfficialCards}
                                            visibleCount={officialCardVisibleCount}
                                            officialPositions={eventData.officialPositions || []}
                                            eventOfficialByUserId={eventOfficialByUserId}
                                            availableFieldOptions={availableOfficialFieldOptions}
                                            assignedOfficialsDisabled={isImmutableField('eventOfficials')}
                                            comboboxProps={sharedComboboxProps}
                                            onScroll={(event) => maybeExtendVisibleCountOnScroll(event, assignedOfficialCards.length, setOfficialCardVisibleCount)}
                                            onRemoveCard={(card) => {
                                                if (card.source === 'draft' && card.email) {
                                                    setPendingStaffInvites((prev) => prev.flatMap((invite) => {
                                                        if (normalizeInviteEmail(invite.email) !== normalizeInviteEmail(card.email)) {
                                                            return [invite];
                                                        }
                                                        const nextRoles = invite.roles.filter((role) => role !== 'OFFICIAL');
                                                        if (!nextRoles.length) {
                                                            return [];
                                                        }
                                                        return [{ ...invite, roles: nextRoles }];
                                                    }));
                                                    return;
                                                }
                                                if (card.userId) {
                                                    handleRemoveOfficial(card.userId);
                                                }
                                            }}
                                            onUpdateEligibility={handleUpdateEventOfficialEligibility}
                                        />

                                        <StaffAssignedHostsList
                                            cards={assignedHostCards}
                                            visibleCount={hostCardVisibleCount}
                                            assistantHostsDisabled={isImmutableField('assistantHostIds')}
                                            onScroll={(event) => maybeExtendVisibleCountOnScroll(event, assignedHostCards.length, setHostCardVisibleCount)}
                                            onRemoveCard={(card) => {
                                                if (card.source === 'draft' && card.email) {
                                                    setPendingStaffInvites((prev) => prev.flatMap((invite) => {
                                                        if (normalizeInviteEmail(invite.email) !== normalizeInviteEmail(card.email)) {
                                                            return [invite];
                                                        }
                                                        const nextRoles = invite.roles.filter((role) => role !== 'ASSISTANT_HOST');
                                                        if (!nextRoles.length) {
                                                            return [];
                                                        }
                                                        return [{ ...invite, roles: nextRoles }];
                                                    }));
                                                    return;
                                                }
                                                if (card.userId) {
                                                    handleRemoveAssistantHost(card.userId);
                                                }
                                            }}
                                        />
                                    </SimpleGrid>
                                    {staffInviteError && (
                                        <Text size="xs" c="red">
                                            {staffInviteError}
                                        </Text>
                                    )}
                        </StaffSection>

                        <DivisionSettingsSection
                            collapsed={collapsedSections['section-division-settings']}
                            onToggle={() => toggleSectionCollapse('section-division-settings')}
                        >
                            <div id="section-division-settings-content" className="mt-4 space-y-4">
                                <DivisionModeControls
                                    control={control}
                                    supportsEditableTeamSignup={supportsEditableTeamSignup}
                                    showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                                    eventType={eventData.eventType}
                                    singleDivision={eventData.singleDivision}
                                    leagueIncludesPlayoffs={Boolean(leagueData.includePlayoffs)}
                                    splitLeaguePlayoffDivisionsLocked={splitLeaguePlayoffDivisionsLocked}
                                    hasExternalRentalField={hasExternalRentalField}
                                    isImmutableField={isImmutableField}
                                />
                                {eventData.singleDivision ? (
                                <div className="rounded-lg border border-gray-200 bg-white p-4">
                                    <Stack gap="md">
                                        <div>
                                            <Title order={6}>Single Division</Title>
                                            <Text size="sm" c="dimmed">
                                                Price, capacity, and payment plans apply to every selected division.
                                            </Text>
                                        </div>
                                        <motion.div
                                            id="division-defaults-content"
                                            layout
                                            className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start"
                                            transition={DIVISION_LAYOUT_TRANSITION}
                                        >
                                            <AnimatedLayoutSection in={eventData.singleDivision} className="md:col-span-3">
                                                <Controller
                                                    name="maxParticipants"
                                                    control={control}
                                                    render={({ field, fieldState }) => (
                                                        <NumberInput
                                                            label={eventData.teamSignup ? 'Max Teams' : 'Max Participants'}
                                                            min={2}
                                                            max={MAX_STANDARD_NUMBER}
                                                            value={field.value ?? ''}
                                                            w="100%"
                                                            styles={alignedDetailsFieldStyles}
                                                            clampBehavior="blur"
                                                            disabled={isImmutableField('maxParticipants')}
                                                            onChange={(val) => {
                                                                if (isImmutableField('maxParticipants')) return;
                                                                const numeric = typeof val === 'number' && Number.isFinite(val)
                                                                    ? Math.trunc(val)
                                                                    : null;
                                                                field.onChange(numeric);
                                                            }}
                                                            error={fieldState.error?.message as string | undefined}
                                                        />
                                                    )}
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs}
                                                className="md:col-span-3"
                                            >
                                                <NumberInput
                                                    label={eventData.singleDivision ? 'Playoff Team Count' : 'Default Playoff Team Count'}
                                                    min={2}
                                                    max={MAX_STANDARD_NUMBER}
                                                    w="100%"
                                                    styles={alignedDetailsFieldStyles}
                                                    value={typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined}
                                                    disabled={isImmutableField('playoffTeamCount')}
                                                    clampBehavior="strict"
                                                    onChange={(value) => {
                                                        if (isImmutableField('playoffTeamCount')) return;
                                                        const numeric = typeof value === 'number' ? value : Number(value);
                                                        setLeagueData((prev) => ({
                                                            ...prev,
                                                            playoffTeamCount: Number.isFinite(numeric) ? Math.max(2, Math.trunc(numeric)) : undefined,
                                                        }));
                                                    }}
                                                    error={errors.leagueData?.playoffTeamCount?.message as string | undefined}
                                                />
                                                {!eventData.singleDivision ? (
                                                    <Text size="xs" c="dimmed" mt="xs">
                                                        Used as the default for new divisions.
                                                    </Text>
                                                ) : null}
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'LEAGUE'}
                                                className="md:col-span-12"
                                            >
                                                <LeagueFields
                                                    leagueData={leagueData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    participantCount={eventData.maxParticipants ?? undefined}
                                                    onLeagueDataChange={(updates) => setLeagueData((prev) => ({ ...prev, ...updates }))}
                                                    slots={[]}
                                                    onAddSlot={() => undefined}
                                                    onUpdateSlot={() => undefined}
                                                    onRemoveSlot={() => undefined}
                                                    fields={[]}
                                                    fieldsLoading={false}
                                                    showPlayoffSettings={false}
                                                    showTimeslots={false}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'LEAGUE' && leagueData.includePlayoffs && !eventData.splitLeaguePlayoffDivisions}
                                                className="md:col-span-12"
                                            >
                                                <TournamentFields
                                                    title="Playoff Configuration"
                                                    tournamentData={playoffData}
                                                    setTournamentData={setPlayoffData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <SingleDivisionPoolControls
                                                visible={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                defaults={singleDivisionPoolPlayDefaults}
                                                maxStandardNumber={MAX_STANDARD_NUMBER}
                                                numberInputStyles={alignedDetailsFieldStyles}
                                                disabled={isImmutableField('divisions')}
                                                onChange={updateSingleDivisionTournamentPoolDefaults}
                                            />
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                                className="md:col-span-12"
                                            >
                                                <LeagueFields
                                                    configurationTitle="Pool Configuration"
                                                    leagueData={leagueData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    participantCount={eventData.maxParticipants ?? undefined}
                                                    onLeagueDataChange={(updates) => setLeagueData((prev) => ({ ...prev, ...updates }))}
                                                    slots={[]}
                                                    onAddSlot={() => undefined}
                                                    onUpdateSlot={() => undefined}
                                                    onRemoveSlot={() => undefined}
                                                    fields={[]}
                                                    fieldsLoading={false}
                                                    showPlayoffSettings={false}
                                                    showTimeslots={false}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <AnimatedLayoutSection
                                                in={eventData.singleDivision && eventData.eventType === 'TOURNAMENT'}
                                                className="md:col-span-12"
                                            >
                                                <TournamentFields
                                                    title="Tournament Configuration"
                                                    tournamentData={tournamentData}
                                                    setTournamentData={setTournamentData}
                                                    sport={eventData.sportConfig ?? undefined}
                                                    unstyled
                                                />
                                            </AnimatedLayoutSection>
                                            <SingleDivisionPricingControls
                                                visible={eventData.singleDivision && !eventData.allowPaymentPlans}
                                                control={control}
                                                priceCents={eventData.price}
                                                eventType={eventData.eventType}
                                                taxable={eventTaxableForPreview}
                                                maxPriceCents={MAX_PRICE_CENTS}
                                                numberInputStyles={alignedDetailsFieldStyles}
                                                hasStripeAccount={hasStripeAccount}
                                                priceImmutable={isImmutableField('price')}
                                                organizerTaxCollectionAllowed={organizerTaxCollectionAllowed}
                                                organizerResponsibilityMessage={eventTaxPolicyForPreview.organizerResponsibilityMessage}
                                                showTaxHandlingControls={isOrganizationHostedEvent || organizerTaxCollectionAllowed}
                                                organizerManualTaxSelected={organizerManualTaxSelected}
                                                organizationDefaultEventTaxHandling={organizationDefaultEventTaxHandling}
                                                connectingStripe={connectingStripe}
                                                onConnectStripe={handleConnectStripe}
                                            />
                                            <SingleDivisionPaymentPlanControls
                                                allowPaymentPlans={eventData.allowPaymentPlans}
                                                installmentCount={eventData.installmentCount || 0}
                                                installmentAmounts={eventData.installmentAmounts || []}
                                                installmentDueDates={eventData.installmentDueDates || []}
                                                installmentDueRelativeDays={eventData.installmentDueRelativeDays || []}
                                                teamSignup={eventData.teamSignup}
                                                allowTeamSplitDefault={eventData.allowTeamSplitDefault}
                                                eventType={eventData.eventType}
                                                parentEvent={eventData.parentEvent}
                                                eventStart={eventData.start}
                                                taxable={eventTaxableForPreview}
                                                hasStripeAccount={hasStripeAccount}
                                                maxStandardNumber={MAX_STANDARD_NUMBER}
                                                maxPriceCents={MAX_PRICE_CENTS}
                                                onAllowPaymentPlansChange={(next) => {
                                                    setValue('allowPaymentPlans', next, { shouldDirty: true, shouldValidate: true });
                                                    if (next && (!eventData.installmentAmounts?.length || eventData.installmentAmounts.length === 0)) {
                                                        syncInstallmentCount((eventData.installmentCount || 1));
                                                    } else if (next) {
                                                        setValue('price', sumInstallmentAmounts(eventData.installmentAmounts), {
                                                            shouldDirty: true,
                                                            shouldValidate: true,
                                                        });
                                                    }
                                                }}
                                                onInstallmentCountChange={(count) => syncInstallmentCount(count)}
                                                onTeamSplitDefaultChange={(checked) => setValue('allowTeamSplitDefault', checked, {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                })}
                                                onInstallmentDueRelativeDayChange={setInstallmentDueRelativeDay}
                                                onInstallmentDueDateChange={setInstallmentDueDate}
                                                onInstallmentAmountChange={setInstallmentAmount}
                                                onRemoveInstallment={removeInstallment}
                                                onAddInstallment={() => syncInstallmentCount((eventData.installmentAmounts?.length || 0) + 1)}
                                            />
                                        </motion.div>
                                    </Stack>
                                </div>
                                ) : null}
                                <div className="space-y-3">
                                    <Text size="sm" fw={600}>
                                        {divisionEditor.editingId ? 'Edit Division' : 'New Division'}
                                    </Text>
                                    <AnimatedSection in={splitDivisionEditorEnabled} collapseClassName="max-w-xs">
                                        <MantineSelect
                                            label="Division Type"
                                            data={[
                                                { value: 'LEAGUE', label: 'League' },
                                                { value: 'PLAYOFF', label: 'Playoff' },
                                            ]}
                                            value={divisionEditor.divisionKind}
                                            comboboxProps={sharedComboboxProps}
                                            disabled={isImmutableField('divisions')}
                                            onChange={handleDivisionEditorKindChange}
                                        />
                                    </AnimatedSection>
                                </div>
                                <AnimatedSection in={!splitDivisionEditorEnabled || divisionEditor.divisionKind === 'LEAGUE'}>
                                    <motion.div
                                        layout
                                        className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start"
                                        transition={DIVISION_LAYOUT_TRANSITION}
                                    >
                                    <DivisionEditorCoreControls
                                        gender={divisionEditor.gender}
                                        skillDivisionTypeId={divisionEditor.skillDivisionTypeId}
                                        ageDivisionTypeId={divisionEditor.ageDivisionTypeId}
                                        name={divisionEditor.name}
                                        maxParticipants={divisionEditor.maxParticipants}
                                        price={divisionEditor.price}
                                        allowPaymentPlans={divisionEditor.allowPaymentPlans}
                                        singleDivision={eventData.singleDivision}
                                        teamSignup={eventData.teamSignup}
                                        eventType={eventData.eventType}
                                        taxable={eventTaxableForPreview}
                                        divisionEditorReady={divisionEditorReady}
                                        divisionsImmutable={isImmutableField('divisions')}
                                        hasStripeAccount={hasStripeAccount}
                                        maxStandardNumber={MAX_STANDARD_NUMBER}
                                        maxPriceCents={MAX_PRICE_CENTS}
                                        maxMediumTextLength={MAX_MEDIUM_TEXT_LENGTH}
                                        divisionMaxParticipantsWarning={divisionMaxParticipantsWarning}
                                        genderOptions={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                        skillDivisionTypeOptions={skillDivisionTypeSelectOptions}
                                        ageDivisionTypeOptions={ageDivisionTypeSelectOptions}
                                        comboboxProps={sharedComboboxProps}
                                        onGenderChange={(gender) => updateDivisionEditorSelection({ gender })}
                                        onSkillDivisionChange={(skillDivisionTypeId) => updateDivisionEditorSelection({ skillDivisionTypeId })}
                                        onAgeDivisionChange={(ageDivisionTypeId) => updateDivisionEditorSelection({ ageDivisionTypeId })}
                                        onNameChange={(nextName) => {
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                name: nextName,
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
                                        onPriceChange={(nextValue) => {
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                price: normalizePriceCents(nextValue),
                                                error: null,
                                            }));
                                        }}
                                    />
                                    {!eventData.singleDivision ? (
                                        <DivisionEditorPaymentPlanControls
                                            allowPaymentPlans={divisionEditor.allowPaymentPlans}
                                            installmentCount={divisionEditor.installmentCount || 0}
                                            installmentAmounts={divisionEditor.installmentAmounts || []}
                                            installmentDueDates={divisionEditor.installmentDueDates || []}
                                            installmentDueRelativeDays={divisionEditor.installmentDueRelativeDays || []}
                                            eventType={eventData.eventType}
                                            parentEvent={eventData.parentEvent}
                                            eventStart={eventData.start}
                                            taxable={eventTaxableForPreview}
                                            disabled={isImmutableField('divisions') || !divisionEditorReady || !hasStripeAccount}
                                            maxStandardNumber={MAX_STANDARD_NUMBER}
                                            maxPriceCents={MAX_PRICE_CENTS}
                                            onAllowPaymentPlansChange={(checked) => {
                                                setDivisionEditor((prev) => ({
                                                    ...prev,
                                                    allowPaymentPlans: checked,
                                                    price: checked && prev.installmentAmounts.length
                                                        ? sumInstallmentAmounts(prev.installmentAmounts)
                                                        : prev.price,
                                                    installmentCount: checked
                                                        ? (prev.installmentCount || prev.installmentAmounts.length || 1)
                                                        : 0,
                                                    installmentDueDates: checked ? prev.installmentDueDates : [],
                                                    installmentDueRelativeDays: checked ? prev.installmentDueRelativeDays : [],
                                                    installmentAmounts: checked ? prev.installmentAmounts : [],
                                                    error: null,
                                                }));
                                                if (checked && (!divisionEditor.installmentAmounts || divisionEditor.installmentAmounts.length === 0)) {
                                                    syncDivisionInstallmentCount(divisionEditor.installmentCount || 1);
                                                }
                                            }}
                                            onInstallmentCountChange={(count) => syncDivisionInstallmentCount(count)}
                                            onInstallmentDueRelativeDayChange={setDivisionInstallmentDueRelativeDay}
                                            onInstallmentDueDateChange={setDivisionInstallmentDueDate}
                                            onInstallmentAmountChange={setDivisionInstallmentAmount}
                                            onRemoveInstallment={removeDivisionInstallment}
                                            onAddInstallment={() => syncDivisionInstallmentCount((divisionEditor.installmentAmounts?.length || 0) + 1)}
                                        />
                                    ) : null}
                                    <DivisionEditorLeagueConfigControls
                                        leagueConfigVisible={eventData.eventType === 'LEAGUE' && !eventData.singleDivision}
                                        playoffTeamCountVisible={eventData.eventType === 'LEAGUE' && !eventData.singleDivision && leagueData.includePlayoffs}
                                        playoffConfigVisible={
                                            eventData.eventType === 'LEAGUE'
                                            && !eventData.singleDivision
                                            && leagueData.includePlayoffs
                                            && !eventData.splitLeaguePlayoffDivisions
                                        }
                                        leagueData={divisionEditor.leagueConfig}
                                        sport={eventData.sportConfig ?? undefined}
                                        participantCount={divisionEditor.maxParticipants ?? undefined}
                                        playoffTeamCount={divisionEditor.playoffTeamCount}
                                        playoffConfig={buildTournamentConfig(divisionEditor.playoffConfig)}
                                        maxStandardNumber={MAX_STANDARD_NUMBER}
                                        numberInputStyles={alignedDetailsFieldStyles}
                                        disabled={isImmutableField('divisions') || !divisionEditorReady}
                                        onLeagueDataChange={setDivisionEditorLeagueConfig}
                                        onPlayoffTeamCountChange={(playoffTeamCount) => {
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                playoffTeamCount,
                                                error: null,
                                            }));
                                        }}
                                        onPlayoffConfigChange={setDivisionEditorPlayoffConfig}
                                    />
                                    <DivisionEditorPlayoffPlacementControls
                                        visible={splitDivisionEditorEnabled && typeof divisionEditor.playoffTeamCount === 'number' && divisionEditor.playoffTeamCount > 0}
                                        playoffTeamCount={divisionEditor.playoffTeamCount}
                                        playoffDivisionOptions={playoffDivisionSelectOptions}
                                        placementDivisionIds={normalizeDivisionKeys(divisionEditor.playoffPlacementDivisionIds || [])}
                                        comboboxProps={sharedComboboxProps}
                                        disabled={isImmutableField('divisions')}
                                        onPlacementDivisionChange={(placementIndex, value) => {
                                            const normalizedValue = normalizeDivisionKeys([value ?? ''])[0] ?? '';
                                            setDivisionEditor((prev) => {
                                                const nextMapping = [...prev.playoffPlacementDivisionIds];
                                                while (nextMapping.length <= placementIndex) {
                                                    nextMapping.push('');
                                                }
                                                nextMapping[placementIndex] = normalizedValue;
                                                return {
                                                    ...prev,
                                                    playoffPlacementDivisionIds: nextMapping,
                                                    error: null,
                                                };
                                            });
                                        }}
                                    />
                                    <DivisionEditorTournamentPoolControls
                                        visible={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs && !eventData.singleDivision}
                                        playoffTeamCount={divisionEditor.playoffTeamCount}
                                        poolCount={divisionEditor.poolCount}
                                        poolTeamCount={derivePoolTeamCount(
                                            eventData.singleDivision
                                                ? eventData.maxParticipants
                                                : divisionEditor.maxParticipants,
                                            divisionEditor.poolCount,
                                        )}
                                        maxStandardNumber={MAX_STANDARD_NUMBER}
                                        numberInputStyles={alignedDetailsFieldStyles}
                                        disabled={isImmutableField('divisions') || !divisionEditorReady}
                                        onPlayoffTeamCountChange={(playoffTeamCount) => {
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                playoffTeamCount,
                                                error: null,
                                            }));
                                        }}
                                        onPoolCountChange={(poolCount) => {
                                            setDivisionEditor((prev) => ({
                                                ...prev,
                                                poolCount,
                                                error: null,
                                            }));
                                        }}
                                    />
                                    <DivisionEditorTournamentConfigControls
                                        poolConfigVisible={eventData.eventType === 'TOURNAMENT' && leagueData.includePlayoffs}
                                        tournamentConfigVisible={eventData.eventType === 'TOURNAMENT' && !eventData.singleDivision}
                                        leagueData={divisionEditor.leagueConfig}
                                        tournamentData={buildTournamentConfig(divisionEditor.playoffConfig)}
                                        sport={eventData.sportConfig ?? undefined}
                                        participantCount={divisionEditor.maxParticipants ?? undefined}
                                        onLeagueDataChange={setDivisionEditorLeagueConfig}
                                        onTournamentDataChange={setDivisionEditorPlayoffConfig}
                                    />
                                </motion.div>
                                <AnimatedLayoutSection in={eventData.singleDivision}>
                                    <Text size="xs" c="dimmed">
                                        {eventData.eventType === 'LEAGUE'
                                            ? 'Division price, capacity, payment plan, league schedule settings, and playoff settings apply to the single combined schedule.'
                                            : eventData.eventType === 'TOURNAMENT'
                                                ? 'Division price, capacity, payment plan, and pool-play settings apply to every selected division while single division is enabled.'
                                                : 'Division price, capacity, and payment plan mirror event-level values while single division is enabled.'}
                                    </Text>
                                </AnimatedLayoutSection>
                                </AnimatedSection>
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
                                participantCount={eventData.singleDivision
                                    ? (eventData.maxParticipants ?? 0)
                                    : (() => {
                                        const total = (eventData.divisionDetails || []).reduce((sum, detail) => (
                                            sum + Math.max(0, Math.trunc(detail.maxParticipants || 0))
                                        ), 0);
                                        return total > 0 ? total : (eventData.maxParticipants ?? 0);
                                    })()}
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
                    </form>
                </div>

                {/* Footer */}
                <div className="border-t p-6 flex justify-between items-center">
                    <div className="flex flex-col gap-3">
                        {leagueWarning && (
                            <Alert color="yellow" radius="md">
                                {leagueWarning}
                            </Alert>
                        )}
                        {leagueError && (
                            <Alert color="red" radius="md">
                                {leagueError}
                            </Alert>
                        )}
                    </div>
                </div>
            </div>
        </div>
            </div>
        </div>
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
