import type { ReactNode } from 'react';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type EventDetailsSectionProps = {
    collapsed: boolean;
    onToggle: () => void;
    title?: string;
    errorCount?: number;
    firstErrorMessage?: string;
    children: ReactNode;
};

export const EventDetailsSection = ({
    collapsed,
    onToggle,
    title = 'Event Details',
    errorCount,
    firstErrorMessage,
    children,
}: EventDetailsSectionProps) => (
    <CollapsibleEventFormSection
        id="section-event-details"
        title={title}
        collapsed={collapsed}
        onToggle={onToggle}
        errorCount={errorCount}
        firstErrorMessage={firstErrorMessage}
    >
        {children}
    </CollapsibleEventFormSection>
);
