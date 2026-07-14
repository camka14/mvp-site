import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import { registrationService, type DivisionRegistrationSelection } from '@/lib/registrationService';
import type { Event, Team, UserData } from '@/types';

import { normalizePriceCents } from './divisionRegistration';
import type { JoinIntent, RegistrationBillingPlan } from './eventRegistrationCommands';

export type PaymentPlanPreviewState = {
    intent: JoinIntent;
    ownerLabel: string;
};

type EventJoinActionInputs = {
    event: Event;
    user: UserData | null | undefined;
    eventHasStarted: boolean;
    joinClosedMessage: string;
    isDivisionSelectionMissing: boolean;
    registrationByDivisionType: boolean;
    selfRegistrationBlockedReason: string | null;
    isMinor: boolean;
    billing: RegistrationBillingPlan;
    selection: DivisionRegistrationSelection;
    occurrence?: WeeklyOccurrenceSelection;
    selectedChildId: string;
    selectedChildEligible: boolean;
    selectedChildIsFreeAgent: boolean;
    selectedChildIsWaitlisted: boolean;
    selectedChildIsRegistered: boolean;
    selectedChildEmail?: string | null;
    playerCount: number;
    selectedTeamId: string;
    selectedTeamIsWaitlisted: boolean;
    userTeams: Team[];
    paymentPlanPreview: PaymentPlanPreviewState | null;
    timeoutMs: number;
    ensureWeeklyOccurrenceSelected: (message?: string) => boolean;
    shouldAskRegistrationQuestions: (intent: JoinIntent) => boolean;
    openRegistrationQuestionsStep: (intent: JoinIntent) => void;
    beginSigningFlow: (intent: JoinIntent) => Promise<boolean>;
    finalizeJoin: (intent: JoinIntent) => void | Promise<void>;
    reload: () => void | Promise<void>;
    setJoining: (joining: boolean) => void;
    setJoiningChildFreeAgent: (joining: boolean) => void;
    setRegisteringChild: (registering: boolean) => void;
    setJoinError: (error: string | null) => void;
    setJoinNotice: (notice: string | null) => void;
    setPaymentPlanPreview: (preview: PaymentPlanPreviewState | null) => void;
};

export function createEventJoinActions({
    event,
    user,
    eventHasStarted,
    joinClosedMessage,
    isDivisionSelectionMissing,
    registrationByDivisionType,
    selfRegistrationBlockedReason,
    isMinor,
    billing,
    selection,
    occurrence,
    selectedChildId,
    selectedChildEligible,
    selectedChildIsFreeAgent,
    selectedChildIsWaitlisted,
    selectedChildIsRegistered,
    selectedChildEmail,
    playerCount,
    selectedTeamId,
    selectedTeamIsWaitlisted,
    userTeams,
    paymentPlanPreview,
    timeoutMs,
    ensureWeeklyOccurrenceSelected,
    shouldAskRegistrationQuestions,
    openRegistrationQuestionsStep,
    beginSigningFlow,
    finalizeJoin,
    reload,
    setJoining,
    setJoiningChildFreeAgent,
    setRegisteringChild,
    setJoinError,
    setJoinNotice,
    setPaymentPlanPreview,
}: EventJoinActionInputs) {
    const handleRegisterChild = async () => {
        if (!user) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before registering a child.')) {
            return;
        }
        if (!selectedChildId) {
            setJoinError(event.teamSignup
                ? 'Select a child to add as a free agent.'
                : 'Select a child to register.');
            return;
        }
        const bypassEligibilityCheck = (event.teamSignup && selectedChildIsFreeAgent)
            || (!event.teamSignup && selectedChildIsWaitlisted);
        if (!selectedChildEligible && !bypassEligibilityCheck) {
            setJoinError('Selected child is not eligible for this event.');
            return;
        }

        if (event.teamSignup) {
            setJoinError(null);
            setJoinNotice(null);
            setJoiningChildFreeAgent(true);
            try {
                if (selectedChildIsFreeAgent) {
                    await eventService.removeFreeAgent(event.$id, selectedChildId, occurrence);
                    setJoinNotice('Child removed from free agent list.');
                } else {
                    const intent: JoinIntent = {
                        mode: 'child_free_agent',
                        childId: selectedChildId,
                        childEmail: selectedChildEmail ?? null,
                    };
                    const signingStarted = await beginSigningFlow(intent);
                    if (signingStarted) {
                        return;
                    }
                    await finalizeJoin(intent);
                    return;
                }
                await reload();
            } catch (error) {
                setJoinError(error instanceof Error ? error.message : 'Failed to update child free agent status.');
            } finally {
                setJoiningChildFreeAgent(false);
            }
            return;
        }

        const eventCapacity = resolveEventParticipantCapacity(event);
        const eventWaitlistMode = (eventCapacity > 0 && playerCount >= eventCapacity)
            || selectedChildIsWaitlisted;
        if (eventWaitlistMode) {
            setJoinError(null);
            setJoinNotice(null);
            try {
                if (selectedChildIsWaitlisted) {
                    setRegisteringChild(true);
                    await eventService.removeFromWaitlist(event.$id, selectedChildId, 'user', occurrence);
                    setJoinNotice('Child removed from waitlist.');
                    await reload();
                    return;
                }
                if (selectedChildIsRegistered) {
                    setJoinNotice('Child is already registered for this event.');
                    return;
                }
                const intent: JoinIntent = {
                    mode: 'child_waitlist',
                    childId: selectedChildId,
                    childEmail: selectedChildEmail ?? null,
                };
                const signingStarted = await beginSigningFlow(intent);
                if (signingStarted) {
                    return;
                }
                await finalizeJoin(intent);
            } catch (error) {
                setJoinError(error instanceof Error ? error.message : 'Failed to update child waitlist status.');
            } finally {
                setRegisteringChild(false);
            }
            return;
        }

        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before registering a child.'
                    : 'Select a division before registering a child.',
            );
            return;
        }
        const childIntent: JoinIntent = {
            mode: 'child',
            childId: selectedChildId,
            childEmail: selectedChildEmail ?? null,
        };
        if (shouldAskRegistrationQuestions(childIntent)) {
            openRegistrationQuestionsStep(childIntent);
            return;
        }
        setJoinError(null);
        setJoinNotice(null);

        try {
            const signingStarted = await beginSigningFlow(childIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(childIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to register child.');
        }
    };

    const handleJoinEvent = async (skipPaymentPlanPreview = false) => {
        if (!user) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining.')) {
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
            return;
        }
        if (selfRegistrationBlockedReason) {
            setJoinError(selfRegistrationBlockedReason);
            return;
        }
        if (
            !skipPaymentPlanPreview
            && !isMinor
            && billing.allowPaymentPlans
            && normalizePriceCents(billing.priceCents) > 0
        ) {
            setPaymentPlanPreview({ intent: { mode: 'user' }, ownerLabel: 'You' });
            return;
        }

        const joinIntent: JoinIntent = { mode: 'user' };
        if (shouldAskRegistrationQuestions(joinIntent)) {
            openRegistrationQuestionsStep(joinIntent);
            return;
        }
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                trackEventRegistrationStarted(event, 'self', {
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
            signingStarted = await beginSigningFlow(joinIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(joinIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join event');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const handleJoinWaitlist = async () => {
        if (!user) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining the waitlist.')) {
            return;
        }
        if (selfRegistrationBlockedReason) {
            setJoinError(selfRegistrationBlockedReason);
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining the waitlist.'
                    : 'Select a division before joining the waitlist.',
            );
            return;
        }
        const waitlistMinorIntent: JoinIntent = { mode: 'user' };
        if (isMinor && shouldAskRegistrationQuestions(waitlistMinorIntent)) {
            openRegistrationQuestionsStep(waitlistMinorIntent);
            return;
        }
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                trackEventRegistrationStarted(event, 'waitlist', {
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
            signingStarted = await beginSigningFlow({ mode: 'user_waitlist' });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'user_waitlist' });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join waitlist');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const handleJoinTeamWaitlist = async () => {
        if (!user || !selectedTeamId) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining the waitlist.')) {
            return;
        }
        if (!selectedTeamIsWaitlisted && isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining the waitlist.'
                    : 'Select a division before joining the waitlist.',
            );
            return;
        }
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const team = userTeams.find((candidate) => candidate.$id === selectedTeamId)
            ?? ({ $id: selectedTeamId } as Team);
        let signingStarted = false;
        try {
            if (selectedTeamIsWaitlisted) {
                await eventService.removeFromWaitlist(event.$id, selectedTeamId, 'team', occurrence);
                setJoinNotice('Team removed from waitlist.');
                await reload();
                return;
            }
            const intent: JoinIntent = { mode: 'team_waitlist', team };
            signingStarted = await beginSigningFlow(intent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(intent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to update team waitlist status');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const handleJoinAsTeam = async (skipPaymentPlanPreview = false, teamOverride?: Team) => {
        if (!user || (!selectedTeamId && !teamOverride?.$id)) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before joining.')) {
            return;
        }
        if (isDivisionSelectionMissing) {
            setJoinError(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
            return;
        }

        const team = teamOverride
            ?? userTeams.find((candidate) => candidate.$id === selectedTeamId)
            ?? ({ $id: selectedTeamId } as Team);
        const joinIntent: JoinIntent = { mode: 'team', team };
        if (
            !skipPaymentPlanPreview
            && billing.allowPaymentPlans
            && normalizePriceCents(billing.priceCents) > 0
        ) {
            const teamName = typeof team.name === 'string' && team.name.trim().length > 0
                ? team.name.trim()
                : 'Your team';
            setPaymentPlanPreview({ intent: joinIntent, ownerLabel: teamName });
            return;
        }
        if (shouldAskRegistrationQuestions(joinIntent)) {
            openRegistrationQuestionsStep(joinIntent);
            return;
        }
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow(joinIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(joinIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const continuePaymentPlanPreview = () => {
        const preview = paymentPlanPreview;
        setPaymentPlanPreview(null);
        if (!preview) {
            return;
        }
        if (preview.intent.mode === 'team') {
            void handleJoinAsTeam(true, preview.intent.team ?? undefined);
            return;
        }
        void handleJoinEvent(true);
    };

    const handleWithdrawTeam = async () => {
        if (!user || !selectedTeamId) {
            return;
        }
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before withdrawing.')) {
            return;
        }
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const selectedTeam = userTeams.find((team) => team.$id === selectedTeamId)
            ?? ({ $id: selectedTeamId } as Team);
        try {
            await paymentService.leaveEvent(
                user,
                event,
                selectedTeam,
                undefined,
                undefined,
                timeoutMs,
                occurrence,
            );
            setJoinNotice('Team withdrawn from this event.');
            await reload();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to withdraw team');
        } finally {
            setJoining(false);
        }
    };

    return {
        handleRegisterChild,
        handleJoinEvent,
        handleJoinWaitlist,
        handleJoinTeamWaitlist,
        handleJoinAsTeam,
        continuePaymentPlanPreview,
        handleWithdrawTeam,
    };
}
