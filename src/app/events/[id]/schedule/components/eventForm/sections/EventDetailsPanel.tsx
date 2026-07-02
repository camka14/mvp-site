import type {
    ComponentProps,
    Dispatch,
    ReactNode,
    SetStateAction,
} from 'react';
import type { Control } from 'react-hook-form';

import type {
    Event,
    Field,
    LeagueConfig,
} from '@/types';

import type { EventFormValues } from '../formTypes';
import { EventDetailsLocationControls } from './EventDetailsLocationControls';
import { EventDetailsResourceControls } from './EventDetailsResourceControls';
import { EventDetailsSection } from './EventDetailsSection';
import { EventDetailsTimingControls } from './EventDetailsTimingControls';
import { EventDetailsTypeControls } from './EventDetailsTypeControls';

type EventDetailsPanelProps = {
    collapsed: boolean;
    control: Control<EventFormValues>;
    eventData: EventFormValues;
    leagueData: LeagueConfig;
    isAffiliateEvent: boolean;
    eventTypeOptions: Array<{ value: string; label: string }>;
    supportsEditableTeamSignup: boolean;
    showsFixedTeamEventToggle: boolean;
    supportsNoFixedEndDateTime: boolean;
    automaticRefundsAvailable: boolean;
    manualPaymentsEnabled: boolean;
    todaysDate: Date;
    maxStandardNumber: number;
    maxResourceNameLength: number;
    selectStyles?: ComponentProps<typeof EventDetailsTypeControls>['selectStyles'];
    numberInputStyles?: ComponentProps<typeof EventDetailsTypeControls>['numberInputStyles'];
    dateTimePickerStyles?: ComponentProps<typeof EventDetailsTimingControls>['dateTimePickerStyles'];
    multiSelectStyles?: ComponentProps<typeof EventDetailsLocationControls>['multiSelectStyles'];
    popoverProps?: ComponentProps<typeof EventDetailsTimingControls>['popoverProps'];
    comboboxProps?: ComponentProps<typeof EventDetailsTypeControls>['comboboxProps'];
    isImmutableField: (key: keyof Event) => boolean;
    onToggle: () => void;
    onEventTypeChange: ComponentProps<typeof EventDetailsTypeControls>['onEventTypeChange'];
    onAffiliateEventChange: ComponentProps<typeof EventDetailsTypeControls>['onAffiliateEventChange'];
    onIncludePlayoffsChange: (checked: boolean) => void;
    onIncludePoolPlayChange: (checked: boolean) => void;
    onStartChange: (value: Date) => void;
    onEndChange: (value: Date) => void;
    onNoFixedEndDateTimeChange: (checked: boolean) => void;
    onManualPaymentsChange: (checked: boolean) => void;
    coordinatesSelected: boolean;
    defaultCoordinates?: [number, number];
    onSelectedAddressChange: (coordinates: [number, number], address: string) => void;
    isLocationImmutable: boolean;
    templatesLoading: boolean;
    templatesError?: string | null;
    templateOrganizationId?: string | null;
    templateOptions: Array<{ value: string; label: string }>;
    normalizeNumberValue: (value: unknown) => number | undefined;
    showAffiliateListingControls?: boolean;
    showRequiredDocumentControls?: boolean;
    localFieldCreationControl?: ReactNode;
    registrationQuestionsEditor: ReactNode;
    hasUnsetTeamCapacityLimits: boolean;
    showOrganizationFields: boolean;
    organizationResourcePool: Field[];
    resourceSelectorLoading: boolean;
    organizationHostedEventId?: string | null;
    rentalResourcesError?: string | null;
    showLocalFieldCreationControls: boolean;
    eventLocalFields: Field[];
    fieldNamesCollapsed: boolean;
    setFieldNamesCollapsed: Dispatch<SetStateAction<boolean>>;
    onLocalFieldNameChange: (fieldId: string, name: string) => void;
};

export const EventDetailsPanel = ({
    collapsed,
    control,
    eventData,
    leagueData,
    isAffiliateEvent,
    eventTypeOptions,
    supportsEditableTeamSignup,
    showsFixedTeamEventToggle,
    supportsNoFixedEndDateTime,
    automaticRefundsAvailable,
    manualPaymentsEnabled,
    todaysDate,
    maxStandardNumber,
    maxResourceNameLength,
    selectStyles,
    numberInputStyles,
    dateTimePickerStyles,
    multiSelectStyles,
    popoverProps,
    comboboxProps,
    isImmutableField,
    onToggle,
    onEventTypeChange,
    onAffiliateEventChange,
    onIncludePlayoffsChange,
    onIncludePoolPlayChange,
    onStartChange,
    onEndChange,
    onNoFixedEndDateTimeChange,
    onManualPaymentsChange,
    coordinatesSelected,
    defaultCoordinates,
    onSelectedAddressChange,
    isLocationImmutable,
    templatesLoading,
    templatesError,
    templateOrganizationId,
    templateOptions,
    normalizeNumberValue,
    showAffiliateListingControls = false,
    showRequiredDocumentControls = true,
    localFieldCreationControl,
    registrationQuestionsEditor,
    hasUnsetTeamCapacityLimits,
    showOrganizationFields,
    organizationResourcePool,
    resourceSelectorLoading,
    organizationHostedEventId,
    rentalResourcesError,
    showLocalFieldCreationControls,
    eventLocalFields,
    fieldNamesCollapsed,
    setFieldNamesCollapsed,
    onLocalFieldNameChange,
}: EventDetailsPanelProps) => (
    <EventDetailsSection
        collapsed={collapsed}
        onToggle={onToggle}
    >
        <div id="section-event-details-content" className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 md:items-start">
            <EventDetailsTypeControls
                control={control}
                eventType={eventData.eventType}
                isAffiliateEvent={isAffiliateEvent}
                eventTypeOptions={eventTypeOptions}
                includePlayoffs={Boolean(leagueData.includePlayoffs)}
                supportsEditableTeamSignup={supportsEditableTeamSignup}
                showsFixedTeamEventToggle={showsFixedTeamEventToggle}
                maxStandardNumber={maxStandardNumber}
                selectStyles={selectStyles}
                numberInputStyles={numberInputStyles}
                comboboxProps={comboboxProps}
                isImmutableField={isImmutableField}
                onEventTypeChange={onEventTypeChange}
                onAffiliateEventChange={onAffiliateEventChange}
                onIncludePlayoffsChange={onIncludePlayoffsChange}
                onIncludePoolPlayChange={onIncludePoolPlayChange}
            />
            <EventDetailsTimingControls
                control={control}
                eventType={eventData.eventType}
                startValue={eventData.start}
                noFixedEndDateTime={Boolean(eventData.noFixedEndDateTime)}
                supportsNoFixedEndDateTime={supportsNoFixedEndDateTime}
                automaticRefundsAvailable={automaticRefundsAvailable}
                manualPaymentsEnabled={manualPaymentsEnabled}
                todaysDate={todaysDate}
                maxStandardNumber={maxStandardNumber}
                dateTimePickerStyles={dateTimePickerStyles}
                numberInputStyles={numberInputStyles}
                popoverProps={popoverProps}
                isImmutableField={isImmutableField}
                onStartChange={onStartChange}
                onEndChange={onEndChange}
                onNoFixedEndDateTimeChange={onNoFixedEndDateTimeChange}
                onManualPaymentsChange={onManualPaymentsChange}
            />
        </div>

        <EventDetailsLocationControls
            control={control}
            coordinates={eventData.coordinates}
            defaultCoordinates={defaultCoordinates}
            coordinatesSelected={coordinatesSelected}
            onSelectedAddressChange={onSelectedAddressChange}
            isLocationImmutable={isLocationImmutable}
            isImmutableField={isImmutableField}
            templatesLoading={templatesLoading}
            templatesError={templatesError}
            templateOrganizationId={templateOrganizationId}
            templateOptions={templateOptions}
            comboboxProps={comboboxProps}
            multiSelectStyles={multiSelectStyles}
            maxStandardNumber={maxStandardNumber}
            normalizeNumberValue={normalizeNumberValue}
            minAge={eventData.minAge}
            maxAge={eventData.maxAge}
            showAffiliateListingControls={showAffiliateListingControls}
            showRequiredDocumentControls={showRequiredDocumentControls}
            resourceControls={showOrganizationFields ? (
                <EventDetailsResourceControls
                    control={control}
                    showOrganizationFields={showOrganizationFields}
                    organizationResourcePool={organizationResourcePool}
                    resourceSelectorLoading={resourceSelectorLoading}
                    organizationHostedEventId={organizationHostedEventId}
                    isImmutableField={isImmutableField}
                    rentalResourcesError={rentalResourcesError}
                    showLocalFieldCreationControls={showLocalFieldCreationControls}
                    eventLocalFields={eventLocalFields}
                    fieldNamesCollapsed={fieldNamesCollapsed}
                    setFieldNamesCollapsed={setFieldNamesCollapsed}
                    maxResourceNameLength={maxResourceNameLength}
                    embedded
                    showLocalFieldNameControls={false}
                    onLocalFieldNameChange={onLocalFieldNameChange}
                />
            ) : null}
            localFieldNameControls={showLocalFieldCreationControls ? (
                <EventDetailsResourceControls
                    control={control}
                    showOrganizationFields={showOrganizationFields}
                    organizationResourcePool={organizationResourcePool}
                    resourceSelectorLoading={resourceSelectorLoading}
                    organizationHostedEventId={organizationHostedEventId}
                    isImmutableField={isImmutableField}
                    rentalResourcesError={rentalResourcesError}
                    showLocalFieldCreationControls={showLocalFieldCreationControls}
                    eventLocalFields={eventLocalFields}
                    fieldNamesCollapsed={fieldNamesCollapsed}
                    setFieldNamesCollapsed={setFieldNamesCollapsed}
                    maxResourceNameLength={maxResourceNameLength}
                    embedded
                    showOrganizationResourceControls={false}
                    localFieldCreationControl={localFieldCreationControl}
                    onLocalFieldNameChange={onLocalFieldNameChange}
                />
            ) : null}
            registrationQuestionsEditor={registrationQuestionsEditor}
            hasUnsetTeamCapacityLimits={hasUnsetTeamCapacityLimits}
            teamSignup={Boolean(eventData.teamSignup)}
        />
    </EventDetailsSection>
);
