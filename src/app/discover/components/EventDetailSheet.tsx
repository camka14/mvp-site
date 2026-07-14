import React, { useState, useCallback } from 'react';
import { Button, ActionIcon, Group } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
    QrCode,
} from 'lucide-react';
import {
    Event,
    UserData,
    Team,
    getEventImageFallbackUrl,
    getEventImageUrl,
} from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import {
    normalizePriceCents,
} from './eventDetail/divisionRegistration';
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
import {
    CheckoutPreviewDialog,
    PasswordConfirmationDialog,
    PaymentPlanPreviewDialog,
    RegistrationQuestionsDialog,
    SigningDialog,
} from './eventDetail/EventRegistrationDialogs';
import {
    FreeAgentActionsDialog,
    InlineEventAuthDialog,
} from './eventDetail/EventDetailDialogs';
import {
    EventParticipantDropdowns,
    EventParticipantsSection,
} from './eventDetail/EventParticipantsSection';
import { ManualPaymentProofDialog } from './eventDetail/ManualPaymentProofDialog';
import { createEventJoinActions } from './eventDetail/eventJoinActions';
import { createEventParticipantActions } from './eventDetail/eventParticipantActions';
import { ChildRegistrationPanel } from './eventDetail/ChildRegistrationPanel';
import { EventTeamParticipantCard } from './eventDetail/EventTeamParticipantCard';
import { EventDetailSheetSummary } from './eventDetail/EventDetailSheetSummary';
import { PublicEventOverview } from './eventDetail/PublicEventOverview';
import { PublicEventProgramDetails } from './eventDetail/PublicEventProgramDetails';
import { buildEventDetailPublicModel } from './eventDetail/eventDetailPublicModel';
import { EventIndividualRegistrationPanel } from './eventDetail/EventIndividualRegistrationPanel';
import { EventTeamRegistrationPanel } from './eventDetail/EventTeamRegistrationPanel';
import { EventJoinCard } from './eventDetail/EventJoinCard';
import { EventDetailHero } from './eventDetail/EventDetailHero';
import { useApp } from '@/app/providers';
import { EventQrCodeModal } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RegistrationHoldTimer from '@/components/ui/RegistrationHoldTimer';
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
    } = useEventDetailPresentationController();
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');
    const [selectedChildId, setSelectedChildId] = useState('');
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
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
    } = useRegistrationWorkflowController();
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
    } = useEventCheckoutController({
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
    } = useEventDetailNavigationController({
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
    useDivisionSelectionSynchronization({
        options: divisionOptions,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
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
    } = useEventJoinFinalizationController({
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
    const { confirmRegistrationAfterPayment } = useRegistrationConfirmationController({
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
    } = useEventSigningController({
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
        shouldAsk: shouldAskRegistrationQuestions,
        open: openRegistrationQuestionsStep,
        close: closeRegistrationQuestionsStep,
        updateAnswer: updateRegistrationQuestionAnswer,
        submit: submitRegistrationQuestionsStep,
        reset: resetRegistrationQuestions,
    } = useRegistrationQuestionsController({
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
    const joinCardFrameClassName = renderInline
        ? `fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto px-4 pb-4 pt-3 lg:inset-auto lg:p-0 ${
            joinCardDocked
                ? 'lg:fixed lg:bottom-24 lg:z-30 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto'
                : 'lg:static lg:max-h-none lg:overflow-visible'
        }`
        : undefined;

    const content = (
        <div className={`space-y-6 ${renderInline ? 'pb-24 lg:pb-0' : ''}`}>
            {!renderInline && (
                <div
                    style={{
                        position: 'sticky',
                        top: 12,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        zIndex: SHEET_POPOVER_Z_INDEX + 20,
                    }}
                >
                    <ActionIcon
                        variant="filled"
                        color="gray"
                        radius="xl"
                        aria-label="Close"
                        onClick={onClose}
                        style={{
                            boxShadow: 'var(--mvp-shadow-overlay)',
                        }}
                    >
                        ×
                    </ActionIcon>
                </div>
            )}
            
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <EventDetailHero
                    imageUrl={eventImageUrl}
                    imageFallbackUrl={eventImageFallbackUrl}
                    eventName={currentEvent.name}
                    eventTypeLabel={eventTypeLabel}
                    sportLabel={sportLabel}
                    registrationTypeLabel={registrationTypeLabel}
                    showHostedByLabel={shouldShowHostedByHeroLabel}
                    hostedByLabel={hostedByLabel}
                    scheduleLabel={eventScheduleDisplayText}
                    locationLabel={eventLocationSummary}
                    spotsLabel={spotsSummary}
                />

                {/* Content */}
                <div className="bg-white p-5 sm:p-7">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
                        {/* Main Content */}
                        <div className="space-y-6">
                            {renderInline ? (
                                <>
                                    <div className="space-y-5">
                                        <PublicEventOverview
                                            description={currentEvent.description}
                                            organization={organization}
                                            hostUser={hostUser}
                                            hostedByHref={hostedByHref}
                                            hostedByLabel={hostedByLabel}
                                            hostedByHandle={hostedByHandle}
                                            isAffiliateEvent={isAffiliateEvent}
                                            registrationStatusClassName={publicRegistrationStatusClassName}
                                            registrationStatusLabel={publicRegistrationStatusLabel}
                                            isEvergreenProgram={isEvergreenProgram}
                                            sharesSingleDayWindow={sharesSingleDayWindow}
                                            scheduleDisplayText={eventScheduleDisplayText}
                                            startDate={startDateValue}
                                            endDate={endDateValue}
                                            displayTimeZone={eventDisplayTimeZone}
                                            locationSummary={eventLocationSummary}
                                            address={eventAddress}
                                            mapEmbedSrc={mapEmbedSrc}
                                        />

                                        <PublicEventProgramDetails
                                            allDivisionOptionCount={allDivisionOptions.length}
                                            eligibleDivisionCount={divisionOptions.length}
                                            divisionGroups={publicDivisionGroups}
                                            registrationByDivisionType={registrationByDivisionType}
                                            selectedDivisionId={selectedDivisionOption?.id}
                                            selectedDivisionTypeKey={selectedDivisionOption?.divisionTypeKey}
                                            onDivisionSelect={handlePublicDivisionSelect}
                                            supportsScheduleDetails={supportsScheduleDetails}
                                            scheduleDateChips={scheduleDateChips}
                                            schedulePreviewItems={schedulePreviewItems}
                                            eventType={currentEvent.eventType}
                                            canViewStaffSection={canViewStaffSection}
                                            sportLabel={sportLabel}
                                            hostedByLabel={hostedByLabel}
                                            assistantHostNames={assistantHostNames}
                                            officialNames={officialNames}
                                            officialSchedulingMode={currentEvent.officialSchedulingMode}
                                            officialPositionsSummary={officialPositionsSummary}
                                        />
                                    </div>
                                </>
                            ) : (
                                <EventDetailSheetSummary
                                    event={currentEvent}
                                    isTeamSignup={isTeamSignup}
                                    priceCents={selectedDivisionBilling.priceCents}
                                    eventMinAge={eventMinAge}
                                    eventMaxAge={eventMaxAge}
                                    divisionLabels={eventDivisionLabels}
                                    mapEmbedSrc={mapEmbedSrc}
                                    mapLat={mapLat}
                                    mapLng={mapLng}
                                    participantCapacity={participantCapacity}
                                    registrationCutoffSummary={registrationCutoffSummary}
                                />
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6 lg:self-start">
                            {showParticipantsSection ? (
                                <EventParticipantsSection
                                    isTeamSignup={isTeamSignup}
                                    participantCapacity={participantCapacity}
                                    totalParticipants={totalParticipants}
                                    freeAgentCount={normalizedFreeAgentIds.length}
                                    waitlistCount={normalizedWaitlistIds.length}
                                    spotsLeft={spotsLeft}
                                    fillPercent={eventFillPercent}
                                    divisionCapacityRows={participantDivisionCapacityRows}
                                    capacityBreakdownOpened={showCapacityBreakdown}
                                    players={players}
                                    teams={teams}
                                    freeAgents={freeAgents}
                                    loading={isLoadingEvent}
                                    onToggleCapacityBreakdown={toggleCapacityBreakdown}
                                    onOpenPlayers={openPlayersDropdown}
                                    onOpenTeams={openTeamsDropdown}
                                    onOpenFreeAgents={openFreeAgentsDropdown}
                                />
                            ) : null}

                            {/* Join Options (includes total participants) */}
                            <div
                                ref={joinCardAnchorRef}
                                style={joinCardDocked ? { height: joinCardHeight } : undefined}
                            >
                                <div
                                    ref={joinCardRef}
                                    className={joinCardFrameClassName}
                                    style={joinCardDocked
                                        ? {
                                            left: joinCardLeft,
                                            width: joinCardWidth || undefined,
                                        }
                                        : undefined}
                                >
                            <EventJoinCard
                                renderInline={renderInline}
                                mobileExpanded={mobileJoinExpanded}
                                registrationTypeLabel={registrationTypeLabel}
                                selectedDivisionOption={selectedDivisionOption}
                                priceCents={selectedDivisionBilling.priceCents}
                                eventPriceSummary={eventPriceSummary}
                                joinError={joinError}
                                joinNotice={joinNotice}
                                event={currentEvent}
                                eventImageUrl={eventImageUrl}
                                affiliateActionUrl={affiliateActionUrl}
                                isAffiliateEvent={isAffiliateEvent}
                                isWeeklyParentEvent={isWeeklyParentEvent}
                                selectedWeeklyOccurrenceOption={selectedWeeklyOccurrenceOption}
                                weeklySessionOptions={weeklySessionOptions}
                                weeklySelectionRequired={weeklySelectionRequired}
                                hasAgeLimits={hasAgeLimits}
                                eventMinAge={eventMinAge}
                                eventMaxAge={eventMaxAge}
                                divisionOptionCount={divisionOptions.length}
                                registrationCutoffSummary={registrationCutoffSummary}
                                refundSummary={refundSummary}
                                isDivisionSelectionMissing={isDivisionSelectionMissing}
                                registrationByDivisionType={registrationByDivisionType}
                                hasUser={Boolean(user)}
                                isUserRegistered={Boolean(isUserRegistered)}
                                totalParticipants={totalParticipants}
                                participantCapacity={participantCapacity}
                                canShowScheduleButton={canShowScheduleButton}
                                hostManageQrActions={renderHostManageQrActions()}
                                isTournament={currentEvent.eventType === 'TOURNAMENT'}
                                registrationPanel={registrationPanel}
                                hasRefundTarget={hasRefundTarget}
                                activeChildren={activeChildren}
                                selectedWeeklyOccurrence={selectedWeeklyOccurrence}
                                eventStartDate={eventStartDate}
                                showSecurePaymentNote={showSecurePaymentNote}
                                showPoweredByBracketIqNote={showPoweredByBracketIqNote}
                                onToggleMobile={toggleMobileJoin}
                                onAffiliateClick={() => {
                                    if (!affiliateActionUrl) {
                                        return;
                                    }
                                    trackEventOutboundClicked(
                                        currentEvent,
                                        affiliateActionUrl,
                                        'event_detail',
                                    );
                                    trackEventRegistrationStarted(currentEvent, 'affiliate', {
                                        destination_selected: true,
                                    });
                                }}
                                onClearWeeklyOccurrence={onWeeklyOccurrenceChange
                                    ? () => onWeeklyOccurrenceChange(null)
                                    : undefined}
                                onWeeklySessionSelect={(session) => {
                                    void handleWeeklySessionSelect(session);
                                }}
                                onAuthenticate={openAuthModal}
                                onViewBracket={handleBracketClick}
                                onRefundSuccess={loadEventDetails}
                            />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderEventTeamParticipant = (participant: Team | UserData) => (
        <EventTeamParticipantCard
            event={currentEvent}
            team={participant as Team}
            user={user}
            divisionNameIndex={divisionDisplayNameIndex}
            onRequireAuth={openAuthModal}
            onReload={() => loadEventDetails(currentEvent.$id, { automatic: false })}
            onNotice={setJoinNotice}
        />
    );

    return (
        <>
            {content}

            <EventQrCodeModal
                eventId={currentEvent.$id}
                eventName={currentEvent.name || 'Event'}
                eventUrl={currentEventPublicUrl}
                organizationLogoId={currentOrganizationLogoId}
                opened={showQrCodeModal}
                onClose={closeQrCode}
            />

            <EventParticipantDropdowns
                visible={showParticipantsSection}
                isTeamSignup={isTeamSignup}
                playersOpened={showPlayersDropdown}
                teamsOpened={showTeamsDropdown}
                freeAgentsOpened={showFreeAgentsDropdown}
                players={players}
                teams={teams}
                freeAgents={freeAgents}
                loading={isLoadingEvent}
                renderTeam={renderEventTeamParticipant}
                onClosePlayers={closePlayersDropdown}
                onCloseTeams={closeTeamsDropdown}
                onCloseFreeAgents={closeFreeAgentsDropdown}
                onOpenFreeAgentActions={openFreeAgentActions}
            />

            <InlineEventAuthDialog
                opened={showAuthModal}
                mode={authModalMode}
                form={authModalForm}
                loading={authModalLoading}
                error={authModalError}
                maxDateOfBirth={maxAuthDob}
                verificationEmail={authVerificationEmail}
                verificationMessage={authVerificationMessage}
                verificationMessageType={authVerificationMessageType}
                resendingVerification={authResendingVerification}
                onFieldChange={handleAuthModalInputChange}
                onToggleMode={toggleAuthModalMode}
                onResendVerification={handleAuthModalResendVerification}
                onContinueWithGoogle={handleAuthModalGoogle}
                onSubmit={submitAuthModal}
                onClose={closeAuthModal}
            />

            <FreeAgentActionsDialog
                user={selectedFreeAgentActionUser}
                eventId={currentEvent?.$id ?? null}
                onInvite={handleInviteFreeAgentToTeam}
                onClose={closeFreeAgentActions}
            />

            <RegistrationQuestionsDialog
                opened={showRegistrationQuestionsModal}
                questions={registrationQuestions}
                answers={registrationQuestionAnswers}
                error={joinError}
                submitting={joining || registeringChild}
                onAnswerChange={updateRegistrationQuestionAnswer}
                onClose={closeRegistrationQuestionsStep}
                onSubmit={submitRegistrationQuestionsStep}
            />

            <PaymentPlanPreviewDialog
                opened={Boolean(paymentPlanPreview)}
                ownerLabel={paymentPlanPreview?.ownerLabel ?? 'you'}
                divisionName={selectedDivisionOption?.name}
                totalPriceCents={selectedDivisionBilling.priceCents}
                rows={paymentPlanPreviewRows}
                onClose={() => setPaymentPlanPreview(null)}
                onContinue={continuePaymentPlanPreview}
            />

            <PasswordConfirmationDialog
                opened={showPasswordModal}
                password={password}
                error={passwordError}
                loading={confirmingPassword}
                onPasswordChange={setPassword}
                onClose={cancelPasswordConfirmation}
                onSubmit={confirmPasswordAndStartSigning}
            />

            <SigningDialog
                opened={showSignModal}
                signLinks={signLinks}
                currentIndex={currentSignIndex}
                textAccepted={textAccepted}
                recording={recordingSignature}
                onTextAcceptedChange={setTextAccepted}
                onAcceptText={handleTextAcceptance}
                onFinishedSigning={handleSignedDocument}
                onClose={cancelSigning}
            />

            <CheckoutPreviewDialog
                opened={showCheckoutPreviewModal && Boolean(pendingEventCheckout)}
                originalPriceCents={normalizePriceCents(selectedDivisionBilling.priceCents)}
                discountCode={discountCode}
                discountPreview={discountPreview}
                discountPreviewLoading={discountPreviewLoading}
                discountPreviewError={discountPreviewError}
                checkoutError={joinError}
                joining={joining}
                onDiscountCodeChange={handleCheckoutDiscountCodeChange}
                onClearDiscount={clearCheckoutDiscount}
                onApplyDiscount={handleApplyDiscountPreview}
                onCheckout={continueCheckoutPreview}
                onClose={closeCheckoutPreview}
            />

            <BillingAddressModal
                opened={showBillingAddressModal}
                onClose={closeBillingAddress}
                onSaved={continueAfterBillingAddress}
            />

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={closePayment}
                event={checkoutEvent ?? currentEvent}
                paymentData={paymentData}
                onPaymentSuccess={async () => {
                    clearPaymentData();
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment();
                }}
                onPaymentPending={async () => {
                    clearPaymentData();
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment({ pendingPayment: true });
                }}
            />
            <ManualPaymentProofDialog
                opened={showManualPaymentModal}
                event={checkoutEvent ?? currentEvent}
                bill={manualPaymentBill}
                zIndex={SIGN_MODAL_Z_INDEX}
                onClose={() => setShowManualPaymentModal(false)}
                onSubmit={handleManualPaymentProofSubmit}
            />
            <RegistrationHoldTimer
                expiresAt={registrationHoldExpiresAt}
                onExpire={handleEventRegistrationHoldExpired}
            />
        </>
    );
}

