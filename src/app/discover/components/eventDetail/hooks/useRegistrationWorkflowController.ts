import { useCallback, useReducer, useState } from 'react';

import type { PaymentPlanPreviewState } from '../eventJoinActions';
import {
    initialRegistrationWorkflowState,
    isRegistrationWorkflowPhase,
    registrationWorkflowReducer,
    type RegistrationWorkflowPhase,
} from '../registrationWorkflow';

export function useRegistrationWorkflowController() {
    const [paymentPlanPreviewState, setPaymentPlanPreviewState] = useState<PaymentPlanPreviewState | null>(null);
    const [workflow, dispatch] = useReducer(
        registrationWorkflowReducer,
        initialRegistrationWorkflowState,
    );
    const setPhase = useCallback((
        phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
        opened: boolean,
    ) => {
        dispatch({ type: opened ? 'open' : 'close', phase });
    }, []);
    const setManualPaymentOpened = useCallback((opened: boolean) => {
        setPhase('manual-proof', opened);
    }, [setPhase]);
    const setConfirmingPurchase = useCallback((opened: boolean) => {
        setPhase('confirming', opened);
    }, [setPhase]);
    const setPaymentPlanPreview = useCallback((preview: PaymentPlanPreviewState | null) => {
        setPaymentPlanPreviewState(preview);
        setPhase('payment-plan-preview', Boolean(preview));
    }, [setPhase]);
    const reset = useCallback(() => {
        setPaymentPlanPreviewState(null);
        dispatch({ type: 'reset' });
    }, []);

    return {
        setPhase,
        setManualPaymentOpened,
        setConfirmingPurchase,
        setPaymentPlanPreview,
        reset,
        showRegistrationQuestionsModal: isRegistrationWorkflowPhase(workflow, 'questions'),
        showPasswordModal: isRegistrationWorkflowPhase(workflow, 'password'),
        showSignModal: isRegistrationWorkflowPhase(workflow, 'signing'),
        showCheckoutPreviewModal: isRegistrationWorkflowPhase(workflow, 'checkout-preview'),
        showBillingAddressModal: isRegistrationWorkflowPhase(workflow, 'billing-address'),
        showPaymentModal: isRegistrationWorkflowPhase(workflow, 'payment'),
        showManualPaymentModal: isRegistrationWorkflowPhase(workflow, 'manual-proof'),
        confirmingPurchase: isRegistrationWorkflowPhase(workflow, 'confirming'),
        paymentPlanPreview: isRegistrationWorkflowPhase(workflow, 'payment-plan-preview')
            ? paymentPlanPreviewState
            : null,
    };
}
