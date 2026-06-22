import type { Dispatch, SetStateAction } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Button, Collapse, Group, Text, TextInput, Title } from '@mantine/core';

import { getFieldDisplayName } from '@/lib/fieldUtils';
import type { Event, Field } from '@/types';

import type { EventFormValues } from '../formTypes';
import { SECTION_ANIMATION_DURATION_MS } from '../constants';
import { FacilityResourceSelector } from '../components/FacilityResourceSelector';

type EventDetailsResourceControlsProps = {
    control: Control<EventFormValues>;
    showOrganizationFields: boolean;
    organizationResourcePool: Field[];
    resourceSelectorLoading: boolean;
    organizationHostedEventId?: string | null;
    isImmutableField: (key: keyof Event) => boolean;
    rentalResourcesError?: string | null;
    showLocalFieldCreationControls: boolean;
    eventLocalFields: Field[];
    fieldNamesCollapsed: boolean;
    setFieldNamesCollapsed: Dispatch<SetStateAction<boolean>>;
    maxResourceNameLength: number;
    onLocalFieldNameChange: (fieldId: string, name: string) => void;
};

export const EventDetailsResourceControls = ({
    control,
    showOrganizationFields,
    organizationResourcePool,
    resourceSelectorLoading,
    organizationHostedEventId,
    isImmutableField,
    rentalResourcesError,
    showLocalFieldCreationControls,
    eventLocalFields,
    fieldNamesCollapsed,
    setFieldNamesCollapsed,
    maxResourceNameLength,
    onLocalFieldNameChange,
}: EventDetailsResourceControlsProps) => (
    <>
        {showOrganizationFields ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start">
                <div className="md:col-span-6">
                    <Controller
                        name="selectedFieldIds"
                        control={control}
                        render={({ field, fieldState }) => (
                            <FacilityResourceSelector
                                label="Resources"
                                description="Choose which resources this event can use."
                                placeholder={resourceSelectorLoading ? 'Loading resources...' : 'Select one or more resources'}
                                fields={organizationResourcePool}
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
            </div>
        ) : null}

        {showLocalFieldCreationControls && eventLocalFields.length > 0 ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
                    <div>
                        <Title order={6}>Resource Names</Title>
                        <Text size="sm" c="dimmed">
                            Resources will be created for this event using the names you provide below.
                        </Text>
                    </div>
                    <Button
                        type="button"
                        variant="subtle"
                        size="xs"
                        aria-expanded={!fieldNamesCollapsed}
                        aria-controls="event-local-field-names"
                        onClick={() => setFieldNamesCollapsed((previous) => !previous)}
                    >
                        {fieldNamesCollapsed ? 'Expand' : 'Collapse'}
                    </Button>
                </Group>
                <Collapse in={!fieldNamesCollapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                    <div
                        id="event-local-field-names"
                        className="mt-4 grid max-h-[22rem] grid-cols-1 gap-3 overflow-y-auto pr-2 md:grid-cols-2"
                    >
                        {eventLocalFields.map((field) => (
                            <TextInput
                                key={field.$id}
                                label={`${getFieldDisplayName(field, 'Resource')} Name`}
                                value={field.name ?? ''}
                                w="100%"
                                maxLength={maxResourceNameLength}
                                onChange={(event) => onLocalFieldNameChange(field.$id, event.currentTarget.value)}
                            />
                        ))}
                    </div>
                </Collapse>
            </div>
        ) : null}
    </>
);
