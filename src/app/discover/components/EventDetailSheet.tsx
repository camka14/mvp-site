import React, { useState, useCallback, useReducer } from 'react';
import Image from 'next/image';
import { Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
    CalendarDays,
    ChevronDown,
    ChevronUp,
    MapPin,
    QrCode,
    ShieldCheck,
    Users,
} from 'lucide-react';
import {
    Event,
    UserData,
    Team,
    getEventImageFallbackUrl,
    getEventImageUrl,
    formatPrice,
} from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { formatAgeRange } from '@/lib/age';
import {
    normalizePriceCents,
} from './eventDetail/divisionRegistration';
import {
    buildWeeklySessionOptions,
    resolveSelectedWeeklySessionOption,
    type WeeklySessionOption,
} from './eventDetail/weeklySessions';
import { useInlineEventAuthController } from './eventDetail/hooks/useInlineEventAuthController';
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
import { collectUniqueUserIds } from './eventDetail/eventDetailData';
import {
    initialRegistrationWorkflowState,
    isRegistrationWorkflowPhase,
    registrationWorkflowReducer,
    type RegistrationWorkflowPhase,
} from './eventDetail/registrationWorkflow';
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
import {
    createEventJoinActions,
    type PaymentPlanPreviewState,
} from './eventDetail/eventJoinActions';
import { createEventParticipantActions } from './eventDetail/eventParticipantActions';
import { ChildRegistrationPanel } from './eventDetail/ChildRegistrationPanel';
import { EventTeamParticipantCard } from './eventDetail/EventTeamParticipantCard';
import { EventDetailSheetSummary } from './eventDetail/EventDetailSheetSummary';
import { PublicEventOverview } from './eventDetail/PublicEventOverview';
import { PublicEventProgramDetails } from './eventDetail/PublicEventProgramDetails';
import { buildEventDetailPublicModel } from './eventDetail/eventDetailPublicModel';
import { useApp } from '@/app/providers';
import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
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
const WEEKLY_SESSION_VISIBLE_ROWS = 10;
const WEEKLY_SESSION_CARD_HEIGHT_PX = 72;
const WEEKLY_SESSION_CARD_GAP_PX = 8;
const WEEKLY_SESSION_LIST_MAX_HEIGHT_PX = (
    WEEKLY_SESSION_VISIBLE_ROWS * WEEKLY_SESSION_CARD_HEIGHT_PX
) + ((WEEKLY_SESSION_VISIBLE_ROWS - 1) * WEEKLY_SESSION_CARD_GAP_PX);

export default function EventDetailSheet({
    event,
    isOpen,
    onClose,
    renderInline = false,
    selectedOccurrence = null,
    onWeeklyOccurrenceChange,
    publicCompletion,
}: EventDetailSheetProps) {
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
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [showCapacityBreakdown, setShowCapacityBreakdown] = useState(false);
    const [selectedFreeAgentActionUser, setSelectedFreeAgentActionUser] = useState<UserData | null>(null);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');
    const [selectedChildId, setSelectedChildId] = useState('');
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
    const [paymentPlanPreviewState, setPaymentPlanPreviewState] = useState<PaymentPlanPreviewState | null>(null);
    const [registrationWorkflow, dispatchRegistrationWorkflow] = useReducer(
        registrationWorkflowReducer,
        initialRegistrationWorkflowState,
    );
    const setRegistrationWorkflowPhase = useCallback((
        phase: Exclude<RegistrationWorkflowPhase, 'idle'>,
        opened: boolean,
    ) => {
        dispatchRegistrationWorkflow({ type: opened ? 'open' : 'close', phase });
    }, []);
    const setShowManualPaymentModal = useCallback((opened: boolean) => {
        setRegistrationWorkflowPhase('manual-proof', opened);
    }, [setRegistrationWorkflowPhase]);
    const setConfirmingPurchase = useCallback((opened: boolean) => {
        setRegistrationWorkflowPhase('confirming', opened);
    }, [setRegistrationWorkflowPhase]);
    const setPaymentPlanPreview = useCallback((preview: PaymentPlanPreviewState | null) => {
        setPaymentPlanPreviewState(preview);
        setRegistrationWorkflowPhase('payment-plan-preview', Boolean(preview));
    }, [setRegistrationWorkflowPhase]);
    const resetRegistrationWorkflow = useCallback(() => {
        dispatchRegistrationWorkflow({ type: 'reset' });
    }, []);
    const showRegistrationQuestionsModal = isRegistrationWorkflowPhase(registrationWorkflow, 'questions');
    const showPasswordModal = isRegistrationWorkflowPhase(registrationWorkflow, 'password');
    const showSignModal = isRegistrationWorkflowPhase(registrationWorkflow, 'signing');
    const showCheckoutPreviewModal = isRegistrationWorkflowPhase(registrationWorkflow, 'checkout-preview');
    const showBillingAddressModal = isRegistrationWorkflowPhase(registrationWorkflow, 'billing-address');
    const showPaymentModal = isRegistrationWorkflowPhase(registrationWorkflow, 'payment');
    const showManualPaymentModal = isRegistrationWorkflowPhase(registrationWorkflow, 'manual-proof');
    const confirmingPurchase = isRegistrationWorkflowPhase(registrationWorkflow, 'confirming');
    const paymentPlanPreview = isRegistrationWorkflowPhase(registrationWorkflow, 'payment-plan-preview')
        ? paymentPlanPreviewState
        : null;
    const [showQrCodeModal, setShowQrCodeModal] = useState(false);
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

    // Team-signup join controls
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [mobileJoinExpanded, setMobileJoinExpanded] = useState(false);

    const currentEventPublicUrl = React.useMemo(
        () => (currentEvent.$id ? buildEventPublicUrl(currentEvent.$id) : ''),
        [currentEvent.$id],
    );
    const currentOrganizationLogoId = React.useMemo(() => {
        const organization = currentEvent.organization;
        if (organization && typeof organization === 'object' && typeof organization.logoId === 'string') {
            return organization.logoId;
        }
        return null;
    }, [currentEvent.organization]);
    const isWeeklyParentEvent = currentEvent.eventType === 'WEEKLY_EVENT' && !currentEvent.parentEvent;
    const weeklySessionOptions = React.useMemo(
        () => (isWeeklyParentEvent ? buildWeeklySessionOptions(currentEvent, 3) : []),
        [currentEvent, isWeeklyParentEvent],
    );
    const normalizedSelectedOccurrence = React.useMemo<WeeklyOccurrenceSelection | null>(() => {
        const slotId = typeof selectedOccurrence?.slotId === 'string' ? selectedOccurrence.slotId.trim() : '';
        const occurrenceDate = typeof selectedOccurrence?.occurrenceDate === 'string' ? selectedOccurrence.occurrenceDate.trim() : '';
        if (!slotId || !occurrenceDate) {
            return null;
        }
        return { slotId, occurrenceDate };
    }, [selectedOccurrence]);
    const selectedWeeklyOccurrenceOption = React.useMemo(
        () => (
            normalizedSelectedOccurrence
                ? weeklySessionOptions.find((option) => (
                    option.slotId === normalizedSelectedOccurrence.slotId
                    && option.occurrenceDate === normalizedSelectedOccurrence.occurrenceDate
                )) ?? resolveSelectedWeeklySessionOption(currentEvent, normalizedSelectedOccurrence)
                : null
        ),
        [currentEvent, normalizedSelectedOccurrence, weeklySessionOptions],
    );
    const selectedWeeklyOccurrence = React.useMemo<WeeklyOccurrenceSelection | undefined>(
        () => {
            if (!selectedWeeklyOccurrenceOption) {
                return undefined;
            }
            return {
                slotId: selectedWeeklyOccurrenceOption.slotId,
                occurrenceDate: selectedWeeklyOccurrenceOption.occurrenceDate,
            };
        },
        [selectedWeeklyOccurrenceOption],
    );
    const weeklySelectionRequired = isWeeklyParentEvent && !selectedWeeklyOccurrence;
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

    const todayForDob = new Date();
    const maxAuthDob = `${todayForDob.getFullYear()}-${String(todayForDob.getMonth() + 1).padStart(2, '0')}-${String(todayForDob.getDate()).padStart(2, '0')}`;

    const handleInlineAuthAuthenticated = useCallback(() => {
        setJoinError(null);
    }, []);
    const handleInlineAuthSignedIn = useCallback(() => {
        setJoinNotice('Signed in. Continue registration.');
    }, []);
    const handleInlineAuthProfileCompletionRequired = useCallback(() => {
        const nextPath = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}${window.location.hash}`
            : '/discover';
        router.push(`/complete-profile?next=${encodeURIComponent(nextPath)}`);
    }, [router]);
    const {
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
    } = useInlineEventAuthController({
        refreshSession,
        onAuthenticated: handleInlineAuthAuthenticated,
        onSignedIn: handleInlineAuthSignedIn,
        onProfileCompletionRequired: handleInlineAuthProfileCompletionRequired,
    });
    useDivisionSelectionSynchronization({
        options: divisionOptions,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const handleViewSchedule = (tab?: string) => {
        const eventPath = `/events/${currentEvent.$id}`;
        const target = tab ? `${eventPath}?tab=${tab}` : eventPath;
        router.push(target);
        onClose();
    };

    const handleBracketClick = () => {
        if (currentEvent.eventType === 'TOURNAMENT') {
            handleViewSchedule('bracket');
        }
    };

    const handleWeeklySessionSelect = useCallback((session: WeeklySessionOption) => {
        if (!currentEvent || currentEvent.eventType !== 'WEEKLY_EVENT' || currentEvent.parentEvent) {
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
            openAuthModal();
            return;
        }

        setJoinNotice('Session selected. Finish registration on the event page.');
        const params = new URLSearchParams({
            tab: 'schedule',
            slotId: session.slotId,
            occurrenceDate: session.occurrenceDate,
        });
        router.push(`/events/${currentEvent.$id}?${params.toString()}`);
        onClose();
    }, [currentEvent, onClose, onWeeklyOccurrenceChange, openAuthModal, router, user]);

    const navigateToPublicEventCompletion = useCallback(() => {
        clearEventRegistrationProgress();
        if (!publicCompletion?.slug) {
            return;
        }
        navigateToPublicCompletion({
            router,
            slug: publicCompletion.slug,
            kind: 'event',
            redirectUrl: publicCompletion.redirectUrl,
        });
    }, [clearEventRegistrationProgress, publicCompletion, router]);

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
        setPaymentPlanPreviewState,
        setSelectedDivisionId,
        setSelectedDivisionTypeKey,
    });

    const openFreeAgentActions = useCallback((agent: UserData) => {
        setSelectedFreeAgentActionUser(agent);
    }, []);

    const closeFreeAgentActions = useCallback(() => {
        setSelectedFreeAgentActionUser(null);
    }, []);

    const toggleCapacityBreakdown = useCallback(() => {
        setShowCapacityBreakdown((opened) => !opened);
    }, []);
    const openPlayersDropdown = useCallback(() => setShowPlayersDropdown(true), []);
    const closePlayersDropdown = useCallback(() => setShowPlayersDropdown(false), []);
    const openTeamsDropdown = useCallback(() => setShowTeamsDropdown(true), []);
    const closeTeamsDropdown = useCallback(() => setShowTeamsDropdown(false), []);
    const openFreeAgentsDropdown = useCallback(() => setShowFreeAgentsDropdown(true), []);
    const closeFreeAgentsDropdown = useCallback(() => setShowFreeAgentsDropdown(false), []);

    const handleInviteFreeAgentToTeam = useCallback(() => {
        if (!selectedFreeAgentActionUser || !currentEvent.$id) {
            return;
        }
        const params = new URLSearchParams({
            event: currentEvent.$id,
            freeAgent: selectedFreeAgentActionUser.$id,
        });
        setShowFreeAgentsDropdown(false);
        setSelectedFreeAgentActionUser(null);
        router.push(`/teams?${params.toString()}`);
    }, [currentEvent.$id, router, selectedFreeAgentActionUser]);

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
    const shouldScrollWeeklySessions = weeklySessionOptions.length > WEEKLY_SESSION_VISIBLE_ROWS;
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
                onClick={() => setShowQrCodeModal(true)}
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
                <div className="mvp-image-background relative min-h-[340px] overflow-hidden sm:min-h-[420px]">
                    <Image
                        src={eventImageUrl}
                        alt={currentEvent.name}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 1200px"
                        className="object-cover"
                        onError={(e) => {
                            e.currentTarget.src = eventImageFallbackUrl;
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-slate-950/5" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
                        <div className="mb-5 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-slate-950 shadow-sm">
                                {eventTypeLabel}
                            </span>
                            {sportLabel ? (
                                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                                    {sportLabel}
                                </span>
                            ) : null}
                            <span className="rounded-full border border-emerald-200/50 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-50 backdrop-blur">
                                {registrationTypeLabel}
                            </span>
                        </div>
                        <div className="max-w-4xl">
                            <h1 className="text-3xl font-bold leading-tight tracking-normal sm:text-5xl">
                                {currentEvent.name}
                            </h1>
                            {shouldShowHostedByHeroLabel ? (
                                <Text className="mt-3 max-w-2xl text-base leading-7 text-slate-100 sm:text-lg">
                                    {hostedByLabel}
                                </Text>
                            ) : null}
                        </div>
                        <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-100">
                            <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                                <CalendarDays size={16} />
                                {eventScheduleDisplayText}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                                <MapPin size={16} />
                                {eventLocationSummary}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-md bg-white/12 px-3 py-2 backdrop-blur">
                                <Users size={16} />
                                {spotsSummary}
                            </span>
                        </div>
                    </div>
                </div>

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
                            <Paper
                                withBorder
                                p="lg"
                                radius="md"
                                className="rounded-t-xl border-slate-200 bg-white shadow-2xl lg:rounded-md lg:shadow-xl"
                            >
                                {renderInline && (
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 text-left lg:hidden"
                                        onClick={() => setMobileJoinExpanded((expanded) => !expanded)}
                                        aria-expanded={mobileJoinExpanded}
                                    >
                                        <span>
                                            <Text fw={800} className="text-slate-950">
                                                {registrationTypeLabel}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {selectedDivisionOption?.name
                                                    ? `${selectedDivisionOption.name} · ${formatPrice(selectedDivisionBilling.priceCents)}`
                                                    : eventPriceSummary}
                                            </Text>
                                        </span>
                                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                            {mobileJoinExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                                        </span>
                                    </button>
                                )}
                                <div className={`${!renderInline || mobileJoinExpanded ? 'block' : 'hidden'} lg:block ${renderInline ? 'mt-4 border-t border-slate-200 pt-4 lg:mt-0 lg:border-t-0 lg:pt-0' : ''}`}>
	                                {joinError && <Alert color="red" variant="light" mb="sm">{joinError}</Alert>}
                                {joinNotice && <Alert color="green" variant="light" mb="sm">{joinNotice}</Alert>}
                                {isAffiliateEvent && (
                                    <Stack gap="xs">
                                        <Button
                                            component="a"
                                            href={affiliateActionUrl || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            fullWidth
                                            disabled={!affiliateActionUrl}
                                            onClick={() => {
                                                if (!affiliateActionUrl) {
                                                    return;
                                                }
                                                trackEventOutboundClicked(currentEvent, affiliateActionUrl, 'event_detail');
                                                trackEventRegistrationStarted(currentEvent, 'affiliate', {
                                                    destination_selected: true,
                                                });
                                            }}
                                        >
                                            View Event
                                        </Button>
                                        <Text size="xs" c="dimmed" ta="center">
                                            Registration or booking continues on the organizer&apos;s website.
                                        </Text>
                                    </Stack>
                                )}
                                {!isAffiliateEvent && isWeeklyParentEvent && (
                                    <div className="space-y-3 mb-4">
                                        <Group justify="space-between" align="center" gap="xs">
                                            <div>
                                                <Text size="sm" fw={600}>
                                            {selectedWeeklyOccurrenceOption ? 'Selected weekly session' : 'Select a weekly session'}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    Choose the day and slot you want to register for.
                                                </Text>
                                            </div>
                                            {selectedWeeklyOccurrenceOption && onWeeklyOccurrenceChange && (
                                                <Button
                                                    variant="subtle"
                                                    color="red"
                                                    size="compact-sm"
                                                    onClick={() => onWeeklyOccurrenceChange(null)}
                                                >
                                                    Clear
                                                </Button>
                                            )}
                                        </Group>
                                        {weeklySessionOptions.length === 0 ? (
                                            <Alert color="yellow" variant="light">
                                                No upcoming weekly sessions are available.
                                            </Alert>
                                        ) : (
                                            <div
                                                className={`space-y-2 ${shouldScrollWeeklySessions ? 'overflow-y-auto pr-1' : ''}`}
                                                style={shouldScrollWeeklySessions ? { maxHeight: WEEKLY_SESSION_LIST_MAX_HEIGHT_PX } : undefined}
                                            >
                                                {weeklySessionOptions.map((session) => {
                                                    const isSelected = selectedWeeklyOccurrenceOption?.slotId === session.slotId
                                                        && selectedWeeklyOccurrenceOption?.occurrenceDate === session.occurrenceDate;
                                                    return (
                                                        <button
                                                            key={session.id}
                                                            type="button"
                                                            onClick={() => { void handleWeeklySessionSelect(session); }}
                                                            className={`w-full rounded-lg border p-2 text-left transition ${
                                                                isSelected
                                                                    ? 'border-red-400 bg-red-50 shadow-sm'
                                                                    : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="mvp-image-background relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                                                                    <Image
                                                                        src={eventImageUrl}
                                                                        alt={currentEvent.name}
                                                                        fill
                                                                        unoptimized
                                                                        sizes="96px"
                                                                        className="object-cover"
                                                                    />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <Text size="sm" fw={600} className="truncate">
                                                                        {session.label}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        Divisions: {session.divisionLabel}
                                                                    </Text>
                                                                    <Text size="xs" c={isSelected ? 'red' : 'dimmed'}>
                                                                        {isSelected ? 'Selected' : 'Tap to select'}
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!isAffiliateEvent ? ((!isWeeklyParentEvent || !weeklySelectionRequired) ? (
                                    <>
                                {hasAgeLimits && (
                                    <Alert color="yellow" variant="light" mb="sm">
                                        <Text fw={600} size="sm">
                                            Age-restricted event
                                        </Text>
                                        <Text size="sm">
                                            Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}. We only check eligibility using the date of birth you enter in your profile. The host may verify age at check-in (for example, photo ID).
                                        </Text>
                                    </Alert>
                                )}
                                {divisionOptions.length > 0 && selectedDivisionOption && (
                                    <div className="mb-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <Text size="xs" c="dimmed" fw={800} tt="uppercase" className="tracking-normal">
                                                    Selected division
                                                </Text>
                                                <Text size="sm" fw={800} className="text-slate-950">
                                                    {selectedDivisionOption.name}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {selectedDivisionOption.divisionTypeName}
                                                </Text>
                                            </div>
                                            <Text size="sm" fw={800} className="text-emerald-700">
                                                {formatPrice(selectedDivisionBilling.priceCents)}
                                            </Text>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
                                            <div>
                                                <Text size="xs" c="dimmed">Registration closes</Text>
                                                <Text size="xs" fw={700}>{registrationCutoffSummary}</Text>
                                            </div>
                                            <div>
                                                <Text size="xs" c="dimmed">Refunds</Text>
                                                <Text size="xs" fw={700}>{refundSummary}</Text>
                                            </div>
                                            {!hasAgeLimits && selectedDivisionOption.ageCutoffLabel && (
                                                <div className="sm:col-span-2">
                                                    <Text size="xs" c="dimmed">{selectedDivisionOption.ageCutoffLabel}</Text>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {isDivisionSelectionMissing && (
                                    <Alert color="yellow" variant="light" mb="sm">
                                        {registrationByDivisionType
                                            ? 'Choose a division type before registration.'
                                            : 'Choose a division before registration.'}
                                    </Alert>
                                )}

                                {!user ? (
                                    <div style={{ textAlign: 'center' }}>
                                        <Button fullWidth color="blue" onClick={openAuthModal}>
                                            Register / Login
                                        </Button>
                                        <Text size="xs" c="dimmed" mt="xs">
                                            Sign in or create an account to register or purchase.
                                        </Text>
                                    </div>
                                ) : isUserRegistered ? (
                                    <>
                                        <Text size="sm" c="green" fw={500} ta="center">
                                            {"✓ You're registered for this event"}
                                        </Text>
                                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                                            <Text size="sm" c="dimmed">
                                                {totalParticipants} / {participantCapacity} total participants
                                            </Text>
                                        </div>
                                        {canShowScheduleButton && (
                                            <div className="mt-4 space-y-2">
                                                {renderHostManageQrActions()}
                                                {currentEvent.eventType === 'TOURNAMENT' && (
                                                    <Button
                                                        fullWidth
                                                        color="green"
                                                        onClick={handleBracketClick}
                                                    >
                                                        View Tournament Bracket
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="space-y-3">
                                        {!isTeamSignup ? (
                                            <div className="space-y-3">
                                                {selfRegistrationBlockedReason && (
                                                    <Alert color="yellow" variant="light">
                                                        {selfRegistrationBlockedReason}
                                                    </Alert>
                                                )}
                                                {!selfRegistrationBlockedReason && isMinor && (
                                                    <Alert color="blue" variant="light">
                                                        Your join request will be sent to a linked parent/guardian for approval.
                                                    </Alert>
                                                )}

                                                {showSelfWaitlistActions ? (
                                                    isUserWaitlisted ? (
                                                        <div className="space-y-2">
                                                            <Text size="sm" c="blue" fw={500} ta="center">
                                                                {"✓ You're on the waitlist"}
                                                            </Text>
                                                            <Button
                                                                fullWidth
                                                                color="red"
                                                                variant="light"
                                                                onClick={() => { void handleLeaveWaitlist(); }}
                                                                disabled={selfWaitlistLeaveDisabled}
                                                            >
                                                                {eventHasStarted ? 'Unavailable' : (joining ? 'Updating…' : 'Leave Waitlist')}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            fullWidth
                                                            color="orange"
                                                            onClick={() => { void handleJoinWaitlist(); }}
                                                            disabled={selfWaitlistJoinDisabled}
                                                        >
                                                            {eventHasStarted
                                                                ? 'Unavailable'
                                                                : joining
                                                                ? (isMinor ? 'Sending…' : 'Adding…')
                                                                : (isMinor ? 'Send' : 'Join Waitlist')}
                                                        </Button>
                                                    )
                                                ) : (
                                                    <Button
                                                        fullWidth
                                                        color="blue"
                                                            onClick={() => { void handleJoinEvent(); }}
                                                            disabled={selfJoinDisabled}
                                                        >
                                                            {eventHasStarted
                                                                ? 'Unavailable'
                                                                : confirmingPurchase
                                                            ? 'Confirming purchase…'
                                                                    : joining
                                                                        ? 'Submitting…'
                                                                        : isMinor
                                                                            ? 'Send'
                                                                    : selectedDivisionBilling.priceCents > 0
                                                                    ? (currentUserPaymentFailed ? 'Complete payment' : `Join Event - ${formatPrice(selectedDivisionBilling.priceCents)}`)
                                                                    : 'Join Event'}
                                                    </Button>
                                                )}

                                                {canShowScheduleButton && (
                                                    <div className="mt-2">
                                                        {renderHostManageQrActions()}
                                                    </div>
                                                )}

                                                {childRegistrationPanel}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {eventHasStarted && (
                                                    <Alert color="yellow" variant="light">
                                                        {isWeeklyParentEvent && selectedWeeklyOccurrenceOption
                                            ? 'This weekly session has already started. Joining and leaving are no longer available.'
                                                            : 'This event has already started. Joining and leaving are no longer available.'}
                                                    </Alert>
                                                )}
                                                <Button fullWidth disabled={eventHasStarted} onClick={() => setShowTeamJoinOptions(prev => !prev)}>
                                                    {showTeamJoinOptions ? 'Hide Team Options' : 'View Team Options'}
                                                </Button>

                                                {showTeamJoinOptions && (
                                                    <Paper withBorder p="md" radius="md" className="space-y-4">
                                                        {isLoadingTeams ? (
                                                            <div className="text-sm text-gray-600">Loading your teams...</div>
                                                        ) : userTeams.length > 0 ? (
                                                            <div className="space-y-4">
                                                                <div>
                                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                                        Select your team
                                                                    </label>
                                                                    <MantineSelect
                                                                        placeholder="Choose a team"
                                                                        data={userTeams.map(t => ({
                                                                            value: t.$id,
                                                                            label: t.name || 'Team',
                                                                        }))}
                                                                        value={selectedTeamId}
                                                                        onChange={(value) => {
                                                                            const nextValue = value || '';
                                                                            setSelectedTeamId(nextValue);
                                                                            saveEventRegistrationProgress({
                                                                                selectedTeamId: nextValue || null,
                                                                            });
                                                                        }}
                                                                        searchable
                                                                        comboboxProps={sharedComboboxProps}
                                                                    />
                                                                </div>

                                                                {/* Manage Teams Button Section - Matching Hide/Show button height */}
                                                                <div className="flex justify-center">
                                                                    <Button variant="default"
                                                                        onClick={() => {
                                                                            router.push(`/teams?event=${currentEvent.$id}`);
                                                                            onClose();
                                                                        }}
                                                                    >
                                                                        Manage Teams
                                                                    </Button>
                                                                </div>

                                                                {/* Join/Waitlist Button Section - Matching Hide/Show button height */}
                                                                <div className="flex flex-col items-center gap-2 pt-2">
                                                                    {showTeamWaitlistActions ? (
                                                                        <Button
                                                                            onClick={() => { void handleJoinTeamWaitlist(); }}
                                                                            disabled={
                                                                                joining
                                                                                || eventHasStarted
                                                                                || weeklySelectionRequired
                                                                                || !selectedTeamId
                                                                                || (!selectedTeamIsWaitlisted && isDivisionSelectionMissing)
                                                                            }
                                                                            color="orange"
                                                                        >
                                                                            {eventHasStarted
                                                                                ? 'Unavailable'
                                                                                : joining
                                                                                ? 'Updating...'
                                                                                : (selectedTeamIsWaitlisted ? 'Leave Waitlist' : 'Join Waitlist')}
                                                                        </Button>
                                                                    ) : (
                                                                        <Button
                                                                            onClick={() => { void handleJoinAsTeam(); }}
                                                                            disabled={
                                                                                joining
                                                                                || eventHasStarted
                                                                                || weeklySelectionRequired
                                                                                || !selectedTeamId
                                                                                || confirmingPurchase
                                                                                || isDivisionSelectionMissing
                                                                                || selectedTeamIsRegistered
                                                                            }
                                                                            color={selectedTeamIsRegistered ? 'gray' : 'green'}
                                                                        >
                                                                            {eventHasStarted
                                                                                ? 'Unavailable'
                                                                                : selectedTeamIsRegistered
                                                                                ? 'Already in Event'
                                                                                : confirmingPurchase
                                                                                ? 'Confirming purchase...'
	                                                                                : joining
	                                                                                    ? 'Joining...'
	                                                                                    : !selectedTeamId
	                                                                                        ? 'Choose a team'
	                                                                                    : (!isFreeForUser && selectedDivisionBilling.priceCents > 0)
	                                                                                        ? (selectedTeamPaymentFailed ? 'Complete payment' : `Join for ${formatPrice(selectedDivisionBilling.priceCents)}`)
	                                                                                        : 'Join Event'}
                                                                        </Button>
                                                                    )}
                                                                    {selectedTeamIsRegistered && (
                                                                        <Button
                                                                            onClick={() => { void handleWithdrawTeam(); }}
                                                                            disabled={joining || eventHasStarted || weeklySelectionRequired || !selectedTeamId}
                                                                            color={!isFreeForUser && selectedDivisionBilling.priceCents > 0 ? 'orange' : 'red'}
                                                                            variant="light"
                                                                        >
                                                                            {joining
                                                                                ? 'Withdrawing...'
                                                                                : 'Withdraw Team'}
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center space-y-3">
                                                                <p className="text-sm text-gray-600">
                                                                    You have no managed teams for {currentEvent.sport?.name}.
                                                                </p>
                                                                <Button variant="default"
                                                                    onClick={() => {
                                                                        router.push(`/teams?event=${currentEvent.$id}`);
                                                                        onClose();
                                                                    }}
                                                                >
                                                                    Create Team
                                                                </Button>
                                                                {/* Total participants below actions */}
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <Text size="sm" c="dimmed">
                                                                        {totalParticipants} / {participantCapacity} total participants
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Paper>

                                                )}
                                                {!selfRegistrationBlockedReason && isMinor && (
                                                    <Alert color="blue" variant="light">
                                                        Tap Send to request parent/guardian approval before joining as a free agent.
                                                    </Alert>
                                                )}
                                                {isUserFreeAgent ? (
                                                    <div className="space-y-2">
                                                        <div className="w-full py-2 px-4 rounded-lg bg-purple-50 text-purple-700 text-center font-medium">
                                                            You are listed as a free agent
                                                        </div>
                                                        <button
                                                            onClick={() => { void handleLeaveFreeAgents(); }}
                                                            disabled={joining || eventHasStarted}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${(joining || eventHasStarted) ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                                                        >
                                                            {eventHasStarted ? 'Unavailable' : (joining ? 'Updating…' : 'Leave Free Agent List')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { void handleJoinFreeAgents(); }}
                                                        disabled={joining || Boolean(freeAgentJoinBlockedReason)}
                                                        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${(joining || freeAgentJoinBlockedReason) ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                                                    >
                                                        {joining
                                                            ? (isMinor ? 'Sending…' : 'Adding…')
                                                            : freeAgentJoinBlockedReason
                                                                ? 'Unavailable'
                                                                : isMinor
                                                                    ? 'Send'
                                                                    : 'Join as Free Agent (Free)'}
                                                    </button>
                                                )}

                                                {childRegistrationPanel}

                                                {/* View Schedule / Bracket Buttons */}
                                                {canShowScheduleButton && (
                                                    <div className="mt-2">
                                                        {renderHostManageQrActions()}
                                                    </div>
                                                )}

                                                {!renderInline && currentEvent.eventType === 'TOURNAMENT' &&
                                                    <button
                                                        onClick={handleBracketClick}
                                                        className="w-full mt-2 py-2 px-4 rounded-lg bg-green-600 text-white hover:bg-green-700"
                                                    >
                                                        View Tournament Bracket
                                                    </button>
                                                }
                                            </div>
                                        )}
                                    </div>
                                )}
                                    </>
                                ) : (
                                    <Alert color="blue" variant="light">
                                                            Select a weekly session to see registration options.
                                    </Alert>
                                )) : null}
                                {hasRefundTarget && (
                                    <div className="mt-5 border-t border-slate-200 pt-4">
                                        <RefundSection
                                            event={currentEvent}
                                            userRegistered={!!isUserRegistered}
                                            linkedChildren={activeChildren}
                                            selectedOccurrence={selectedWeeklyOccurrence ?? null}
                                            effectiveStart={eventStartDate}
                                            onRefundSuccess={loadEventDetails}
                                        />
                                    </div>
                                )}
                                {(showSecurePaymentNote || showPoweredByBracketIqNote) && (
                                    <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
                                        {showSecurePaymentNote && (
                                            <div className="flex items-center gap-2 text-emerald-800">
                                                <ShieldCheck size={15} />
                                                <Text size="xs" fw={700}>Secure payments</Text>
                                            </div>
                                        )}
                                        {showPoweredByBracketIqNote && (
                                            <Text size="xs" c="dimmed">
                                                Powered by BracketIQ
                                            </Text>
                                        )}
                                    </div>
                                )}
                                </div>
                            </Paper>
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
                onClose={() => setShowQrCodeModal(false)}
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

