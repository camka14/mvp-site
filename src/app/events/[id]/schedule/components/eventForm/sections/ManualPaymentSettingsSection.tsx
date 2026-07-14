import type { Control } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import {
    Alert,
    Button,
    Group,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';

import { normalizeManualPaymentProvider } from '@/lib/manualRegistrationPayments';

import type { EventFormValues } from '../formTypes';
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
}: ManualPaymentSettingsSectionProps) => {
    if (!visible) {
        return null;
    }

    return (
        <ManualPaymentsSection collapsed={collapsed} onToggle={onToggle}>
            <Alert color="yellow" variant="light">
                Manual payments are handled outside BracketIQ. Stripe checkout, platform fees, refund requests, and automatic refunds are disabled for these registrations. The host is responsible for confirming payments and handling refunds.
            </Alert>
            <Stack gap="sm">
                {links.map((link, index) => (
                    <Group key={link.id || index} align="flex-end" grow>
                        <Select
                            label={index === 0 ? 'Provider' : undefined}
                            value={normalizeManualPaymentProvider(link.provider)}
                            data={[
                                { value: 'CASH_APP', label: 'Cash App' },
                                { value: 'VENMO', label: 'Venmo' },
                                { value: 'PAYPAL', label: 'PayPal' },
                                { value: 'STRIPE', label: 'Stripe' },
                                { value: 'ZELLE', label: 'Zelle' },
                                { value: 'OTHER', label: 'Other' },
                            ]}
                            onChange={(value) => onLinkChange(index, 'provider', value ?? 'OTHER')}
                        />
                        <TextInput
                            label={index === 0 ? 'Label' : undefined}
                            value={link.label ?? ''}
                            onChange={(event) => onLinkChange(index, 'label', event.currentTarget.value)}
                        />
                        <TextInput
                            label={index === 0 ? 'Payment link' : undefined}
                            value={link.url ?? ''}
                            placeholder="https://..."
                            onChange={(event) => onLinkChange(index, 'url', event.currentTarget.value)}
                        />
                        <Button variant="subtle" color="red" onClick={() => onRemoveLink(index)}>
                            Remove
                        </Button>
                    </Group>
                ))}
                <Group justify="flex-start">
                    <Button variant="default" onClick={onAddLink}>Add payment link</Button>
                </Group>
            </Stack>
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
