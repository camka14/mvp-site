import type { ComponentProps } from 'react';
import { NumberInput, Text } from '@mantine/core';
import {
    Controller,
    type Control,
} from 'react-hook-form';

import type { Event } from '@/types';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { DIVISION_NUMBER_FIELD_CLASS } from '../divisionLayout';
import { BRACKET_TEAM_COUNT_ERROR } from '../divisionMessages';
import { parseOptionalWholeNumber } from '../divisionNumbers';
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
}: SingleDivisionCapacityControlsProps) => {
    const resolvedPlayoffTeamCountError = playoffTeamCountError || (
        typeof playoffTeamCount === 'number' && playoffTeamCount >= 2
            ? undefined
            : BRACKET_TEAM_COUNT_ERROR
    );

    return <>
        <AnimatedLayoutSection in={singleDivision} className={DIVISION_NUMBER_FIELD_CLASS}>
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
            className={DIVISION_NUMBER_FIELD_CLASS}
        >
            <NumberInput
                label={singleDivision ? 'Playoff Team Count' : 'Default Playoff Team Count'}
                min={2}
                max={maxStandardNumber}
                w="100%"
                styles={numberInputStyles}
                value={typeof playoffTeamCount === 'number' ? playoffTeamCount : ''}
                disabled={playoffTeamCountDisabled}
                clampBehavior="none"
                onChange={(value) => {
                    if (playoffTeamCountDisabled) return;
                    onPlayoffTeamCountChange(parseOptionalWholeNumber(value));
                }}
                error={Boolean(resolvedPlayoffTeamCountError)}
            />
            {resolvedPlayoffTeamCountError ? (
                <Text size="xs" c="red" mt={4}>
                    {resolvedPlayoffTeamCountError}
                </Text>
            ) : null}
            {!singleDivision ? (
                <Text size="xs" c="dimmed" mt="xs">
                    Used as the default for new divisions.
                </Text>
            ) : null}
        </AnimatedLayoutSection>
    </>;
};
