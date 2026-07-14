import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { registrationService } from '@/lib/registrationService';
import type { Event, RegistrationQuestion, UserData } from '@/types';

import { useRegistrationQuestionsController } from '../useRegistrationQuestionsController';

jest.mock('@/lib/analytics/eventAnalytics', () => ({
    trackEventRegistrationStarted: jest.fn(),
}));

jest.mock('@/lib/registrationService', () => ({
    registrationService: {
        registerSelfForEvent: jest.fn(),
    },
}));

const mockedTrackRegistrationStarted = trackEventRegistrationStarted as jest.MockedFunction<
    typeof trackEventRegistrationStarted
>;
const mockedRegisterSelf = registrationService.registerSelfForEvent as jest.MockedFunction<
    typeof registrationService.registerSelfForEvent
>;

const questions = [{
    id: 'question_1',
    prompt: 'Jersey size?',
    required: true,
    answerType: 'TEXT',
}] as RegistrationQuestion[];
const event = { $id: 'event_1' } as Event;
const user = { $id: 'user_1' } as UserData;
const saveProgress = jest.fn();
const beginSigning = jest.fn();
const finalizeJoin = jest.fn();
const reload = jest.fn();
const setWorkflowPhase = jest.fn();

function useQuestionsHarness(isMinor = false) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>('old error');
    const [joinNotice, setJoinNotice] = useState<string | null>('old notice');
    const controller = useRegistrationQuestionsController({
        questions,
        answers,
        setAnswers,
        event,
        user,
        isMinor,
        selection: { divisionId: 'division_1', divisionTypeId: 'type_1' },
        occurrence: { slotId: 'slot_1', occurrenceDate: '2026-07-15' },
        saveProgress,
        beginSigning,
        finalizeJoin,
        reload,
        setWorkflowPhase,
        setJoining,
        setJoinError,
        setJoinNotice,
    });
    return { controller, answers, joining, joinError, joinNotice };
}

describe('useRegistrationQuestionsController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        beginSigning.mockResolvedValue(false);
        finalizeJoin.mockResolvedValue(undefined);
        reload.mockResolvedValue(undefined);
    });

    it('opens only supported intents and persists answer edits', () => {
        const { result } = renderHook(() => useQuestionsHarness());
        expect(result.current.controller.shouldAsk({ mode: 'user' })).toBe(true);
        expect(result.current.controller.shouldAsk({ mode: 'child_free_agent' })).toBe(false);
        expect(result.current.controller.shouldAsk({
            mode: 'user',
            answers: [{ questionId: 'question_1', answer: 'M' }],
        })).toBe(false);

        act(() => result.current.controller.open({ mode: 'team' }));
        expect(setWorkflowPhase).toHaveBeenCalledWith('questions', true);
        expect(result.current.joinError).toBeNull();
        act(() => result.current.controller.updateAnswer('question_1', 'M'));
        expect(result.current.answers).toEqual({ question_1: 'M' });
        expect(saveProgress).toHaveBeenCalledWith({
            step: 'questions',
            answers: { question_1: 'M' },
        });
    });

    it('keeps the question phase open when a required answer is missing', async () => {
        const { result } = renderHook(() => useQuestionsHarness());
        act(() => result.current.controller.open({ mode: 'user' }));

        await act(async () => {
            await result.current.controller.submit();
        });

        expect(result.current.joinError).toBe('Answer "Jersey size?" before continuing.');
        expect(beginSigning).not.toHaveBeenCalled();
        expect(finalizeJoin).not.toHaveBeenCalled();
    });

    it('forwards answered intent through signing and finalization', async () => {
        const { result } = renderHook(() => useQuestionsHarness());
        act(() => result.current.controller.updateAnswer('question_1', 'L'));
        act(() => result.current.controller.open({ mode: 'team' }));

        await act(async () => {
            await result.current.controller.submit();
        });

        const answeredIntent = {
            mode: 'team',
            answers: [{ questionId: 'question_1', answer: 'L' }],
        };
        expect(beginSigning).toHaveBeenCalledWith(answeredIntent);
        expect(finalizeJoin).toHaveBeenCalledWith(answeredIntent);
        expect(setWorkflowPhase).toHaveBeenCalledWith('questions', false);
        expect(result.current.joining).toBe(false);
    });

    it('leaves joining active when signing takes ownership', async () => {
        beginSigning.mockResolvedValue(true);
        const { result } = renderHook(() => useQuestionsHarness());
        act(() => result.current.controller.updateAnswer('question_1', 'S'));
        act(() => result.current.controller.open({ mode: 'user' }));

        await act(async () => {
            await result.current.controller.submit();
        });

        expect(finalizeJoin).not.toHaveBeenCalled();
        expect(result.current.joining).toBe(true);
    });

    it('registers a minor for parent approval without starting document signing', async () => {
        mockedRegisterSelf.mockResolvedValue({
            requiresParentApproval: true,
            registration: null,
        } as never);
        const { result } = renderHook(() => useQuestionsHarness(true));
        act(() => result.current.controller.updateAnswer('question_1', 'M'));
        act(() => result.current.controller.open({ mode: 'user' }));

        await act(async () => {
            await result.current.controller.submit();
        });

        expect(mockedTrackRegistrationStarted).toHaveBeenCalledWith(event, 'self', expect.objectContaining({
            requires_parent_approval: true,
            answered_registration_questions: true,
        }));
        expect(mockedRegisterSelf).toHaveBeenCalledWith(
            'event_1',
            { divisionId: 'division_1', divisionTypeId: 'type_1' },
            [{ questionId: 'question_1', answer: 'M' }],
        );
        expect(result.current.joinNotice).toContain('parent/guardian');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(beginSigning).not.toHaveBeenCalled();
    });

    it('restores the answered intent when continuation fails', async () => {
        beginSigning.mockRejectedValue(new Error('Signing unavailable.'));
        const { result } = renderHook(() => useQuestionsHarness());
        act(() => result.current.controller.updateAnswer('question_1', 'XL'));
        act(() => result.current.controller.open({ mode: 'user' }));

        await act(async () => {
            await result.current.controller.submit();
        });

        expect(result.current.joinError).toBe('Signing unavailable.');
        expect(result.current.controller.intent).toEqual({
            mode: 'user',
            answers: [{ questionId: 'question_1', answer: 'XL' }],
        });
        expect(setWorkflowPhase).toHaveBeenLastCalledWith('questions', true);
        expect(result.current.joining).toBe(false);
    });
});
