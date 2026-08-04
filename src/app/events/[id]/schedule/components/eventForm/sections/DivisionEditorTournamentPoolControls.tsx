import type { ComponentProps } from 'react';
import { NumberInput } from '@mantine/core';

import { AnimatedLayoutSection } from '../components/AnimatedSection';
import { DIVISION_NUMBER_FIELD_CLASS } from '../divisionLayout';
import { BRACKET_TEAM_COUNT_ERROR } from '../divisionMessages';
import { parseOptionalWholeNumber } from '../divisionNumbers';

type DivisionEditorTournamentPoolControlsProps = {
    visible: boolean;
    playoffTeamCount?: number | null;
    poolCount?: number | null;
    poolTeamCount?: number | null;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    disabled: boolean;
    playoffTeamCountError?: string;
    onPlayoffTeamCountChange: (value: number | null) => void;
    onPoolCountChange: (value: number | null) => void;
};

export const DivisionEditorTournamentPoolControls = ({
    visible,
    playoffTeamCount,
    poolCount,
    poolTeamCount,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    playoffTeamCountError,
    onPlayoffTeamCountChange,
    onPoolCountChange,
}: DivisionEditorTournamentPoolControlsProps) => (
    <>
        <AnimatedLayoutSection in={visible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Bracket Teams"
                min={2}
                max={maxStandardNumber}
                value={playoffTeamCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="none"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    onPlayoffTeamCountChange(parseOptionalWholeNumber(value) ?? null);
                }}
                error={playoffTeamCountError || (
                    typeof playoffTeamCount === 'number' && playoffTeamCount >= 2
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
                value={poolCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="strict"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    onPoolCountChange(parseOptionalWholeNumber(value) ?? null);
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className={DIVISION_NUMBER_FIELD_CLASS}>
            <NumberInput
                label="Pool Team Count"
                value={poolTeamCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                disabled
            />
        </AnimatedLayoutSection>
    </>
);
