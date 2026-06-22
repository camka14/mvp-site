import type { ComponentProps } from 'react';
import {
    Select as MantineSelect,
    Text,
} from '@mantine/core';

import { AnimatedSection } from '../components/AnimatedSection';
import type { DivisionEditorKind } from '../divisionForm';

type DivisionEditorHeaderProps = {
    editing: boolean;
    splitDivisionEditorEnabled: boolean;
    divisionKind: DivisionEditorKind;
    disabled: boolean;
    comboboxProps?: ComponentProps<typeof MantineSelect>['comboboxProps'];
    onDivisionKindChange: (value: string | null) => void;
};

export const DivisionEditorHeader = ({
    editing,
    splitDivisionEditorEnabled,
    divisionKind,
    disabled,
    comboboxProps,
    onDivisionKindChange,
}: DivisionEditorHeaderProps) => (
    <div className="space-y-3">
        <Text size="sm" fw={600}>
            {editing ? 'Edit Division' : 'New Division'}
        </Text>
        <AnimatedSection in={splitDivisionEditorEnabled} collapseClassName="max-w-xs">
            <MantineSelect
                label="Division Type"
                data={[
                    { value: 'LEAGUE', label: 'League' },
                    { value: 'PLAYOFF', label: 'Playoff' },
                ]}
                value={divisionKind}
                comboboxProps={comboboxProps}
                disabled={disabled}
                onChange={onDivisionKindChange}
            />
        </AnimatedSection>
    </div>
);
