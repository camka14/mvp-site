import type { ReactNode } from 'react';
import { Stack } from '@mantine/core';
import { CollapsibleEventFormSection } from '../components/CollapsibleEventFormSection';

type ManualPaymentsSectionProps = {
    collapsed: boolean;
    onToggle: () => void;
    errorCount?: number;
    firstErrorMessage?: string;
    children: ReactNode;
};

export const ManualPaymentsSection = ({
    collapsed,
    onToggle,
    errorCount,
    firstErrorMessage,
    children,
}: ManualPaymentsSectionProps) => (
    <CollapsibleEventFormSection
        id="section-manual-payments"
        title="Manual Payments"
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
