import type { ComponentProps } from 'react';
import { NumberInput } from '@mantine/core';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

type DivisionEditorTournamentPoolControlsProps = {
    visible: boolean;
    playoffTeamCount?: number | null;
    poolCount?: number | null;
    poolTeamCount?: number | null;
    maxStandardNumber: number;
    numberInputStyles?: ComponentProps<typeof NumberInput>['styles'];
    disabled: boolean;
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
    onPlayoffTeamCountChange,
    onPoolCountChange,
}: DivisionEditorTournamentPoolControlsProps) => (
    <>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
            <NumberInput
                label="Bracket Teams"
                min={2}
                max={maxStandardNumber}
                value={playoffTeamCount ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="strict"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onPlayoffTeamCountChange(Number.isFinite(numeric)
                        ? Math.max(2, Math.trunc(numeric))
                        : null);
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
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
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onPoolCountChange(Number.isFinite(numeric)
                        ? Math.max(1, Math.trunc(numeric))
                        : null);
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
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
