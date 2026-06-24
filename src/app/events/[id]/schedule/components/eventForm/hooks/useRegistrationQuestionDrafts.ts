import { useEffect, useState } from 'react';

import { teamService } from '@/lib/teamService';
import type { RegistrationQuestionDraft } from '@/types';

type UseRegistrationQuestionDraftsParams = {
    eventId?: string | null;
    isCreateMode: boolean;
    open: boolean;
};

export const useRegistrationQuestionDrafts = ({
    eventId,
    isCreateMode,
    open,
}: UseRegistrationQuestionDraftsParams) => {
    const [drafts, setDrafts] = useState<RegistrationQuestionDraft[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !eventId || isCreateMode) {
            setDrafts([]);
            setLoading(false);
            setError(null);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        teamService.getRegistrationQuestions('EVENT', eventId, 'edit')
            .then((questions) => {
                if (cancelled) {
                    return;
                }
                setDrafts(questions.map((question, index) => ({
                    id: question.id,
                    prompt: question.prompt,
                    answerType: question.answerType,
                    required: question.required,
                    sortOrder: question.sortOrder ?? index,
                })));
            })
            .catch((loadError) => {
                if (cancelled) {
                    return;
                }
                setDrafts([]);
                setError(loadError instanceof Error ? loadError.message : 'Failed to load registration questions.');
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [eventId, isCreateMode, open]);

    return {
        drafts,
        setDrafts,
        loading,
        error,
    };
};
