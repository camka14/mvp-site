import { renderHook } from '@testing-library/react';

import { useEventDetailInactiveReset } from '../useEventDetailInactiveReset';

function createActions() {
    return {
        setJoinError: jest.fn(),
        setJoinNotice: jest.fn(),
        resetRegistrationWorkflow: jest.fn(),
        resetSigningState: jest.fn(),
        setShowCapacityBreakdown: jest.fn(),
        setSelectedChildId: jest.fn(),
        resetChildRegistrationState: jest.fn(),
        setJoiningChildFreeAgent: jest.fn(),
        resetRegistrationQuestions: jest.fn(),
        setPaymentPlanPreviewState: jest.fn(),
        setSelectedDivisionId: jest.fn(),
        setSelectedDivisionTypeKey: jest.fn(),
    };
}

describe('useEventDetailInactiveReset', () => {
    it('does not reset an active event detail', () => {
        const actions = createActions();

        renderHook(() => useEventDetailInactiveReset({ active: true, ...actions }));

        Object.values(actions).forEach((action) => expect(action).not.toHaveBeenCalled());
    });

    it('clears every event-scoped transient value when initially inactive', () => {
        const actions = createActions();

        renderHook(() => useEventDetailInactiveReset({ active: false, ...actions }));

        expect(actions.setJoinError).toHaveBeenCalledWith(null);
        expect(actions.setJoinNotice).toHaveBeenCalledWith(null);
        expect(actions.resetRegistrationWorkflow).toHaveBeenCalledTimes(1);
        expect(actions.resetSigningState).toHaveBeenCalledTimes(1);
        expect(actions.setShowCapacityBreakdown).toHaveBeenCalledWith(false);
        expect(actions.setSelectedChildId).toHaveBeenCalledWith('');
        expect(actions.resetChildRegistrationState).toHaveBeenCalledTimes(1);
        expect(actions.setJoiningChildFreeAgent).toHaveBeenCalledWith(false);
        expect(actions.resetRegistrationQuestions).toHaveBeenCalledTimes(1);
        expect(actions.setPaymentPlanPreviewState).toHaveBeenCalledWith(null);
        expect(actions.setSelectedDivisionId).toHaveBeenCalledWith('');
        expect(actions.setSelectedDivisionTypeKey).toHaveBeenCalledWith('');
    });

    it('resets exactly once when the detail becomes inactive', () => {
        const actions = createActions();
        const { rerender } = renderHook(
            ({ active }) => useEventDetailInactiveReset({ active, ...actions }),
            { initialProps: { active: true } },
        );

        rerender({ active: false });
        rerender({ active: false });

        Object.values(actions).forEach((action) => expect(action).toHaveBeenCalledTimes(1));
    });
});
