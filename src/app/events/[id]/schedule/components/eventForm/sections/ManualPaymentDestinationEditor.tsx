import { Button, Group, Image, Select, Stack, TextInput } from '@mantine/core';
import { Link as LinkIcon } from 'lucide-react';
import { useController, type Control } from 'react-hook-form';

import {
    formatManualPaymentProviderInput,
    getManualPaymentProviderInputLabel,
    getManualPaymentProviderInputPlaceholder,
    getManualPaymentProviderLabel,
    normalizeManualPaymentProvider,
    type ManualPaymentLink,
    type ManualPaymentProvider,
} from '@/lib/manualRegistrationPayments';

import type { EventFormValues } from '../formTypes';

type ManualPaymentDestinationEditorProps = {
    control: Control<EventFormValues>;
    links: ManualPaymentLink[];
    onAddLink: () => void;
    onLinkChange: (
        index: number,
        field: 'provider' | 'label' | 'url',
        value: string,
    ) => void;
    onRemoveLink: (index: number) => void;
};

const PROVIDER_OPTIONS: Array<{ value: ManualPaymentProvider; label: string }> = [
    { value: 'CASH_APP', label: 'Cash App' },
    { value: 'VENMO', label: 'Venmo' },
    { value: 'PAYPAL', label: 'PayPal' },
    { value: 'STRIPE', label: 'Stripe' },
    { value: 'ZELLE', label: 'Zelle' },
    { value: 'OTHER', label: 'Other' },
];

const PROVIDER_MARK_SOURCES: Partial<Record<ManualPaymentProvider, string>> = {
    CASH_APP: '/payment-providers/cash-app-pay.svg',
    VENMO: '/payment-providers/venmo.png',
    PAYPAL: '/payment-providers/paypal.png',
    STRIPE: '/payment-providers/stripe.svg',
    ZELLE: 'https://www.zelle.com/sites/default/files/2026-02/Zelle-logo-no-tagline-RGB-purple.png',
};

const ManualPaymentProviderMark = ({ provider }: { provider: ManualPaymentProvider }) => {
    const source = PROVIDER_MARK_SOURCES[provider];
    if (!source) {
        return <LinkIcon aria-hidden size={18} strokeWidth={2} />;
    }
    return (
        <Image
            src={source}
            alt={`${getManualPaymentProviderLabel(provider)} logo`}
            fit="contain"
            h={20}
            w={28}
        />
    );
};

const ManualPaymentDestinationRow = ({
    control,
    index,
    link,
    onLinkChange,
    onRemove,
}: {
    control: Control<EventFormValues>;
    index: number;
    link: ManualPaymentLink;
    onLinkChange: ManualPaymentDestinationEditorProps['onLinkChange'];
    onRemove: () => void;
}) => {
    const { field: providerField } = useController({
        control,
        name: `manualPaymentLinks.${index}.provider`,
    });
    const {
        field: { ref: labelInputRef, ...labelField },
    } = useController({
        control,
        name: `manualPaymentLinks.${index}.label`,
    });
    const {
        field: { ref: urlInputRef, ...urlField },
        fieldState: urlFieldState,
    } = useController({
        control,
        name: `manualPaymentLinks.${index}.url`,
    });
    const provider = normalizeManualPaymentProvider(providerField.value ?? link.provider);
    const urlError = urlFieldState.error?.message;
    const urlInputId = `manual-payment-link-${index}-url`;
    const urlErrorId = `${urlInputId}-error`;

    return (
        <div
            className="flex flex-wrap items-end gap-3"
            data-testid="manual-payment-destination-row"
        >
            <Select
                label="Provider"
                name={providerField.name}
                value={provider}
                data={PROVIDER_OPTIONS}
                className="w-full sm:w-48 sm:flex-none"
                leftSection={<ManualPaymentProviderMark provider={provider} />}
                leftSectionWidth={38}
                renderOption={({ option }) => (
                    <Group gap="sm" wrap="nowrap">
                        <ManualPaymentProviderMark
                            provider={normalizeManualPaymentProvider(option.value)}
                        />
                        <span>{option.label}</span>
                    </Group>
                )}
                onBlur={providerField.onBlur}
                onChange={(value) => {
                    const nextProvider = normalizeManualPaymentProvider(value);
                    const currentDefaultLabel = getManualPaymentProviderLabel(provider);
                    onLinkChange(index, 'provider', nextProvider);
                    const currentLabel = String(labelField.value ?? '');
                    if (!currentLabel.trim() || currentLabel.trim() === currentDefaultLabel) {
                        onLinkChange(index, 'label', getManualPaymentProviderLabel(nextProvider));
                    }
                    onLinkChange(index, 'url', formatManualPaymentProviderInput(
                        nextProvider,
                        String(urlField.value ?? ''),
                    ));
                }}
            />
            <TextInput
                label="Public label"
                name={labelField.name}
                value={String(labelField.value ?? '')}
                className="w-full sm:w-56 sm:flex-none"
                onBlur={labelField.onBlur}
                ref={labelInputRef}
                onChange={(event) => onLinkChange(index, 'label', event.currentTarget.value)}
            />
            <TextInput
                id={urlInputId}
                label={getManualPaymentProviderInputLabel(provider)}
                name={urlField.name}
                value={String(urlField.value ?? '')}
                placeholder={getManualPaymentProviderInputPlaceholder(provider)}
                error={urlError}
                errorProps={{ id: urlErrorId }}
                aria-describedby={urlError ? urlErrorId : undefined}
                aria-invalid={Boolean(urlError)}
                className="w-full sm:w-72 sm:flex-none"
                onBlur={urlField.onBlur}
                ref={urlInputRef}
                onChange={(event) => onLinkChange(index, 'url', event.currentTarget.value)}
            />
            <Button type="button" variant="subtle" color="red" onClick={onRemove}>
                Remove
            </Button>
        </div>
    );
};

export const ManualPaymentDestinationEditor = ({
    control,
    links,
    onAddLink,
    onLinkChange,
    onRemoveLink,
}: ManualPaymentDestinationEditorProps) => (
    <Stack gap="sm">
        {links.map((link, index) => (
            <ManualPaymentDestinationRow
                key={link.id || index}
                control={control}
                index={index}
                link={link}
                onLinkChange={onLinkChange}
                onRemove={() => onRemoveLink(index)}
            />
        ))}
        <Group justify="flex-start">
            <Button type="button" variant="default" onClick={onAddLink}>
                Add payment destination
            </Button>
        </Group>
    </Stack>
);
