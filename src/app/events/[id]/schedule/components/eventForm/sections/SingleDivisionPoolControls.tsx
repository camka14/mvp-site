import type { ComponentProps } from 'react';
import { NumberInput } from '@mantine/core';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

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
    onChange: (updates: { playoffTeamCount?: number | null; poolCount?: number | null }) => void;
};

export const SingleDivisionPoolControls = ({
    visible,
    defaults,
    maxStandardNumber,
    numberInputStyles,
    disabled,
    onChange,
}: SingleDivisionPoolControlsProps) => (
    <>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
            <NumberInput
                label="Bracket Teams"
                min={2}
                max={maxStandardNumber}
                value={defaults.bracketTeams ?? ''}
                w="100%"
                styles={numberInputStyles}
                clampBehavior="strict"
                disabled={disabled}
                onChange={(value) => {
                    if (disabled) {
                        return;
                    }
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onChange({
                        playoffTeamCount: Number.isFinite(numeric)
                            ? Math.max(2, Math.trunc(numeric))
                            : null,
                    });
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
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
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onChange({
                        poolCount: Number.isFinite(numeric)
                            ? Math.max(1, Math.trunc(numeric))
                            : null,
                    });
                }}
            />
        </AnimatedLayoutSection>
        <AnimatedLayoutSection in={visible} className="md:col-span-6">
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
