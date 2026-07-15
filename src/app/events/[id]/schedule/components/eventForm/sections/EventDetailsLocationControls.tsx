import type { ComponentProps, ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import {
    Alert,
    MultiSelect as MantineMultiSelect,
    NumberInput,
    Text,
} from '@mantine/core';

import LocationSelector, { type LocationSelectionMeta } from '@/components/location/LocationSelector';
import type { Event } from '@/types';

import type { EventFormValues } from '../formTypes';
import { AnimatedSection } from '../components/AnimatedSection';

type EventDetailsLocationControlsProps = {
    control: Control<EventFormValues>;
    coordinates?: [number, number];
    defaultCoordinates?: [number, number];
    coordinatesSelected: boolean;
    onSelectedAddressChange: (coordinates: [number, number], address: string) => void;
    isLocationImmutable: boolean;
    isImmutableField: (key: keyof Event) => boolean;
    templatesLoading: boolean;
    templatesError?: string | null;
    templateOrganizationId?: string | null;
    templateOptions: Array<{ value: string; label: string }>;
    comboboxProps?: ComponentProps<typeof MantineMultiSelect>['comboboxProps'];
    maxStandardNumber: number;
    normalizeNumberValue: (value: unknown) => number | undefined;
    minAge?: unknown;
    maxAge?: unknown;
    showLocationMap?: boolean;
    showAffiliateListingControls?: boolean;
    showRequiredDocumentControls?: boolean;
    showAgeControls?: boolean;
    showRegistrationQuestions?: boolean;
    showCapacityWarning?: boolean;
    resourceControls?: ReactNode;
    localFieldNameControls?: ReactNode;
    registrationQuestionsEditor: ReactNode;
    hasUnsetTeamCapacityLimits: boolean;
    teamSignup: boolean;
};

export const EventDetailsLocationControls = ({
    control,
    coordinates,
    defaultCoordinates,
    coordinatesSelected,
    onSelectedAddressChange,
    isLocationImmutable,
    isImmutableField,
    templatesLoading,
    templatesError,
    templateOrganizationId,
    templateOptions,
    comboboxProps,
    maxStandardNumber,
    normalizeNumberValue,
    minAge,
    maxAge,
    showLocationMap = true,
    showAffiliateListingControls = false,
    showRequiredDocumentControls = true,
    showAgeControls = true,
    showRegistrationQuestions = true,
    showCapacityWarning = true,
    resourceControls,
    localFieldNameControls,
    registrationQuestionsEditor,
    hasUnsetTeamCapacityLimits,
    teamSignup,
}: EventDetailsLocationControlsProps) => (
    <div className="space-y-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start">
            {showLocationMap ? <div className="md:col-span-6" data-testid="event-details-location-map">
                <Controller
                    name="location"
                    control={control}
                    render={({ field, fieldState }) => (
                        <LocationSelector
                            value={field.value}
                            coordinates={{
                                lat: (coordinates?.[1] ?? defaultCoordinates?.[1] ?? 0),
                                lng: (coordinates?.[0] ?? defaultCoordinates?.[0] ?? 0),
                            }}
                            onChange={(location, lat, lng, address, meta?: LocationSelectionMeta) => {
                                if (isLocationImmutable) return;
                                const nextSelected = Boolean(meta?.selected);
                                field.onChange(location);
                                onSelectedAddressChange(
                                    nextSelected ? [lng, lat] : [0, 0],
                                    nextSelected ? address ?? location : '',
                                );
                            }}
                            isValid={!fieldState.error}
                            disabled={isLocationImmutable}
                            label="Location"
                            required
                            errorMessage={fieldState.error?.message as string | undefined}
                            showStreetViewControl={false}
                            requireSelection
                            selected={coordinatesSelected}
                            selectionErrorMessage="Select an event address from suggestions or the map"
                            alwaysShowMap
                        />
                    )}
                />
                {resourceControls ? (
                    <div className="mt-4">
                        {resourceControls}
                    </div>
                ) : null}
            </div> : null}

            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 md:items-start ${showLocationMap ? 'md:col-span-6' : 'md:col-span-12'}`} data-testid="event-details-map-side-controls">
                {showRequiredDocumentControls ? (
                    <div className="sm:col-span-2">
                        <Controller
                            name="requiredTemplateIds"
                            control={control}
                            render={({ field }) => (
                                <MantineMultiSelect
                                    label="Required Documents"
                                    placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
                                    data={templateOptions}
                                    value={field.value ?? []}
                                    w="100%"
                                    disabled={!templateOrganizationId || templatesLoading || isImmutableField('requiredTemplateIds')}
                                    comboboxProps={comboboxProps}
                                    onChange={(vals) => {
                                        if (isImmutableField('requiredTemplateIds')) return;
                                        field.onChange(vals);
                                    }}
                                    clearable
                                    searchable
                                />
                            )}
                        />
                        <AnimatedSection in={Boolean(templatesError)}>
                            <Text size="sm" c="red">
                                {templatesError}
                            </Text>
                        </AnimatedSection>
                        <AnimatedSection in={!templatesLoading && Boolean(templateOrganizationId) && templateOptions.length === 0}>
                            <Text size="sm" c="dimmed">
                                No templates yet. Create one in your organization Document Templates tab.
                            </Text>
                        </AnimatedSection>
                    </div>
                ) : null}
                {showAffiliateListingControls ? (
                    <div>
                        <Controller
                            name="maxParticipants"
                            control={control}
                            render={({ field, fieldState }) => (
                                <NumberInput
                                    label="Max Participants"
                                    min={2}
                                    max={maxStandardNumber}
                                    value={field.value ?? ''}
                                    w="100%"
                                    clampBehavior="blur"
                                    disabled={isImmutableField('maxParticipants')}
                                    onChange={(value) => {
                                        if (isImmutableField('maxParticipants')) return;
                                        const numeric = typeof value === 'number' && Number.isFinite(value)
                                            ? Math.trunc(value)
                                            : null;
                                        field.onChange(numeric);
                                    }}
                                    error={fieldState.error?.message as string | undefined}
                                />
                            )}
                        />
                    </div>
                ) : null}
                {showAgeControls ? <div>
                    <Controller
                        name="minAge"
                        control={control}
                        render={({ field, fieldState }) => (
                            <NumberInput
                                label="Minimum Age"
                                min={0}
                                max={maxStandardNumber}
                                value={normalizeNumberValue(field.value) ?? ''}
                                w="100%"
                                clampBehavior="strict"
                                disabled={isImmutableField('minAge')}
                                onChange={(val) => {
                                    if (isImmutableField('minAge')) return;
                                    const next = typeof val === 'number' && Number.isFinite(val) ? val : undefined;
                                    field.onChange(next);
                                }}
                                error={fieldState.error?.message as string | undefined}
                            />
                        )}
                    />
                </div> : null}
                {showAgeControls ? <div>
                    <Controller
                        name="maxAge"
                        control={control}
                        render={({ field, fieldState }) => (
                            <NumberInput
                                label="Maximum Age"
                                min={0}
                                max={maxStandardNumber}
                                value={normalizeNumberValue(field.value) ?? ''}
                                w="100%"
                                clampBehavior="strict"
                                disabled={isImmutableField('maxAge')}
                                onChange={(val) => {
                                    if (isImmutableField('maxAge')) return;
                                    const next = typeof val === 'number' && Number.isFinite(val) ? val : undefined;
                                    field.onChange(next);
                                }}
                                error={fieldState.error?.message as string | undefined}
                            />
                        )}
                    />
                </div> : null}
                {showAgeControls ? <Text size="xs" c="dimmed" className="sm:col-span-2">
                    Leave age limits blank if anyone can register.
                </Text> : null}
                {showAgeControls ? <AnimatedSection
                    in={typeof minAge === 'number' || typeof maxAge === 'number'}
                    collapseClassName="sm:col-span-2"
                >
                    <Alert color="yellow" variant="light">
                        <Text fw={600} size="sm">
                            Age-restricted event
                        </Text>
                        <Text size="sm">
                            We only check age using the date of birth users enter in their profile. If your event requires an age check (for example, 18+ or 21+), you are responsible for verifying attendees&apos; age at check-in.
                        </Text>
                    </Alert>
                </AnimatedSection> : null}
                {showRegistrationQuestions ? registrationQuestionsEditor : null}
                {localFieldNameControls ? (
                    <div className="sm:col-span-2">{localFieldNameControls}</div>
                ) : null}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-start">
            {showCapacityWarning && hasUnsetTeamCapacityLimits ? (
                <div className="md:col-span-12">
                    <Alert color="yellow" variant="light" radius="md">
                        <Text size="sm" fw={600}>Capacity limits are required before save</Text>
                        <Text size="sm">
                            Set {teamSignup ? 'Max Teams' : 'Max Participants'} and Team Size.
                            Blank values are kept as null and shown as validation errors.
                        </Text>
                    </Alert>
                </div>
            ) : null}
        </div>
    </div>
);
