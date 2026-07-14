import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { trackEventRegistrationStarted } from '@/lib/analytics/eventAnalytics';
import { billService } from '@/lib/billService';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { eventService, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { paymentService } from '@/lib/paymentService';
import {
    registrationService,
    type ConsentLinks,
    type DivisionRegistrationSelection,
    type EventRegistration,
} from '@/lib/registrationService';
import type { Bill, Event, RegistrationQuestionAnswerInput, Team, UserData } from '@/types';

import { normalizePriceCents } from '../divisionRegistration';
import {
    createEventRegistrationBill,
    getJoinIntentRegistrationType,
    type JoinIntent,
    type RegistrationBillingPlan,
} from '../eventRegistrationCommands';
import { submitManualPaymentProof } from '../manualPaymentProof';
import type { PendingEventCheckoutState } from './useEventDiscountPreview';

type UseEventJoinFinalizationControllerArgs = {
    event: Event | null;
    checkoutEvent: Event | null;
    user: UserData | null | undefined;
    billing: RegistrationBillingPlan;
    occurrence?: WeeklyOccurrenceSelection;
    selection: DivisionRegistrationSelection;
    weeklySelectionRequired: boolean;
    isDivisionSelectionMissing: boolean;
    registrationByDivisionType: boolean;
    selectedDivisionAtCapacity: boolean;
    isFreeForUser: boolean;
    selectedTeamId: string;
    userTeams: Team[];
    playerCount: number;
    teamCount: number;
    timeoutMs: number;
    prepareCheckout: (checkout: PendingEventCheckoutState) => void | Promise<void>;
    reload: () => void | Promise<void>;
    navigateToCompletion: () => void;
    clearProgress: () => void;
    setJoinError: Dispatch<SetStateAction<string | null>>;
    setJoinNotice: Dispatch<SetStateAction<string | null>>;
    setManualPaymentOpened: (opened: boolean) => void;
};

type ReturnedBill = Bill & { id?: string };

export function useEventJoinFinalizationController({
    event,
    checkoutEvent,
    user,
    billing,
    occurrence,
    selection,
    weeklySelectionRequired,
    isDivisionSelectionMissing,
    registrationByDivisionType,
    selectedDivisionAtCapacity,
    isFreeForUser,
    selectedTeamId,
    userTeams,
    playerCount,
    teamCount,
    timeoutMs,
    prepareCheckout,
    reload,
    navigateToCompletion,
    clearProgress,
    setJoinError,
    setJoinNotice,
    setManualPaymentOpened,
}: UseEventJoinFinalizationControllerArgs) {
    const [manualPaymentBill, setManualPaymentBill] = useState<Bill | null>(null);
    const [registeringChild, setRegisteringChild] = useState(false);
    const [childRegistration, setChildRegistration] = useState<EventRegistration | null>(null);
    const [childConsent, setChildConsent] = useState<ConsentLinks | null>(null);
    const [childRegistrationChildId, setChildRegistrationChildId] = useState<string | null>(null);

    const ensureWeeklyOccurrenceSelected = useCallback((
        message: string = 'Select a weekly session before continuing.',
    ) => {
        if (!weeklySelectionRequired) {
            return true;
        }
        setJoinError(message);
        return false;
    }, [setJoinError, weeklySelectionRequired]);

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => (
        createEventRegistrationBill({
            ownerType,
            ownerId,
            event,
            billing,
            occurrence,
            user,
            timeoutMs,
        })
    ), [billing, event, occurrence, timeoutMs, user]);

    const registerChildForEvent = useCallback(async (
        childId: string,
        childSelection: DivisionRegistrationSelection = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!event) {
            throw new Error('Event is not loaded.');
        }
        const resolvedSelection = occurrence
            ? {
                ...childSelection,
                slotId: occurrence.slotId ?? undefined,
                occurrenceDate: occurrence.occurrenceDate ?? undefined,
            }
            : childSelection;

        setRegisteringChild(true);
        try {
            const result = await registrationService.registerChildForEvent(
                event.$id,
                childId,
                resolvedSelection,
                answers,
            );
            setChildRegistration(result.registration ?? null);
            setChildConsent(result.consent ?? null);
            setChildRegistrationChildId(childId);
            const notices: string[] = [];
            const registrationStatus = (result.registration?.status ?? '').toLowerCase();
            const consentStatus = (result.consent?.status ?? '').toLowerCase();
            if (registrationStatus === 'active') {
                notices.push('Child registration completed.');
            } else if (result.requiresParentApproval) {
                notices.push('Child request sent. A parent/guardian must approve before registration can continue.');
            } else if (result.consent?.requiresChildEmail) {
                notices.push('Child registration started. Add child email to continue child-signature document steps.');
            } else if (consentStatus === 'parentsigned') {
                notices.push('Parent signature completed. Registration is pending child signature.');
            } else if (consentStatus === 'childsigned') {
                notices.push('Child signature completed. Registration is pending parent/guardian signature.');
            } else if (consentStatus === 'completed') {
                notices.push('All signatures are complete. Finalizing registration.');
            } else if (result.consent?.status) {
                notices.push(`Child registration is pending. Consent status: ${result.consent.status}.`);
            } else if (registrationStatus) {
                notices.push(`Child registration is pending. Status: ${registrationStatus}.`);
            } else {
                notices.push('Child registration request submitted and is pending processing.');
            }
            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                notices.push(result.warnings[0]);
            }
            setJoinNotice(notices.join(' '));
            await reload();
            if (registrationStatus === 'active') {
                navigateToCompletion();
            }
        } finally {
            setRegisteringChild(false);
        }
    }, [event, navigateToCompletion, occurrence, reload, setJoinNotice]);

    const completeChildRegistration = useCallback(async (
        childId: string,
        childSelection: DivisionRegistrationSelection = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!event || !user) {
            throw new Error('Event is not loaded.');
        }

        const childPriceCents = normalizePriceCents(billing.priceCents);
        if (childPriceCents > 0) {
            if (event.registrationPaymentMode === 'MANUAL') {
                throw new Error('Child registration requires payment. Manual child payment checkout is not available yet.');
            }
            if (billing.allowPaymentPlans) {
                throw new Error('Child registration requires payment. Payment plans for child registration are not available yet.');
            }
            await prepareCheckout({
                event: checkoutEvent ?? event,
                selection: childSelection,
                answers,
                eventRegistration: {
                    registrantId: childId,
                    registrantType: 'CHILD',
                    parentId: user.$id,
                },
            });
            return;
        }

        await registerChildForEvent(childId, childSelection, answers);
    }, [billing.allowPaymentPlans, billing.priceCents, checkoutEvent, event, prepareCheckout, registerChildForEvent, user]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !event) {
            return;
        }
        if (!ensureWeeklyOccurrenceSelected()) {
            return;
        }
        const requiresDivisionSelection = intent.mode !== 'child_free_agent';
        if (requiresDivisionSelection && isDivisionSelectionMissing) {
            throw new Error(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
        }
        trackEventRegistrationStarted(event, getJoinIntentRegistrationType(intent), {
            division_id: selection.divisionId,
            division_type_id: selection.divisionTypeId,
            slot_id: occurrence?.slotId,
            occurrence_date: occurrence?.occurrenceDate,
        });

        if (intent.mode === 'child') {
            if (!intent.childId) {
                throw new Error('Select a child to register.');
            }
            await completeChildRegistration(intent.childId, selection, intent.answers);
            return;
        }
        if (intent.mode === 'child_free_agent') {
            if (!intent.childId) {
                throw new Error('Select a child to add as a free agent.');
            }
            await eventService.addFreeAgent(event.$id, intent.childId, occurrence);
            setJoinNotice('Child added to free agent list.');
            await reload();
            return;
        }
        if (intent.mode === 'child_waitlist') {
            if (!intent.childId) {
                throw new Error('Select a child to add to waitlist.');
            }
            await eventService.addToWaitlist(event.$id, intent.childId, 'user', occurrence);
            setJoinNotice('Child added to waitlist.');
            await reload();
            return;
        }

        const resolvedTeam = (() => {
            if (intent.mode !== 'team' && intent.mode !== 'team_waitlist') {
                return undefined;
            }
            if (intent.team) {
                return intent.team;
            }
            if (selectedTeamId) {
                return userTeams.find((team) => team.$id === selectedTeamId)
                    ?? ({ $id: selectedTeamId } as Team);
            }
            return undefined;
        })();

        const totalParticipants = event.teamSignup ? teamCount : playerCount;
        const participantCapacity = resolveEventParticipantCapacity(event);
        const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
        const joinAtCapacity = eventAtCapacity || selectedDivisionAtCapacity;

        if (joinAtCapacity && intent.mode === 'user') {
            await eventService.addToWaitlist(event.$id, user.$id, 'user', occurrence);
            setJoinNotice('Added to waitlist.');
            await reload();
            return;
        }
        if (joinAtCapacity && intent.mode === 'team') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(event.$id, resolvedTeam.$id, 'team', occurrence);
            setJoinNotice('Team added to waitlist.');
            await reload();
            return;
        }

        const shouldRegisterSelf = intent.mode === 'user'
            && !event.teamSignup
            && (isFreeForUser || billing.allowPaymentPlans);
        let registrationResult: EventRegistration | null = null;
        const isManualPaidRegistration = event.registrationPaymentMode === 'MANUAL'
            && !isFreeForUser
            && (intent.mode === 'user' || intent.mode === 'team');

        if (shouldRegisterSelf) {
            const result = await registrationService.registerSelfForEvent(event.$id, selection, intent.answers);
            registrationResult = result.registration ?? null;
            if (registrationResult?.status && registrationResult.status !== 'active') {
                setJoinNotice(`Registration status: ${registrationResult.status}`);
            }
        }

        if (intent.mode === 'user_waitlist') {
            await eventService.addToWaitlist(event.$id, user.$id, 'user', occurrence);
            setJoinNotice('Added to waitlist.');
            await reload();
            return;
        }
        if (intent.mode === 'team_waitlist') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(event.$id, resolvedTeam.$id, 'team', occurrence);
            setJoinNotice('Team added to waitlist.');
            await reload();
            return;
        }

        if (isManualPaidRegistration) {
            const joinTeam = intent.mode === 'team' ? resolvedTeam : undefined;
            if (intent.mode === 'team' && !joinTeam?.$id) {
                throw new Error('Team is required to register.');
            }
            const joinResult = await paymentService.joinEvent(
                user,
                checkoutEvent ?? event,
                joinTeam,
                selection,
                timeoutMs,
                occurrence,
                intent.answers,
            );
            const returnedBill = joinResult?.bill as ReturnedBill | undefined;
            const billId = returnedBill?.$id ?? returnedBill?.id;
            if (!billId) {
                throw new Error('Registration was created, but no manual payment bill was returned.');
            }
            const fullBill = await billService.getBill(billId);
            setManualPaymentBill(fullBill ?? returnedBill ?? null);
            setManualPaymentOpened(true);
            setJoinNotice('Registration started. Send payment to the host, then upload proof for review.');
            await reload();
            return;
        }

        if (billing.allowPaymentPlans) {
            const eventForJoin = checkoutEvent ?? event;
            const joinTeam = intent.mode === 'team' ? resolvedTeam : undefined;
            if (intent.mode === 'team' && !joinTeam?.$id) {
                throw new Error('Team is required to start a payment plan.');
            }

            let billCreatedDuringJoin = false;
            try {
                const joinResult = await paymentService.joinEvent(
                    user,
                    eventForJoin,
                    joinTeam,
                    selection,
                    timeoutMs,
                    occurrence,
                    intent.answers,
                );
                billCreatedDuringJoin = Boolean(joinResult?.bill);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to join event.';
                if (!message.toLowerCase().includes('already registered')) {
                    throw error;
                }
            }

            try {
                if (billCreatedDuringJoin) {
                    setJoinNotice(
                        intent.mode === 'team'
                            ? 'Team joined. Payment plan started. A bill was created - you can manage payments from your Profile.'
                            : 'Joined. Payment plan started. A bill was created - pay installments from your Profile.',
                    );
                } else if (intent.mode === 'team' && joinTeam?.$id) {
                    await createBillForOwner('TEAM', joinTeam.$id);
                    setJoinNotice(
                        'Team joined. Payment plan started. A bill was created - you can manage payments from your Profile.',
                    );
                } else {
                    await createBillForOwner('USER', user.$id);
                    setJoinNotice('Joined. Payment plan started. A bill was created - pay installments from your Profile.');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to start payment plan.';
                if (message.toLowerCase().includes('payment plan already exists')) {
                    setJoinNotice(
                        intent.mode === 'team'
                            ? 'Team joined. Payment plan already exists - you can manage payments from your Profile.'
                            : 'Joined. Payment plan already exists - you can manage payments from your Profile.',
                    );
                } else {
                    try {
                        await paymentService.leaveEvent(
                            user,
                            eventForJoin,
                            joinTeam,
                            undefined,
                            undefined,
                            timeoutMs,
                            occurrence,
                        );
                    } catch (rollbackError) {
                        console.error('Failed to rollback payment-plan join after billing error', rollbackError);
                    }
                    throw new Error(message);
                }
            }

            await reload();
            navigateToCompletion();
            return;
        }

        if (isFreeForUser) {
            if (!shouldRegisterSelf) {
                await paymentService.joinEvent(
                    user,
                    checkoutEvent ?? event,
                    resolvedTeam,
                    selection,
                    timeoutMs,
                    occurrence,
                    intent.answers,
                );
            }
            await reload();
            const selfRegistrationPending = Boolean(
                shouldRegisterSelf
                && registrationResult?.status
                && registrationResult.status !== 'active',
            );
            if (!selfRegistrationPending) {
                navigateToCompletion();
            }
            return;
        }

        await prepareCheckout({
            event: checkoutEvent ?? event,
            team: resolvedTeam,
            selection,
            answers: intent.answers,
        });
    }, [
        billing.allowPaymentPlans,
        checkoutEvent,
        completeChildRegistration,
        createBillForOwner,
        ensureWeeklyOccurrenceSelected,
        event,
        isDivisionSelectionMissing,
        isFreeForUser,
        navigateToCompletion,
        occurrence,
        playerCount,
        prepareCheckout,
        registrationByDivisionType,
        reload,
        selectedDivisionAtCapacity,
        selectedTeamId,
        selection,
        setJoinNotice,
        setManualPaymentOpened,
        teamCount,
        timeoutMs,
        user,
        userTeams,
    ]);

    const submitManualProof = useCallback(async (proofFile: File) => {
        await submitManualPaymentProof({
            event: checkoutEvent ?? event,
            bill: manualPaymentBill,
            proofFile,
        });
        setManualPaymentOpened(false);
        setManualPaymentBill(null);
        clearProgress();
        await reload();
        setJoinNotice('Payment proof uploaded. The host will review it and confirm your payment.');
    }, [
        checkoutEvent,
        clearProgress,
        event,
        manualPaymentBill,
        reload,
        setJoinNotice,
        setManualPaymentOpened,
    ]);

    const resetChildRegistrationState = useCallback(() => {
        setRegisteringChild(false);
        setChildRegistration(null);
        setChildConsent(null);
        setChildRegistrationChildId(null);
    }, []);

    return {
        manualPaymentBill,
        registeringChild,
        setRegisteringChild,
        childRegistration,
        childConsent,
        childRegistrationChildId,
        ensureWeeklyOccurrenceSelected,
        finalizeJoin,
        submitManualProof,
        resetChildRegistrationState,
    };
}
