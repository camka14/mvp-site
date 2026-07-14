export type RegistrationWorkflowPhase =
    | 'idle'
    | 'questions'
    | 'payment-plan-preview'
    | 'password'
    | 'signing'
    | 'checkout-preview'
    | 'billing-address'
    | 'payment'
    | 'manual-proof'
    | 'confirming';

export type RegistrationWorkflowState = {
    phase: RegistrationWorkflowPhase;
};

export type RegistrationWorkflowAction =
    | { type: 'open'; phase: Exclude<RegistrationWorkflowPhase, 'idle'> }
    | { type: 'close'; phase: Exclude<RegistrationWorkflowPhase, 'idle'> }
    | { type: 'reset' };

export const initialRegistrationWorkflowState: RegistrationWorkflowState = {
    phase: 'idle',
};

export function registrationWorkflowReducer(
    state: RegistrationWorkflowState,
    action: RegistrationWorkflowAction,
): RegistrationWorkflowState {
    switch (action.type) {
        case 'open':
            return state.phase === action.phase ? state : { phase: action.phase };
        case 'close':
            return state.phase === action.phase ? initialRegistrationWorkflowState : state;
        case 'reset':
            return state.phase === 'idle' ? state : initialRegistrationWorkflowState;
        default:
            return state;
    }
}

export function isRegistrationWorkflowPhase(
    state: RegistrationWorkflowState,
    phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
): boolean {
    return state.phase === phase;
}
