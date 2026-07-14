import { useCallback, useState } from 'react';

import { paymentService, type DiscountPreview, type EventRegistrationCheckoutTarget } from '@/lib/paymentService';
import type { DivisionRegistrationSelection } from '@/lib/registrationService';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import type { BillingAddress, Event, RegistrationQuestionAnswerInput, Team, UserData } from '@/types';

export type PendingEventCheckoutState = {
    event: Event;
    team?: Team;
    eventRegistration?: EventRegistrationCheckoutTarget;
    selection?: DivisionRegistrationSelection;
    answers?: RegistrationQuestionAnswerInput[];
    discountCode?: string | null;
};

export type EventCheckoutWithBillingAddress = PendingEventCheckoutState & {
    billingAddress?: BillingAddress;
};

type ApplyEventDiscountInput = {
    checkout: PendingEventCheckoutState | null;
    user: UserData | null | undefined;
    occurrence?: WeeklyOccurrenceSelection;
};

export function useEventDiscountPreview() {
    const [code, setCode] = useState('');
    const [preview, setPreview] = useState<DiscountPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetPreview = useCallback(() => {
        setPreview(null);
        setError(null);
    }, []);

    const prepare = useCallback((nextCode?: string | null) => {
        setCode(nextCode?.trim() ?? '');
        setPreview(null);
        setError(null);
    }, []);

    const changeCode = useCallback((nextCode: string) => {
        setCode(nextCode);
        setPreview(null);
        setError(null);
    }, []);

    const clearCode = useCallback(() => {
        setCode('');
        setPreview(null);
        setError(null);
    }, []);

    const apply = useCallback(async ({ checkout, user, occurrence }: ApplyEventDiscountInput) => {
        if (!checkout || !user) {
            return;
        }
        const normalizedCode = code.trim();
        if (!normalizedCode) {
            setPreview(null);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await paymentService.previewEventDiscount({
                user,
                event: checkout.event,
                team: checkout.team,
                selection: checkout.selection,
                occurrence,
                answers: checkout.answers,
                discountCode: normalizedCode,
                eventRegistration: checkout.eventRegistration,
            });
            setPreview(result);
            setCode(result.code ?? normalizedCode);
        } catch (caught) {
            setPreview(null);
            setError(caught instanceof Error ? caught.message : 'Unable to apply discount code.');
        } finally {
            setLoading(false);
        }
    }, [code]);

    const validateAppliedCode = useCallback(() => {
        const normalizedCode = code.trim();
        const appliedCode = preview?.code?.trim() ?? '';
        if (normalizedCode && normalizedCode.toUpperCase() !== appliedCode.toUpperCase()) {
            setError('Apply the discount code before continuing to payment.');
            return false;
        }
        return true;
    }, [code, preview?.code]);

    return {
        code,
        preview,
        loading,
        error,
        prepare,
        resetPreview,
        changeCode,
        clearCode,
        apply,
        validateAppliedCode,
    };
}
