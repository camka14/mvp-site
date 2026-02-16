// components/PaymentModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Event, PaymentIntent, formatPrice, getEventImageUrl } from '@/types';
import PaymentForm from './PaymentForm';
import { Modal, Button, Group, Alert, Loader, Text } from '@mantine/core';

// Initialize Stripe with publishable key from environment; may be overridden by payment response
const envPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

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
    onPaymentSuccess: () => Promise<void> | void;
}

export default function PaymentModal({
    isOpen,
    onClose,
    event,
    paymentData,
    onPaymentSuccess
}: PaymentModalProps) {
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'confirm' | 'payment' | 'success'>('confirm');
    const [reloadingEvent, setReloadingEvent] = useState(false);
    const isMountedRef = useRef(true);

    const eventName = event.name ?? 'Event';
    const eventLocation = event.location ?? '';
    const eventTypeLabel = event.eventType ?? 'EVENT';

    // Early return if modal shouldn't be shown
    if (!isOpen) return null;

    const clientSecret = paymentData?.paymentIntent;
    const publishableKey = paymentData?.publishableKey || envPublishableKey;

    const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

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

    const resetModal = () => {
        setView('confirm');
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
                setError('Payment succeeded but failed to join event. Please contact support.');
            }
        } finally {
            if (isMountedRef.current) {
                setReloadingEvent(false);
            }
        }
    };

    const modalTitle = view === 'confirm'
        ? 'Confirm Payment'
        : view === 'payment'
            ? 'Payment'
            : 'Payment Complete';

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

            {/* Confirmation View */}
            {view === 'confirm' ? (
                <div className="space-y-6">
                    {/* Event Details */}
                    <div className="flex items-center space-x-4">
                        {event.imageId && (
                            <Image
                                src={getEventImageUrl({ imageId: event.imageId, width: 80, height: 80 })}
                                alt={eventName}
                                width={64}
                                height={64}
                                unoptimized
                                className="w-16 h-16 rounded-lg object-cover"
                            />
                        )}
                        <div>
                            <h4 className="font-semibold text-lg">{eventName}</h4>
                            <p className="text-gray-600">{eventLocation}</p>
                            <p className="text-sm text-gray-500 capitalize">{eventTypeLabel}</p>
                        </div>
                    </div>

                    {/* Price Breakdown */}
                    {paymentData && paymentData.feeBreakdown ? (
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h5 className="font-medium mb-3 text-gray-900">Price Breakdown</h5>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Price:</span>
                                    <span className="font-medium">{formatPrice(paymentData.feeBreakdown.eventPrice)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Processing Fee:</span>
                                    <span className="font-medium">{formatPrice(paymentData.feeBreakdown.processingFee)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Stripe Fee:</span>
                                    <span className="font-medium">{formatPrice(paymentData.feeBreakdown.stripeFee)}</span>
                                </div>
                                <div className="border-t pt-2 flex justify-between font-semibold text-base">
                                    <span>Total:</span>
                                    <span>${(paymentData.feeBreakdown.totalCharge / 100).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <Alert color="yellow" variant="light">Price details are unavailable. Continue to complete payment.</Alert>
                    )}

                    {/* Action Buttons */}
                    <Group grow>
                        <Button variant="default" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => setView('payment')}>Continue to Payment</Button>
                    </Group>
                </div>
            ) : view === 'payment' ? (
                /* Payment Form - Only show when we have payment intent */
                clientSecret && (
                    <Elements
                        key={clientSecret}
                        stripe={stripePromise}
                        options={{
                            clientSecret,
                            appearance: {
                                theme: 'stripe',
                                variables: {
                                    colorPrimary: '#2563eb',
                                },
                            },
                        }}
                    >
                        <PaymentForm
                            onSuccess={handlePaymentSuccess}
                            onError={setError}
                            amount={paymentData.feeBreakdown?.totalCharge || 0}
                            eventName={eventName}
                        />
                    </Elements>
                )
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
                            <span>Reloading event…</span>
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">Event details are up to date.</Text>
                    )}
                    <Group justify="center" mt="md">
                        <Button onClick={() => { onClose(); resetModal(); }}>Close</Button>
                    </Group>
                </div>
            )}
        </Modal>
    );
}
