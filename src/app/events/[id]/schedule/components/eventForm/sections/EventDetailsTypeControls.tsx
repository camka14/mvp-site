import type { ComponentProps } from 'react';
import { Controller, type Control } from 'react-hook-form';
import {
    Checkbox,
    NumberInput,
    Select as MantineSelect,
} from '@mantine/core';

import type { Event } from '@/types';

import type { EventFormValues } from '../../EventForm';
import { AnimatedSection } from '../components/AnimatedSection';

type EventDetailsTypeControlsProps = {
    control: Control<EventFormValues>;
    eventType: Event['eventType'];
    eventTypeOptions: Array<{ value: string; label: string }>;
    includePlayoffs: boolean;
    supportsEditableTeamSignup: boolean;
    showsFixedTeamEventToggle: boolean;
    maxStandardNumber: number;
    selectStyles?: ComponentProps<typeof MantineSelect>['styles'];
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    isImmutableField: (key: keyof Event) => boolean;
    onEventTypeChange: (eventType: Event['eventType'], applyValue: (eventType: Event['eventType']) => void) => void;
    onIncludePlayoffsChange: (checked: boolean) => void;
    onIncludePoolPlayChange: (checked: boolean) => void;
};

export const EventDetailsTypeControls = ({
    control,
    eventType,
    eventTypeOptions,
    includePlayoffs,
    supportsEditableTeamSignup,
    showsFixedTeamEventToggle,
    maxStandardNumber,
    selectStyles,
    numberInputStyles,
    comboboxProps,
    isImmutableField,
    onEventTypeChange,
    onIncludePlayoffsChange,
    onIncludePoolPlayChange,
}: EventDetailsTypeControlsProps) => (
    <>
        <div className="md:col-span-2">
            <Controller
                name="eventType"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                    <div className="space-y-2">
                        <MantineSelect
                            label="Event Type"
                            data={eventTypeOptions}
                            value={field.value}
                            comboboxProps={comboboxProps}
                            styles={selectStyles}
                            disabled={isImmutableField('eventType')}
                            onChange={(value) => {
                                if (isImmutableField('eventType')) return;
                                if (!value) return;
                                onEventTypeChange(value as Event['eventType'], field.onChange);
                            }}
                            w="100%"
                        />
                        <AnimatedSection in={eventType === 'LEAGUE'}>
                            <Checkbox
                                size="xs"
                                label="Include playoffs"
                                checked={includePlayoffs}
                                disabled={isImmutableField('includePlayoffs')}
                                onChange={(event) => {
                                    if (isImmutableField('includePlayoffs')) return;
                                    onIncludePlayoffsChange(event.currentTarget.checked);
                                }}
                            />
                        </AnimatedSection>
                        <AnimatedSection in={eventType === 'TOURNAMENT'}>
                            <Checkbox
                                size="xs"
                                label="Include pool play"
                                checked={includePlayoffs}
                                disabled={isImmutableField('includePlayoffs')}
                                onChange={(event) => {
                                    if (isImmutableField('includePlayoffs')) return;
                                    onIncludePoolPlayChange(event.currentTarget.checked);
                                }}
                            />
                        </AnimatedSection>
                    </div>
                )}
            />
        </div>
        <div className="space-y-2 md:col-span-1" data-testid="team-size-control">
            <Controller
                name="teamSizeLimit"
                control={control}
                render={({ field, fieldState }) => (
                    <NumberInput
                        label="Team Size"
                        min={1}
                        max={maxStandardNumber}
                        value={field.value ?? ''}
                        w="100%"
                        styles={numberInputStyles}
                        clampBehavior="blur"
                        disabled={isImmutableField('teamSizeLimit')}
                        onChange={(val) => {
                            if (isImmutableField('teamSizeLimit')) return;
                            const numeric = typeof val === 'number' && Number.isFinite(val)
                                ? Math.trunc(val)
                                : null;
                            field.onChange(numeric);
                        }}
                        error={fieldState.error?.message as string | undefined}
                    />
                )}
            />
            <AnimatedSection in={supportsEditableTeamSignup} className="pt-1">
                <Controller
                    name="teamSignup"
                    control={control}
                    render={({ field: teamSignupField }) => (
                        <Checkbox
                            data-testid="team-signup-switch"
                            size="xs"
                            label="Use teams"
                            aria-label="Use teams"
                            checked={Boolean(teamSignupField.value)}
                            disabled={isImmutableField('teamSignup')}
                            onChange={(event) => {
                                if (isImmutableField('teamSignup')) return;
                                teamSignupField.onChange(event.currentTarget.checked);
                            }}
                        />
                    )}
                />
            </AnimatedSection>
            <AnimatedSection in={showsFixedTeamEventToggle} className="pt-1">
                <Checkbox
                    data-testid="team-event-checkbox"
                    size="xs"
                    label="Team Event"
                    aria-label="Team Event"
                    checked
                    disabled
                />
            </AnimatedSection>
        </div>
    </>
);
