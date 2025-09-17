// components/PaymentModal.tsx
import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Event, PaymentIntent, formatPrice, getEventImageUrl } from '@/types';
import { useApp } from '@/app/providers';
import { paymentService } from '@/lib/paymentService';
import PaymentForm from './PaymentForm';
import { Modal, Button, Group, Alert } from '@mantine/core';

// Initialize Stripe with publishable key from environment
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
    console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
}

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    event: Event;
    paymentData: PaymentIntent | null;
    onPaymentSuccess: () => void;
}

export default function PaymentModal({
    isOpen,
    onClose,
    event,
    paymentData,
    onPaymentSuccess
}: PaymentModalProps) {
    const { user } = useApp();
    const [error, setError] = useState<string | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(true);

    // Early return if modal shouldn't be shown
    if (!isOpen || !paymentData) return null;

    // Handle Stripe configuration error
    if (!stripePromise) {
        return (
            <Modal opened={true} onClose={onClose} title="Configuration Error" centered>
                <Alert color="red" variant="light" mb="md">
                    Payment system is not properly configured. Please contact support.
                </Alert>
                <Button fullWidth onClick={onClose}>Close</Button>
            </Modal>
        );
    }

    const handlePaymentSuccess = async () => {
        try {
            onPaymentSuccess();
            onClose();
            resetModal();
        } catch (error) {
            setError('Payment succeeded but failed to join event. Please contact support.');
        }
    };

    const resetModal = () => {
        setShowConfirmation(true);
        setError(null);
    };

    return (
        <Modal opened={isOpen} onClose={() => { onClose(); resetModal(); }} title={showConfirmation ? 'Confirm Registration' : 'Payment'} size="lg" centered>
                {/* Error Display */}
                {error && (
                    <Alert color="red" variant="light" mb="md">{error}</Alert>
                )}

                    {/* Confirmation View */}
                    {showConfirmation && paymentData.feeBreakdown ? (
                        <div className="space-y-6">
                            {/* Event Details */}
                            <div className="flex items-center space-x-4">
                                {event.imageId && (
                                    <img
                                        src={getEventImageUrl({ imageId: event.imageId, width: 80, height: 80 })}
                                        alt={event.name}
                                        className="w-16 h-16 rounded-lg object-cover"
                                    />
                                )}
                                <div>
                                    <h4 className="font-semibold text-lg">{event.name}</h4>
                                    <p className="text-gray-600">{event.location}</p>
                                    <p className="text-sm text-gray-500 capitalize">{event.eventType}</p>
                                </div>
                            </div>

                            {/* Price Breakdown */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h5 className="font-medium mb-3 text-gray-900">Price Breakdown</h5>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Event Price:</span>
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

                            {/* Action Buttons */}
                            <Group grow>
                                <Button variant="default" onClick={onClose}>Cancel</Button>
                                <Button onClick={() => setShowConfirmation(false)}>Continue to Payment</Button>
                            </Group>
                        </div>
                    ) : (
                        /* Payment Form - Only show when we have payment intent */
                        paymentData.paymentIntent && (
                            <Elements
                                stripe={stripePromise}
                                options={{
                                    clientSecret: paymentData.paymentIntent,
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
                                    eventName={event.name}
                                />
                            </Elements>
                        )
                    )}
        </Modal>
    );
}
