import type { Control } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import {
    Alert,
    Stack,
    Textarea,
} from '@mantine/core';

import type { EventFormValues } from '../formTypes';
import { ManualPaymentDestinationEditor } from './ManualPaymentDestinationEditor';
import { ManualPaymentsSection } from './ManualPaymentsSection';

type ManualPaymentSettingsSectionProps = {
    collapsed: boolean;
    control: Control<EventFormValues>;
    links: NonNullable<EventFormValues['manualPaymentLinks']>;
    onAddLink: () => void;
    onLinkChange: (
        index: number,
        field: 'provider' | 'label' | 'url',
        value: string,
    ) => void;
    onRemoveLink: (index: number) => void;
    onToggle: () => void;
    visible: boolean;
    errorCount?: number;
    firstErrorMessage?: string;
};

export const ManualPaymentSettingsSection = ({
    collapsed,
    control,
    links,
    onAddLink,
    onLinkChange,
    onRemoveLink,
    onToggle,
    visible,
    errorCount,
    firstErrorMessage,
}: ManualPaymentSettingsSectionProps) => {
    if (!visible) {
        return null;
    }

    return (
        <ManualPaymentsSection
            collapsed={collapsed}
            onToggle={onToggle}
            errorCount={errorCount}
            firstErrorMessage={firstErrorMessage}
        >
            <Alert color="yellow" variant="light">
                Manual payments are handled outside BracketIQ. Stripe checkout, platform fees, refund requests, and automatic refunds are disabled for these registrations. The host is responsible for confirming payments and handling refunds.
            </Alert>
            <ManualPaymentDestinationEditor
                control={control}
                links={links}
                onAddLink={onAddLink}
                onLinkChange={onLinkChange}
                onRemoveLink={onRemoveLink}
            />
            <Controller
                name="manualPaymentInstructions"
                control={control}
                render={({ field }) => (
                    <Textarea
                        label="Manual payment instructions"
                        autosize
                        minRows={3}
                        maxLength={2000}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Tell registrants what to include in the payment note and how refunds are handled."
                    />
                )}
            />
        </ManualPaymentsSection>
    );
};
