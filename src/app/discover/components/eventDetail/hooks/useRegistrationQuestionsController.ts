import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { registrationService, type DivisionRegistrationSelection } from '@/lib/registrationService';
import type { Event, RegistrationQuestion, RegistrationQuestionAnswerInput, UserData } from '@/types';

import type { JoinIntent } from '../eventRegistrationCommands';
import type { RegistrationWorkflowPhase } from '../registrationWorkflow';
import type { RegistrationProgressPatch } from './useEventRegistrationProgress';

type SetWorkflowPhase = (
    phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
    opened: boolean,
) => void;

type UseRegistrationQuestionsControllerArgs = {
    questions: RegistrationQuestion[];
    answers: Record<string, string>;
    setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
    event: Event | null;
    user: UserData | null | undefined;
    isMinor: boolean;
    selection: DivisionRegistrationSelection;
    occurrence?: WeeklyOccurrenceSelection;
    saveProgress: (patch?: RegistrationProgressPatch) => void;
    beginSigning: (intent: JoinIntent) => Promise<boolean>;
    finalizeJoin: (intent: JoinIntent) => void | Promise<void>;
    reload: () => void | Promise<void>;
    setWorkflowPhase: SetWorkflowPhase;
    setJoining: Dispatch<SetStateAction<boolean>>;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
};

export function useRegistrationQuestionsController({
    questions,
    answers,
    setAnswers,
    event,
    user,
    isMinor,
    selection,
    occurrence,
    saveProgress,
    beginSigning,
    finalizeJoin,
    reload,
    setWorkflowPhase,
    setJoining,
    setJoinError,
    setJoinNotice,
}: UseRegistrationQuestionsControllerArgs) {
    const [intent, setIntent] = useState<JoinIntent | null>(null);

    const buildAnswers = useCallback((): RegistrationQuestionAnswerInput[] => (
        questions.map((question) => ({
            questionId: question.id,
            answer: answers[question.id] ?? '',
        }))
    ), [answers, questions]);

    const validateAnswers = useCallback((): string | null => {
        const missingRequired = questions.find((question) => (
            Boolean(question.required) && String(answers[question.id] ?? '').trim().length === 0
        ));
        return missingRequired
            ? `Answer "${missingRequired.prompt}" before continuing.`
            : null;
    }, [answers, questions]);

    const shouldAsk = useCallback((nextIntent: JoinIntent): boolean => (
        questions.length > 0
        && !nextIntent.answers
        && (nextIntent.mode === 'user' || nextIntent.mode === 'team' || nextIntent.mode === 'child')
    ), [questions.length]);

    const open = useCallback((nextIntent: JoinIntent) => {
        setJoinError(null);
        setIntent(nextIntent);
        setWorkflowPhase('questions', true);
    }, [setJoinError, setWorkflowPhase]);

    const close = useCallback(() => {
        setWorkflowPhase('questions', false);
        setIntent(null);
    }, [setWorkflowPhase]);

    const updateAnswer = useCallback((questionId: string, value: string) => {
        const nextAnswers = {
            ...answers,
            [questionId]: value,
        };
        setAnswers(nextAnswers);
        saveProgress({
            step: 'questions',
            answers: nextAnswers,
        });
    }, [answers, saveProgress, setAnswers]);

    const submit = useCallback(async () => {
        if (!intent || !event || !user) {
            return;
        }
        const validationError = validateAnswers();
        if (validationError) {
            setJoinError(validationError);
            return;
        }

        const answeredIntent: JoinIntent = {
            ...intent,
            answers: buildAnswers(),
        };
        saveProgress({
            step: 'signing',
            answers,
        });
        setWorkflowPhase('questions', false);
        setIntent(null);
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (answeredIntent.mode === 'user' && isMinor) {
                trackEventRegistrationStarted(event, 'self', {
                    division_id: selection.divisionId,
                    division_type_id: selection.divisionTypeId,
                    slot_id: occurrence?.slotId,
                    occurrence_date: occurrence?.occurrenceDate,
                    requires_parent_approval: true,
                    answered_registration_questions: true,
                });
                const result = await registrationService.registerSelfForEvent(
                    event.$id,
                    selection,
                    answeredIntent.answers,
                );
                setJoinNotice(
                    result.requiresParentApproval
                        ? 'Join request sent. A parent/guardian can approve it from their child management page.'
                        : `Registration status: ${result.registration?.status ?? 'pendingConsent'}`,
                );
                await reload();
                return;
            }
            signingStarted = await beginSigning(answeredIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(answeredIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to continue registration.');
            setWorkflowPhase('questions', true);
            setIntent(answeredIntent);
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    }, [
        answers,
        beginSigning,
        buildAnswers,
        event,
        finalizeJoin,
        intent,
        isMinor,
        occurrence?.occurrenceDate,
        occurrence?.slotId,
        reload,
        saveProgress,
        selection,
        setJoinError,
        setJoinNotice,
        setJoining,
        setWorkflowPhase,
        user,
        validateAnswers,
    ]);

    const reset = useCallback(() => {
        setIntent(null);
    }, []);

    return {
        intent,
        shouldAsk,
        open,
        close,
        updateAnswer,
        submit,
        reset,
    };
}
