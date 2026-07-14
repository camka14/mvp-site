import { useEffect, type Dispatch, type SetStateAction } from 'react';

type UseEventDetailInactiveResetInput = {
    active: boolean;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
    resetRegistrationWorkflow: () => void;
    resetSigningState: () => void;
    setShowCapacityBreakdown: Dispatch<SetStateAction<boolean>>;
    setSelectedChildId: Dispatch<SetStateAction<string>>;
    resetChildRegistrationState: () => void;
    setJoiningChildFreeAgent: Dispatch<SetStateAction<boolean>>;
    resetRegistrationQuestions: () => void;
    setPaymentPlanPreviewState: (value: null) => void;
    setSelectedDivisionId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionTypeKey: Dispatch<SetStateAction<string>>;
};

export function useEventDetailInactiveReset({
    active,
    setJoinError,
    setJoinNotice,
    resetRegistrationWorkflow,
    resetSigningState,
    setShowCapacityBreakdown,
    setSelectedChildId,
    resetChildRegistrationState,
    setJoiningChildFreeAgent,
    resetRegistrationQuestions,
    setPaymentPlanPreviewState,
    setSelectedDivisionId,
    setSelectedDivisionTypeKey,
}: UseEventDetailInactiveResetInput) {
    useEffect(() => {
        if (active) {
            return;
        }

        setJoinError(null);
        setJoinNotice(null);
        resetRegistrationWorkflow();
        resetSigningState();
        setShowCapacityBreakdown(false);
        setSelectedChildId('');
        resetChildRegistrationState();
        setJoiningChildFreeAgent(false);
        resetRegistrationQuestions();
        setPaymentPlanPreviewState(null);
        setSelectedDivisionId('');
        setSelectedDivisionTypeKey('');
    }, [
        active,
        resetChildRegistrationState,
        resetRegistrationQuestions,
        resetRegistrationWorkflow,
        resetSigningState,
        setJoinError,
        setJoinNotice,
        setJoiningChildFreeAgent,
        setPaymentPlanPreviewState,
        setSelectedChildId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
        setShowCapacityBreakdown,
    ]);
}
