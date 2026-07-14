import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
    buildRegistrationProgressKey,
    clearRegistrationProgress,
    loadRegistrationProgress,
    saveRegistrationProgress,
    type RegistrationProgressStep,
} from '@/lib/registrationProgressStorage';

type RegistrationProgressPatch = {
    step?: RegistrationProgressStep;
    answers?: Record<string, string>;
    selectedTeamId?: string | null;
    selectedDivisionId?: string | null;
    selectedDivisionTypeKey?: string | null;
    registrationId?: string | null;
    holdExpiresAt?: string | null;
};

type UseEventRegistrationProgressArgs = {
    userId?: string | null;
    eventId?: string | null;
    slotId?: string | null;
    occurrenceDate?: string | null;
    answers: Record<string, string>;
    selectedTeamId: string;
    selectedDivisionId: string;
    selectedDivisionTypeKey: string;
    registrationId?: string | null;
    setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
    setSelectedTeamId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionId: Dispatch<SetStateAction<string>>;
    setSelectedDivisionTypeKey: Dispatch<SetStateAction<string>>;
};

export function useEventRegistrationProgress({
    userId,
    eventId,
    slotId,
    occurrenceDate,
    answers,
    selectedTeamId,
    selectedDivisionId,
    selectedDivisionTypeKey,
    registrationId,
    setAnswers,
    setSelectedTeamId,
    setSelectedDivisionId,
    setSelectedDivisionTypeKey,
}: UseEventRegistrationProgressArgs) {
    const progressKey = useMemo(() => buildRegistrationProgressKey({
        scope: 'event',
        userId,
        subjectId: eventId,
        slotId,
        occurrenceDate,
    }), [eventId, occurrenceDate, slotId, userId]);
    const [holdState, setHoldState] = useState<{
        progressKey: string | null;
        expiresAt: string | null;
    }>({
        progressKey,
        expiresAt: null,
    });
    const holdExpiresAt = holdState.progressKey === progressKey ? holdState.expiresAt : null;
    const setHoldExpiresAt = useCallback((expiresAt: string | null) => {
        setHoldState({ progressKey, expiresAt });
    }, [progressKey]);

    const save = useCallback((patch: RegistrationProgressPatch = {}) => {
        if (!progressKey || !userId || !eventId) {
            return;
        }
        saveRegistrationProgress(progressKey, {
            scope: 'event',
            userId,
            subjectId: eventId,
            step: patch.step ?? 'questions',
            answers: patch.answers ?? answers,
            selectedTeamId: (patch.selectedTeamId ?? selectedTeamId) || null,
            selectedDivisionId: (patch.selectedDivisionId ?? selectedDivisionId) || null,
            selectedDivisionTypeKey: (patch.selectedDivisionTypeKey ?? selectedDivisionTypeKey) || null,
            slotId,
            occurrenceDate,
            registrationId: patch.registrationId ?? registrationId ?? null,
            holdExpiresAt: patch.holdExpiresAt ?? holdExpiresAt,
        });
    }, [
        answers,
        eventId,
        holdExpiresAt,
        occurrenceDate,
        progressKey,
        registrationId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        slotId,
        userId,
    ]);

    const clear = useCallback(() => {
        clearRegistrationProgress(progressKey);
        setHoldExpiresAt(null);
    }, [progressKey, setHoldExpiresAt]);

    useEffect(() => {
        const draft = loadRegistrationProgress(progressKey);
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) {
                return;
            }
            if (!draft) {
                return;
            }
            if (draft.answers) {
                setAnswers((current) => ({
                    ...current,
                    ...draft.answers,
                }));
            }
            if (draft.selectedTeamId) {
                setSelectedTeamId(draft.selectedTeamId);
            }
            if (draft.selectedDivisionId) {
                setSelectedDivisionId(draft.selectedDivisionId);
            }
            if (draft.selectedDivisionTypeKey) {
                setSelectedDivisionTypeKey(draft.selectedDivisionTypeKey);
            }
            setHoldExpiresAt(draft.holdExpiresAt ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, [
        progressKey,
        setAnswers,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
        setSelectedTeamId,
        setHoldExpiresAt,
    ]);

    return {
        progressKey,
        holdExpiresAt,
        setHoldExpiresAt,
        save,
        clear,
    };
}
