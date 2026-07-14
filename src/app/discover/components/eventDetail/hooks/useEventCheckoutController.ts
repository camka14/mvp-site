import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { isApiRequestError } from '@/lib/apiClient';
import { billingAddressService } from '@/lib/billingAddressService';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import type { BillingAddress, PaymentIntent, UserData } from '@/types';

import type { RegistrationWorkflowPhase } from '../registrationWorkflow';
import {
    useEventDiscountPreview,
    type EventCheckoutWithBillingAddress,
    type PendingEventCheckoutState,
} from './useEventDiscountPreview';
import { useEventRegistrationProgress } from './useEventRegistrationProgress';

type SetWorkflowPhase = (
    phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
    opened: boolean,
) => void;

type UseEventCheckoutControllerArgs = {
    user: UserData | null | undefined;
    eventId?: string | null;
    occurrence?: WeeklyOccurrenceSelection;
    registrationQuestionAnswers: Record<string, string>;
    selectedTeamId: string;
    selectedDivisionId: string;
    selectedDivisionTypeKey: string;
    setRegistrationQuestionAnswers: Dispatch<SetStateAction<Record<string, string>>>;
    setSelectedTeamId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionTypeKey: Dispatch<SetStateAction<string>>;
    setJoining: Dispatch<SetStateAction<boolean>>;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setWorkflowPhase: SetWorkflowPhase;
};

export function hasCompleteBillingAddress(
    billingAddress?: BillingAddress | null,
): billingAddress is BillingAddress {
    return Boolean(
        billingAddress?.line1?.trim()
        && billingAddress.city?.trim()
        && billingAddress.state?.trim()
        && billingAddress.postalCode?.trim()
        && billingAddress.countryCode?.trim(),
    );
}

export function useEventCheckoutController({
    user,
    eventId,
    occurrence,
    registrationQuestionAnswers,
    selectedTeamId,
    selectedDivisionId,
    selectedDivisionTypeKey,
    setRegistrationQuestionAnswers,
    setSelectedTeamId,
    setSelectedDivisionId,
    setSelectedDivisionTypeKey,
    setJoining,
    setJoinError,
    setWorkflowPhase,
}: UseEventCheckoutControllerArgs) {
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [pendingCheckout, setPendingCheckout] = useState<PendingEventCheckoutState | null>(null);
    const progress = useEventRegistrationProgress({
        userId: user?.$id,
        eventId,
        slotId: occurrence?.slotId ?? null,
        occurrenceDate: occurrence?.occurrenceDate ?? null,
        answers: registrationQuestionAnswers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        registrationId: paymentData?.registrationId,
        setAnswers: setRegistrationQuestionAnswers,
        setSelectedTeamId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });
    const discount = useEventDiscountPreview();

    const startCheckout = useCallback(async ({
        event,
        team,
        eventRegistration,
        selection,
        answers,
        discountCode: checkoutDiscountCode,
        billingAddress,
    }: EventCheckoutWithBillingAddress) => {
        if (!user) {
            throw new Error('You must be signed in to continue.');
        }

        try {
            const paymentIntent = await paymentService.createPaymentIntent(
                user,
                event,
                team,
                undefined,
                undefined,
                selection,
                billingAddress,
                occurrence,
                answers,
                (checkoutDiscountCode ?? discount.code).trim() || null,
                eventRegistration,
            );
            const holdExpiresAt = paymentIntent.registrationHoldExpiresAt ?? null;
            progress.setHoldExpiresAt(holdExpiresAt);
            progress.save({
                step: 'checkout',
                answers: answers?.reduce<Record<string, string>>((acc, answer) => {
                    acc[answer.questionId] = answer.answer;
                    return acc;
                }, {}) ?? registrationQuestionAnswers,
                selectedTeamId: (team?.$id ?? selectedTeamId) || null,
                selectedDivisionId: (selection?.divisionId ?? selectedDivisionId) || null,
                selectedDivisionTypeKey: (selection?.divisionTypeKey ?? selectedDivisionTypeKey) || null,
                registrationId: paymentIntent.registrationId ?? null,
                holdExpiresAt,
            });
            setPaymentData(paymentIntent);
            setWorkflowPhase('payment', true);
            setPendingCheckout(null);
            setWorkflowPhase('billing-address', false);
            setWorkflowPhase('checkout-preview', false);
            discount.resetPreview();
        } catch (error) {
            if (
                isApiRequestError(error)
                && error.data
                && typeof error.data === 'object'
                && 'billingAddressRequired' in error.data
                && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
            ) {
                setPendingCheckout({
                    event,
                    team,
                    eventRegistration,
                    selection,
                    answers,
                    discountCode: checkoutDiscountCode ?? discount.code,
                });
                setWorkflowPhase('billing-address', true);
                setWorkflowPhase('checkout-preview', false);
                return;
            }
            throw error;
        }
    }, [
        discount,
        occurrence,
        progress,
        registrationQuestionAnswers,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        setWorkflowPhase,
        user,
    ]);

    const prepareCheckout = useCallback(async (checkout: PendingEventCheckoutState) => {
        setPendingCheckout(checkout);
        discount.prepare(checkout.discountCode);
        setJoinError(null);

        try {
            const profile = await billingAddressService.getBillingAddressProfile();
            if (!hasCompleteBillingAddress(profile.billingAddress)) {
                setWorkflowPhase('checkout-preview', false);
                setWorkflowPhase('billing-address', true);
                return;
            }
            setWorkflowPhase('billing-address', false);
            setWorkflowPhase('checkout-preview', true);
        } catch {
            setWorkflowPhase('checkout-preview', false);
            setWorkflowPhase('billing-address', true);
        }
    }, [discount, setJoinError, setWorkflowPhase]);

    const applyDiscountPreview = useCallback(async () => {
        await discount.apply({
            checkout: pendingCheckout,
            user,
            occurrence,
        });
    }, [discount, occurrence, pendingCheckout, user]);

    const closeCheckoutPreview = useCallback(() => {
        setWorkflowPhase('checkout-preview', false);
        setPendingCheckout(null);
        discount.resetPreview();
    }, [discount, setWorkflowPhase]);

    const continueCheckoutPreview = useCallback(async () => {
        if (!pendingCheckout || !discount.validateAppliedCode()) {
            return;
        }
        const normalizedCode = discount.code.trim();
        setJoining(true);
        setJoinError(null);
        try {
            await startCheckout({
                ...pendingCheckout,
                discountCode: normalizedCode || null,
            });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Unable to start checkout.');
        } finally {
            setJoining(false);
        }
    }, [discount, pendingCheckout, setJoinError, setJoining, startCheckout]);

    const expireHold = useCallback(() => {
        progress.clear();
        setWorkflowPhase('payment', false);
        setPaymentData(null);
        setPendingCheckout(null);
        setWorkflowPhase('billing-address', false);
        setJoinError('Registration hold expired. Start registration again to reserve a new spot.');
    }, [progress, setJoinError, setWorkflowPhase]);

    const closeBillingAddress = useCallback(() => {
        setWorkflowPhase('billing-address', false);
        setWorkflowPhase('checkout-preview', false);
        setPendingCheckout(null);
    }, [setWorkflowPhase]);

    const continueAfterBillingAddress = useCallback(() => {
        if (!pendingCheckout) {
            setWorkflowPhase('billing-address', false);
            return;
        }
        setWorkflowPhase('billing-address', false);
        setWorkflowPhase('checkout-preview', true);
    }, [pendingCheckout, setWorkflowPhase]);

    const closePayment = useCallback(() => {
        setWorkflowPhase('payment', false);
        setPaymentData(null);
    }, [setWorkflowPhase]);

    const clearPaymentData = useCallback(() => {
        setPaymentData(null);
    }, []);

    return {
        paymentData,
        pendingCheckout,
        holdExpiresAt: progress.holdExpiresAt,
        discountCode: discount.code,
        discountPreview: discount.preview,
        discountPreviewLoading: discount.loading,
        discountPreviewError: discount.error,
        saveProgress: progress.save,
        clearProgress: progress.clear,
        prepareCheckout,
        startCheckout,
        applyDiscountPreview,
        closeCheckoutPreview,
        continueCheckoutPreview,
        changeDiscountCode: discount.changeCode,
        clearDiscountCode: discount.clearCode,
        expireHold,
        closeBillingAddress,
        continueAfterBillingAddress,
        closePayment,
        clearPaymentData,
    };
}
