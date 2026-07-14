import React, { useState, useCallback, useReducer } from 'react';
import Image from 'next/image';
import { Avatar, Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Stack } from '@mantine/core';
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
    Match,
    UserData,
    Team,
    getEventDateTime,
    getUserFullName,
    getUserHandle,
    getEventImageFallbackUrl,
    getEventImageUrl,
    getOrganizationAvatarUrl,
    formatAffiliateEventPriceRange,
    formatEventDivisionPriceRange,
    formatPrice,
} from '@/types';
import type { WeeklyOccurrenceSelection } from '@/lib/eventService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import type { FamilyChild } from '@/lib/familyService';
import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';
import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, normalizeTimeZone } from '@/lib/dateUtils';
import { getFieldDisplayName } from '@/lib/fieldUtils';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { normalizeExternalHttpUrl } from '@/lib/externalUrl';
import { buildDivisionCapacityBreakdown, isDivisionAtCapacity, resolveDivisionCapacitySnapshot } from '@/lib/divisionCapacity';
import {
    evaluateDivisionAgeEligibility,
    extractDivisionTokenFromId,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import { buildDivisionDisplayNameIndex, resolveDivisionDisplayName } from '@/lib/divisionDisplay';
import { collectOrganizationHostIds } from '@/lib/organizationEventAccess';
import {
    buildDivisionOptionsForEvent,
    formatInstallmentDueDateLabel,
    formatInstallmentRelativeDueDayLabel,
    getDivisionIdFromEventEntry,
    getNormalizedDivisionAliases,
    normalizeInstallmentAmountsCents,
    normalizeInstallmentDueDateValues,
    normalizeInstallmentDueRelativeDayValues,
    normalizeDivisionKey,
    normalizePriceCents,
    isActiveFamilyChild,
    isDivisionOptionEligibleForRegistrant,
    type EventDivisionOption,
} from './eventDetail/divisionRegistration';
import {
    buildPublicDivisionGroups,
    buildScheduleTimeslotGroups,
    formatOfficialSchedulingModeLabel,
    formatReadOnlyValueList,
    formatRefundSummary,
    formatRegistrationCutoffSummary,
    formatSlotTimeRange,
    getDayOfWeekLabel,
    getOrganizationHostedByHref,
    getOrganizationName,
    getSportLabel,
    normalizeComparableLabel,
    uniqueNonEmptyStrings,
} from './eventDetail/eventDetailPresentation';
import {
    buildWeeklySessionOptions,
    parseDateValue,
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
import { collectUniqueUserIds, normalizeUserId } from './eventDetail/eventDetailData';
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
    type ParticipantDivisionCapacityRow,
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
import { useApp } from '@/app/providers';
import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
import UserCard from '@/components/ui/UserCard';
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

type DivisionSelectionPayload = {
    divisionId?: string;
    divisionTypeId?: string;
    divisionTypeKey?: string;
};

type ReadOnlyDetailField = {
    label: string;
    value: string;
};

function ReadOnlyDetailsGrid({ items }: { items: ReadOnlyDetailField[] }) {
    const visibleItems = items.filter((item) => item.value.trim().length > 0);
    if (!visibleItems.length) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleItems.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                    <Text size="sm" c="dimmed">{item.label}</Text>
                    <Text fw={600}>{item.value}</Text>
                </div>
            ))}
        </div>
    );
}

function PublicEventSection({
    eyebrow,
    title,
    children,
    className = '',
}: {
    eyebrow?: string;
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    const hasHeader = Boolean(eyebrow || title);

    return (
        <section className={`border-b border-slate-200 py-7 first:pt-0 last:border-b-0 last:pb-0 ${className}`}>
            {hasHeader && (
                <div className="mb-5">
                    {eyebrow && (
                        <Text size="xs" c="dimmed" tt="uppercase" fw={800} className="tracking-normal">
                            {eyebrow}
                        </Text>
                    )}
                    {title && (
                        <h2 className={`${eyebrow ? 'mt-1' : ''} text-xl font-bold leading-tight text-slate-950`}>
                            {title}
                        </h2>
                    )}
                </div>
            )}
            {children}
        </section>
    );
}

function PublicEventMetaPill({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    if (!value.trim()) {
        return null;
    }

    return (
        <div className="border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} className="tracking-normal">
                {label}
            </Text>
            <Text size="sm" fw={700} className="mt-1 text-slate-950">
                {value}
            </Text>
        </div>
    );
}

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
    const effectiveEventStartDate = selectedWeeklyOccurrenceOption?.start ?? parseDateValue(currentEvent?.start ?? null);
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
    const eventMinAge = typeof currentEvent?.minAge === 'number' ? currentEvent.minAge : undefined;
    const eventMaxAge = typeof currentEvent?.maxAge === 'number' ? currentEvent.maxAge : undefined;
    const hasAgeLimits = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    const eventStartDate = effectiveEventStartDate;
    const eventHasStarted = Boolean(eventStartDate && new Date() >= eventStartDate);
    const joinClosedMessage = isWeeklyParentEvent && selectedWeeklyOccurrenceOption
        ? 'This weekly session has already started. Joining is closed.'
        : 'This event has already started. Joining is closed.';
    const userDob = parseDateValue(user?.dateOfBirth ?? null);
    const selectedChildForDivisionFilter = React.useMemo(() => {
        if (currentEvent?.teamSignup || !selectedChildId) {
            return null;
        }
        return children.find((child) => child.userId === selectedChildId && isActiveFamilyChild(child)) ?? null;
    }, [children, currentEvent?.teamSignup, selectedChildId]);
    const selectedChildDobForDivisionFilter = parseDateValue(selectedChildForDivisionFilter?.dateOfBirth ?? null);
    const divisionRegistrantDob = selectedChildDobForDivisionFilter ?? userDob;
    const registrationByDivisionType = Boolean(currentEvent?.registrationByDivisionType);
    const allDivisionOptions = React.useMemo(
        () => buildDivisionOptionsForEvent(currentEvent),
        [currentEvent],
    );
    const divisionOptions = React.useMemo(
        () => allDivisionOptions.filter((division) => (
            isDivisionOptionEligibleForRegistrant({
                division,
                dateOfBirth: divisionRegistrantDob,
                eventStartDate,
                eventMinAge,
                eventMaxAge,
            })
        )),
        [allDivisionOptions, divisionRegistrantDob, eventMaxAge, eventMinAge, eventStartDate],
    );
    const publicDivisionGroups = React.useMemo(
        () => buildPublicDivisionGroups(divisionOptions),
        [divisionOptions],
    );
    const divisionDisplayNameIndex = React.useMemo(
        () => buildDivisionDisplayNameIndex(currentEvent.divisionDetails),
        [currentEvent.divisionDetails],
    );
    const eventDivisionLabels = React.useMemo(() => {
        const nameById = new Map<string, string>();
        allDivisionOptions.forEach((option) => {
            const normalizedId = normalizeDivisionKey(option.id);
            if (normalizedId && !nameById.has(normalizedId)) {
                nameById.set(normalizedId, option.name);
            }
        });

        const labels: string[] = [];
        const seen = new Set<string>();
        const appendLabel = (value: string | null | undefined) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed.length) return;
            const dedupeKey = trimmed.toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            labels.push(trimmed);
        };

        if (!Array.isArray(currentEvent?.divisions)) {
            return labels;
        }

        currentEvent.divisions.forEach((division) => {
            const divisionId = getDivisionIdFromEventEntry(division);
            const fromOptions = divisionId ? nameById.get(divisionId) : null;
            if (fromOptions) {
                appendLabel(fromOptions);
                return;
            }

            if (division && typeof division === 'object') {
                const explicitName = typeof division.name === 'string' ? division.name : null;
                if (explicitName) {
                    appendLabel(explicitName);
                    return;
                }
            }

            if (divisionId) {
                const inferred = inferDivisionDetails({
                    identifier: extractDivisionTokenFromId(divisionId) ?? divisionId,
                    sportInput:
                        typeof currentEvent.sport === 'string'
                            ? currentEvent.sport
                            : currentEvent.sport?.name ?? currentEvent.sportId ?? undefined,
                });
                appendLabel(inferred.defaultName || divisionId);
                return;
            }

            if (typeof division === 'string') {
                appendLabel(division);
            }
        });

        return labels;
    }, [currentEvent.divisions, currentEvent.sport, currentEvent.sportId, allDivisionOptions]);
    const selectedDivisionOption = React.useMemo(() => {
        if (!divisionOptions.length) {
            return null;
        }
        if (registrationByDivisionType) {
            const matchingByType = divisionOptions.filter((option) => option.divisionTypeKey === selectedDivisionTypeKey);
            if (matchingByType.length) {
                return [...matchingByType].sort((left, right) => left.name.localeCompare(right.name))[0];
            }
            return divisionOptions[0];
        }
        return divisionOptions.find((option) => option.id === selectedDivisionId) ?? divisionOptions[0];
    }, [divisionOptions, registrationByDivisionType, selectedDivisionId, selectedDivisionTypeKey]);
    const handlePublicDivisionSelect = (division: EventDivisionOption) => {
        if (registrationByDivisionType) {
            setSelectedDivisionTypeKey(division.divisionTypeKey);
            saveEventRegistrationProgress({
                selectedDivisionTypeKey: division.divisionTypeKey,
            });
            return;
        }
        setSelectedDivisionId(division.id);
        saveEventRegistrationProgress({
            selectedDivisionId: division.id,
        });
    };
    const divisionSelectionPayload = React.useMemo<DivisionSelectionPayload>(() => {
        if (!selectedDivisionOption) {
            return {};
        }
        if (registrationByDivisionType) {
            return {
                divisionTypeKey: selectedDivisionTypeKey || selectedDivisionOption.divisionTypeKey,
                divisionTypeId: selectedDivisionOption.divisionTypeId,
                divisionId: selectedDivisionOption.id,
            };
        }
        return {
            divisionId: selectedDivisionOption.id,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            divisionTypeKey: selectedDivisionOption.divisionTypeKey,
        };
    }, [registrationByDivisionType, selectedDivisionOption, selectedDivisionTypeKey]);
    const resolvedDivisionSelectionPayload = React.useMemo<DivisionSelectionPayload>(() => (
        selectedWeeklyOccurrence
            ? {
                ...divisionSelectionPayload,
                slotId: selectedWeeklyOccurrence.slotId ?? undefined,
                occurrenceDate: selectedWeeklyOccurrence.occurrenceDate ?? undefined,
            }
            : divisionSelectionPayload
    ), [divisionSelectionPayload, selectedWeeklyOccurrence]);
    const isDivisionSelectionMissing = React.useMemo(() => {
        if (!allDivisionOptions.length) {
            return false;
        }
        if (!divisionOptions.length) {
            return true;
        }
        if (registrationByDivisionType) {
            return !(selectedDivisionTypeKey || selectedDivisionOption?.divisionTypeKey);
        }
        return !(selectedDivisionId || selectedDivisionOption?.id);
    }, [
        allDivisionOptions.length,
        divisionOptions.length,
        registrationByDivisionType,
        selectedDivisionId,
        selectedDivisionOption,
        selectedDivisionTypeKey,
    ]);
    const selectedDivisionCapacitySnapshot = React.useMemo(
        () => resolveDivisionCapacitySnapshot({
            event: currentEvent,
            divisionId: selectedDivisionOption?.id,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [currentEvent, selectedDivisionOption?.id, teams],
    );
    const selectedDivisionAtCapacity = isDivisionAtCapacity(selectedDivisionCapacitySnapshot);
    const divisionCapacityBreakdown = React.useMemo(
        () => buildDivisionCapacityBreakdown({
            event: currentEvent,
            excludePlayoffs: true,
            eligibleTeamIds: teams.map((team) => team.$id),
        }),
        [currentEvent, teams],
    );
    const participantDivisionCapacityRows = React.useMemo<ParticipantDivisionCapacityRow[]>(() => {
        const sportInput = typeof currentEvent.sport === 'string'
            ? currentEvent.sport
            : currentEvent.sport?.name ?? currentEvent.sportId ?? null;
        return divisionCapacityBreakdown.map((row) => ({
            id: row.divisionId,
            label: resolveDivisionDisplayName({
                division: row.divisionId,
                divisionNameIndex: divisionDisplayNameIndex,
                sportInput,
            }) ?? row.name ?? 'Division',
            filled: row.filled,
            capacity: row.capacity,
            spotsLeft: row.capacity > 0 ? Math.max(0, row.capacity - row.filled) : 0,
            fillPercent: row.capacity > 0
                ? Math.min(100, Math.round((row.filled / row.capacity) * 100))
                : 0,
        }));
    }, [currentEvent.sport, currentEvent.sportId, divisionCapacityBreakdown, divisionDisplayNameIndex]);
    const selectedDivisionBilling = React.useMemo(() => {
        if (!currentEvent) {
            return {
                priceCents: 0,
                allowPaymentPlans: false,
                installmentCount: 0,
                installmentAmounts: [] as number[],
                installmentDueDates: [] as string[],
                installmentDueRelativeDays: [] as number[],
            };
        }

        const eventPriceCents = normalizePriceCents(currentEvent.price);
        const eventAllowPaymentPlans = Boolean(currentEvent.allowPaymentPlans);
        const eventInstallmentAmounts = normalizeInstallmentAmountsCents(currentEvent.installmentAmounts);
        const eventInstallmentDueDates = normalizeInstallmentDueDateValues(currentEvent.installmentDueDates);
        const eventInstallmentDueRelativeDays = normalizeInstallmentDueRelativeDayValues((currentEvent as any).installmentDueRelativeDays);
        const eventInstallmentCount = Number.isFinite(Number(currentEvent.installmentCount))
            ? Math.max(0, Math.trunc(Number(currentEvent.installmentCount)))
            : eventInstallmentAmounts.length;

        if (!selectedDivisionOption) {
            return {
                priceCents: eventPriceCents,
                allowPaymentPlans: eventAllowPaymentPlans,
                installmentCount: eventAllowPaymentPlans ? (eventInstallmentCount || eventInstallmentAmounts.length || 0) : 0,
                installmentAmounts: eventAllowPaymentPlans ? eventInstallmentAmounts : [],
                installmentDueDates: eventAllowPaymentPlans ? eventInstallmentDueDates : [],
                installmentDueRelativeDays: eventAllowPaymentPlans ? eventInstallmentDueRelativeDays : [],
            };
        }

        const divisionPriceCents = typeof selectedDivisionOption.priceCents === 'number'
            ? normalizePriceCents(selectedDivisionOption.priceCents)
            : eventPriceCents;
        const divisionAllowPaymentPlans = typeof selectedDivisionOption.allowPaymentPlans === 'boolean'
            ? selectedDivisionOption.allowPaymentPlans
            : eventAllowPaymentPlans;
        const divisionInstallmentAmounts = divisionAllowPaymentPlans
            ? (
                (selectedDivisionOption.installmentAmounts?.length
                    ? selectedDivisionOption.installmentAmounts
                    : eventInstallmentAmounts)
            ).map((value) => normalizePriceCents(value))
            : [];
        const divisionInstallmentDueDates = divisionAllowPaymentPlans
            ? (
                selectedDivisionOption.installmentDueDates?.length
                    ? selectedDivisionOption.installmentDueDates
                    : eventInstallmentDueDates
            )
            : [];
        const divisionInstallmentDueRelativeDays = divisionAllowPaymentPlans
            ? (
                selectedDivisionOption.installmentDueRelativeDays?.length
                    ? selectedDivisionOption.installmentDueRelativeDays
                    : eventInstallmentDueRelativeDays
            )
            : [];
        const divisionInstallmentCount = divisionAllowPaymentPlans
            ? (
                typeof selectedDivisionOption.installmentCount === 'number'
                    ? Math.max(0, Math.trunc(selectedDivisionOption.installmentCount))
                    : (divisionInstallmentAmounts.length || eventInstallmentCount || 0)
            )
            : 0;

        return {
            priceCents: divisionPriceCents,
            allowPaymentPlans: divisionAllowPaymentPlans,
            installmentCount: divisionInstallmentCount,
            installmentAmounts: divisionInstallmentAmounts,
            installmentDueDates: divisionInstallmentDueDates,
            installmentDueRelativeDays: divisionInstallmentDueRelativeDays,
        };
    }, [currentEvent, selectedDivisionOption]);
    const checkoutEvent = React.useMemo(() => {
        if (!currentEvent) {
            return null;
        }
        return {
            ...currentEvent,
            price: selectedDivisionBilling.priceCents,
            allowPaymentPlans: selectedDivisionBilling.allowPaymentPlans,
            installmentCount: selectedDivisionBilling.installmentCount,
            installmentAmounts: selectedDivisionBilling.installmentAmounts,
            installmentDueDates: selectedDivisionBilling.installmentDueDates,
            installmentDueRelativeDays: selectedDivisionBilling.installmentDueRelativeDays,
        };
    }, [currentEvent, selectedDivisionBilling]);
    const paymentPlanPreviewRows = React.useMemo(() => {
        const normalizedAmounts = normalizeInstallmentAmountsCents(selectedDivisionBilling.installmentAmounts);
        const normalizedDueDates = normalizeInstallmentDueDateValues(selectedDivisionBilling.installmentDueDates);
        const normalizedRelativeDueDays = normalizeInstallmentDueRelativeDayValues(selectedDivisionBilling.installmentDueRelativeDays);
        const useRelativeDueDates = currentEvent.eventType === 'WEEKLY_EVENT' && !currentEvent.parentEvent;
        const rowCount = Math.max(
            selectedDivisionBilling.installmentCount || 0,
            normalizedAmounts.length,
            useRelativeDueDates ? normalizedRelativeDueDays.length : normalizedDueDates.length,
        );

        return Array.from({ length: rowCount }, (_, index) => ({
            id: `${index}-${normalizedAmounts[index] ?? 0}-${useRelativeDueDates ? normalizedRelativeDueDays[index] ?? '' : normalizedDueDates[index] ?? ''}`,
            installmentNumber: index + 1,
            amountCents: normalizedAmounts[index] ?? 0,
            dueDateLabel: useRelativeDueDates
                ? formatInstallmentRelativeDueDayLabel(normalizedRelativeDueDays[index] ?? 0)
                : formatInstallmentDueDateLabel(normalizedDueDates[index] ?? ''),
        }));
    }, [
        currentEvent.eventType,
        currentEvent.parentEvent,
        selectedDivisionBilling.installmentAmounts,
        selectedDivisionBilling.installmentCount,
        selectedDivisionBilling.installmentDueDates,
        selectedDivisionBilling.installmentDueRelativeDays,
    ]);
    const userAge = userDob ? calculateAgeOnDate(userDob, eventStartDate ?? new Date()) : undefined;
    const hasValidUserAge = typeof userAge === 'number' && Number.isFinite(userAge);
    const isMinor = typeof userAge === 'number' && Number.isFinite(userAge) && userAge < 18;
    const isAdult = typeof userAge === 'number' && Number.isFinite(userAge) && userAge >= 18;
    const ageWithinLimits = !hasAgeLimits
        || (typeof userAge === 'number' && Number.isFinite(userAge) && isAgeWithinRange(userAge, eventMinAge, eventMaxAge));
    const selectedDivisionAgeForUser = React.useMemo(() => {
        if (!selectedDivisionOption) {
            return null;
        }
        return evaluateDivisionAgeEligibility({
            dateOfBirth: userDob ?? undefined,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
    }, [eventStartDate, selectedDivisionOption, userDob]);
    const selfRegistrationBlockedReason = (() => {
        if (!user) return null;
        if (eventHasStarted) {
            return joinClosedMessage;
        }
        if (!hasValidUserAge) {
            return 'Add your date of birth to your profile to register for events.';
        }
        if (!ageWithinLimits) {
            return `This event is limited to ages ${formatAgeRange(eventMinAge, eventMaxAge)}.`;
        }
        if (
            selectedDivisionAgeForUser?.applies
            && selectedDivisionAgeForUser.eligible === false
        ) {
            return selectedDivisionAgeForUser.message
                ? `Selected division age requirement: ${selectedDivisionAgeForUser.message}.`
                : 'You are not age-eligible for the selected division.';
        }
        return null;
    })();
    const canRegisterChild = isAdult && !eventHasStarted;

    const isEventHost = !!user && currentEvent && user.$id === currentEvent.hostId;
    const isFreeEvent = Boolean(currentEvent) && selectedDivisionBilling.priceCents === 0;
    const shouldBypassHostPayment = Boolean(currentEvent && isEventHost && !currentEvent.teamSignup);
    const isFreeForUser = isFreeEvent || shouldBypassHostPayment;

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

    // Update the join event handlers
    if (!currentEvent) return null;
    if (!isActive) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const affiliateActionUrl = normalizeExternalHttpUrl(currentEvent.affiliateUrl) ?? '';
    const isAffiliateEvent = affiliateActionUrl.length > 0;
    const normalizedDateDisplayMode = typeof currentEvent.dateDisplayMode === 'string'
        ? currentEvent.dateDisplayMode.trim().toUpperCase()
        : 'SCHEDULED';
    const isEvergreenProgram = normalizedDateDisplayMode === 'NO_FIXED_DATE' || normalizedDateDisplayMode === 'ONGOING';
    const eventScheduleDisplayText = isEvergreenProgram
        ? (currentEvent.dateDisplayText?.trim() || currentEvent.scheduleText?.trim() || 'No fixed start date')
        : `${date} at ${time}`;
    const isTeamSignup = currentEvent.teamSignup;
    const shouldScrollWeeklySessions = weeklySessionOptions.length > WEEKLY_SESSION_VISIBLE_ROWS;
    const startDateValue = parseDateValue(currentEvent.start ?? null);
    const endDateValue = parseDateValue(currentEvent.end ?? null);
    const sharesSingleDayWindow = Boolean(
        startDateValue
        && endDateValue
        && startDateValue.toDateString() === endDateValue.toDateString(),
    );
    const sportLabel = getSportLabel(currentEvent);
    const organization = typeof currentEvent.organization === 'object' && currentEvent.organization
        ? currentEvent.organization
        : null;
    const organizationName = getOrganizationName(currentEvent.organization);
    const isOrganizationEvent = typeof currentEvent.organizationId === 'string' && currentEvent.organizationId.trim().length > 0;
    const hostedByLabel = (() => {
        if (isOrganizationEvent && organizationName) {
            return organizationName;
        }
        if (hostUser) {
            return getUserFullName(hostUser);
        }
        if (organizationName) {
            return organizationName;
        }
        const normalizedHostId = typeof currentEvent.hostId === 'string' ? currentEvent.hostId.trim() : '';
        return normalizedHostId || 'Hosted by organizer';
    })();
    const hostedByHandle = !isOrganizationEvent && hostUser ? getUserHandle(hostUser) : null;
    const hostedByHref = getOrganizationHostedByHref({
        organization,
        organizationId: currentEvent.organizationId,
        affiliateUrl: affiliateActionUrl,
        isAffiliateEvent,
    });
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    const participantCapacity = resolveEventParticipantCapacity(currentEvent);
    const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
    const spotsLeft = participantCapacity > 0 ? Math.max(0, participantCapacity - totalParticipants) : 0;
    const eventFillPercent = participantCapacity > 0
        ? Math.min(100, Math.round((totalParticipants / participantCapacity) * 100))
        : 0;
    const normalizedFreeAgentIds = (() => {
        const fromEvent = collectUniqueUserIds(currentEvent.freeAgentIds);
        const additionalFromProfiles = freeAgents
            .map((entry) => normalizeUserId(entry?.$id))
            .filter((entry): entry is string => Boolean(entry));
        return Array.from(new Set([...fromEvent, ...additionalFromProfiles]));
    })();
    const normalizedWaitlistIds = (() => {
        const fromEvent = collectUniqueUserIds(currentEvent.waitListIds);
        const fromLegacy = collectUniqueUserIds(currentEvent.waitList);
        return Array.from(new Set([...fromEvent, ...fromLegacy]));
    })();
    const normalizedParticipantUserIds = collectUniqueUserIds(currentEvent.userIds);
    const normalizedFreeAgentIdSet = new Set(normalizedFreeAgentIds);
    const normalizedWaitlistIdSet = new Set(normalizedWaitlistIds);
    // Use expanded relations for registration state
    const isUserRegistered = !!user && (
        (!isTeamSignup && (players.some(p => p.$id === user.$id) || normalizedParticipantUserIds.includes(user.$id))) ||
        (isTeamSignup && teams.some(t => (t.playerIds || []).includes(user.$id)))
    );
    const isUserWaitlisted = !!user && normalizedWaitlistIdSet.has(user.$id);
    const isUserFreeAgent = !!user && normalizedFreeAgentIdSet.has(user.$id);
    const isChildEligible = (child: FamilyChild): boolean => {
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        if (!childDob) {
            return false;
        }
        const childAgeAtEvent = calculateAgeOnDate(childDob, eventStartDate ?? new Date());
        if (!Number.isFinite(childAgeAtEvent)) {
            return false;
        }
        if (hasAgeLimits) {
            return isAgeWithinRange(childAgeAtEvent, eventMinAge, eventMaxAge);
        }
        if (isTeamSignup) {
            return true;
        }
        if (!selectedDivisionOption) {
            return true;
        }
        const divisionEligibility = evaluateDivisionAgeEligibility({
            dateOfBirth: childDob,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
        if (!divisionEligibility.applies) {
            return true;
        }
        return divisionEligibility.eligible !== false;
    };
    const activeChildren = children.filter(isActiveFamilyChild);
    const hasActiveChildren = activeChildren.length > 0;
    const hasLinkedChildRefundTarget = activeChildren.some((child) => {
        const childId = normalizeUserId(child.userId);
        if (!childId) {
            return false;
        }
        return normalizedParticipantUserIds.includes(childId)
            || normalizedWaitlistIdSet.has(childId)
            || normalizedFreeAgentIdSet.has(childId)
            || teams.some((team) => (team.playerIds || []).includes(childId));
    });
    const hasRefundTarget = Boolean(user && (
        isUserRegistered
        || isUserWaitlisted
        || isUserFreeAgent
        || hasLinkedChildRefundTarget
    ));
    const shouldShowChildRegistrationPanel = canRegisterChild
        && (childrenLoading || Boolean(childrenError) || hasActiveChildren);
    const childOptions = activeChildren.map((child) => {
        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child';
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        const childAgeAtEvent = childDob ? calculateAgeOnDate(childDob, eventStartDate ?? new Date()) : undefined;
        const ageLabel = typeof childAgeAtEvent === 'number' && Number.isFinite(childAgeAtEvent)
            ? `${childAgeAtEvent}y at event`
            : 'age unknown';
        const eligible = isChildEligible(child);
        const childId = normalizeUserId(child.userId);
        const hasExistingEventState = Boolean(
            childId
            && (
                normalizedParticipantUserIds.includes(childId)
                || normalizedWaitlistIdSet.has(childId)
                || normalizedFreeAgentIdSet.has(childId)
                || teams.some((team) => (team.playerIds || []).includes(childId))
            ),
        );
        return {
            value: child.userId,
            label: `${name} (${ageLabel})`,
            visible: eligible || hasExistingEventState,
        };
    }).filter((option) => option.visible).map((option) => ({
        value: option.value,
        label: option.label,
    }));
    const selectedChild = activeChildren.find((child) => child.userId === selectedChildId);
    const selectedChildEligible = selectedChild ? isChildEligible(selectedChild) : false;
    const selectedChildHasEmail = selectedChild
        ? (typeof selectedChild.hasEmail === 'boolean' ? selectedChild.hasEmail : Boolean(selectedChild.email))
        : true;
    const selectedChildIsFreeAgent = Boolean(
        selectedChildId
        && normalizedFreeAgentIdSet.has(selectedChildId),
    );
    const selectedChildIsWaitlisted = Boolean(
        selectedChildId
        && normalizedWaitlistIdSet.has(selectedChildId),
    );
    const selectedChildIsRegistered = Boolean(
        selectedChildId
        && (players.some((participant) => participant.$id === selectedChildId) || normalizedParticipantUserIds.includes(selectedChildId)),
    );
    const showChildRegistrationStatus = Boolean(selectedChildId && childRegistrationChildId === selectedChildId);
    const hasCoordinates = Array.isArray(currentEvent.coordinates) && currentEvent.coordinates.length >= 2;
    const mapLat = hasCoordinates ? Number(currentEvent.coordinates[1]) : undefined;
    const mapLng = hasCoordinates ? Number(currentEvent.coordinates[0]) : undefined;
    const hasValidCoords = typeof mapLat === 'number' && typeof mapLng === 'number' && !Number.isNaN(mapLat) && !Number.isNaN(mapLng);
    const eventAddress = (currentEvent.address || '').trim();
    const mapQuery = eventAddress.length > 0
        ? eventAddress
        : (hasValidCoords ? `${mapLat},${mapLng}` : '');
    const encodedMapQuery = encodeURIComponent(mapQuery);
    const mapEmbedSrc = mapQuery
        ? `https://maps.google.com/maps?q=${encodedMapQuery}&z=14&output=embed`
        : null;
    const eventPriceSummary = isAffiliateEvent
        ? formatAffiliateEventPriceRange(currentEvent)
        : `${formatEventDivisionPriceRange(currentEvent)} / ${isTeamSignup ? 'team' : 'player'}`;
    const usesManualRegistrationPayments = currentEvent.registrationPaymentMode === 'MANUAL'
        || (currentEvent.manualPaymentLinks ?? []).length > 0
        || Boolean(currentEvent.manualPaymentInstructions?.trim());
    const showSecurePaymentNote = !isAffiliateEvent
        && !usesManualRegistrationPayments
        && normalizePriceCents(selectedDivisionBilling.priceCents) > 0;
    const showPoweredByBracketIqNote = !isAffiliateEvent;
    const registrationCutoffSummary = formatRegistrationCutoffSummary(currentEvent.registrationCutoffHours);
    const refundSummary = formatRefundSummary(currentEvent.cancellationRefundHours);
    const eventTypeLabel = isEvergreenProgram
        ? 'Program'
        : formatEnumDisplayLabel(currentEvent.eventType, 'Event');
    const registrationTypeLabel = isTeamSignup ? 'Team registration' : 'Individual registration';
    const spotsSummary = participantCapacity > 0
        ? `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`
        : 'Open capacity';
    const eventLocationSummary = currentEvent.location || 'Location coming soon';
    const shouldShowHostedByHeroLabel = Boolean(
        hostedByLabel
        && normalizeComparableLabel(hostedByLabel) !== normalizeComparableLabel(eventLocationSummary)
    );
    const officialPositionsSummary = uniqueNonEmptyStrings(
        (currentEvent.officialPositions ?? [])
            .slice()
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .map((position) => {
                const normalizedName = position.name?.trim() || 'Official';
                const normalizedCount = Number.isFinite(Number(position.count))
                    ? Math.max(1, Math.trunc(Number(position.count)))
                    : 1;
                return `${normalizedName} x${normalizedCount}`;
            }),
    ).join(', ') || 'None';
    const assistantHostNames = (() => {
        const hydratedIds = new Set((currentEvent.assistantHosts ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(currentEvent.assistantHosts ?? []).map((entry) => getUserFullName(entry)),
            ...((currentEvent.assistantHostIds ?? []).filter((entry) => !hydratedIds.has(entry))),
        ]);
    })();
    const officialNames = (() => {
        const hydratedIds = new Set((currentEvent.officials ?? []).map((entry) => entry.$id));
        return uniqueNonEmptyStrings([
            ...(currentEvent.officials ?? []).map((entry) => getUserFullName(entry)),
            ...((currentEvent.officialIds ?? []).filter((entry) => !hydratedIds.has(entry))),
        ]);
    })();
    const normalizedViewerId = typeof user?.$id === 'string' ? user.$id.trim() : '';
    const organizationHostIds = typeof currentEvent.organization === 'object' && currentEvent.organization
        ? collectOrganizationHostIds(currentEvent.organization)
        : [];
    const canViewStaffSection = Boolean(
        normalizedViewerId
        && (
            currentEvent.hostId === normalizedViewerId
            || (currentEvent.assistantHostIds ?? []).includes(normalizedViewerId)
            || (currentEvent.officialIds ?? []).includes(normalizedViewerId)
            || organizationHostIds.includes(normalizedViewerId)
        ),
    );
    const readOnlyFieldCount = (() => {
        if (Array.isArray(currentEvent.fields) && currentEvent.fields.length > 0) {
            return currentEvent.fields.length;
        }
        if (Array.isArray(currentEvent.fieldIds) && currentEvent.fieldIds.length > 0) {
            return currentEvent.fieldIds.length;
        }
        if (typeof currentEvent.fieldCount === 'number' && Number.isFinite(currentEvent.fieldCount)) {
            return Math.max(0, Math.trunc(currentEvent.fieldCount));
        }
        return 0;
    })();
    const scheduleFieldNamesById = new Map((currentEvent.fields ?? []).map((field) => [field.$id, field]));
    const fallbackDivisionIds = Array.isArray(currentEvent.divisions)
        ? currentEvent.divisions
            .map((entry) => getDivisionIdFromEventEntry(entry))
            .filter((entry): entry is string => Boolean(entry))
        : [];
    const scheduleTimeslotGroups = buildScheduleTimeslotGroups(currentEvent.timeSlots ?? []);
    const teamNameById = new Map(teams.map((team) => [team.$id, team.name || 'Team']));
    const selectedDivisionScheduleAliases = new Set<string>([
        ...getNormalizedDivisionAliases(selectedDivisionOption?.id),
        ...getNormalizedDivisionAliases(selectedDivisionOption?.key),
        ...getNormalizedDivisionAliases(selectedDivisionOption?.divisionTypeKey),
    ]);
    const matchesSelectedScheduleDivision = (value: unknown): boolean => {
        if (selectedDivisionScheduleAliases.size === 0) {
            return false;
        }
        const aliases = new Set<string>();
        if (value && typeof value === 'object') {
            const row = value as { id?: unknown; $id?: unknown; key?: unknown; name?: unknown };
            [row.id, row.$id, row.key, row.name].forEach((entry) => {
                getNormalizedDivisionAliases(entry).forEach((alias) => aliases.add(alias));
            });
        } else {
            getNormalizedDivisionAliases(value).forEach((alias) => aliases.add(alias));
        }
        return Array.from(aliases).some((alias) => selectedDivisionScheduleAliases.has(alias));
    };
    const getMatchTeamLabel = (match: Match, side: 'team1' | 'team2'): string => {
        const hydratedTeam = match[side];
        if (hydratedTeam && typeof hydratedTeam === 'object' && typeof hydratedTeam.name === 'string' && hydratedTeam.name.trim().length > 0) {
            return hydratedTeam.name.trim();
        }
        const teamId = side === 'team1' ? match.team1Id : match.team2Id;
        if (teamId && teamNameById.has(teamId)) {
            return teamNameById.get(teamId) ?? 'Team';
        }
        const seed = side === 'team1' ? match.team1Seed : match.team2Seed;
        return typeof seed === 'number' ? `Seed ${seed}` : 'TBD';
    };
    const eventDisplayTimeZone = normalizeTimeZone(currentEvent.timeZone);
    const formatEventWeekday = (value: Date): string =>
        new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            timeZone: eventDisplayTimeZone,
        }).format(value);
    const schedulePreviewItems = (() => {
        const nowMs = todayForDob.getTime();
        const allMatchRows = (currentEvent.matches ?? [])
            .map((match) => {
                const start = parseDateValue(match.start ?? null);
                if (!start) {
                    return null;
                }
                const fieldLabel = match.field
                    ? getFieldDisplayName(match.field, match.fieldId ?? undefined)
                    : match.fieldId
                        ? getFieldDisplayName({ $id: match.fieldId, name: scheduleFieldNamesById.get(match.fieldId)?.name ?? '' }, match.fieldId)
                        : 'Field TBD';
                return {
                    id: match.$id,
                    startMs: start.getTime(),
                    dateKey: formatDisplayDate(start, { year: '2-digit', timeZone: eventDisplayTimeZone }),
                    dateLabel: formatDisplayDate(start, { year: '2-digit', timeZone: eventDisplayTimeZone }),
                    dayLabel: formatEventWeekday(start),
                    timeLabel: formatDisplayTime(start, { timeZone: eventDisplayTimeZone }),
                    title: `${getMatchTeamLabel(match, 'team1')} vs ${getMatchTeamLabel(match, 'team2')}`,
                    meta: fieldLabel,
                    matchesSelectedDivision: matchesSelectedScheduleDivision(match.division),
                };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .sort((left, right) => left.startMs - right.startMs);
        const selectedDivisionMatchRows = allMatchRows.filter((row) => row.matchesSelectedDivision);
        const matchRows = selectedDivisionMatchRows.length > 0 ? selectedDivisionMatchRows : allMatchRows;
        const preferredMatches = matchRows.filter((row) => row.startMs >= nowMs);
        const selectedMatches = (preferredMatches.length > 0 ? preferredMatches : matchRows).slice(0, 4);
        if (selectedMatches.length > 0) {
            return selectedMatches;
        }

        const timeslotRows = scheduleTimeslotGroups
            .flatMap(([dayOfWeek, slots]) => slots.map((slot) => {
                const slotDivisionIds = Array.isArray(slot.divisions) && slot.divisions.length
                    ? slot.divisions
                    : [];
                const fieldNames = uniqueNonEmptyStrings(
                    (
                        Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
                            ? slot.scheduledFieldIds
                            : typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0
                                ? [slot.scheduledFieldId]
                                : []
                    ).map((fieldId: string) => {
                        const resolved = scheduleFieldNamesById.get(fieldId);
                        return getFieldDisplayName(
                            { $id: fieldId, name: resolved?.name ?? '' },
                            fieldId,
                        );
                    }),
                );
                const divisionNames = uniqueNonEmptyStrings(
                    (
                        slotDivisionIds.length
                            ? slotDivisionIds
                            : fallbackDivisionIds
                    ).map((divisionId: string) => resolveDivisionDisplayName({
                        division: divisionId,
                        divisionNameIndex: divisionDisplayNameIndex,
                        sportInput: sportLabel,
                    }) ?? divisionId),
                );
                const dayLabel = getDayOfWeekLabel(dayOfWeek);
                return {
                    id: slot.$id,
                    startMs: typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : Number.MAX_SAFE_INTEGER,
                    dateKey: dayLabel,
                    dateLabel: dayLabel,
                    dayLabel: 'Weekly',
                    timeLabel: formatSlotTimeRange(slot.startTimeMinutes, slot.endTimeMinutes),
                    title: formatReadOnlyValueList(fieldNames, 'Fields TBD'),
                    meta: formatReadOnlyValueList(divisionNames, 'All divisions'),
                    matchesSelectedDivision: slotDivisionIds.some((divisionId) => matchesSelectedScheduleDivision(divisionId)),
                };
            }))
            .sort((left, right) => left.startMs - right.startMs);
        const selectedDivisionTimeslotRows = timeslotRows.filter((row) => row.matchesSelectedDivision);
        return (selectedDivisionTimeslotRows.length > 0 ? selectedDivisionTimeslotRows : timeslotRows)
            .slice(0, 4);
    })();
    const scheduleDateChips = Array.from(
        schedulePreviewItems.reduce((entries, item) => {
            if (!entries.has(item.dateKey)) {
                entries.set(item.dateKey, {
                    key: item.dateKey,
                    dayLabel: item.dayLabel,
                    dateLabel: item.dateLabel,
                });
            }
            return entries;
        }, new Map<string, { key: string; dayLabel: string; dateLabel: string }>()),
    ).map(([, value]) => value).slice(0, 5);
    const supportsScheduleDetails = currentEvent.eventType === 'LEAGUE'
        || currentEvent.eventType === 'TOURNAMENT'
        || currentEvent.eventType === 'WEEKLY_EVENT'
        || Boolean(readOnlyFieldCount)
        || Boolean(currentEvent.timeSlots?.length);
    const canShowScheduleButton = isEventHost && !renderInline && !isWeeklyParentEvent;
    const showParticipantsSection = !isWeeklyParentEvent;
    const scheduleButtonLabel = isEventHost ? 'Manage Event' : 'View Schedule';
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
                                        <PublicEventSection title="About this event">
                                            <div className="space-y-5">
                                                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        {organization && hostedByHref ? (
                                                            <a
                                                                href={hostedByHref}
                                                                target={hostedByHref.startsWith('http') ? '_blank' : undefined}
                                                                rel={hostedByHref.startsWith('http') ? 'noreferrer' : undefined}
                                                                className="group flex max-w-md items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                                                            >
                                                                <Avatar
                                                                    src={getOrganizationAvatarUrl(organization, 48)}
                                                                    radius="md"
                                                                    size={48}
                                                                    alt={hostedByLabel}
                                                                />
                                                                <div className="min-w-0">
                                                                    <Text size="sm" c="dimmed">Hosted by</Text>
                                                                    <Text fw={800} className="truncate text-slate-950">{hostedByLabel}</Text>
                                                                    <Text size="sm" c="dimmed" className="truncate group-hover:text-slate-700">
                                                                        {isAffiliateEvent ? 'Open website' : 'Open organization page'}
                                                                    </Text>
                                                                </div>
                                                            </a>
                                                        ) : hostUser ? (
                                                            <UserCard
                                                                user={hostUser}
                                                                showRole
                                                                role="Host"
                                                                className="max-w-md border border-slate-200 !p-3 !shadow-none"
                                                            />
                                                        ) : (
                                                            <div className="max-w-md rounded-md border border-slate-200 bg-white p-3">
                                                                <Text size="sm" c="dimmed">Hosted by</Text>
                                                                <Text fw={800} className="text-slate-950">{hostedByLabel}</Text>
                                                                {hostedByHandle && (
                                                                    <Text size="sm" c="dimmed">{hostedByHandle}</Text>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 ${publicRegistrationStatusClassName}`}>
                                                        <ShieldCheck size={16} />
                                                        <Text size="sm" fw={700}>{publicRegistrationStatusLabel}</Text>
                                                    </div>
                                                </div>
                                                <Text className="text-base leading-7 text-slate-700">
                                                    {currentEvent.description?.trim() || 'No description provided yet.'}
                                                </Text>
                                            </div>
                                        </PublicEventSection>

                                        <PublicEventSection>
                                            <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
                                                <div className="space-y-3">
                                                    <PublicEventMetaPill
                                                        label={isEvergreenProgram ? 'Schedule' : (sharesSingleDayWindow ? 'Starts' : 'Start date')}
                                                        value={isEvergreenProgram
                                                            ? eventScheduleDisplayText
                                                            : (startDateValue
                                                                ? (sharesSingleDayWindow
                                                                    ? formatDisplayDateTime(startDateValue, { timeZone: eventDisplayTimeZone })
                                                                    : formatDisplayDate(startDateValue, { timeZone: eventDisplayTimeZone }))
                                                                : '')}
                                                    />
                                                    {!isEvergreenProgram && (
                                                        <PublicEventMetaPill
                                                            label={sharesSingleDayWindow ? 'Ends' : 'End date'}
                                                            value={endDateValue
                                                                ? (sharesSingleDayWindow
                                                                    ? formatDisplayTime(endDateValue, { timeZone: eventDisplayTimeZone })
                                                                    : formatDisplayDate(endDateValue, { timeZone: eventDisplayTimeZone }))
                                                                : ''}
                                                        />
                                                    )}
                                                    <PublicEventMetaPill label="Location" value={eventLocationSummary} />
                                                    {eventAddress && (
                                                        <PublicEventMetaPill label="Address" value={eventAddress} />
                                                    )}
                                                </div>
                                                {mapEmbedSrc ? (
                                                    <div className="space-y-3">
                                                        <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100" style={{ aspectRatio: '4 / 3' }}>
                                                            <iframe
                                                                title="Event location preview"
                                                                src={mapEmbedSrc}
                                                                className="h-full w-full"
                                                                loading="lazy"
                                                                allowFullScreen
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </PublicEventSection>

                                        {(allDivisionOptions.length > 0 || supportsScheduleDetails) && (
                                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start">
                                                {allDivisionOptions.length > 0 && (
                                                    <PublicEventSection title="Choices" className="xl:h-full">
                                                        {divisionOptions.length === 0 ? (
                                                            <Alert color="yellow" variant="light">
                                                                No divisions are available for the selected registrant&apos;s age.
                                                            </Alert>
                                                        ) : (
                                                        <div className="divide-y divide-slate-200">
                                                            {publicDivisionGroups.map((genderGroup) => {
                                                                const genderDivisionCount = genderGroup.ageGroups.reduce((count, ageGroup) => (
                                                                    count + ageGroup.skillGroups.reduce((skillCount, skillGroup) => skillCount + skillGroup.options.length, 0)
                                                                ), 0);
                                                                const genderHasSelected = genderGroup.ageGroups.some((ageGroup) => (
                                                                    ageGroup.skillGroups.some((skillGroup) => (
                                                                        skillGroup.options.some((division) => (
                                                                            registrationByDivisionType
                                                                                ? selectedDivisionOption?.divisionTypeKey === division.divisionTypeKey
                                                                                : selectedDivisionOption?.id === division.id
                                                                        ))
                                                                    ))
                                                                ));
                                                                return (
                                                                    <details
                                                                        key={genderGroup.key}
                                                                        className="group py-1"
                                                                        open={genderHasSelected || publicDivisionGroups.length === 1}
                                                                    >
                                                                        <summary className="cursor-pointer py-2 text-base font-bold text-slate-950 marker:text-slate-400">
                                                                            <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                                                <span>{genderGroup.label}</span>
                                                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                                                                                    {genderDivisionCount}
                                                                                </span>
                                                                            </span>
                                                                        </summary>
                                                                        <div className="pb-2 pl-3">
                                                                            {genderGroup.ageGroups.map((ageGroup) => {
                                                                                const ageDivisionCount = ageGroup.skillGroups.reduce((count, skillGroup) => count + skillGroup.options.length, 0);
                                                                                const ageHasSelected = ageGroup.skillGroups.some((skillGroup) => (
                                                                                    skillGroup.options.some((division) => (
                                                                                        registrationByDivisionType
                                                                                            ? selectedDivisionOption?.divisionTypeKey === division.divisionTypeKey
                                                                                            : selectedDivisionOption?.id === division.id
                                                                                    ))
                                                                                ));
                                                                                return (
                                                                                    <details
                                                                                        key={ageGroup.key}
                                                                                        className="border-t border-slate-100 py-1"
                                                                                        open={ageHasSelected || genderGroup.ageGroups.length === 1}
                                                                                    >
                                                                                        <summary className="cursor-pointer py-1.5 text-sm font-bold text-slate-800 marker:text-slate-400">
                                                                                            <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                                                                <span>{ageGroup.label}</span>
                                                                                                <span className="text-xs font-bold text-slate-500">
                                                                                                    {ageDivisionCount}
                                                                                                </span>
                                                                                            </span>
                                                                                        </summary>
                                                                                        <div className="pb-2 pl-3">
                                                                                            {ageGroup.skillGroups.map((skillGroup) => {
                                                                                                const skillHasSelected = skillGroup.options.some((division) => (
                                                                                                    registrationByDivisionType
                                                                                                        ? selectedDivisionOption?.divisionTypeKey === division.divisionTypeKey
                                                                                                        : selectedDivisionOption?.id === division.id
                                                                                                ));
                                                                                                return (
                                                                                                    <details
                                                                                                        key={skillGroup.key}
                                                                                                        className="border-t border-slate-100 py-1"
                                                                                                        open={skillHasSelected || ageGroup.skillGroups.length === 1}
                                                                                                    >
                                                                                                        <summary className="cursor-pointer py-1.5 text-sm font-bold text-slate-700 marker:text-slate-400">
                                                                                                            <span className="ml-1 inline-flex w-[calc(100%-1rem)] items-center justify-between gap-3 align-middle">
                                                                                                                <span>{skillGroup.label}</span>
                                                                                                                <span className="text-xs font-bold text-slate-500">
                                                                                                                    {skillGroup.options.length}
                                                                                                                </span>
                                                                                                            </span>
                                                                                                        </summary>
                                                                                                        <div className="grid grid-cols-1 gap-2 pb-2 pl-3">
                                                                                                            {skillGroup.options.map((division) => {
                                                                                                                const isSelected = registrationByDivisionType
                                                                                                                    ? selectedDivisionOption?.divisionTypeKey === division.divisionTypeKey
                                                                                                                    : selectedDivisionOption?.id === division.id;
                                                                                                                const displaySkillLabel = skillGroup.options.length > 1
                                                                                                                    ? division.name
                                                                                                                    : skillGroup.label;
                                                                                                                return (
                                                                                                                    <button
                                                                                                                        key={division.id}
                                                                                                                        type="button"
                                                                                                                        aria-pressed={isSelected}
                                                                                                                        onClick={() => handlePublicDivisionSelect(division)}
                                                                                                                        className={`rounded-md border px-3 py-2.5 text-left transition ${
                                                                                                                            isSelected
                                                                                                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm'
                                                                                                                                : 'border-slate-200 bg-white text-slate-900 hover:border-emerald-300 hover:bg-emerald-50/50'
                                                                                                                        }`}
                                                                                                                    >
                                                                                                                        <div className="flex items-center justify-between gap-3">
                                                                                                                            <div>
                                                                                                                                <Text fw={800}>{displaySkillLabel}</Text>
                                                                                                                                <Text size="xs" c={isSelected ? 'green' : 'dimmed'}>
                                                                                                                                    {division.name}
                                                                                                                                </Text>
                                                                                                                            </div>
                                                                                                                            {isSelected && (
                                                                                                                                <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                                                                                                                                    Current
                                                                                                                                </span>
                                                                                                                            )}
                                                                                                                        </div>
                                                                                                                        {division.ageCutoffLabel && (
                                                                                                                            <Text size="xs" c="dimmed" className="mt-2">
                                                                                                                                {division.ageCutoffLabel}
                                                                                                                            </Text>
                                                                                                                        )}
                                                                                                                    </button>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    </details>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </details>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </details>
                                                                );
                                                            })}
                                                        </div>
                                                        )}
                                                    </PublicEventSection>
                                                )}

                                                {supportsScheduleDetails && (
                                                    <PublicEventSection title="Timeline" className="xl:h-full">
                                                        <div className="space-y-5">
                                                            {scheduleDateChips.length > 0 && (
                                                                <div className="flex gap-2 overflow-x-auto pb-1">
                                                                    {scheduleDateChips.map((chip) => (
                                                                        <div
                                                                            key={chip.key}
                                                                            className="min-w-[76px] rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-emerald-950"
                                                                        >
                                                                            <Text size="xs" fw={800} tt="uppercase" className="tracking-normal">
                                                                                {chip.dayLabel}
                                                                            </Text>
                                                                            <Text size="sm" fw={800}>{chip.dateLabel}</Text>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="divide-y divide-slate-200">
                                                                {schedulePreviewItems.length === 0 ? (
                                                                    <Text size="sm" c="dimmed">
                                                                        No schedule preview is available yet.
                                                                    </Text>
                                                                ) : schedulePreviewItems.map((item) => (
                                                                    <div key={item.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
                                                                        <div>
                                                                            <Text size="sm" fw={800} className="text-slate-950">{item.timeLabel}</Text>
                                                                            <Text size="xs" c="dimmed">{item.dateLabel}</Text>
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <Text fw={800} className="truncate text-slate-950">{item.title}</Text>
                                                                            <Text size="sm" c="dimmed" className="truncate">{item.meta}</Text>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </PublicEventSection>
                                                )}
                                            </div>
                                        )}

                                        {(currentEvent.eventType === 'LEAGUE' || canViewStaffSection) && (
                                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                                {currentEvent.eventType === 'LEAGUE' && (
                                                    <PublicEventSection eyebrow="Format" title="League Scoring Rules" className="h-full">
                                                        <PublicEventMetaPill label="Scoring profile" value={sportLabel || 'Default'} />
                                                    </PublicEventSection>
                                                )}

                                                {canViewStaffSection && (
                                                    <PublicEventSection eyebrow="Operations" title="Staff" className="h-full">
                                                        <div className="grid grid-cols-1 gap-3">
                                                            <PublicEventMetaPill label="Primary host" value={hostedByLabel} />
                                                            <PublicEventMetaPill label="Assistant hosts" value={formatReadOnlyValueList(assistantHostNames, 'No assistant hosts assigned')} />
                                                            <PublicEventMetaPill label="Officials" value={formatReadOnlyValueList(officialNames, 'No officials assigned')} />
                                                            <PublicEventMetaPill label="Staffing mode" value={formatOfficialSchedulingModeLabel(currentEvent.officialSchedulingMode)} />
                                                            <PublicEventMetaPill label="Official positions" value={officialPositionsSummary} />
                                                        </div>
                                                    </PublicEventSection>
                                                )}
                                            </div>
                                        )}
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

