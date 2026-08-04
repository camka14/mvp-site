import type { ReactNode } from 'react';
import { Stack } from '@mantine/core';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type StaffSectionProps = {
    collapsed: boolean;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
    children: ReactNode;
};

export const StaffSection = ({
    collapsed,
    onToggle,
    errorCount,
    firstErrorMessage,
    children,
}: StaffSectionProps) => (
    <CollapsibleEventFormSection
        id="section-officials"
        title="Staff"
        collapsed={collapsed}
        onToggle={onToggle}
        errorCount={errorCount}
        firstErrorMessage={firstErrorMessage}
    >
        <Stack gap="md" mt="md">
            {children}
        </Stack>
    </CollapsibleEventFormSection>
);
