import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';

import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import type { Event, UserData } from '@/types';
import { useInlineEventAuthController } from './useInlineEventAuthController';
import type { WeeklySessionOption } from '../weeklySessions';

type PublicCompletion = {
    slug: string;
    redirectUrl?: string | null;
};

type UseEventDetailNavigationControllerArgs = {
    event: Event;
    user: UserData | null | undefined;
    refreshSession: () => Promise<void>;
    onClose: () => void;
    onWeeklyOccurrenceChange?: (
        occurrence: { slotId: string; occurrenceDate: string } | null,
    ) => void;
    publicCompletion?: PublicCompletion;
    clearRegistrationProgress: () => void;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
};

export function useEventDetailNavigationController({
    event,
    user,
    refreshSession,
    onClose,
    onWeeklyOccurrenceChange,
    publicCompletion,
    clearRegistrationProgress,
    setJoinError,
    setJoinNotice,
}: UseEventDetailNavigationControllerArgs) {
    const router = useRouter();
    const maxAuthDob = useMemo(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }, []);
    const handleInlineAuthAuthenticated = useCallback(() => {
        setJoinError(null);
    }, [setJoinError]);
    const handleInlineAuthSignedIn = useCallback(() => {
        setJoinNotice('Signed in. Continue registration.');
    }, [setJoinNotice]);
    const handleInlineAuthProfileCompletionRequired = useCallback(() => {
        const nextPath = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}${window.location.hash}`
            : '/discover';
        router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
    }, [router]);
    const auth = useInlineEventAuthController({
        refreshSession,
        onAuthenticated: handleInlineAuthAuthenticated,
        onSignedIn: handleInlineAuthSignedIn,
        onProfileCompletionRequired: handleInlineAuthProfileCompletionRequired,
    });
    const openAuth = auth.open;
    const viewSchedule = useCallback((tab?: string) => {
        const eventPath = `/events/${event.$id}`;
        router.push(tab ? `${eventPath}?tab=${tab}` : eventPath);
        onClose();
    }, [event.$id, onClose, router]);
    const viewBracket = useCallback(() => {
        if (event.eventType === 'TOURNAMENT') {
            viewSchedule('bracket');
        }
    }, [event.eventType, viewSchedule]);
    const selectWeeklySession = useCallback((session: WeeklySessionOption) => {
        if (event.eventType !== 'WEEKLY_EVENT' || event.parentEvent) {
            return;
        }
        setJoinError(null);
        setJoinNotice(null);
        if (onWeeklyOccurrenceChange) {
            onWeeklyOccurrenceChange({
                slotId: session.slotId,
                occurrenceDate: session.occurrenceDate,
            });
            return;
        }
        if (!user) {
            openAuth();
            return;
        }

        setJoinNotice('Session selected. Finish registration on the event page.');
        const params = new URLSearchParams({
            tab: 'schedule',
            slotId: session.slotId,
            occurrenceDate: session.occurrenceDate,
        });
        router.push(`/events/${event.$id}?${params.toString()}`);
        onClose();
    }, [
        event.$id,
        event.eventType,
        event.parentEvent,
        onClose,
        onWeeklyOccurrenceChange,
        openAuth,
        router,
        setJoinError,
        setJoinNotice,
        user,
    ]);
    const navigateToCompletion = useCallback(() => {
        clearRegistrationProgress();
        if (!publicCompletion?.slug) {
            return;
        }
        navigateToPublicCompletion({
            router,
            slug: publicCompletion.slug,
            kind: 'event',
            redirectUrl: publicCompletion.redirectUrl,
        });
    }, [clearRegistrationProgress, publicCompletion, router]);

    return {
        maxAuthDob,
        auth,
        viewSchedule,
        viewBracket,
        selectWeeklySession,
        navigateToCompletion,
    };
}
