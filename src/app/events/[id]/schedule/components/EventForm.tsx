import React, { useCallback, useMemo } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { getEventImageUrl, Event, UserData, Team, Field } from '@/types';
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
    buildDivisionTypeOptionsForEvent,
    buildSlotDivisionLookup,
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

    if (!open) {
        return null;
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
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
                isAffiliateEvent={isAffiliateEvent}
                isImmutableField={isImmutableField}
                leagueError={leagueError}
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
        </div>
    );
});

EventForm.displayName = 'EventForm';

export default EventForm;
