import type { ComponentProps } from 'react';
import {
    Select as MantineSelect,
    Text,
} from '@mantine/core';

import { AnimatedLayoutSection } from '../components/AnimatedSection';

type DivisionEditorPlayoffPlacementControlsProps = {
    visible: boolean;
    playoffTeamCount?: number | null;
    playoffDivisionOptions: ComponentProps<typeof MantineSelect>['data'];
    placementDivisionIds?: string[];
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    disabled: boolean;
    onPlacementDivisionChange: (placementIndex: number, value: string | null) => void;
};

export const DivisionEditorPlayoffPlacementControls = ({
    visible,
    playoffTeamCount,
    playoffDivisionOptions = [],
    placementDivisionIds = [],
    comboboxProps,
    disabled,
    onPlacementDivisionChange,
}: DivisionEditorPlayoffPlacementControlsProps) => (
    <AnimatedLayoutSection in={visible} className="md:col-span-9">
        <div className="space-y-2">
            <Text size="sm" fw={600}>Playoff Placement Mapping</Text>
            {playoffDivisionOptions.length === 0 ? (
                <Text size="xs" c="red">
                    Add a playoff division before mapping placements.
                </Text>
            ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {Array.from({ length: Math.max(0, Math.trunc(playoffTeamCount ?? 0)) }).map((_, placementIndex) => (
                        <MantineSelect
                            key={`editor-placement-${placementIndex}`}
                            label={`Placement #${placementIndex + 1}`}
                            placeholder="Select playoff division"
                            data={playoffDivisionOptions}
                            value={placementDivisionIds[placementIndex] || null}
                            comboboxProps={comboboxProps}
                            disabled={disabled}
                            onChange={(value) => onPlacementDivisionChange(placementIndex, value)}
                        />
                    ))}
                </div>
            )}
        </div>
    </AnimatedLayoutSection>
);
