import { Controller, type Control } from 'react-hook-form';
import { Text } from '@mantine/core';

import LeagueFields, {
    type LeagueFieldOption,
    type LeagueSlotForm,
} from '@/app/discover/components/LeagueFields';
import type { Event, Field, LeagueConfig, Sport } from '@/types';

import type { EventFormValues } from '../formTypes';
import { AnimatedSection } from '../components/AnimatedSection';
import { FacilityResourceSelector } from '../components/FacilityResourceSelector';

type DivisionOption = {
    value: string;
    label: string;
};

type ScheduleConfigBodyProps = {
    control: Control<EventFormValues>;
    usesRentalSlots: boolean;
    immutableTimeSlotCount: number;
    isWeeklyChildEvent: boolean;
    isSchedulableEventType: boolean;
    isOrganizationManagedEvent: boolean;
    organizationHostedEventId?: string | null;
    selectedFields: Field[];
    resourceSelectorLoading: boolean;
    rentalResourcesError?: string | null;
    isImmutableField: (key: keyof Event) => boolean;
    leagueData: LeagueConfig;
    sport?: Sport;
    participantCount: number;
    leagueSlots: LeagueSlotForm[];
    leagueFieldOptions?: LeagueFieldOption[];
    divisionOptions: DivisionOption[];
    eventStartDate?: string;
    lockSlotDivisions: boolean;
    lockedDivisionKeys: string[];
    readOnly: boolean;
    allowDivisionEditsWhenReadOnly: boolean;
    allowResourceEditsWhenReadOnly: boolean;
    onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
    onAddSlot: () => void;
    onUpdateSlot: (index: number, updates: Partial<LeagueSlotForm>) => void;
    onRemoveSlot: (index: number) => void;
    onAutoResolveSlotConflict: (index: number) => void;
};

export const ScheduleConfigBody = ({
    control,
    usesRentalSlots,
    immutableTimeSlotCount,
    isWeeklyChildEvent,
    isSchedulableEventType,
    isOrganizationManagedEvent,
    organizationHostedEventId,
    selectedFields,
    resourceSelectorLoading,
    rentalResourcesError,
    isImmutableField,
    leagueData,
    sport,
    participantCount,
    leagueSlots,
    leagueFieldOptions,
    divisionOptions,
    eventStartDate,
    lockSlotDivisions,
    lockedDivisionKeys,
    readOnly,
    allowDivisionEditsWhenReadOnly,
    allowResourceEditsWhenReadOnly,
    onLeagueDataChange,
    onAddSlot,
    onUpdateSlot,
    onRemoveSlot,
    onAutoResolveSlotConflict,
}: ScheduleConfigBodyProps) => (
    <div id="section-schedule-config-content" className="mt-4 space-y-6">
        {!isSchedulableEventType && usesRentalSlots ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
                <Text fw={600} size="sm">Rental Slot Schedule</Text>
                <Text size="sm" c="dimmed">
                    This event uses pre-booked rental slots. Slot scheduling is managed by the rental reservation.
                </Text>
                <Text size="sm" c="dimmed" mt="xs">
                    Linked slots: {immutableTimeSlotCount}
                </Text>
            </div>
        ) : null}

        {isWeeklyChildEvent ? (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                <Text fw={600} size="sm">Weekly Session Schedule</Text>
                <Text size="sm" c="dimmed">
                    Older parent-linked weekly rows use fixed start/end times from the selected session. New weekly registrations use the parent event slot and occurrence date.
                </Text>
                <Controller
                    name="selectedFieldIds"
                    control={control}
                    render={({ field, fieldState }) => (
                        <FacilityResourceSelector
                            label="Session Resources"
                            description="Choose which resources this weekly child session can use."
                            placeholder={resourceSelectorLoading ? 'Loading resources...' : 'Select one or more resources'}
                            fields={selectedFields}
                            value={Array.isArray(field.value) ? field.value : []}
                            disabled={resourceSelectorLoading || isImmutableField('fieldIds')}
                            loading={resourceSelectorLoading}
                            eventOrganizationId={organizationHostedEventId}
                            onChange={(values) => {
                                if (isImmutableField('fieldIds')) return;
                                field.onChange(values);
                            }}
                            error={fieldState.error?.message || rentalResourcesError}
                        />
                    )}
                />
            </div>
        ) : null}

        {isSchedulableEventType ? (
            <div className="space-y-4">
                <AnimatedSection in={isOrganizationManagedEvent}>
                    <Text size="xs" c="dimmed">
                        Select event resources directly inside each timeslot.
                    </Text>
                </AnimatedSection>

                <LeagueFields
                    leagueData={leagueData}
                    sport={sport}
                    participantCount={participantCount}
                    onLeagueDataChange={onLeagueDataChange}
                    slots={leagueSlots}
                    onAddSlot={onAddSlot}
                    onUpdateSlot={onUpdateSlot}
                    onRemoveSlot={onRemoveSlot}
                    onAutoResolveSlotConflict={onAutoResolveSlotConflict}
                    fields={selectedFields}
                    fieldsLoading={resourceSelectorLoading}
                    fieldOptions={leagueFieldOptions}
                    divisionOptions={divisionOptions}
                    eventStartDate={eventStartDate}
                    lockSlotDivisions={lockSlotDivisions}
                    lockedDivisionKeys={lockedDivisionKeys}
                    readOnly={readOnly}
                    allowDivisionEditsWhenReadOnly={allowDivisionEditsWhenReadOnly}
                    allowResourceEditsWhenReadOnly={allowResourceEditsWhenReadOnly}
                    showPlayoffSettings={false}
                    showLeagueConfiguration={false}
                    emptyFieldsMessage={isOrganizationManagedEvent
                        ? 'No resources found. Create a resource on the Organizations page first, then return here to attach weekly availability.'
                        : undefined}
                />
            </div>
        ) : null}
    </div>
);
