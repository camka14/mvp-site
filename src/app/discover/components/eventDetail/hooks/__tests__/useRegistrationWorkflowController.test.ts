import { act, renderHook } from '@testing-library/react';

import { useRegistrationWorkflowController } from '../useRegistrationWorkflowController';

describe('useRegistrationWorkflowController', () => {
    it('starts idle with every registration surface closed', () => {
        const { result } = renderHook(() => useRegistrationWorkflowController());

        expect(result.current.showRegistrationQuestionsModal).toBe(false);
        expect(result.current.showSignModal).toBe(false);
        expect(result.current.showPaymentModal).toBe(false);
        expect(result.current.confirmingPurchase).toBe(false);
        expect(result.current.paymentPlanPreview).toBeNull();
    });

    it('keeps registration phases mutually exclusive', () => {
        const { result } = renderHook(() => useRegistrationWorkflowController());

        act(() => result.current.setPhase('questions', true));
        expect(result.current.showRegistrationQuestionsModal).toBe(true);

        act(() => result.current.setPhase('signing', true));
        expect(result.current.showRegistrationQuestionsModal).toBe(false);
        expect(result.current.showSignModal).toBe(true);

        act(() => result.current.setPhase('signing', false));
        expect(result.current.showSignModal).toBe(false);
    });

    it('owns payment-plan preview state and closes it atomically', () => {
        const { result } = renderHook(() => useRegistrationWorkflowController());
        const preview = {
            ownerLabel: 'Cascade Crew',
            target: { kind: 'team', teamId: 'team-one' },
        } as never;

        act(() => result.current.setPaymentPlanPreview(preview));
        expect(result.current.paymentPlanPreview).toBe(preview);

        act(() => result.current.setPaymentPlanPreview(null));
        expect(result.current.paymentPlanPreview).toBeNull();
    });

    it('exposes semantic aliases and resets phase plus preview state', () => {
        const { result } = renderHook(() => useRegistrationWorkflowController());

        act(() => result.current.setManualPaymentOpened(true));
        expect(result.current.showManualPaymentModal).toBe(true);

        act(() => result.current.setConfirmingPurchase(true));
        expect(result.current.showManualPaymentModal).toBe(false);
        expect(result.current.confirmingPurchase).toBe(true);

        act(() => result.current.reset());
        expect(result.current.confirmingPurchase).toBe(false);
        expect(result.current.paymentPlanPreview).toBeNull();
    });
});
