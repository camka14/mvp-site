import type { ReactNode } from 'react';
import { Button, Collapse, Paper } from '@mantine/core';

import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type DivisionSettingsSectionProps = {
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
};

export const DivisionSettingsSection = ({
    collapsed,
    onToggle,
    children,
}: DivisionSettingsSectionProps) => (
    <Paper
        id="section-division-settings"
        shadow="xs"
        radius="md"
        withBorder
        p="lg"
        className="scroll-mt-20 bg-gray-50"
    >
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Divisions</h3>
            <Button
                type="button"
                variant="subtle"
                size="xs"
                aria-expanded={!collapsed}
                aria-controls="section-division-settings-content"
                onClick={onToggle}
            >
                {collapsed ? 'Expand' : 'Collapse'}
            </Button>
        </div>
        <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
            {children}
        </Collapse>
    </Paper>
);
