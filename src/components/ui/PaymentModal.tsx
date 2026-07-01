// components/PaymentModal.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { BillingAddress, Event, PaymentIntent } from '@/types';
import { isStripePaymentIntentClientSecret } from '@/lib/stripeClientSecret';
import { getPaymentModalCopy } from '@/components/ui/paymentModalCopy';
import { billingAddressService } from '@/lib/billingAddressService';
import PaymentForm from './PaymentForm';
import { Modal, Button, Group, Alert, Loader, Text } from '@mantine/core';
import { MOBILE_APP_THEME_TOKENS } from '@/app/theme/mobilePalette';

// Initialize Stripe with publishable key from environment; may be overridden by payment response
const envPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromiseByKey = new Map<string, ReturnType<typeof loadStripe>>();

const getStripePromise = (publishableKey: string): ReturnType<typeof loadStripe> => {
    const existing = stripePromiseByKey.get(publishableKey);
    if (existing) {
        return existing;
    }
    const next = loadStripe(publishableKey, {
        developerTools: {
            assistant: {
                enabled: false,
            },
        },
    });
    stripePromiseByKey.set(publishableKey, next);
    return next;
};

export type PaymentEventSummary = Partial<Event> & {
    name: string;
    location: string;
    eventType: Event['eventType'];
    price: number;
};

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: PaymentEventSummary;
    paymentData: PaymentIntent | null;
    payerName?: string | null;
    onPaymentSuccess: () => Promise<void> | void;
    onPaymentPending?: () => Promise<void> | void;
}

export default function PaymentModal({
    isOpen,
    onClose,
    event,
    paymentData,
    payerName,
    onPaymentSuccess,
    onPaymentPending,
}: PaymentModalProps) {
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'payment' | 'success' | 'pending'>('payment');
    const [reloadingEvent, setReloadingEvent] = useState(false);
    const [billingAddress, setBillingAddress] = useState<BillingAddress | null>(null);
    const [billingEmail, setBillingEmail] = useState<string | null>(null);
    const [activePaymentData, setActivePaymentData] = useState<PaymentIntent | null>(paymentData);
    const isMountedRef = useRef(true);

    const purchaseType = activePaymentData?.feeBreakdown?.purchaseType;
    const copy = getPaymentModalCopy(purchaseType);
    const eventName = event.name ?? 'Event';

    const resetModal = () => {
        setView('payment');
        setError(null);
        setReloadingEvent(false);
    };

    const handlePaymentSuccess = async () => {
        setError(null);
        setView('success');
        setReloadingEvent(true);
        try {
            await onPaymentSuccess();
        } catch (error) {
            if (isMountedRef.current) {
                setError(copy.refreshFailureMessage);
            }
        } finally {
            if (isMountedRef.current) {
                setReloadingEvent(false);
            }
        }
    };

    const handlePaymentPending = async () => {
        setError(null);
        setView('pending');
        setReloadingEvent(true);
        try {
            await (onPaymentPending ?? onPaymentSuccess)();
        } catch (error) {
            if (isMountedRef.current) {
                setError(copy.refreshFailureMessage);
            }
        } finally {
            if (isMountedRef.current) {
                setReloadingEvent(false);
            }
        }
    };

    const modalTitle = view === 'payment'
        ? 'Payment'
        : view === 'pending'
            ? 'Payment Pending'
            : 'Payment Complete';

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            setActivePaymentData(paymentData);
            setView('payment');
        }
    }, [isOpen, paymentData]);

    useEffect(() => {
        if (!isOpen) {
            setBillingAddress(null);
            setBillingEmail(null);
            return;
        }

        let cancelled = false;
        billingAddressService.getBillingAddressProfile()
            .then((profile) => {
                if (!cancelled && isMountedRef.current) {
                    setBillingAddress(profile.billingAddress ?? null);
                    setBillingEmail(profile.email ?? null);
                }
            })
            .catch((loadError) => {
                console.error('Failed to load billing address for payment modal', loadError);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const clientSecret = activePaymentData?.paymentIntent;
    const hasValidClientSecret = isStripePaymentIntentClientSecret(clientSecret);
    const publishableKey = activePaymentData?.publishableKey || envPublishableKey;
    const feeBreakdown = activePaymentData?.feeBreakdown ?? null;

    const stripePromise = useMemo(() => (
        publishableKey
        ? getStripePromise(publishableKey)
        : null
    ), [publishableKey]);
    const initialElementsAmount = feeBreakdown
        ? Math.max(1, Math.round(feeBreakdown.totalCharge))
        : 0;
    const stripeElementsOptions = useMemo(() => (
        hasValidClientSecret && initialElementsAmount > 0
            ? {
                mode: 'payment' as const,
                amount: initialElementsAmount,
                currency: 'usd',
                appearance: {
                    theme: 'stripe' as const,
                    variables: {
                        colorPrimary: MOBILE_APP_THEME_TOKENS.primary,
                    },
                },
            }
            : undefined
    ), [clientSecret, hasValidClientSecret]);

    // Early return after hooks so opening the modal does not change hook order.
    if (!isOpen) return null;

    // Handle Stripe configuration error
    if (!stripePromise) {
        return (
            <Modal opened={true} onClose={onClose} title="Configuration Error" centered zIndex={1500}>
                <Alert color="red" variant="light" mb="md">
                    Payment system is not properly configured. Please contact support.
                </Alert>
                <Button fullWidth onClick={onClose}>Close</Button>
            </Modal>
        );
    }

    return (
        <Modal
            opened={isOpen}
            onClose={() => { onClose(); resetModal(); }}
            title={modalTitle}
            size="lg"
            centered
            zIndex={1500}
        >
            {/* Error Display */}
            {error && (
                <Alert color="red" variant="light" mb="md">{error}</Alert>
            )}

            {view === 'payment' ? (
                /* Payment Form - Only show when we have payment intent */
                hasValidClientSecret && feeBreakdown ? (
                    <Elements
                        key={`${publishableKey}:${clientSecret}`}
                        stripe={stripePromise}
                        options={stripeElementsOptions}
                    >
                        <PaymentForm
                            onSuccess={handlePaymentSuccess}
                            onPending={handlePaymentPending}
                            onError={setError}
                            eventName={eventName}
                            feeBreakdown={feeBreakdown}
                            paymentIntent={clientSecret}
                            billingAddress={billingAddress}
                            billingEmail={billingEmail}
                            billingName={payerName}
                            onFeeBreakdownChange={(nextFeeBreakdown) => {
                                setActivePaymentData((current) => current
                                    ? { ...current, feeBreakdown: nextFeeBreakdown }
                                    : current);
                            }}
                        />
                    </Elements>
                ) : (
                    <Alert color="red" variant="light">
                        Checkout could not be initialized. Please close this dialog and try again.
                    </Alert>
                )
            ) : view === 'pending' ? (
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-14 w-14 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-8 w-8"
                            aria-hidden="true"
                        >
                            <path d="M12 6v6l4 2" />
                            <circle cx="12" cy="12" r="10" />
                        </svg>
                    </div>
                    <h4 className="font-semibold text-lg">Payment pending</h4>
                    <p className="text-sm text-gray-600">
                        Your bank payment is processing. You are marked as pending until Stripe confirms the payment.
                    </p>
                    {reloadingEvent ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                            <Loader size="sm" />
                            <span>{copy.reloadingMessage}</span>
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">{copy.refreshedMessage}</Text>
                    )}
                    <Group justify="center" mt="md">
                        <Button onClick={() => { onClose(); resetModal(); }}>Close</Button>
                    </Group>
                </div>
            ) : (
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-14 w-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-8 w-8"
                            aria-hidden="true"
                        >
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    </div>
                    <h4 className="font-semibold text-lg">Payment successful</h4>
                    <p className="text-sm text-gray-600">
                        Payment succeeded. We’re refreshing the details now.
                    </p>
                    {reloadingEvent ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                            <Loader size="sm" />
                            <span>{copy.reloadingMessage}</span>
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">{copy.refreshedMessage}</Text>
                    )}
                    <Group justify="center" mt="md">
                        <Button onClick={() => { onClose(); resetModal(); }}>Close</Button>
                    </Group>
                </div>
            )}
        </Modal>
    );
}
