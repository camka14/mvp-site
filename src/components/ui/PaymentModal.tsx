// components/PaymentModal.tsx
import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Event, PaymentIntent, formatPrice, getEventImageUrl } from '@/types';
import { useApp } from '@/app/providers';
import { paymentService } from '@/lib/paymentService';
import PaymentForm from './PaymentForm';
import ModalShell from './ModalShell';

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
            <ModalShell isOpen={true} onClose={onClose} title="Configuration Error" maxWidth="md">
                <p className="text-red-600 mb-4">
                    Payment system is not properly configured. Please contact support.
                </p>
                <button onClick={onClose} className="w-full py-2 px-4 bg-gray-600 text-white rounded-lg">
                    Close
                </button>
            </ModalShell>
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
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={showConfirmation ? 'Confirm Registration' : 'Payment'}
            maxWidth="lg"
        >
                {/* Error Display */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-red-600 text-sm">{error}</p>
                    </div>
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
                            <div className="flex space-x-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Continue to Payment
                                </button>
                            </div>
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
        </ModalShell>
    );
}
