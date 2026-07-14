import {
    useCallback,
    type Dispatch,
    type SetStateAction,
} from 'react';

import { createClientId } from '@/lib/clientId';
import type { RegistrationQuestionDraft } from '@/types';

type UseRegistrationQuestionEditorActionsParams = {
    expandSection: (sectionId: string) => void;
    setDrafts: Dispatch<SetStateAction<RegistrationQuestionDraft[]>>;
};

export const useRegistrationQuestionEditorActions = ({
    expandSection,
    setDrafts,
}: UseRegistrationQuestionEditorActionsParams) => {
    const addQuestion = useCallback(() => {
        expandSection('section-registration-questions');
        setDrafts((current) => [
            ...current,
            {
                id: createClientId(),
                prompt: '',
                answerType: 'TEXT',
                required: false,
                sortOrder: current.length,
            },
        ]);
    }, [expandSection, setDrafts]);

    const changePrompt = useCallback((index: number, prompt: string) => {
        setDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, prompt, sortOrder: index }
                : entry
        )));
    }, [setDrafts]);

    const changeRequired = useCallback((index: number, required: boolean) => {
        setDrafts((current) => current.map((entry, entryIndex) => (
            entryIndex === index
                ? { ...entry, required, sortOrder: index }
                : entry
        )));
    }, [setDrafts]);

    const removeQuestion = useCallback((index: number) => {
        setDrafts((current) => current
            .filter((_, entryIndex) => entryIndex !== index)
            .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex })));
    }, [setDrafts]);

    return {
        addQuestion,
        changePrompt,
        changeRequired,
        removeQuestion,
    };
};
