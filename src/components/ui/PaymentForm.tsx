import React, { useEffect, useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import type { BillingAddress, FeeBreakdown } from '@/types';
import { formatPrice } from '@/types';

interface PaymentFormProps {
    onSuccess: () => void;
    onPending?: () => void;
    onError: (error: string) => void;
    eventName: string;
    feeBreakdown: FeeBreakdown;
    paymentIntent: string;
    billingAddress?: BillingAddress | null;
    billingEmail?: string | null;
    billingName?: string | null;
    onFeeBreakdownChange?: (feeBreakdown: FeeBreakdown) => void;
}

const normalizeCents = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.round(value))
        : 0
);

const getVisibleTaxAmount = (feeBreakdown: FeeBreakdown): number => {
    const taxAmount = normalizeCents(feeBreakdown.taxAmount);
    return taxAmount > 0 ? taxAmount : 0;
};

const getVisibleTotalCharge = (feeBreakdown: FeeBreakdown): number => (
    normalizeCents(feeBreakdown.eventPrice) + getVisibleTaxAmount(feeBreakdown)
);

export default function PaymentForm({
    onSuccess,
    onPending,
    onError,
    eventName,
    feeBreakdown: initialFeeBreakdown,
    paymentIntent,
    billingAddress,
    billingEmail,
    billingName,
}: PaymentFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [feeBreakdown, setFeeBreakdown] = useState(initialFeeBreakdown);
    const amount = getVisibleTotalCharge(feeBreakdown);

    useEffect(() => {
        setFeeBreakdown(initialFeeBreakdown);
    }, [initialFeeBreakdown, paymentIntent]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) return;
        setLoading(true);

        try {
            const { error: submitError } = await elements.submit();
            if (submitError) {
                onError(submitError.message || 'Payment details are incomplete.');
                return;
            }

            const { error, paymentIntent: confirmedPaymentIntent } = await stripe.confirmPayment({
                elements,
                clientSecret: paymentIntent,
                confirmParams: {
                    return_url: `${window.location.origin}/payment-success`,
                },
                redirect: 'if_required',
            });

            if (error) {
                onError(error.message || 'Payment failed');
            } else if (confirmedPaymentIntent?.status === 'processing') {
                if (onPending) {
                    onPending();
                } else {
                    onSuccess();
                }
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
                    layout: {
                        type: 'tabs',
                        defaultCollapsed: false,
                    },
                    defaultValues: billingAddress ? {
                        billingDetails: {
                            name: billingName ?? undefined,
                            email: billingEmail ?? undefined,
                            address: {
                                line1: billingAddress.line1,
                                line2: billingAddress.line2 ?? undefined,
                                city: billingAddress.city,
                                state: billingAddress.state,
                                postal_code: billingAddress.postalCode,
                                country: billingAddress.countryCode,
                            },
                        },
                    } : undefined,
                }}
            />

            <div className="border-t pt-4">
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span>Processing fees are included in the online price.</span>
                </div>
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
