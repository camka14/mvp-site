import type { ReactNode } from 'react';
import { Button, Collapse, Paper } from '@mantine/core';

import { AnimatedSection } from '../components/AnimatedSection';
import { SECTION_ANIMATION_DURATION_MS } from '../constants';

type ScheduleConfigSectionProps = {
    visible: boolean;
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
};

export const ScheduleConfigSection = ({
    visible,
    collapsed,
    onToggle,
    children,
}: ScheduleConfigSectionProps) => (
    <AnimatedSection in={visible}>
        <Paper
            id="section-schedule-config"
            shadow="xs"
            radius="md"
            withBorder
            p="lg"
            className="scroll-mt-20 bg-gray-50"
        >
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Schedule</h3>
                <Button
                    type="button"
                    variant="subtle"
                    size="xs"
                    aria-expanded={!collapsed}
                    aria-controls="section-schedule-config-content"
                    onClick={onToggle}
                >
                    {collapsed ? 'Expand' : 'Collapse'}
                </Button>
            </div>
            <Collapse in={!collapsed} transitionDuration={SECTION_ANIMATION_DURATION_MS} animateOpacity>
                {children}
            </Collapse>
        </Paper>
    </AnimatedSection>
);
