import {
    initialRegistrationWorkflowState,
    isRegistrationWorkflowPhase,
    registrationWorkflowReducer,
} from '../registrationWorkflow';

describe('registrationWorkflowReducer', () => {
    it('opens exactly one registration phase at a time', () => {
        const questions = registrationWorkflowReducer(initialRegistrationWorkflowState, {
            type: 'open',
            phase: 'questions',
        });
        const password = registrationWorkflowReducer(questions, {
            type: 'open',
            phase: 'password',
        });

        expect(password).toEqual({ phase: 'password' });
        expect(isRegistrationWorkflowPhase(password, 'password')).toBe(true);
        expect(isRegistrationWorkflowPhase(password, 'questions')).toBe(false);
    });

    it('does not let a stale close action clear the current phase', () => {
        const signing = { phase: 'signing' as const };

        expect(registrationWorkflowReducer(signing, {
            type: 'close',
            phase: 'password',
        })).toBe(signing);
        expect(registrationWorkflowReducer(signing, {
            type: 'close',
            phase: 'signing',
        })).toEqual(initialRegistrationWorkflowState);
    });

    it.each([
        'payment-plan-preview',
        'checkout-preview',
        'billing-address',
        'payment',
        'manual-proof',
        'confirming',
    ] as const)('replaces the prior phase with %s', (phase) => {
        const result = registrationWorkflowReducer({ phase: 'questions' }, {
            type: 'open',
            phase,
        });

        expect(result).toEqual({ phase });
    });

    it('resets any active workflow and preserves an idle state identity', () => {
        expect(registrationWorkflowReducer({ phase: 'payment' }, { type: 'reset' }))
            .toEqual(initialRegistrationWorkflowState);
        expect(registrationWorkflowReducer(initialRegistrationWorkflowState, { type: 'reset' }))
            .toBe(initialRegistrationWorkflowState);
    });
});
