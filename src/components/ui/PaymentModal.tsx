import React, { useState,} from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Event, PaymentIntent, getEventImageUrl } from '@/types';
import { useApp } from '@/app/providers';
import { paymentService } from '@/lib/paymentService';
import PaymentForm from './PaymentForm';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

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
    paymentData, // Payment intent is passed in, not created here
    onPaymentSuccess
}: PaymentModalProps) {
    const { user } = useApp();
    const [error, setError] = useState<string | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(true);

    // NO useEffect to create payment intent - it's already created and passed in

    const handlePaymentSuccess = async () => {
        try {
            const isTournament = event.eventType === 'tournament';
            // After successful payment, add user to event
            await paymentService.joinEvent(event.$id, user!.$id, undefined, isTournament);
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

    if (!isOpen || !paymentData) return null; // Only show if we have payment data

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {showConfirmation ? 'Confirm Registration' : 'Payment'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="text-red-800 text-sm">{error}</div>
                        </div>
                    )}

                    {/* Confirmation View */}
                    {showConfirmation && paymentData.feeBreakdown && (
                        <div className="space-y-6">
                            {/* Event Details */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center space-x-3">
                                    <img src={getEventImageUrl({imageId: event.imageId, size: 12})} alt={event.name} className="w-12 h-12 rounded-lg object-cover" />
                                    <div>
                                        <div className="font-medium text-gray-900">{event.name}</div>
                                        <div className="text-sm text-gray-600">{event.location}</div>
                                        <div className="text-xs text-gray-500 capitalize">{event.eventType}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Price Breakdown */}
                            <div>
                                <h4 className="font-medium text-gray-900 mb-2">Price Breakdown</h4>
                                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Event Price:</span>
                                        <span>${(paymentData.feeBreakdown.eventPrice / 100).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Processing Fee:</span>
                                        <span>${(paymentData.feeBreakdown.processingFee / 100).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Stripe Fee:</span>
                                        <span>${(paymentData.feeBreakdown.stripeFee / 100).toFixed(2)}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Total:</span>
                                        <span>${(paymentData.feeBreakdown.totalCharge / 100).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex space-x-3">
                                <button onClick={onClose} className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50">
                                    Cancel
                                </button>
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Continue to Payment
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Payment Form */}
                    {!showConfirmation && paymentData.paymentIntent && (
                        <Elements
                            stripe={stripePromise}
                            options={{
                                clientSecret: paymentData.paymentIntent,
                                appearance: { theme: 'stripe' }
                            }}
                        >
                            <PaymentForm
                                onSuccess={handlePaymentSuccess}
                                onError={setError}
                                amount={paymentData.feeBreakdown.totalCharge / 100}
                                eventName={event.name}
                            />
                        </Elements>
                    )}
                </div>
            </div>
        </div>
    );
}
