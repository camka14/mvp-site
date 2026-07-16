import type { ComponentProps } from 'react';
import { NumberInput } from '@mantine/core';

import type { Division, Event, EventTag, RegistrationQuestionDraft } from '@/types';

import { deriveScheduleParticipantCount } from '../divisionForm';
import type { EventFormValues } from '../formTypes';
import { coordinatesAreSet } from '../locationHelpers';
import { normalizeNumber } from '../configDefaults';
import type { useDivisionCommitController } from '../hooks/useDivisionCommitController';
import type { useDivisionEditorController } from '../hooks/useDivisionEditorController';
import type { useEventFormConfigurationActions } from '../hooks/useEventFormConfigurationActions';
import type { useEventFormFieldWriters } from '../hooks/useEventFormFieldWriters';
import type { useEventFormSectionsController } from '../hooks/useEventFormSectionsController';
import type { useEventPaymentController } from '../hooks/useEventPaymentController';
import type { useEventResourceController } from '../hooks/useEventResourceController';
import type { useEventSlotController } from '../hooks/useEventSlotController';
import type { useStaffOfficialController } from '../hooks/useStaffOfficialController';
import { EventFormShell } from '../components/EventFormShell';
import { BasicInformationSection } from './BasicInformationSection';
import { EventDetailsPanel } from './EventDetailsPanel';
import { EventFormDivisionSection } from './EventFormDivisionSection';
import { EventFormStaffSection } from './EventFormStaffSection';
import { LeagueScoringConfigSection } from './LeagueScoringConfigSection';
import { ManualPaymentSettingsSection } from './ManualPaymentSettingsSection';
import { MatchRulesConfigSection } from './MatchRulesConfigSection';
import { RegistrationQuestionsSection } from './RegistrationQuestionsSection';
import { ScheduleConfigBody } from './ScheduleConfigBody';
import { ScheduleConfigSection } from './ScheduleConfigSection';

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
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_SHORT_TEXT_LENGTH = 80;
const MAX_MEDIUM_TEXT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;

type FormCatalogModel = {
    eventTagOptions: EventTag[];
    sportOptions: ComponentProps<typeof BasicInformationSection>['sportOptions'];
    sportsById: ComponentProps<typeof BasicInformationSection>['sportsById'];
    sportsError?: unknown;
    sportsLoading: boolean;
};

type SetFormValue = (
    name: string,
    value: unknown,
    options?: Record<string, unknown>,
) => void;

type PresentationModel = {
    allowImageEdit: boolean;
    eventTypeOptions: ComponentProps<typeof EventDetailsPanel>['eventTypeOptions'];
    lockedEventTypeTagSlugs: string[];
    mobileEditUnsupportedWarning?: string | null;
    selectedImageUrl: string;
    selectedSportForOfficials: ComponentProps<typeof MatchRulesConfigSection>['sport'];
    supportsNoFixedEndDateTime: boolean;
};

type RegistrationQuestionsModel = {
    drafts: RegistrationQuestionDraft[];
    error?: string | null;
    loading: boolean;
};

type TemplateModel = {
    error?: string | null;
    loading: boolean;
    organizationId?: string | null;
    options: ComponentProps<typeof EventDetailsPanel>['templateOptions'];
};

export type EventFormSectionsProps = {
    catalog: FormCatalogModel;
    configurationActions: ReturnType<typeof useEventFormConfigurationActions>;
    control: ComponentProps<typeof BasicInformationSection>['control'];
    defaultCoordinates?: ComponentProps<typeof EventDetailsPanel>['defaultCoordinates'];
    divisionController: ReturnType<typeof useDivisionEditorController>;
    divisionOptions: ComponentProps<typeof ScheduleConfigBody>['divisionOptions'];
    divisionTypeOptions: ComponentProps<typeof EventFormDivisionSection>['divisionTypeOptions'];
    errors: ComponentProps<typeof BasicInformationSection>['errors'];
    eventData: EventFormValues;
    fieldWriters: ReturnType<typeof useEventFormFieldWriters>;
    formId?: string;
    handleSaveDivisionDetail: ReturnType<typeof useDivisionCommitController>['handleSaveDivisionDetail'];
    hasUnsetTeamCapacityLimits: boolean;
    hideSectionNavigation?: boolean;
    isAffiliateEvent: boolean;
    isImmutableField: (fieldName: keyof Event) => boolean;
    leagueError?: string | null;
    onTryoutDivisionSelection: (divisions: Division[]) => void;
    onTryoutPriceChange: (sourceDivisionId: string, price: number) => void;
    organizationId?: string;
    paymentController: ReturnType<typeof useEventPaymentController>;
    presentation: PresentationModel;
    registrationQuestions: RegistrationQuestionsModel;
    resourceController: ReturnType<typeof useEventResourceController>;
    sectionsController: ReturnType<typeof useEventFormSectionsController>;
    setValue: SetFormValue;
    slotController: ReturnType<typeof useEventSlotController>;
    slotDivisionKeys: string[];
    staffController: ReturnType<typeof useStaffOfficialController>;
    templates: TemplateModel;
};

export const EventFormSections = ({
    catalog,
    configurationActions,
    control,
    defaultCoordinates,
    divisionController,
    divisionOptions,
    divisionTypeOptions,
    errors,
    eventData,
    fieldWriters,
    formId,
    handleSaveDivisionDetail,
    hasUnsetTeamCapacityLimits,
    hideSectionNavigation = false,
    isAffiliateEvent,
    isImmutableField,
    leagueError,
    onTryoutDivisionSelection,
    onTryoutPriceChange,
    organizationId,
    paymentController,
    presentation,
    registrationQuestions,
    resourceController,
    sectionsController,
    setValue,
    slotController,
    slotDivisionKeys,
    staffController,
    templates,
}: EventFormSectionsProps) => {
    const leagueData = eventData.leagueData;
    const tournamentData = eventData.tournamentData;
    const playoffData = eventData.playoffData;
    const {
        eventLocalFields,
        fieldCount,
        handleLocalFieldNameChange,
        hasExternalRentalField,
        hasImmutableTimeSlots,
        immutableTimeSlots,
        isOrganizationHostedEvent,
        isOrganizationManagedEvent,
        leagueFieldOptions,
        organizationHostedEventId,
        organizationResourcePool,
        rentalResourcesError,
        resourceSelectorLoading,
        selectedFields,
        setFieldCount,
        showLocalFieldCreationControls,
        showOrganizationFieldsInEventDetails,
        usesRentalSlots,
    } = resourceController;
    const {
        activeSectionId,
        collapsedSections,
        fieldNamesCollapsed,
        handleManualPaymentsChange,
        isSchedulableEventType,
        isWeeklyChildEvent,
        questionActions,
        scoringConfigSectionLabel,
        setFieldNamesCollapsed,
        showManualPaymentsSection,
        showMatchRulesSection,
        showScheduleConfig,
        showScoringConfigSection,
        showStaffSection,
        showsFixedTeamEventToggle,
        scrollToSection,
        supportsEditableTeamSignup,
        toggleSectionCollapse,
        visibleSectionNavItems,
    } = sectionsController;
    const {
        automaticRefundsAvailable,
        addManualPaymentLink,
        manualPaymentLinks,
        manualPaymentsEnabled,
        removeManualPaymentLink,
        setManualPaymentLinkValue,
    } = paymentController;
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
    } = configurationActions;
    const {
        handleAddSlot,
        handleAutoResolveSlotConflict,
        handleRemoveSlot,
        handleUpdateSlot,
        leagueWarning,
    } = slotController;
    const {
        setLeagueData,
        setPlayoffData,
        setTournamentData,
    } = fieldWriters;
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
    const registrationQuestionsEditor = (
        <RegistrationQuestionsSection
            collapsed={collapsedSections['section-registration-questions']}
            questions={registrationQuestions.drafts}
            loading={registrationQuestions.loading}
            error={registrationQuestions.error}
            onToggle={() => toggleSectionCollapse('section-registration-questions')}
            onAddQuestion={questionActions.addQuestion}
            onPromptChange={questionActions.changePrompt}
            onRequiredChange={questionActions.changeRequired}
            onRemoveQuestion={questionActions.removeQuestion}
        />
    );

    return (
        <EventFormShell
            formId={formId}
            sectionNavItems={visibleSectionNavItems}
            activeSectionId={activeSectionId}
            mobileEditUnsupportedWarning={presentation.mobileEditUnsupportedWarning}
            leagueWarning={leagueWarning}
            leagueError={leagueError}
            onSelectSection={scrollToSection}
            hideSectionNavigation={hideSectionNavigation}
        >
            <BasicInformationSection
                collapsed={collapsedSections['section-basic-information']}
                control={control}
                errors={errors}
                selectedImageUrl={presentation.selectedImageUrl}
                allowImageEdit={presentation.allowImageEdit}
                sportsLoading={catalog.sportsLoading}
                sportOptions={catalog.sportOptions}
                sportsById={catalog.sportsById}
                sportsError={catalog.sportsError}
                eventTagOptions={catalog.eventTagOptions}
                lockedTagSlugs={presentation.lockedEventTypeTagSlugs}
                comboboxProps={sharedComboboxProps}
                maxEventNameLength={MAX_EVENT_NAME_LENGTH}
                maxDescriptionLength={MAX_DESCRIPTION_LENGTH}
                isImmutableField={isImmutableField}
                setValue={setValue}
                onToggle={() => toggleSectionCollapse('section-basic-information')}
                onImageChange={(fileId) => setValue('imageId', fileId, { shouldDirty: true, shouldValidate: true })}
            />

            <EventDetailsPanel
                collapsed={collapsedSections['section-event-details']}
                control={control}
                eventData={eventData}
                leagueData={leagueData}
                isAffiliateEvent={isAffiliateEvent}
                eventTypeOptions={presentation.eventTypeOptions}
                supportsEditableTeamSignup={supportsEditableTeamSignup}
                showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                supportsNoFixedEndDateTime={presentation.supportsNoFixedEndDateTime}
                automaticRefundsAvailable={automaticRefundsAvailable}
                manualPaymentsEnabled={manualPaymentsEnabled}
                todaysDate={new Date(new Date().setHours(0, 0, 0, 0))}
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
                defaultCoordinates={defaultCoordinates}
                onSelectedAddressChange={handleSelectedAddressChange}
                isLocationImmutable={isImmutableField('location') || isImmutableField('coordinates') || hasExternalRentalField}
                templatesLoading={templates.loading}
                templatesError={templates.error}
                templateOrganizationId={templates.organizationId}
                templateOptions={templates.options}
                normalizeNumberValue={normalizeNumber}
                showAffiliateListingControls={isAffiliateEvent}
                showRequiredDocumentControls={!isAffiliateEvent}
                localFieldCreationControl={isAffiliateEvent ? null : localFieldCreationControl}
                registrationQuestionsEditor={isAffiliateEvent ? null : registrationQuestionsEditor}
                hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
                showOrganizationFields={!isAffiliateEvent && showOrganizationFieldsInEventDetails}
                organizationResourcePool={organizationResourcePool}
                resourceSelectorLoading={resourceSelectorLoading}
                organizationHostedEventId={organizationHostedEventId}
                rentalResourcesError={rentalResourcesError}
                showLocalFieldCreationControls={!isAffiliateEvent && showLocalFieldCreationControls}
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
                sport={presentation.selectedSportForOfficials}
                usesSets={eventData.eventType === 'LEAGUE'
                    ? Boolean(leagueData.usesSets)
                    : eventData.eventType === 'TOURNAMENT'
                        ? Boolean(tournamentData.usesSets)
                        : Boolean(presentation.selectedSportForOfficials?.usePointsPerSetWin)}
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
                onTryoutDivisionSelection={onTryoutDivisionSelection}
                onTryoutPriceChange={onTryoutPriceChange}
                organizationId={organizationId}
                paymentController={paymentController}
                playoffData={playoffData}
                setLeagueData={setLeagueData}
                setPlayoffData={setPlayoffData}
                setTournamentData={setTournamentData}
                setValue={setValue}
                showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                splitLeaguePlayoffDivisionsLocked={isImmutableField('splitLeaguePlayoffDivisions') && !hasExternalRentalField}
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
                    leagueSlots={eventData.leagueSlots}
                    leagueFieldOptions={leagueFieldOptions}
                    divisionOptions={divisionOptions}
                    eventStartDate={eventData.start}
                    lockSlotDivisions={Boolean(eventData.singleDivision)}
                    lockedDivisionKeys={slotDivisionKeys}
                    readOnly={hasImmutableTimeSlots}
                    allowDivisionEditsWhenReadOnly={hasExternalRentalField && !eventData.singleDivision}
                    allowResourceEditsWhenReadOnly={hasExternalRentalField}
                    onLeagueDataChange={(updates) => setLeagueData((previous) => ({ ...previous, ...updates }))}
                    onAddSlot={handleAddSlot}
                    onUpdateSlot={handleUpdateSlot}
                    onRemoveSlot={handleRemoveSlot}
                    onAutoResolveSlotConflict={handleAutoResolveSlotConflict}
                />
            </ScheduleConfigSection>
        </EventFormShell>
    );
};
