import React, { useState, useCallback } from 'react';
import { Button, Group } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
    QrCode,
} from 'lucide-react';
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
import { collectUniqueUserIds } from './eventDetail/eventDetailData';
import { createEventJoinActions } from './eventDetail/eventJoinActions';
import { createEventParticipantActions } from './eventDetail/eventParticipantActions';
import { ChildRegistrationPanel } from './eventDetail/ChildRegistrationPanel';
import { buildEventDetailPublicModel } from './eventDetail/eventDetailPublicModel';
import { EventIndividualRegistrationPanel } from './eventDetail/EventIndividualRegistrationPanel';
import { EventTeamRegistrationPanel } from './eventDetail/EventTeamRegistrationPanel';
import { EventDetailContent } from './eventDetail/EventDetailContent';
import { EventDetailOverlays } from './eventDetail/EventDetailOverlays';
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
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
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
        playersDropdownOpened: showPlayersDropdown,
        teamsDropdownOpened: showTeamsDropdown,
        freeAgentsDropdownOpened: showFreeAgentsDropdown,
        capacityBreakdownOpened: showCapacityBreakdown,
        selectedFreeAgentActionUser,
        qrCodeOpened: showQrCodeModal,
        teamJoinOptionsOpened: showTeamJoinOptions,
        mobileJoinExpanded,
        setCapacityBreakdownOpened: setShowCapacityBreakdown,
        openPlayersDropdown,
        closePlayersDropdown,
        openTeamsDropdown,
        closeTeamsDropdown,
        openFreeAgentsDropdown,
        closeFreeAgentsDropdown,
        toggleCapacityBreakdown,
        openFreeAgentActions,
        closeFreeAgentActions,
        openQrCode,
        closeQrCode,
        toggleTeamJoinOptions,
        toggleMobileJoin,
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
        showRegistrationQuestionsModal,
        showPasswordModal,
        showSignModal,
        showCheckoutPreviewModal,
        showBillingAddressModal,
        showPaymentModal,
        showManualPaymentModal,
        confirmingPurchase,
        paymentPlanPreview,
    } = registrationWorkflowController;
    const {
        anchorRef: joinCardAnchorRef,
        cardRef: joinCardRef,
        layout: {
            docked: joinCardDocked,
            height: joinCardHeight,
            left: joinCardLeft,
            width: joinCardWidth,
        },
    } = useJoinCardDocking({ active: isActive, inline: renderInline });

    const {
        eventPublicUrl: currentEventPublicUrl,
        organizationLogoId: currentOrganizationLogoId,
        isWeeklyParentEvent,
        weeklySessionOptions,
        selectedWeeklyOccurrenceOption,
        selectedWeeklyOccurrence,
        weeklySelectionRequired,
    } = useWeeklyEventSelectionModel({
        event: currentEvent,
        selectedOccurrence,
    });
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
        paymentData,
        pendingCheckout: pendingEventCheckout,
        holdExpiresAt: registrationHoldExpiresAt,
        discountCode,
        discountPreview,
        discountPreviewLoading,
        discountPreviewError,
        saveProgress: saveEventRegistrationProgress,
        clearProgress: clearEventRegistrationProgress,
        prepareCheckout: prepareEventCheckout,
        startCheckout: startEventCheckout,
        applyDiscountPreview: handleApplyDiscountPreview,
        closeCheckoutPreview,
        continueCheckoutPreview,
        changeDiscountCode: handleCheckoutDiscountCodeChange,
        clearDiscountCode: clearCheckoutDiscount,
        expireHold: handleEventRegistrationHoldExpired,
        closeBillingAddress,
        continueAfterBillingAddress,
        closePayment,
        clearPaymentData,
    } = checkoutController;
    const eventImageFallbackUrl = React.useMemo(
        () => getEventImageFallbackUrl({ event: currentEvent, width: 1200, height: 675 }),
        [currentEvent],
    );
    const eventImageUrl = React.useMemo(
        () => getEventImageUrl({
            imageId: currentEvent.imageId,
            width: 1200,
            height: 675,
            placeholderUrl: eventImageFallbackUrl,
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
        userDob,
        registrationByDivisionType,
        allDivisionOptions,
        divisionOptions,
        publicDivisionGroups,
        divisionDisplayNameIndex,
        eventDivisionLabels,
        selectedDivisionOption,
        handlePublicDivisionSelect,
        resolvedDivisionSelectionPayload,
        isDivisionSelectionMissing,
        selectedDivisionAtCapacity,
        participantDivisionCapacityRows,
        selectedDivisionBilling,
        checkoutEvent,
        paymentPlanPreviewRows,
        isMinor,
        isAdult,
        selfRegistrationBlockedReason,
        canRegisterChild,
        isEventHost,
        isFreeForUser,
    } = useEventDivisionRegistrationModel({
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

    const {
        maxAuthDob,
        auth: {
            opened: showAuthModal,
            mode: authModalMode,
            form: authModalForm,
            loading: authModalLoading,
            error: authModalError,
            verificationEmail: authVerificationEmail,
            verificationMessage: authVerificationMessage,
            verificationMessageType: authVerificationMessageType,
            resendingVerification: authResendingVerification,
            open: openAuthModal,
            close: closeAuthModal,
            toggleMode: toggleAuthModalMode,
            updateField: handleAuthModalInputChange,
            submit: submitAuthModal,
            resendVerification: handleAuthModalResendVerification,
            continueWithGoogle: handleAuthModalGoogle,
        },
        viewSchedule: handleViewSchedule,
        viewBracket: handleBracketClick,
        selectWeeklySession: handleWeeklySessionSelect,
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
        manualPaymentBill,
        registeringChild,
        setRegisteringChild,
        childRegistration,
        childConsent,
        childRegistrationChildId,
        ensureWeeklyOccurrenceSelected,
        finalizeJoin,
        submitManualProof: handleManualPaymentProofSubmit,
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

    const { confirmRegistrationAfterPayment } = registrationConfirmationController;

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
        signLinks,
        currentSignIndex,
        password,
        setPassword,
        passwordError,
        confirmingPassword,
        recordingSignature,
        textAccepted,
        setTextAccepted,
        beginSigningFlow,
        cancelPasswordConfirmation,
        confirmPasswordAndStartSigning,
        handleSignedDocument,
        handleTextAcceptance,
        cancelSigning,
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
        close: closeRegistrationQuestionsStep,
        updateAnswer: updateRegistrationQuestionAnswer,
        submit: submitRegistrationQuestionsStep,
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
    const {
        totalParticipants,
        participantCapacity,
        eventAtCapacity,
        spotsLeft,
        eventFillPercent,
        normalizedFreeAgentIds,
        normalizedWaitlistIds,
        normalizedParticipantUserIds,
        normalizedFreeAgentIdSet,
        normalizedWaitlistIdSet,
        isUserRegistered,
        isUserWaitlisted,
        isUserFreeAgent,
        activeChildren,
        hasRefundTarget,
        shouldShowChildRegistrationPanel,
        childOptions,
        selectedChild,
        selectedChildEligible,
        selectedChildHasEmail,
        selectedChildIsFreeAgent,
        selectedChildIsWaitlisted,
        selectedChildIsRegistered,
        showChildRegistrationStatus,
    } = useEventParticipantModel({
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

    // Update the join event handlers
    if (!currentEvent) return null;
    if (!isActive) return null;

    const {
        affiliateActionUrl,
        isAffiliateEvent,
        isEvergreenProgram,
        eventScheduleDisplayText,
        startDateValue,
        endDateValue,
        sharesSingleDayWindow,
        sportLabel,
        organization,
        hostedByLabel,
        hostedByHandle,
        hostedByHref,
        mapLat,
        mapLng,
        eventAddress,
        mapEmbedSrc,
        eventPriceSummary,
        showSecurePaymentNote,
        showPoweredByBracketIqNote,
        registrationCutoffSummary,
        refundSummary,
        eventTypeLabel,
        registrationTypeLabel,
        spotsSummary,
        eventLocationSummary,
        shouldShowHostedByHeroLabel,
        officialPositionsSummary,
        assistantHostNames,
        officialNames,
        canViewStaffSection,
        eventDisplayTimeZone,
        schedulePreviewItems,
        scheduleDateChips,
        supportsScheduleDetails,
        canShowScheduleButton,
        showParticipantsSection,
        scheduleButtonLabel,
    } = buildEventDetailPublicModel({
        event: currentEvent,
        user,
        hostUser,
        teams,
        participantCapacity,
        spotsLeft,
        selectedDivisionBillingPriceCents: selectedDivisionBilling.priceCents,
        selectedDivisionOption,
        divisionDisplayNameIndex,
        isEventHost,
        renderInline,
        isWeeklyParentEvent,
        now: todayForDob,
    });
    const renderHostManageQrActions = () => (
        <Group grow gap="sm" wrap="wrap">
            <Button
                variant="light"
                onClick={() => handleViewSchedule()}
            >
                {scheduleButtonLabel}
            </Button>
            <Button
                variant="default"
                leftSection={<QrCode size={16} />}
                onClick={openQrCode}
            >
                QR Code
            </Button>
        </Group>
    );
    const selectedTeamRegistration = selectedTeamId
        ? teams.find((team) => team.$id === selectedTeamId || team.parentTeamId === selectedTeamId) ?? null
        : null;
    const selectedTeamUsesSchedulableSlots = isTeamSignup && ['LEAGUE', 'TOURNAMENT'].includes(String(currentEvent.eventType ?? '').toUpperCase());
    const selectedTeamIsRegistered = Boolean(
        selectedTeamRegistration
        || (
            !selectedTeamUsesSchedulableSlots
            &&
            selectedTeamId
            && collectUniqueUserIds(currentEvent.teamIds).includes(selectedTeamId)
        ),
    );
    const selectedTeamPaymentFailed = Boolean(
        selectedTeamId
        && paymentFailedTeamIds.includes(selectedTeamId)
    );
    const selectedTeamIsWaitlisted = Boolean(selectedTeamId && normalizedWaitlistIdSet.has(selectedTeamId));
    const {
        handleRegisterChild,
        handleJoinEvent,
        handleJoinWaitlist,
        handleJoinTeamWaitlist,
        handleJoinAsTeam,
        continuePaymentPlanPreview,
        handleWithdrawTeam,
    } = createEventJoinActions({
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
    const joinAtCapacity = eventAtCapacity || selectedDivisionAtCapacity;
    const publicRegistrationStatusLabel = eventHasStarted
        ? 'Registration closed'
        : joinAtCapacity
            ? 'Waitlist available'
            : 'Registration is open';
    const publicRegistrationStatusClassName = eventHasStarted
        ? 'border-slate-200 bg-slate-100 text-slate-700'
        : joinAtCapacity
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900';
    const showSelfWaitlistActions = !currentUserPaymentFailed && (joinAtCapacity || isUserWaitlisted);
    const childWaitlistMode = !isTeamSignup && (joinAtCapacity || selectedChildIsWaitlisted);
    const showTeamWaitlistActions = !selectedTeamPaymentFailed && !selectedTeamIsRegistered && (joinAtCapacity || selectedTeamIsWaitlisted);
    const selfJoinDisabled = weeklySelectionRequired || Boolean(selfRegistrationBlockedReason) || joining || confirmingPurchase || isDivisionSelectionMissing;
    const selfWaitlistJoinDisabled = weeklySelectionRequired || Boolean(selfRegistrationBlockedReason) || joining || isDivisionSelectionMissing;
    const selfWaitlistLeaveDisabled = joining || eventHasStarted;
    const freeAgentJoinBlockedReason = weeklySelectionRequired
                                ? 'Select a weekly session before joining as a free agent.'
        : selfRegistrationBlockedReason;
    const {
        handleLeaveWaitlist,
        handleLeaveFreeAgents,
        handleJoinFreeAgents,
    } = createEventParticipantActions({
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
    const childRegistrationPanel = (
        <ChildRegistrationPanel
            visible={shouldShowChildRegistrationPanel}
            isTeamSignup={isTeamSignup}
            waitlistMode={childWaitlistMode}
            childrenError={childrenError}
            childrenLoading={childrenLoading}
            childOptions={childOptions}
            selectedChildId={selectedChildId}
            selectedChildPresent={Boolean(selectedChild)}
            selectedChildHasEmail={selectedChildHasEmail}
            selectedChildEligible={selectedChildEligible}
            selectedChildIsFreeAgent={selectedChildIsFreeAgent}
            selectedChildIsWaitlisted={selectedChildIsWaitlisted}
            selectedChildIsRegistered={selectedChildIsRegistered}
            joiningChildFreeAgent={joiningChildFreeAgent}
            registeringChild={registeringChild}
            canRegisterChild={canRegisterChild}
            weeklySelectionRequired={weeklySelectionRequired}
            isDivisionSelectionMissing={isDivisionSelectionMissing}
            hasAgeLimits={hasAgeLimits}
            eventMinAge={eventMinAge}
            eventMaxAge={eventMaxAge}
            showRegistrationStatus={showChildRegistrationStatus}
            registration={childRegistration}
            consent={childConsent}
            comboboxProps={sharedComboboxProps}
            onChildChange={setSelectedChildId}
            onAction={() => { void handleRegisterChild(); }}
        />
    );
    const registrationPanel = isTeamSignup ? (
        <EventTeamRegistrationPanel
            eventHasStarted={eventHasStarted}
            selectedWeeklySession={Boolean(isWeeklyParentEvent && selectedWeeklyOccurrenceOption)}
            showTeamJoinOptions={showTeamJoinOptions}
            isLoadingTeams={isLoadingTeams}
            userTeams={userTeams}
            selectedTeamId={selectedTeamId}
            showTeamWaitlistActions={showTeamWaitlistActions}
            joining={joining}
            weeklySelectionRequired={weeklySelectionRequired}
            selectedTeamIsWaitlisted={selectedTeamIsWaitlisted}
            isDivisionSelectionMissing={isDivisionSelectionMissing}
            selectedTeamIsRegistered={selectedTeamIsRegistered}
            confirmingPurchase={confirmingPurchase}
            isFreeForUser={isFreeForUser}
            priceCents={selectedDivisionBilling.priceCents}
            selectedTeamPaymentFailed={selectedTeamPaymentFailed}
            selfRegistrationBlockedReason={selfRegistrationBlockedReason}
            isMinor={isMinor}
            isUserFreeAgent={isUserFreeAgent}
            freeAgentJoinBlockedReason={freeAgentJoinBlockedReason}
            childRegistrationPanel={childRegistrationPanel}
            canShowScheduleButton={canShowScheduleButton}
            hostManageQrActions={renderHostManageQrActions()}
            renderInline={renderInline}
            isTournament={currentEvent.eventType === 'TOURNAMENT'}
            sportName={typeof currentEvent.sport === 'string'
                ? currentEvent.sport
                : currentEvent.sport?.name}
            totalParticipants={totalParticipants}
            participantCapacity={participantCapacity}
            comboboxProps={sharedComboboxProps}
            onToggleTeamOptions={toggleTeamJoinOptions}
            onSelectedTeamChange={(teamId) => {
                setSelectedTeamId(teamId);
                saveEventRegistrationProgress({ selectedTeamId: teamId || null });
            }}
            onManageTeams={() => {
                router.push(`/teams?event=${currentEvent.$id}`);
                onClose();
            }}
            onJoinTeamWaitlist={() => { void handleJoinTeamWaitlist(); }}
            onJoinAsTeam={() => { void handleJoinAsTeam(); }}
            onWithdrawTeam={() => { void handleWithdrawTeam(); }}
            onLeaveFreeAgents={() => { void handleLeaveFreeAgents(); }}
            onJoinFreeAgents={() => { void handleJoinFreeAgents(); }}
            onViewBracket={handleBracketClick}
        />
    ) : (
        <EventIndividualRegistrationPanel
            selfRegistrationBlockedReason={selfRegistrationBlockedReason}
            isMinor={isMinor}
            showSelfWaitlistActions={showSelfWaitlistActions}
            isUserWaitlisted={isUserWaitlisted}
            selfWaitlistLeaveDisabled={selfWaitlistLeaveDisabled}
            selfWaitlistJoinDisabled={selfWaitlistJoinDisabled}
            selfJoinDisabled={selfJoinDisabled}
            eventHasStarted={eventHasStarted}
            joining={joining}
            confirmingPurchase={confirmingPurchase}
            priceCents={selectedDivisionBilling.priceCents}
            currentUserPaymentFailed={currentUserPaymentFailed}
            canShowScheduleButton={canShowScheduleButton}
            hostManageQrActions={renderHostManageQrActions()}
            childRegistrationPanel={childRegistrationPanel}
            onLeaveWaitlist={() => { void handleLeaveWaitlist(); }}
            onJoinWaitlist={() => { void handleJoinWaitlist(); }}
            onJoinEvent={() => { void handleJoinEvent(); }}
        />
    );
    const content = (
        <EventDetailContent
            renderInline={renderInline}
            onClose={onClose}
            sheetPopoverZIndex={SHEET_POPOVER_Z_INDEX}
            heroProps={{
                imageUrl: eventImageUrl,
                imageFallbackUrl: eventImageFallbackUrl,
                eventName: currentEvent.name,
                eventTypeLabel,
                sportLabel,
                registrationTypeLabel,
                showHostedByLabel: shouldShowHostedByHeroLabel,
                hostedByLabel,
                scheduleLabel: eventScheduleDisplayText,
                locationLabel: eventLocationSummary,
                spotsLabel: spotsSummary,
            }}
            overviewProps={{
                description: currentEvent.description,
                organization,
                hostUser,
                hostedByHref,
                hostedByLabel,
                hostedByHandle,
                isAffiliateEvent,
                registrationStatusClassName: publicRegistrationStatusClassName,
                registrationStatusLabel: publicRegistrationStatusLabel,
                isEvergreenProgram,
                sharesSingleDayWindow,
                scheduleDisplayText: eventScheduleDisplayText,
                startDate: startDateValue,
                endDate: endDateValue,
                displayTimeZone: eventDisplayTimeZone,
                locationSummary: eventLocationSummary,
                address: eventAddress,
                mapEmbedSrc,
            }}
            programDetailsProps={{
                allDivisionOptionCount: allDivisionOptions.length,
                eligibleDivisionCount: divisionOptions.length,
                divisionGroups: publicDivisionGroups,
                registrationByDivisionType,
                selectedDivisionId: selectedDivisionOption?.id,
                selectedDivisionTypeKey: selectedDivisionOption?.divisionTypeKey,
                onDivisionSelect: handlePublicDivisionSelect,
                supportsScheduleDetails,
                scheduleDateChips,
                schedulePreviewItems,
                eventType: currentEvent.eventType,
                canViewStaffSection,
                sportLabel,
                hostedByLabel,
                assistantHostNames,
                officialNames,
                officialSchedulingMode: currentEvent.officialSchedulingMode,
                officialPositionsSummary,
            }}
            summaryProps={{
                event: currentEvent,
                isTeamSignup,
                priceCents: selectedDivisionBilling.priceCents,
                eventMinAge,
                eventMaxAge,
                divisionLabels: eventDivisionLabels,
                mapEmbedSrc,
                mapLat,
                mapLng,
                participantCapacity,
                registrationCutoffSummary,
            }}
            showParticipantsSection={showParticipantsSection}
            participantsProps={{
                isTeamSignup,
                participantCapacity,
                totalParticipants,
                freeAgentCount: normalizedFreeAgentIds.length,
                waitlistCount: normalizedWaitlistIds.length,
                spotsLeft,
                fillPercent: eventFillPercent,
                divisionCapacityRows: participantDivisionCapacityRows,
                capacityBreakdownOpened: showCapacityBreakdown,
                players,
                teams,
                freeAgents,
                loading: isLoadingEvent,
                onToggleCapacityBreakdown: toggleCapacityBreakdown,
                onOpenPlayers: openPlayersDropdown,
                onOpenTeams: openTeamsDropdown,
                onOpenFreeAgents: openFreeAgentsDropdown,
            }}
            joinCardProps={{
                renderInline,
                mobileExpanded: mobileJoinExpanded,
                registrationTypeLabel,
                selectedDivisionOption,
                priceCents: selectedDivisionBilling.priceCents,
                eventPriceSummary,
                joinError,
                joinNotice,
                event: currentEvent,
                eventImageUrl,
                affiliateActionUrl,
                isAffiliateEvent,
                isWeeklyParentEvent,
                selectedWeeklyOccurrenceOption,
                weeklySessionOptions,
                weeklySelectionRequired,
                hasAgeLimits,
                eventMinAge,
                eventMaxAge,
                divisionOptionCount: divisionOptions.length,
                registrationCutoffSummary,
                refundSummary,
                isDivisionSelectionMissing,
                registrationByDivisionType,
                hasUser: Boolean(user),
                isUserRegistered: Boolean(isUserRegistered),
                totalParticipants,
                participantCapacity,
                canShowScheduleButton,
                hostManageQrActions: renderHostManageQrActions(),
                isTournament: currentEvent.eventType === 'TOURNAMENT',
                registrationPanel,
                hasRefundTarget,
                activeChildren,
                selectedWeeklyOccurrence,
                eventStartDate,
                showSecurePaymentNote,
                showPoweredByBracketIqNote,
                onToggleMobile: toggleMobileJoin,
                onAffiliateClick: () => {
                    if (!affiliateActionUrl) {
                        return;
                    }
                    trackEventOutboundClicked(currentEvent, affiliateActionUrl, 'event_detail');
                    trackEventRegistrationStarted(currentEvent, 'affiliate', {
                        destination_selected: true,
                    });
                },
                onClearWeeklyOccurrence: onWeeklyOccurrenceChange
                    ? () => onWeeklyOccurrenceChange(null)
                    : undefined,
                onWeeklySessionSelect: (session) => {
                    void handleWeeklySessionSelect(session);
                },
                onAuthenticate: openAuthModal,
                onViewBracket: handleBracketClick,
                onRefundSuccess: loadEventDetails,
            }}
            joinCardAnchorRef={joinCardAnchorRef}
            joinCardRef={joinCardRef}
            joinCardDocked={joinCardDocked}
            joinCardHeight={joinCardHeight}
            joinCardLeft={joinCardLeft}
            joinCardWidth={joinCardWidth}
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
                participantsVisible={showParticipantsSection}
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

