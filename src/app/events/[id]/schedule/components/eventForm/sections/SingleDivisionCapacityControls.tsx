import type { ComponentProps } from 'react';
import { NumberInput, Text } from '@mantine/core';
import {
    Controller,
    type Control,
} from 'react-hook-form';

import type { Event } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import type { EventFormValues } from '../formTypes';

type SingleDivisionCapacityControlsProps = {
    control: Control<EventFormValues>;
    singleDivision: boolean;
    teamSignup: boolean;
    eventType: Event['eventType'];
    includePlayoffs: boolean;
    playoffTeamCount?: number;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    maxParticipantsDisabled: boolean;
    playoffTeamCountDisabled: boolean;
    playoffTeamCountError?: string;
    onPlayoffTeamCountChange: (value: number | undefined) => void;
};

export const SingleDivisionCapacityControls = ({
    control,
    singleDivision,
    teamSignup,
    eventType,
    includePlayoffs,
    playoffTeamCount,
    maxStandardNumber,
    numberInputStyles,
    maxParticipantsDisabled,
    playoffTeamCountDisabled,
    playoffTeamCountError,
    onPlayoffTeamCountChange,
}: SingleDivisionCapacityControlsProps) => (
    <>
        <AnimatedLayoutSection in={singleDivision} className="md:col-span-3">
            <Controller
                name="maxParticipants"
                control={control}
                render={({ field, fieldState }) => (
                    <NumberInput
                        label={teamSignup ? 'Max Teams' : 'Max Participants'}
                        min={2}
                        max={maxStandardNumber}
                        value={field.value ?? ''}
                        w="100%"
                        styles={numberInputStyles}
                        clampBehavior="blur"
                        disabled={maxParticipantsDisabled}
                        onChange={(value) => {
                            if (maxParticipantsDisabled) return;
                            const numeric = typeof value === 'number' && Number.isFinite(value)
                                ? Math.trunc(value)
                                : null;
                            field.onChange(numeric);
                        }}
                        error={fieldState.error?.message as string | undefined}
                    />
                )}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection
            in={eventType === 'LEAGUE' && includePlayoffs}
            className="md:col-span-3"
        >
            <NumberInput
                label={singleDivision ? 'Playoff Team Count' : 'Default Playoff Team Count'}
                min={2}
                max={maxStandardNumber}
                w="100%"
                styles={numberInputStyles}
                value={typeof playoffTeamCount === 'number' ? playoffTeamCount : undefined}
                disabled={playoffTeamCountDisabled}
                clampBehavior="strict"
                onChange={(value) => {
                    if (playoffTeamCountDisabled) return;
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onPlayoffTeamCountChange(Number.isFinite(numeric) ? Math.max(2, Math.trunc(numeric)) : undefined);
                }}
                error={playoffTeamCountError}
            />
            {!singleDivision ? (
                <Text size="xs" c="dimmed" mt="xs">
                    Used as the default for new divisions.
                </Text>
            ) : null}
        </AnimatedLayoutSection>
    </>
);
