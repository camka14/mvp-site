import { useState } from 'react';
import Image from 'next/image';
import { Alert, Button, FileInput, Group, Modal, Stack, Text } from '@mantine/core';

import {
    getManualPaymentProviderLabel,
    normalizeManualPaymentProvider,
} from '@/lib/manualRegistrationPayments';
import type { Bill, Event } from '@/types';
import { formatPrice } from '@/types';

import { getNextManualBillPayment } from './manualPaymentProof';

const MANUAL_PAYMENT_PROVIDER_LOGOS: Partial<Record<string, string>> = {
    CASH_APP: '/payment-providers/cash-app-pay.svg',
    VENMO: '/payment-providers/venmo.png',
    PAYPAL: '/payment-providers/paypal.png',
    STRIPE: '/payment-providers/stripe.svg',
};

type ManualPaymentProofDialogProps = {
    opened: boolean;
    event: Event | null;
    bill: Bill | null;
    zIndex: number;
    onClose: () => void;
    onSubmit: (proofFile: File) => void | Promise<void>;
};

export function ManualPaymentProofDialog({
    opened,
    event,
    bill,
    zIndex,
    onClose,
    onSubmit,
}: ManualPaymentProofDialogProps) {
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const payment = getNextManualBillPayment(bill);
    const links = event?.manualPaymentLinks ?? [];
    const amountDue = payment?.amountCents
        ?? bill?.nextPaymentAmountCents
        ?? bill?.totalAmountCents
        ?? event?.price
        ?? 0;

    const handleSubmit = async () => {
        if (!proofFile) {
            setError('Upload an image showing proof of payment.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await onSubmit(proofFile);
            setProofFile(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to submit payment proof.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Submit payment proof"
            centered
            size="lg"
            zIndex={zIndex}
        >
            <Stack gap="md">
                <Alert color="yellow" variant="light">
                    Manual payments are handled directly by the host. BracketIQ does not process this payment and cannot issue automatic refunds. The host is responsible for confirming payments and handling refunds.
                </Alert>
                <div>
                    <Text size="sm" fw={600}>Amount due</Text>
                    <Text size="xl" fw={700}>{formatPrice(amountDue)}</Text>
                </div>
                {links.length > 0 ? (
                    <Stack gap="xs">
                        <Text size="sm" fw={600}>Payment links</Text>
                        <Group gap="sm">
                            {links.map((link) => {
                                const provider = normalizeManualPaymentProvider(link.provider);
                                const logo = MANUAL_PAYMENT_PROVIDER_LOGOS[provider];
                                return (
                                    <Button
                                        key={link.id || link.url}
                                        component="a"
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        variant="default"
                                        leftSection={logo ? (
                                            <Image
                                                src={logo}
                                                alt={getManualPaymentProviderLabel(provider)}
                                                width={72}
                                                height={24}
                                                style={{ objectFit: 'contain' }}
                                            />
                                        ) : undefined}
                                    >
                                        {link.label || getManualPaymentProviderLabel(provider)}
                                    </Button>
                                );
                            })}
                        </Group>
                    </Stack>
                ) : null}
                {event?.manualPaymentInstructions ? (
                    <Alert color="blue" variant="light">
                        {event.manualPaymentInstructions}
                    </Alert>
                ) : null}
                <FileInput
                    label="Proof image"
                    placeholder="Upload screenshot or receipt"
                    accept="image/*"
                    value={proofFile}
                    onChange={setProofFile}
                    disabled={submitting}
                />
                {error ? <Alert color="red" variant="light">{error}</Alert> : null}
                <Group justify="flex-end">
                    <Button variant="subtle" onClick={onClose} disabled={submitting}>Close</Button>
                    <Button onClick={handleSubmit} loading={submitting}>Upload proof</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
