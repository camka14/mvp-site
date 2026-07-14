import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { registrationService, type DivisionRegistrationSelection } from '@/lib/registrationService';
import type { Event, UserData } from '@/types';

import type { JoinIntent } from './eventRegistrationCommands';

type EventParticipantActionInputs = {
    event: Event;
    user: UserData | null | undefined;
    occurrence?: WeeklyOccurrenceSelection;
    selection: DivisionRegistrationSelection;
    isMinor: boolean;
    freeAgentJoinBlockedReason: string | null;
    shouldAskRegistrationQuestions: (intent: JoinIntent) => boolean;
    openRegistrationQuestionsStep: (intent: JoinIntent) => void;
    reload: () => void | Promise<void>;
    setJoining: (joining: boolean) => void;
    setJoinError: (error: string | null) => void;
    setJoinNotice: (notice: string | null) => void;
};

export function createEventParticipantActions({
    event,
    user,
    occurrence,
    selection,
    isMinor,
    freeAgentJoinBlockedReason,
    shouldAskRegistrationQuestions,
    openRegistrationQuestionsStep,
    reload,
    setJoining,
    setJoinError,
    setJoinNotice,
}: EventParticipantActionInputs) {
    const handleLeaveWaitlist = async () => {
        if (!user) {
            return;
        }
        setJoining(true);
        setJoinError(null);
        try {
            await eventService.removeFromWaitlist(event.$id, user.$id, 'user', occurrence);
            setJoinNotice('Removed from waitlist.');
            await reload();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to leave waitlist');
        } finally {
            setJoining(false);
        }
    };

    const handleLeaveFreeAgents = async () => {
        if (!user) {
            return;
        }
        setJoining(true);
        setJoinError(null);
        try {
            await eventService.removeFreeAgent(event.$id, user.$id, occurrence);
            await reload();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to leave free agents');
        } finally {
            setJoining(false);
        }
    };

    const handleJoinFreeAgents = async () => {
        if (!user) {
            return;
        }
        if (freeAgentJoinBlockedReason) {
            setJoinError(freeAgentJoinBlockedReason);
            return;
        }
        if (isMinor) {
            const minorIntent: JoinIntent = { mode: 'user' };
            if (shouldAskRegistrationQuestions(minorIntent)) {
                openRegistrationQuestionsStep(minorIntent);
                return;
            }
        }

        setJoining(true);
        setJoinError(null);
        try {
            if (isMinor) {
                trackEventRegistrationStarted(event, 'free_agent', {
                    division_id: selection.divisionId,
                    division_type_id: selection.divisionTypeId,
                    slot_id: occurrence?.slotId,
                    occurrence_date: occurrence?.occurrenceDate,
                    requires_parent_approval: true,
                });
                const result = await registrationService.registerSelfForEvent(event.$id, selection);
                setJoinNotice(result.requiresParentApproval
                    ? 'Join request sent. A parent/guardian can approve it from their child management page.'
                    : `Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                await reload();
                return;
            }

            await eventService.addFreeAgent(event.$id, user.$id, occurrence);
            await reload();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as free agent');
        } finally {
            setJoining(false);
        }
    };

    return {
        handleLeaveWaitlist,
        handleLeaveFreeAgents,
        handleJoinFreeAgents,
    };
}
