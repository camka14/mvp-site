import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import { formatPrice } from '@/types';

interface PaymentFormProps {
    onSuccess: () => void;
    onError: (error: string) => void;
    amount: number;
    eventName: string;
}

export default function PaymentForm({
    onSuccess,
    onError,
    amount,
    eventName
}: PaymentFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) return;

        setLoading(true);

        try {
            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/payment-success`,
                },
                redirect: 'if_required',
            });

            if (error) {
                onError(error.message || 'Payment failed');
            } else {
                onSuccess();
            }
        } catch (err) {
            onError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <h4 className="font-medium text-gray-900 mb-2">Payment Details</h4>
                <p className="text-sm text-gray-600 mb-4">
                    Paying for <strong>{eventName}</strong>
                </p>
            </div>

            <PaymentElement
                options={{
                    layout: 'tabs',
                }}
            />

            <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold mb-4">
                    <span>Total:</span>
                    <span>{formatPrice(amount)}</span>
                </div>

                <button
                    type="submit"
                    disabled={!stripe || !elements || loading}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${!stripe || !elements || loading
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                >
                    {loading ? (
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                            Processing...
                        </div>
                    ) : (
                        `Pay ${formatPrice(amount)}`
                    )}
                </button>
            </div>
        </form>
    );
}
