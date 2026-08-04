import type { ReactNode } from 'react';

import { AnimatedSection } from '../components/AnimatedSection';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type ScheduleConfigSectionProps = {
    visible: boolean;
    collapsed: boolean;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
    children: ReactNode;
};

export const ScheduleConfigSection = ({
    visible,
    collapsed,
    onToggle,
    errorCount,
    firstErrorMessage,
    children,
}: ScheduleConfigSectionProps) => (
    <AnimatedSection in={visible}>
        <CollapsibleEventFormSection
            id="section-schedule-config"
            title="Schedule"
            collapsed={collapsed}
            onToggle={onToggle}
            errorCount={errorCount}
            firstErrorMessage={firstErrorMessage}
        >
            {children}
        </CollapsibleEventFormSection>
    </AnimatedSection>
);
