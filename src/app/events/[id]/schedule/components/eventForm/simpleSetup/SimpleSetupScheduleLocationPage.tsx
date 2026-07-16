'use client';

import { NumberInput, Stack, Text, Title } from '@mantine/core';

import { deriveScheduleParticipantCount } from '../divisionForm';
import { coordinatesAreSet } from '../locationHelpers';
import { EventDetailsLocationControls } from '../sections/EventDetailsLocationControls';
import { EventDetailsResourceControls } from '../sections/EventDetailsResourceControls';
import type { EventFormSectionsProps } from '../sections/EventFormSections';
import { EventDetailsTimingControls } from '../sections/EventDetailsTimingControls';
import { ScheduleConfigBody } from '../sections/ScheduleConfigBody';

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const alignedDetailsFieldStyles = {
    label: {
        minHeight: '3rem',
        display: 'flex',
        alignItems: 'flex-end',
        lineHeight: 1.25,
    },
} as const;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_MEDIUM_TEXT_LENGTH = 160;

type SimpleSetupScheduleLocationPageProps = {
    model: EventFormSectionsProps;
};

export const SimpleSetupScheduleLocationPage = ({
    model,
}: SimpleSetupScheduleLocationPageProps) => {
    const {
        configurationActions,
        control,
        defaultCoordinates,
        divisionOptions,
        errors,
        eventData,
        fieldWriters,
        isImmutableField,
        resourceController,
        sectionsController,
        slotController,
        slotDivisionKeys,
    } = model;
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
        fieldNamesCollapsed,
        isSchedulableEventType,
        isWeeklyChildEvent,
        setFieldNamesCollapsed,
        showScheduleConfig,
    } = sectionsController;
    const {
        handleEndChange,
        handleNoFixedEndDateTimeChange,
        handleSelectedAddressChange,
        handleStartChange,
    } = configurationActions;
    const {
        handleAddSlot,
        handleAutoResolveSlotConflict,
        handleRemoveSlot,
        handleUpdateSlot,
    } = slotController;
    const { setLeagueData } = fieldWriters;
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

    return (
        <Stack gap="xl">
            <div>
                <Title order={4}>Timing and location</Title>
                <Text size="sm" c="dimmed">
                    Set the event window, address, and resources available to the schedule.
                </Text>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
                <EventDetailsTimingControls
                    control={control}
                    eventType={eventData.eventType}
                    startValue={eventData.start}
                    noFixedEndDateTime={Boolean(eventData.noFixedEndDateTime)}
                    supportsNoFixedEndDateTime={model.presentation.supportsNoFixedEndDateTime}
                    automaticRefundsAvailable={model.paymentController.automaticRefundsAvailable}
                    manualPaymentsEnabled={model.paymentController.manualPaymentsEnabled}
                    todaysDate={new Date(new Date().setHours(0, 0, 0, 0))}
                    maxStandardNumber={MAX_STANDARD_NUMBER}
                    dateTimePickerStyles={alignedDetailsFieldStyles}
                    numberInputStyles={alignedDetailsFieldStyles}
                    popoverProps={sharedPopoverProps}
                    isImmutableField={isImmutableField}
                    onStartChange={handleStartChange}
                    onEndChange={handleEndChange}
                    onNoFixedEndDateTimeChange={handleNoFixedEndDateTimeChange}
                    onManualPaymentsChange={() => undefined}
                    showScheduleControls
                    showRegistrationControls={false}
                />
            </div>

            <EventDetailsLocationControls
                control={control}
                coordinates={eventData.coordinates}
                defaultCoordinates={defaultCoordinates}
                coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
                onSelectedAddressChange={handleSelectedAddressChange}
                isLocationImmutable={
                    isImmutableField('location')
                    || isImmutableField('coordinates')
                    || hasExternalRentalField
                }
                isImmutableField={isImmutableField}
                templatesLoading={false}
                templateOptions={[]}
                comboboxProps={sharedComboboxProps}
                maxStandardNumber={MAX_STANDARD_NUMBER}
                normalizeNumberValue={() => undefined}
                showRequiredDocumentControls={false}
                showAffiliateListingControls={false}
                showAgeControls={false}
                showRegistrationQuestions={false}
                showCapacityWarning={false}
                resourceControls={showOrganizationFieldsInEventDetails ? (
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
                        embedded
                        showLocalFieldNameControls={false}
                        onLocalFieldNameChange={handleLocalFieldNameChange}
                    />
                ) : null}
                localFieldNameControls={showLocalFieldCreationControls ? (
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
                        embedded
                        showOrganizationResourceControls={false}
                        localFieldCreationControl={localFieldCreationControl}
                        onLocalFieldNameChange={handleLocalFieldNameChange}
                    />
                ) : null}
                registrationQuestionsEditor={null}
                hasUnsetTeamCapacityLimits={false}
                teamSignup={Boolean(eventData.teamSignup)}
            />

            {showScheduleConfig ? (
                <div>
                    <Title order={4}>Schedule</Title>
                    <Text size="sm" c="dimmed" mb="md">
                        Configure the timeslots the match generator can use.
                    </Text>
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
                        leagueData={eventData.leagueData}
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
                        onLeagueDataChange={(updates) => setLeagueData((previous) => ({
                            ...previous,
                            ...updates,
                        }))}
                        onAddSlot={handleAddSlot}
                        onUpdateSlot={handleUpdateSlot}
                        onRemoveSlot={handleRemoveSlot}
                        onAutoResolveSlotConflict={handleAutoResolveSlotConflict}
                    />
                </div>
            ) : null}
        </Stack>
    );
};
