import React, { useEffect, useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import type { StripePaymentElementChangeEvent } from '@stripe/stripe-js';
import type { BillingAddress, FeeBreakdown } from '@/types';
import {
    getPaymentMethodFeeLabel,
    normalizePaymentMethodFeeType,
    type PaymentMethodFeeType,
} from '@/lib/billingFees';
import { paymentService } from '@/lib/paymentService';
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
    onFeeBreakdownChange?: (feeBreakdown: FeeBreakdown) => void;
}

export default function PaymentForm({
    onSuccess,
    onPending,
    onError,
    eventName,
    feeBreakdown: initialFeeBreakdown,
    paymentIntent,
    billingAddress,
    billingEmail,
    onFeeBreakdownChange,
}: PaymentFormProps) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [feeBreakdown, setFeeBreakdown] = useState(initialFeeBreakdown);
    const [selectedPaymentMethodType, setSelectedPaymentMethodType] = useState<PaymentMethodFeeType>(
        normalizePaymentMethodFeeType(initialFeeBreakdown.paymentMethodType),
    );
    const [updatingFees, setUpdatingFees] = useState(false);
    const [feeUpdateError, setFeeUpdateError] = useState<string | null>(null);
    const appliedPaymentMethodType = normalizePaymentMethodFeeType(feeBreakdown.paymentMethodType);
    const selectedPaymentMethodLabel = getPaymentMethodFeeLabel(selectedPaymentMethodType);
    const feeUpdatePending = appliedPaymentMethodType !== selectedPaymentMethodType;
    const amount = feeBreakdown.totalCharge;

    useEffect(() => {
        setFeeBreakdown(initialFeeBreakdown);
        setSelectedPaymentMethodType(normalizePaymentMethodFeeType(initialFeeBreakdown.paymentMethodType));
        setFeeUpdateError(null);
        setUpdatingFees(false);
    }, [initialFeeBreakdown, paymentIntent]);

    useEffect(() => {
        if (!paymentIntent || !selectedPaymentMethodType || appliedPaymentMethodType === selectedPaymentMethodType) {
            return;
        }

        let cancelled = false;
        setUpdatingFees(true);
        setFeeUpdateError(null);
        paymentService.updatePaymentIntentFeeForMethod(paymentIntent, selectedPaymentMethodType)
            .then(async (result) => {
                if (cancelled) return;
                if (elements && typeof elements.fetchUpdates === 'function') {
                    await elements.fetchUpdates().catch(() => undefined);
                }
                if (cancelled) return;
                setFeeBreakdown(result.feeBreakdown);
                onFeeBreakdownChange?.(result.feeBreakdown);
            })
            .catch((error) => {
                if (cancelled) return;
                const message = error instanceof Error ? error.message : 'Failed to update payment fees.';
                setFeeUpdateError(message);
                onError(message);
            })
            .finally(() => {
                if (!cancelled) {
                    setUpdatingFees(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        appliedPaymentMethodType,
        elements,
        onError,
        onFeeBreakdownChange,
        paymentIntent,
        selectedPaymentMethodType,
    ]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) return;
        if (updatingFees || feeUpdatePending) {
            onError('Payment fees are still updating. Please wait a moment and try again.');
            return;
        }
        if (feeUpdateError) {
            onError(feeUpdateError);
            return;
        }

        setLoading(true);

        try {
            const { error, paymentIntent: confirmedPaymentIntent } = await stripe.confirmPayment({
                elements,
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

    const handlePaymentElementChange = (event: StripePaymentElementChangeEvent) => {
        const selectedType = event.value?.type;
        setSelectedPaymentMethodType(normalizePaymentMethodFeeType(selectedType));
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
                onChange={handlePaymentElementChange}
                options={{
                    layout: 'tabs',
                    defaultValues: billingAddress ? {
                        billingDetails: {
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
                    {updatingFees ? (
                        <span>Updating fees for {selectedPaymentMethodLabel}...</span>
                    ) : feeUpdateError ? (
                        <span className="text-red-600">{feeUpdateError}</span>
                    ) : selectedPaymentMethodType === 'card' ? (
                        <span>Card processing fee applied.</span>
                    ) : (
                        <span>Lower {selectedPaymentMethodLabel.toLowerCase()} processing fee applied.</span>
                    )}
                </div>
                <div className="flex justify-between items-center text-lg font-semibold mb-4">
                    <span>Total:</span>
                    <span>{formatPrice(amount)}</span>
                </div>

                <button
                    type="submit"
                    disabled={!stripe || !elements || loading || updatingFees || feeUpdatePending || Boolean(feeUpdateError)}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${!stripe || !elements || loading || updatingFees || feeUpdatePending || feeUpdateError
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                >
                    {loading || updatingFees ? (
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                            {updatingFees ? 'Updating fees...' : 'Processing...'}
                        </div>
                    ) : (
                        `Pay ${formatPrice(amount)}`
                    )}
                </button>
            </div>
        </form>
    );
}
