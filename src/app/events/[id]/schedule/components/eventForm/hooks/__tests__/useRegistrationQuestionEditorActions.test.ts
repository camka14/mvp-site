import { useState } from 'react';
import {
    act,
    renderHook,
} from '@testing-library/react';

import type { RegistrationQuestionDraft } from '@/types';

import { useRegistrationQuestionEditorActions } from '../useRegistrationQuestionEditorActions';

const firstQuestion: RegistrationQuestionDraft = {
    id: 'question_1',
    prompt: 'What position do you play?',
    answerType: 'TEXT',
    required: false,
    sortOrder: 0,
};

const useQuestionEditorHarness = (expandSection: (sectionId: string) => void) => {
    const [drafts, setDrafts] = useState<RegistrationQuestionDraft[]>([firstQuestion]);
    const actions = useRegistrationQuestionEditorActions({ expandSection, setDrafts });
    return { actions, drafts };
};

describe('useRegistrationQuestionEditorActions', () => {
    it('adds a text question and expands the editor section', () => {
        const expandSection = jest.fn();
        const { result } = renderHook(() => useQuestionEditorHarness(expandSection));

        act(() => result.current.actions.addQuestion());

        expect(expandSection).toHaveBeenCalledWith('section-registration-questions');
        expect(result.current.drafts).toHaveLength(2);
        expect(result.current.drafts[1]).toEqual(expect.objectContaining({
            prompt: '',
            answerType: 'TEXT',
            required: false,
            sortOrder: 1,
        }));
        expect(result.current.drafts[1].id).not.toBe('');
    });

    it('updates fields and reindexes drafts after removal', () => {
        const { result } = renderHook(() => useQuestionEditorHarness(jest.fn()));
        act(() => result.current.actions.addQuestion());
        act(() => result.current.actions.changePrompt(1, 'What is your jersey number?'));
        act(() => result.current.actions.changeRequired(1, true));
        expect(result.current.drafts[1]).toEqual(expect.objectContaining({
            prompt: 'What is your jersey number?',
            required: true,
            sortOrder: 1,
        }));

        act(() => result.current.actions.removeQuestion(0));
        expect(result.current.drafts).toHaveLength(1);
        expect(result.current.drafts[0]).toEqual(expect.objectContaining({
            prompt: 'What is your jersey number?',
            sortOrder: 0,
        }));
    });
});
