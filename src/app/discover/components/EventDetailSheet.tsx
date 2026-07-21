import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Event,
    Team,
    getEventImageFallbackUrl,
    getEventImageUrl,
} from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { useEventDetailDataController } from './eventDetail/hooks/useEventDetailDataController';
import { useEventSigningController } from './eventDetail/hooks/useEventSigningController';
import { useRegistrationQuestionsController } from './eventDetail/hooks/useRegistrationQuestionsController';
import { useEventCheckoutController } from './eventDetail/hooks/useEventCheckoutController';
import { useEventJoinFinalizationController } from './eventDetail/hooks/useEventJoinFinalizationController';
import { useRegistrationConfirmationController } from './eventDetail/hooks/useRegistrationConfirmationController';
import { useJoinCardDocking } from './eventDetail/hooks/useJoinCardDocking';
import { useDivisionSelectionSynchronization } from './eventDetail/hooks/useDivisionSelectionSynchronization';
import { useEventDetailInactiveReset } from './eventDetail/hooks/useEventDetailInactiveReset';
import { useEventDivisionRegistrationModel } from './eventDetail/hooks/useEventDivisionRegistrationModel';
import { useEventParticipantModel } from './eventDetail/hooks/useEventParticipantModel';
import { useRegistrationWorkflowController } from './eventDetail/hooks/useRegistrationWorkflowController';
import { useWeeklyEventSelectionModel } from './eventDetail/hooks/useWeeklyEventSelectionModel';
import { useEventDetailNavigationController } from './eventDetail/hooks/useEventDetailNavigationController';
import { useEventDetailPresentationController } from './eventDetail/hooks/useEventDetailPresentationController';
import { createEventJoinActions } from './eventDetail/eventJoinActions';
import { createEventParticipantActions } from './eventDetail/eventParticipantActions';
import { buildEventDetailPublicModel } from './eventDetail/eventDetailPublicModel';
import { EventDetailMainContent } from './eventDetail/EventDetailMainContent';
import { EventDetailOverlays } from './eventDetail/EventDetailOverlays';
import { EventDetailRegistrationPanels } from './eventDetail/EventDetailRegistrationPanels';
import { useApp } from '@/app/providers';
import {
    trackEventOutboundClicked,
    trackEventRegistrationStarted,
} from '@/lib/analytics/eventAnalytics';
// Replaced shadcn Select with Mantine Select

interface EventDetailSheetProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
    renderInline?: boolean;
    selectedOccurrence?: WeeklyOccurrenceSelection | null;
    onWeeklyOccurrenceChange?: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
    publicCompletion?: {
        slug: string;
        redirectUrl?: string | null;
    };
}

const SHEET_POPOVER_Z_INDEX = 1800;
const SIGN_MODAL_Z_INDEX = SHEET_POPOVER_Z_INDEX + 200;
const JOIN_API_TIMEOUT_MS = 5_000;

export default function EventDetailSheet({
    event,
    isOpen,
    onClose,
    renderInline = false,
    selectedOccurrence = null,
    onWeeklyOccurrenceChange,
    publicCompletion,
}: EventDetailSheetProps) {
    const todayForDob = new Date();
    const presentationController = useEventDetailPresentationController();
    const {
        user,
        authUser,
        refreshSession,
        userTeams: cachedUserTeams,
        userTeamsLoading,
    } = useApp();
    const router = useRouter();
    const isActive = renderInline ? Boolean(isOpen) : isOpen;
    const {
        currentEvent,
        players,
        teams,
        freeAgents,
        currentUserPaymentFailed,
        paymentFailedTeamIds,
        isLoadingEvent,
        hostUser,
        children,
        childrenLoading,
        childrenError,
        userTeams,
        isLoadingTeams,
        registrationQuestions,
        registrationQuestionAnswers,
        setRegistrationQuestionAnswers,
        reload: loadEventDetails,
    } = useEventDetailDataController({
        event,
        isActive,
        renderInline,
        selectedOccurrence,
        user,
        cachedUserTeams,
        userTeamsLoading: Boolean(userTeamsLoading),
    });
    const {
        selectedFreeAgentActionUser,
        setCapacityBreakdownOpened: setShowCapacityBreakdown,
        closeFreeAgentsDropdown,
        closeFreeAgentActions,
    } = presentationController;
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');
    const [selectedChildId, setSelectedChildId] = useState('');
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
    const registrationWorkflowController = useRegistrationWorkflowController();
    const {
        setPhase: setRegistrationWorkflowPhase,
        setManualPaymentOpened: setShowManualPaymentModal,
        setConfirmingPurchase,
        setPaymentPlanPreview,
        reset: resetRegistrationWorkflow,
        showSignModal,
        paymentPlanPreview,
    } = registrationWorkflowController;
    const joinCardDocking = useJoinCardDocking({ active: isActive, inline: renderInline });

    const weeklyModel = useWeeklyEventSelectionModel({
        event: currentEvent,
        selectedOccurrence,
    });
    const {
        eventPublicUrl: currentEventPublicUrl,
        organizationLogoId: currentOrganizationLogoId,
        isWeeklyParentEvent,
        selectedWeeklyOccurrenceOption,
        selectedWeeklyOccurrence,
        weeklySelectionRequired,
    } = weeklyModel;
    const checkoutController = useEventCheckoutController({
        user,
        eventId: currentEvent?.$id,
        occurrence: selectedWeeklyOccurrence,
        registrationQuestionAnswers,
        selectedTeamId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        setRegistrationQuestionAnswers,
        setSelectedTeamId,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
        setJoining,
        setJoinError,
        setWorkflowPhase: setRegistrationWorkflowPhase,
    });
    const {
        saveProgress: saveEventRegistrationProgress,
        clearProgress: clearEventRegistrationProgress,
        prepareCheckout: prepareEventCheckout,
    } = checkoutController;
    const divisionRegistrationModel = useEventDivisionRegistrationModel({
        event: currentEvent,
        user,
        children,
        teams,
        selectedChildId,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedWeeklyOccurrence,
        selectedWeeklyOccurrenceOption,
        isWeeklyParentEvent,
        saveRegistrationProgress: saveEventRegistrationProgress,
        onSelectedDivisionIdChange: setSelectedDivisionId,
        onSelectedDivisionTypeKeyChange: setSelectedDivisionTypeKey,
    });
    const eventImageFallbackUrl = React.useMemo(
        () => getEventImageFallbackUrl({ event: currentEvent, width: 1200, height: 675, fit: 'inside' }),
        [currentEvent],
    );
    const eventImageUrl = React.useMemo(
        () => getEventImageUrl({
            imageId: currentEvent.imageId,
            width: 1200,
            height: 675,
            placeholderUrl: eventImageFallbackUrl,
            fit: 'inside',
        }),
        [currentEvent.imageId, eventImageFallbackUrl],
    );
    const navigationController = useEventDetailNavigationController({
        event: currentEvent,
        user,
        refreshSession,
        onClose,
        onWeeklyOccurrenceChange,
        publicCompletion,
        clearRegistrationProgress: clearEventRegistrationProgress,
        setJoinError,
        setJoinNotice,
    });
    const {
        eventStartDate,
        eventMinAge,
        eventMaxAge,
        hasAgeLimits,
        eventHasStarted,
        joinClosedMessage,
        registrationByDivisionType,
        divisionOptions,
        divisionDisplayNameIndex,
        selectedDivisionOption,
        resolvedDivisionSelectionPayload,
        isDivisionSelectionMissing,
        selectedDivisionAtCapacity,
        selectedDivisionBilling,
        checkoutEvent,
        paymentPlanPreviewRows,
        isMinor,
        selfRegistrationBlockedReason,
        canRegisterChild,
        isEventHost,
        isFreeForUser,
    } = divisionRegistrationModel;

    const {
        maxAuthDob,
        navigateToCompletion: navigateToPublicEventCompletion,
    } = navigationController;
    useDivisionSelectionSynchronization({
        options: divisionOptions,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const joinFinalizationController = useEventJoinFinalizationController({
        event: currentEvent,
        checkoutEvent,
        user,
        billing: selectedDivisionBilling,
        occurrence: selectedWeeklyOccurrence,
        selection: resolvedDivisionSelectionPayload,
        weeklySelectionRequired,
        isDivisionSelectionMissing,
        registrationByDivisionType,
        selectedDivisionAtCapacity,
        isFreeForUser,
        selectedTeamId,
        userTeams,
        playerCount: players.length,
        teamCount: teams.length,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        prepareCheckout: prepareEventCheckout,
        reload: loadEventDetails,
        navigateToCompletion: navigateToPublicEventCompletion,
        clearProgress: clearEventRegistrationProgress,
        setJoinError,
        setJoinNotice,
        setManualPaymentOpened: setShowManualPaymentModal,
    });
    const {
        registeringChild,
        setRegisteringChild,
        childRegistrationChildId,
        ensureWeeklyOccurrenceSelected,
        finalizeJoin,
        resetChildRegistrationState,
    } = joinFinalizationController;
    const registrationConfirmationController = useRegistrationConfirmationController({
        event: currentEvent,
        user,
        selectedTeamId,
        occurrence: selectedWeeklyOccurrence,
        reload: loadEventDetails,
        navigateToCompletion: navigateToPublicEventCompletion,
        setConfirming: setConfirmingPurchase,
        setJoinError,
        setJoinNotice,
    });

    const signingController = useEventSigningController({
        event: currentEvent,
        user,
        userEmail: authUser?.email,
        signingOpened: showSignModal,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        onFinalize: finalizeJoin,
        setWorkflowPhase: setRegistrationWorkflowPhase,
        setJoining,
        setJoiningChildFreeAgent,
        setJoinError,
        setJoinNotice,
    });
    const {
        beginSigningFlow,
        resetSigningState,
    } = signingController;

    const registrationQuestionsController = useRegistrationQuestionsController({
        questions: registrationQuestions,
        answers: registrationQuestionAnswers,
        setAnswers: setRegistrationQuestionAnswers,
        event: currentEvent,
        user,
        isMinor,
        selection: resolvedDivisionSelectionPayload,
        occurrence: selectedWeeklyOccurrence,
        saveProgress: saveEventRegistrationProgress,
        beginSigning: beginSigningFlow,
        finalizeJoin,
        reload: loadEventDetails,
        setWorkflowPhase: setRegistrationWorkflowPhase,
        setJoining,
        setJoinError,
        setJoinNotice,
    });
    const {
        shouldAsk: shouldAskRegistrationQuestions,
        open: openRegistrationQuestionsStep,
        reset: resetRegistrationQuestions,
    } = registrationQuestionsController;

    useEventDetailInactiveReset({
        active: isActive,
        setJoinError,
        setJoinNotice,
        resetRegistrationWorkflow,
        resetSigningState,
        setShowCapacityBreakdown,
        setSelectedChildId,
        resetChildRegistrationState,
        setJoiningChildFreeAgent,
        resetRegistrationQuestions,
        setPaymentPlanPreviewState: setPaymentPlanPreview,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const handleInviteFreeAgentToTeam = useCallback(() => {
        if (!selectedFreeAgentActionUser || !currentEvent.$id) {
            return;
        }
        const params = new URLSearchParams({
            event: currentEvent.$id,
            freeAgent: selectedFreeAgentActionUser.$id,
        });
        closeFreeAgentsDropdown();
        closeFreeAgentActions();
        router.push(`/teams?${params.toString()}`);
    }, [
        closeFreeAgentActions,
        closeFreeAgentsDropdown,
        currentEvent.$id,
        router,
        selectedFreeAgentActionUser,
    ]);

    const isTeamSignup = Boolean(currentEvent.teamSignup);
    const participantModel = useEventParticipantModel({
        event: currentEvent,
        user,
        players,
        teams,
        freeAgents,
        children,
        childrenLoading,
        childrenError,
        selectedChildId,
        childRegistrationChildId,
        eventStartDate,
        eventMinAge,
        eventMaxAge,
        hasAgeLimits,
        isTeamSignup,
        selectedDivisionOption,
        canRegisterChild,
    });
    const {
        normalizedWaitlistIdSet,
        selectedChild,
        selectedChildEligible,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
    } = participantModel;

    // Update the join event handlers
    if (!currentEvent) return null;
    if (!isActive) return null;

    const publicModel = buildEventDetailPublicModel({
        event: currentEvent,
        user,
        hostUser,
        teams,
        participantCapacity: participantModel.participantCapacity,
        spotsLeft: participantModel.spotsLeft,
        selectedDivisionBillingPriceCents: selectedDivisionBilling.priceCents,
        selectedDivisionOption,
        divisionDisplayNameIndex,
        isEventHost,
        renderInline,
        isWeeklyParentEvent,
        now: todayForDob,
    });
    const selectedTeamIsWaitlisted = Boolean(selectedTeamId && normalizedWaitlistIdSet.has(selectedTeamId));
    const joinActions = createEventJoinActions({
        event: currentEvent,
        user,
        eventHasStarted,
        joinClosedMessage,
        isDivisionSelectionMissing,
        registrationByDivisionType,
        selfRegistrationBlockedReason,
        isMinor,
        billing: selectedDivisionBilling,
        selection: resolvedDivisionSelectionPayload,
        occurrence: selectedWeeklyOccurrence,
        selectedChildId,
        selectedChildEligible,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
        selectedChildEmail: selectedChild?.email ?? null,
        playerCount: players.length,
        selectedTeamId,
        selectedTeamIsWaitlisted,
        userTeams,
        paymentPlanPreview,
        timeoutMs: JOIN_API_TIMEOUT_MS,
        ensureWeeklyOccurrenceSelected,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        beginSigningFlow,
        finalizeJoin,
        reload: loadEventDetails,
        setJoining,
        setJoiningChildFreeAgent,
        setRegisteringChild,
        setJoinError,
        setJoinNotice,
        setPaymentPlanPreview,
    });
    const { continuePaymentPlanPreview } = joinActions;
    const freeAgentJoinBlockedReason = weeklySelectionRequired
        ? 'Select a weekly session before joining as a free agent.'
        : selfRegistrationBlockedReason;
    const participantActions = createEventParticipantActions({
        event: currentEvent,
        user,
        occurrence: selectedWeeklyOccurrence,
        selection: resolvedDivisionSelectionPayload,
        isMinor,
        freeAgentJoinBlockedReason,
        shouldAskRegistrationQuestions,
        openRegistrationQuestionsStep,
        reload: loadEventDetails,
        setJoining,
        setJoinError,
        setJoinNotice,
    });
    const registrationPanel = (
        <EventDetailRegistrationPanels
            childrenError={childrenError}
            childrenLoading={childrenLoading}
            currentEvent={currentEvent}
            currentUserPaymentFailed={currentUserPaymentFailed}
            divisionModel={divisionRegistrationModel}
            eventTeams={teams}
            isLoadingTeams={isLoadingTeams}
            joinActions={joinActions}
            joining={joining}
            joiningChildFreeAgent={joiningChildFreeAgent}
            joinFinalizationController={joinFinalizationController}
            onManageTeams={() => {
                router.push(`/teams?event=${currentEvent.$id}`);
                onClose();
            }}
            onSelectedChildChange={setSelectedChildId}
            onSelectedTeamChange={(teamId) => {
                setSelectedTeamId(teamId);
                saveEventRegistrationProgress({ selectedTeamId: teamId || null });
            }}
            onViewBracket={navigationController.viewBracket}
            onViewSchedule={navigationController.viewSchedule}
            participantActions={participantActions}
            participantModel={participantModel}
            paymentFailedTeamIds={paymentFailedTeamIds}
            presentationController={presentationController}
            publicModel={publicModel}
            registrationWorkflowController={registrationWorkflowController}
            renderInline={renderInline}
            selectedChildId={selectedChildId}
            selectedTeamId={selectedTeamId}
            selectedTeamIsWaitlisted={selectedTeamIsWaitlisted}
            userTeams={userTeams}
            weeklyModel={weeklyModel}
        />
    );
    const content = (
        <EventDetailMainContent
            currentEvent={currentEvent}
            divisionModel={divisionRegistrationModel}
            eventImageFallbackUrl={eventImageFallbackUrl}
            eventImageUrl={eventImageUrl}
            freeAgents={freeAgents}
            hasUser={Boolean(user)}
            hostUser={hostUser}
            isLoadingEvent={isLoadingEvent}
            joinCardDocking={joinCardDocking}
            joinError={joinError}
            joinNotice={joinNotice}
            navigationController={navigationController}
            onAffiliateClick={() => {
                if (!publicModel.affiliateActionUrl) {
                    return;
                }
                trackEventOutboundClicked(currentEvent, publicModel.affiliateActionUrl, 'event_detail');
                trackEventRegistrationStarted(currentEvent, 'affiliate', {
                    destination_selected: true,
                });
            }}
            onClearWeeklyOccurrence={onWeeklyOccurrenceChange
                ? () => onWeeklyOccurrenceChange(null)
                : undefined}
            onClose={onClose}
            onRefundSuccess={loadEventDetails}
            participantModel={participantModel}
            players={players}
            presentationController={presentationController}
            publicModel={publicModel}
            registrationPanel={registrationPanel}
            renderInline={renderInline}
            sheetPopoverZIndex={SHEET_POPOVER_Z_INDEX}
            teams={teams}
            weeklyModel={weeklyModel}
        />
    );

    return (
        <>
            {content}
            <EventDetailOverlays
                checkoutController={checkoutController}
                checkoutEvent={checkoutEvent}
                currentEvent={currentEvent}
                currentEventPublicUrl={currentEventPublicUrl}
                currentOrganizationLogoId={currentOrganizationLogoId}
                divisionDisplayNameIndex={divisionDisplayNameIndex}
                freeAgents={freeAgents}
                isLoadingEvent={isLoadingEvent}
                isTeamSignup={isTeamSignup}
                joinError={joinError}
                joining={joining}
                joinFinalizationController={joinFinalizationController}
                maxAuthDob={maxAuthDob}
                navigationController={navigationController}
                onContinuePaymentPlanPreview={continuePaymentPlanPreview}
                onInviteFreeAgentToTeam={handleInviteFreeAgentToTeam}
                onParticipantReload={() => loadEventDetails(currentEvent.$id, { automatic: false })}
                onSetJoinNotice={setJoinNotice}
                participantsVisible={publicModel.showParticipantsSection}
                paymentPlanPreviewRows={paymentPlanPreviewRows}
                players={players}
                presentationController={presentationController}
                registeringChild={registeringChild}
                registrationConfirmationController={registrationConfirmationController}
                registrationQuestionAnswers={registrationQuestionAnswers}
                registrationQuestions={registrationQuestions}
                registrationQuestionsController={registrationQuestionsController}
                registrationWorkflowController={registrationWorkflowController}
                selectedDivisionName={selectedDivisionOption?.name}
                selectedDivisionPriceCents={selectedDivisionBilling.priceCents}
                signingController={signingController}
                signingModalZIndex={SIGN_MODAL_Z_INDEX}
                teams={teams}
                user={user}
            />
        </>
    );
}

