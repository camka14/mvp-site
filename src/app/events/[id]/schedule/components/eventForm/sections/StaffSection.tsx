import type { ReactNode } from 'react';
import { Button, Collapse, Paper, Stack } from '@mantine/core';

import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type StaffSectionProps = {
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
};

export const StaffSection = ({
    collapsed,
    onToggle,
    children,
}: StaffSectionProps) => (
    <Paper
        id="section-officials"
        shadow="xs"
        radius="md"
        withBorder
        p="lg"
        className="scroll-mt-20 bg-gray-50"
    >
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Staff</h3>
            <Button
                type="button"
                variant="subtle"
                size="xs"
                aria-expanded={!collapsed}
                aria-controls="section-officials-content"
                onClick={onToggle}
            >
                {collapsed ? 'Expand' : 'Collapse'}
            </Button>
        </div>
        <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
            <Stack id="section-officials-content" gap="md" mt="md">
                {children}
            </Stack>
        </Collapse>
    </Paper>
);
