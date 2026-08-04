import type { ComponentProps } from 'react';
import { NumberInput } from '@mantine/core';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { DIVISION_NUMBER_FIELD_CLASS } from '../divisionLayout';
import { BRACKET_TEAM_COUNT_ERROR } from '../divisionMessages';
import { parseOptionalWholeNumber } from '../divisionNumbers';

type SingleDivisionPoolDefaults = {
    bracketTeams?: number | null;
    poolCount?: number | null;
    poolTeamCount?: number | null;
};

type SingleDivisionPoolControlsProps = {
    visible: boolean;
    defaults: SingleDivisionPoolDefaults;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    disabled: boolean;
    playoffTeamCountError?: string;
    onChange: (updates: { playoffTeamCount?: number | null; poolCount?: number | null }) => void;
};

export const SingleDivisionPoolControls = ({
    visible,
    defaults,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    playoffTeamCountError,
    onChange,
}: SingleDivisionPoolControlsProps) => (
    <>
        <AnimatedLayoutSection in={visible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Bracket Teams"
                min={2}
                max={maxStandardNumber}
                value={defaults.bracketTeams ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="none"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    onChange({
                        playoffTeamCount: parseOptionalWholeNumber(value) ?? null,
                    });
                }}
                error={playoffTeamCountError || (
                    typeof defaults.bracketTeams === 'number' && defaults.bracketTeams >= 2
                        ? undefined
                        : BRACKET_TEAM_COUNT_ERROR
                )}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Pool Count"
                min={1}
                max={maxStandardNumber}
                value={defaults.poolCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="strict"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    onChange({
                        poolCount: parseOptionalWholeNumber(value) ?? null,
                    });
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Pool Team Count"
                value={defaults.poolTeamCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                disabled
            />
        </AnimatedLayoutSection>
    </>
);
