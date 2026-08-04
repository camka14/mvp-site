import type { ReactNode } from 'react';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type DivisionSettingsSectionProps = {
    collapsed: boolean;
    title?: string;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
    children: ReactNode;
};

export const DivisionSettingsSection = ({
    collapsed,
    title = 'Divisions',
    onToggle,
    errorCount,
    firstErrorMessage,
    children,
}: DivisionSettingsSectionProps) => (
    <CollapsibleEventFormSection
        id="section-division-settings"
        title={title}
        collapsed={collapsed}
        onToggle={onToggle}
        errorCount={errorCount}
        firstErrorMessage={firstErrorMessage}
    >
        {children}
    </CollapsibleEventFormSection>
);
