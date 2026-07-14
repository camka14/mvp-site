import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Avatar, Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Modal, Checkbox, PasswordInput, Stack, Collapse, Progress, TextInput, Textarea, FileInput } from '@mantine/core';
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
    BillingAddress,
    Event,
    Match,
    UserData,
    Team,
    getEventDateTime,
    getUserAvatarUrl,
    getUserFullName,
    getUserHandle,
    getTeamAvatarUrl,
    PaymentIntent,
    Bill,
    BillPayment,
    getEventImageFallbackUrl,
    getEventImageUrl,
    getOrganizationAvatarUrl,
    formatAffiliateEventPriceRange,
    formatEventDivisionPriceRange,
    formatPrice,
    RegistrationQuestion,
    RegistrationQuestionAnswerInput,
} from '@/types';
import { apiRequest, isApiRequestError } from '@/lib/apiClient';
import { eventService, type EventParticipantRegistrationEntry, type WeeklyOccurrenceSelection } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService, type DiscountPreview, type EventRegistrationCheckoutTarget } from '@/lib/paymentService';
import { billingAddressService } from '@/lib/billingAddressService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { billService } from '@/lib/billService';
import { createId } from '@/lib/id';
import { boldsignService, SignStep } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { familyService, FamilyChild } from '@/lib/familyService';
import { registrationService, type DivisionRegistrationSelection, ConsentLinks, EventRegistration } from '@/lib/registrationService';
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
    formatPaymentPlanPreviewPrice,
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
    formatNotSpecifiedValue,
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
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
import UserCard from '@/components/ui/UserCard';
import TeamRegistrationFlow from '@/components/ui/TeamRegistrationFlow';
import RegistrationHoldTimer from '@/components/ui/RegistrationHoldTimer';
import {
    buildRegistrationProgressKey,
    clearRegistrationProgress,
    loadRegistrationProgress,
    saveRegistrationProgress,
    type RegistrationProgressStep,
} from '@/lib/registrationProgressStorage';
import {
    getManualPaymentProviderLabel,
    normalizeManualPaymentProvider,
} from '@/lib/manualRegistrationPayments';
import {
    type RegistrationAttemptType,
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

type JoinIntent = {
    mode: 'user' | 'team' | 'child' | 'child_free_agent' | 'user_waitlist' | 'team_waitlist' | 'child_waitlist';
    team?: Team | null;
    childId?: string;
    childEmail?: string | null;
    answers?: RegistrationQuestionAnswerInput[];
};

type PaymentPlanPreviewState = {
    intent: JoinIntent;
    ownerLabel: string;
};

type PendingEventCheckoutState = {
    event: Event;
    team?: Team;
    eventRegistration?: EventRegistrationCheckoutTarget;
    selection?: DivisionRegistrationSelection;
    answers?: RegistrationQuestionAnswerInput[];
    discountCode?: string | null;
};

const hasCompleteBillingAddress = (billingAddress?: BillingAddress | null): billingAddress is BillingAddress => (
    Boolean(
        billingAddress?.line1?.trim()
        && billingAddress.city?.trim()
        && billingAddress.state?.trim()
        && billingAddress.postalCode?.trim()
        && billingAddress.countryCode?.trim(),
    )
);

const MANUAL_PAYMENT_PROVIDER_LOGOS: Partial<Record<string, string>> = {
    CASH_APP: '/payment-providers/cash-app-pay.svg',
    VENMO: '/payment-providers/venmo.png',
    PAYPAL: '/payment-providers/paypal.png',
    STRIPE: '/payment-providers/stripe.svg',
};

const getNextManualBillPayment = (bill: Bill | null): BillPayment | null => {
    const payments = (bill?.payments ?? [])
        .filter((payment) => payment.status !== 'PAID' && payment.status !== 'VOID')
        .sort((left, right) => left.sequence - right.sequence);
    return payments[0] ?? null;
};

function ManualPaymentProofModal({
    opened,
    event,
    bill,
    onClose,
    onSubmitted,
}: {
    opened: boolean;
    event: Event | null;
    bill: Bill | null;
    onClose: () => void;
    onSubmitted: () => void | Promise<void>;
}) {
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const payment = getNextManualBillPayment(bill);
    const links = event?.manualPaymentLinks ?? [];
    const amountDue = payment?.amountCents ?? bill?.nextPaymentAmountCents ?? bill?.totalAmountCents ?? event?.price ?? 0;

    const handleSubmit = async () => {
        if (!bill?.$id || !payment?.$id) {
            setError('No pending bill payment was found for this registration.');
            return;
        }
        if (!proofFile) {
            setError('Upload an image showing proof of payment.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', proofFile);
            if (event?.organizationId) {
                formData.append('organizationId', event.organizationId);
            }
            const upload = await apiRequest<{ file?: { id?: string } }>('/api/files/upload', {
                method: 'POST',
                body: formData,
            });
            const fileId = upload.file?.id;
            if (!fileId) {
                throw new Error('Proof image upload failed.');
            }
            await billService.submitManualPaymentProof({
                billId: bill.$id,
                billPaymentId: payment.$id,
                fileId,
            });
            setProofFile(null);
            await onSubmitted();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to submit payment proof.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Submit payment proof" centered size="lg" zIndex={SIGN_MODAL_Z_INDEX}>
            <Stack gap="md">
                <Alert color="yellow" variant="light">
                    Manual payments are handled directly by the host. BracketIQ does not process this payment and cannot issue automatic refunds. The host is responsible for confirming payments and handling refunds.
                </Alert>
                <div>
                    <Text size="sm" fw={600}>Amount due</Text>
                    <Text size="xl" fw={700}>{formatPrice(amountDue)}</Text>
                </div>
                {links.length > 0 ? (
                    <Stack gap="xs">
                        <Text size="sm" fw={600}>Payment links</Text>
                        <Group gap="sm">
                            {links.map((link) => {
                                const provider = normalizeManualPaymentProvider(link.provider);
                                const logo = MANUAL_PAYMENT_PROVIDER_LOGOS[provider];
                                return (
                                    <Button
                                        key={link.id || link.url}
                                        component="a"
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        variant="default"
                                        leftSection={logo ? (
                                            <Image src={logo} alt={getManualPaymentProviderLabel(provider)} width={72} height={24} style={{ objectFit: 'contain' }} />
                                        ) : undefined}
                                    >
                                        {link.label || getManualPaymentProviderLabel(provider)}
                                    </Button>
                                );
                            })}
                        </Group>
                    </Stack>
                ) : null}
                {event?.manualPaymentInstructions ? (
                    <Alert color="blue" variant="light">
                        {event.manualPaymentInstructions}
                    </Alert>
                ) : null}
                <FileInput
                    label="Proof image"
                    placeholder="Upload screenshot or receipt"
                    accept="image/*"
                    value={proofFile}
                    onChange={setProofFile}
                    disabled={submitting}
                />
                {error ? <Alert color="red" variant="light">{error}</Alert> : null}
                <Group justify="flex-end">
                    <Button variant="subtle" onClick={onClose} disabled={submitting}>Close</Button>
                    <Button onClick={handleSubmit} loading={submitting}>Upload proof</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

type LoadEventDetailsOptions = {
    automatic?: boolean;
};

const isChildJoinIntent = (intent: JoinIntent): boolean => (
    intent.mode === 'child' || intent.mode === 'child_free_agent' || intent.mode === 'child_waitlist'
);

const getJoinIntentRegistrationType = (intent: JoinIntent): RegistrationAttemptType => {
    switch (intent.mode) {
        case 'team':
            return 'team';
        case 'child':
            return 'child';
        case 'user_waitlist':
        case 'child_waitlist':
            return 'waitlist';
        case 'team_waitlist':
            return 'team_waitlist';
        case 'child_free_agent':
            return 'free_agent';
        case 'user':
        default:
            return 'self';
    }
};

const dedupeSignSteps = (steps: SignStep[], fallbackSignerContext: 'participant' | 'parent_guardian' | 'child'): SignStep[] => {
    const seen = new Set<string>();
    return steps.filter((step) => {
        const key = `${step.signerContext ?? fallbackSignerContext}:${step.templateId}:${step.documentId ?? ''}:${step.type}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const normalizeRequestToken = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

const buildEventDetailsLoadKey = (
    eventId: unknown,
    occurrence?: WeeklyOccurrenceSelection,
): string | null => {
    const normalizedEventId = normalizeRequestToken(eventId);
    if (!normalizedEventId) {
        return null;
    }

    const slotId = normalizeRequestToken(occurrence?.slotId);
    const occurrenceDate = normalizeRequestToken(occurrence?.occurrenceDate);
    return slotId && occurrenceDate
        ? `${normalizedEventId}:${slotId}:${occurrenceDate}`
        : `${normalizedEventId}:all`;
};

const normalizeUserId = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const getEventSportName = (event: Event | null | undefined): string => {
    if (!event) {
        return '';
    }
    const rawSport: unknown = (event as { sport?: unknown }).sport;
    if (typeof rawSport === 'string' && rawSport.trim().length > 0) {
        return rawSport.trim();
    }
    if (
        rawSport
        && typeof rawSport === 'object'
        && typeof (rawSport as { name?: unknown }).name === 'string'
    ) {
        return ((rawSport as { name?: string }).name ?? '').trim();
    }
    if (typeof event.sportId === 'string' && event.sportId.trim().length > 0) {
        return event.sportId.trim();
    }
    return '';
};

const teamIsManagedByUser = (team: Team, userId: string): boolean => {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
        return false;
    }
    const assistantCoachIds = Array.isArray((team as { assistantCoachIds?: unknown }).assistantCoachIds)
        ? ((team as { assistantCoachIds?: unknown }).assistantCoachIds as unknown[])
        : [];
    const coachIds = Array.isArray((team as { coachIds?: unknown }).coachIds)
        ? ((team as { coachIds?: unknown }).coachIds as unknown[])
        : [];
    const staffIds = [...assistantCoachIds, ...coachIds]
        .map((entry) => normalizeUserId(entry))
        .filter((entry): entry is string => Boolean(entry));

    return normalizeUserId(team.managerId) === normalizedUserId
        || normalizeUserId(team.captainId) === normalizedUserId
        || normalizeUserId(team.headCoachId) === normalizedUserId
        || staffIds.includes(normalizedUserId);
};

const getManagedUserTeamsForEvent = (teams: Team[] | null | undefined, event: Event | null | undefined, userId: string): Team[] => {
    const targetSport = getEventSportName(event).toLowerCase();
    const teamList = Array.isArray(teams) ? teams : [];
    return teamList.filter((team) => {
        const matchesSport = targetSport.length === 0
            || (team.sport || '').trim().toLowerCase() === targetSport;
        return matchesSport && teamIsManagedByUser(team, userId);
    });
};

const collectUniqueUserIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const ids = value
        .map((entry) => normalizeUserId(entry))
        .filter((entry): entry is string => Boolean(entry));
    return Array.from(new Set(ids));
};

const normalizeEmailValue = (value?: string | null): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
};

type DivisionSelectionPayload = {
    divisionId?: string;
    divisionTypeId?: string;
    divisionTypeKey?: string;
};

const isPaymentFailedRegistration = (registration: EventParticipantRegistrationEntry): boolean =>
    String(registration.status ?? '').trim().toUpperCase() === 'PAYMENT_FAILED';

const collectPaymentFailedRegistrationState = (
    registrations: {
        teams?: EventParticipantRegistrationEntry[];
        users?: EventParticipantRegistrationEntry[];
        children?: EventParticipantRegistrationEntry[];
    } | undefined,
    currentUserId: string | null,
): { userFailed: boolean; teamIds: string[] } => {
    const normalizedUserId = normalizeUserId(currentUserId);
    const failedUsers = (registrations?.users ?? []).filter(isPaymentFailedRegistration);
    const failedTeams = (registrations?.teams ?? []).filter(isPaymentFailedRegistration);

    return {
        userFailed: Boolean(
            normalizedUserId &&
            failedUsers.some((registration) => normalizeUserId(registration.registrantId) === normalizedUserId),
        ),
        teamIds: Array.from(new Set(
            failedTeams
                .map((registration) => normalizeUserId(registration.registrantId))
                .filter((teamId): teamId is string => Boolean(teamId)),
        )),
    };
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
    const [detailedEvent, setDetailedEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<UserData[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
    const [currentUserPaymentFailed, setCurrentUserPaymentFailed] = useState(false);
    const [paymentFailedTeamIds, setPaymentFailedTeamIds] = useState<string[]>([]);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [showCapacityBreakdown, setShowCapacityBreakdown] = useState(false);
    const [selectedFreeAgentActionUser, setSelectedFreeAgentActionUser] = useState<UserData | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [manualPaymentBill, setManualPaymentBill] = useState<Bill | null>(null);
    const [showManualPaymentModal, setShowManualPaymentModal] = useState(false);
    const [registrationHoldExpiresAt, setRegistrationHoldExpiresAt] = useState<string | null>(null);
    const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
    const [showCheckoutPreviewModal, setShowCheckoutPreviewModal] = useState(false);
    const [discountCode, setDiscountCode] = useState('');
    const [discountPreview, setDiscountPreview] = useState<DiscountPreview | null>(null);
    const [discountPreviewLoading, setDiscountPreviewLoading] = useState(false);
    const [discountPreviewError, setDiscountPreviewError] = useState<string | null>(null);
    const [pendingEventCheckout, setPendingEventCheckout] = useState<PendingEventCheckoutState | null>(null);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signLinks, setSignLinks] = useState<SignStep[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingJoin, setPendingJoin] = useState<JoinIntent | null>(null);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
    const [pendingSignatureOperationId, setPendingSignatureOperationId] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [confirmingPassword, setConfirmingPassword] = useState(false);
    const [recordingSignature, setRecordingSignature] = useState(false);
    const [textAccepted, setTextAccepted] = useState(false);
    const [children, setChildren] = useState<FamilyChild[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [childrenError, setChildrenError] = useState<string | null>(null);
    const [selectedChildId, setSelectedChildId] = useState('');
    const [registeringChild, setRegisteringChild] = useState(false);
    const [joiningChildFreeAgent, setJoiningChildFreeAgent] = useState(false);
    const [childRegistration, setChildRegistration] = useState<EventRegistration | null>(null);
    const [childConsent, setChildConsent] = useState<ConsentLinks | null>(null);
    const [childRegistrationChildId, setChildRegistrationChildId] = useState<string | null>(null);
    const [showRegistrationQuestionsModal, setShowRegistrationQuestionsModal] = useState(false);
    const [registrationQuestions, setRegistrationQuestions] = useState<RegistrationQuestion[]>([]);
    const [registrationQuestionAnswers, setRegistrationQuestionAnswers] = useState<Record<string, string>>({});
    const [registrationQuestionsIntent, setRegistrationQuestionsIntent] = useState<JoinIntent | null>(null);
    const [paymentPlanPreview, setPaymentPlanPreview] = useState<PaymentPlanPreviewState | null>(null);
    const [showQrCodeModal, setShowQrCodeModal] = useState(false);
    const [hostUser, setHostUser] = useState<UserData | null>(null);
    const eventRef = React.useRef<Event | null>(event);
    const loadedEventDetailsKeyRef = useRef<string | null>(null);
    const eventDetailsRequestGenerationRef = useRef(0);
    const joinCardAnchorRef = useRef<HTMLDivElement | null>(null);
    const joinCardRef = useRef<HTMLDivElement | null>(null);
    const [joinCardDocked, setJoinCardDocked] = useState(false);
    const [joinCardHeight, setJoinCardHeight] = useState(0);
    const [joinCardLeft, setJoinCardLeft] = useState(0);
    const [joinCardWidth, setJoinCardWidth] = useState(0);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [mobileJoinExpanded, setMobileJoinExpanded] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');

    const currentEvent = detailedEvent || event;
    useEffect(() => {
        if (!currentEvent?.$id || (!isOpen && !renderInline)) {
            setRegistrationQuestions([]);
            setRegistrationQuestionAnswers({});
            return undefined;
        }

        let cancelled = false;
        const loadQuestions = async () => {
            try {
                const questions = await teamService.getRegistrationQuestions('EVENT', currentEvent.$id);
                if (cancelled) {
                    return;
                }
                setRegistrationQuestions(questions);
                setRegistrationQuestionAnswers((current) => {
                    const next = { ...current };
                    questions.forEach((question) => {
                        if (!(question.id in next)) {
                            next[question.id] = '';
                        }
                    });
                    return next;
                });
            } catch {
                if (!cancelled) {
                    setRegistrationQuestions([]);
                    setRegistrationQuestionAnswers({});
                }
            }
        };
        void loadQuestions();
        return () => {
            cancelled = true;
        };
    }, [currentEvent?.$id, isOpen, renderInline]);

    const currentEventPublicUrl = React.useMemo(
        () => (currentEvent?.$id ? buildEventPublicUrl(currentEvent.$id) : ''),
        [currentEvent?.$id],
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
    }, [selectedOccurrence?.occurrenceDate, selectedOccurrence?.slotId]);
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
    const selectedWeeklyOccurrenceSlotId = selectedWeeklyOccurrence?.slotId ?? null;
    const selectedWeeklyOccurrenceDate = selectedWeeklyOccurrence?.occurrenceDate ?? null;
    const weeklySelectionRequired = isWeeklyParentEvent && !selectedWeeklyOccurrence;
    const eventRegistrationProgressKey = React.useMemo(() => buildRegistrationProgressKey({
        scope: 'event',
        userId: user?.$id,
        subjectId: currentEvent?.$id,
        slotId: selectedWeeklyOccurrenceSlotId,
        occurrenceDate: selectedWeeklyOccurrenceDate,
    }), [currentEvent?.$id, selectedWeeklyOccurrenceDate, selectedWeeklyOccurrenceSlotId, user?.$id]);
    const saveEventRegistrationProgress = useCallback((patch: {
        step?: RegistrationProgressStep;
        answers?: Record<string, string>;
        selectedTeamId?: string | null;
        selectedDivisionId?: string | null;
        selectedDivisionTypeKey?: string | null;
        registrationId?: string | null;
        holdExpiresAt?: string | null;
    } = {}) => {
        if (!eventRegistrationProgressKey || !user?.$id || !currentEvent?.$id) {
            return;
        }
        saveRegistrationProgress(eventRegistrationProgressKey, {
            scope: 'event',
            userId: user.$id,
            subjectId: currentEvent.$id,
            step: patch.step ?? 'questions',
            answers: patch.answers ?? registrationQuestionAnswers,
            selectedTeamId: (patch.selectedTeamId ?? selectedTeamId) || null,
            selectedDivisionId: (patch.selectedDivisionId ?? selectedDivisionId) || null,
            selectedDivisionTypeKey: (patch.selectedDivisionTypeKey ?? selectedDivisionTypeKey) || null,
            slotId: selectedWeeklyOccurrenceSlotId,
            occurrenceDate: selectedWeeklyOccurrenceDate,
            registrationId: patch.registrationId ?? paymentData?.registrationId ?? null,
            holdExpiresAt: patch.holdExpiresAt ?? registrationHoldExpiresAt,
        });
    }, [
        currentEvent?.$id,
        eventRegistrationProgressKey,
        paymentData?.registrationId,
        registrationHoldExpiresAt,
        registrationQuestionAnswers,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        selectedWeeklyOccurrenceDate,
        selectedWeeklyOccurrenceSlotId,
        user?.$id,
    ]);
    const clearEventRegistrationProgress = useCallback(() => {
        clearRegistrationProgress(eventRegistrationProgressKey);
        setRegistrationHoldExpiresAt(null);
    }, [eventRegistrationProgressKey]);
    const handleEventRegistrationHoldExpired = useCallback(() => {
        clearEventRegistrationProgress();
        setShowPaymentModal(false);
        setPaymentData(null);
        setPendingEventCheckout(null);
        setShowBillingAddressModal(false);
        setJoinError('Registration hold expired. Start registration again to reserve a new spot.');
    }, [clearEventRegistrationProgress]);
    useEffect(() => {
        const draft = loadRegistrationProgress(eventRegistrationProgressKey);
        if (!draft) {
            setRegistrationHoldExpiresAt(null);
            return;
        }
        if (draft.answers) {
            setRegistrationQuestionAnswers((current) => ({
                ...current,
                ...draft.answers,
            }));
        }
        if (draft.selectedTeamId) {
            setSelectedTeamId(draft.selectedTeamId);
        }
        if (draft.selectedDivisionId) {
            setSelectedDivisionId(draft.selectedDivisionId);
        }
        if (draft.selectedDivisionTypeKey) {
            setSelectedDivisionTypeKey(draft.selectedDivisionTypeKey);
        }
        setRegistrationHoldExpiresAt(draft.holdExpiresAt ?? null);
    }, [eventRegistrationProgressKey]);
    const effectiveEventStartDate = selectedWeeklyOccurrenceOption?.start ?? parseDateValue(currentEvent?.start ?? null);
    const eventImageFallbackUrl = React.useMemo(
        () => getEventImageFallbackUrl({ event: currentEvent, width: 1200, height: 675 }),
        [currentEvent],
    );
    const eventImageUrl = React.useMemo(
        () => getEventImageUrl({
            imageId: currentEvent?.imageId,
            width: 1200,
            height: 675,
            placeholderUrl: eventImageFallbackUrl,
        }),
        [currentEvent?.imageId, eventImageFallbackUrl],
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
        () => buildDivisionDisplayNameIndex(currentEvent?.divisionDetails),
        [currentEvent?.divisionDetails],
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
    }, [currentEvent?.divisions, currentEvent?.sport, currentEvent?.sportId, allDivisionOptions]);
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
        const useRelativeDueDates = currentEvent?.eventType === 'WEEKLY_EVENT' && !currentEvent?.parentEvent;
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
        currentEvent?.eventType,
        currentEvent?.parentEvent,
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

    const isActive = renderInline ? Boolean(isOpen) : isOpen;
    const todayForDob = new Date();
    const maxAuthDob = `${todayForDob.getFullYear()}-${String(todayForDob.getMonth() + 1).padStart(2, '0')}-${String(todayForDob.getDate()).padStart(2, '0')}`;

    useEffect(() => {
        if (!isActive || !renderInline) {
            setJoinCardDocked(false);
            return undefined;
        }

        const updateJoinCardDock = () => {
            const anchor = joinCardAnchorRef.current;
            const card = joinCardRef.current;
            if (!anchor || !card || window.innerWidth < 1024) {
                setJoinCardDocked(false);
                return;
            }

            const anchorRect = anchor.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            const measuredHeight = cardRect.height || joinCardHeight;
            const holdingBottomGap = 96;
            const holdingTop = Math.max(24, window.innerHeight - measuredHeight - holdingBottomGap);

            setJoinCardHeight(measuredHeight);
            setJoinCardLeft(anchorRect.left);
            setJoinCardWidth(anchorRect.width);
            setJoinCardDocked(anchorRect.top <= holdingTop);
        };

        updateJoinCardDock();
        window.addEventListener('scroll', updateJoinCardDock, { passive: true });
        window.addEventListener('resize', updateJoinCardDock);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && joinCardRef.current) {
            resizeObserver = new ResizeObserver(updateJoinCardDock);
            resizeObserver.observe(joinCardRef.current);
        }

        return () => {
            window.removeEventListener('scroll', updateJoinCardDock);
            window.removeEventListener('resize', updateJoinCardDock);
            resizeObserver?.disconnect();
        };
    }, [isActive, joinCardHeight, renderInline]);

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
    const handleAuthModalSubmit = useCallback((submitEvent: React.FormEvent<HTMLFormElement>) => {
        submitEvent.preventDefault();
        return submitAuthModal();
    }, [submitAuthModal]);

    useEffect(() => {
        if (!isActive || !currentEvent?.hostId) {
            setHostUser(null);
            return;
        }
        const hostId = currentEvent.hostId;

        let cancelled = false;

        const loadHostUser = async () => {
            try {
                const resolvedHost = await userService.getUserById(hostId, { eventId: currentEvent.$id });
                if (!cancelled) {
                    setHostUser(resolvedHost ?? null);
                }
            } catch (error) {
                console.error('Failed to load host user:', error);
                if (!cancelled) {
                    setHostUser(null);
                }
            }
        };

        void loadHostUser();

        return () => {
            cancelled = true;
        };
    }, [currentEvent?.$id, currentEvent?.hostId, isActive]);

    useEffect(() => {
        if (!isActive || !user) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const targetEvent = currentEvent ?? event;
        if (!targetEvent || !targetEvent.teamSignup) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const managedTeams = getManagedUserTeamsForEvent(cachedUserTeams, targetEvent, user.$id);
        setUserTeams(managedTeams);
        setIsLoadingTeams(userTeamsLoading && managedTeams.length === 0);
    }, [cachedUserTeams, currentEvent, event, isActive, user, userTeamsLoading]);

    useEffect(() => {
        if (!isActive || !user) {
            setChildren([]);
            setChildrenLoading(false);
            setChildrenError(null);
            return;
        }

        let cancelled = false;
        setChildrenLoading(true);
        setChildrenError(null);

        const loadChildren = async () => {
            try {
                const result = await familyService.listChildren();
                if (!cancelled) {
                    setChildren(result);
                }
            } catch (error) {
                if (!cancelled) {
                    setChildren([]);
                    setChildrenError(error instanceof Error ? error.message : 'Failed to load children.');
                }
            } finally {
                if (!cancelled) {
                    setChildrenLoading(false);
                }
            }
        };

        loadChildren();

        return () => {
            cancelled = true;
        };
    }, [isActive, user]);

    useEffect(() => {
        if (!divisionOptions.length) {
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
            return;
        }

        setSelectedDivisionId((previous) => {
            if (previous && divisionOptions.some((option) => option.id === previous)) {
                return previous;
            }
            return divisionOptions[0].id;
        });

        setSelectedDivisionTypeKey((previous) => {
            if (previous && divisionOptions.some((option) => option.divisionTypeKey === previous)) {
                return previous;
            }
            return divisionOptions[0].divisionTypeKey;
        });
    }, [divisionOptions]);

    const loadEventDetails = useCallback(async (eventId?: string, options: LoadEventDetailsOptions = {}) => {
        const sourceEvent = eventRef.current;
        const targetId = eventId ?? sourceEvent?.$id;
        if (!targetId) return;

        const selectedOccurrence = selectedWeeklyOccurrenceSlotId && selectedWeeklyOccurrenceDate
            ? {
                slotId: selectedWeeklyOccurrenceSlotId,
                occurrenceDate: selectedWeeklyOccurrenceDate,
            }
            : undefined;
        const loadKey = buildEventDetailsLoadKey(targetId, selectedOccurrence);
        if (options.automatic && loadKey && loadedEventDetailsKeyRef.current === loadKey) {
            return;
        }
        if (options.automatic) {
            loadedEventDetailsKeyRef.current = loadKey;
        }

        const requestGeneration = eventDetailsRequestGenerationRef.current + 1;
        eventDetailsRequestGenerationRef.current = requestGeneration;
        const normalizedTargetId = normalizeRequestToken(targetId);
        const isCurrentRequest = () => (
            eventDetailsRequestGenerationRef.current === requestGeneration
            && normalizeRequestToken(eventRef.current?.$id) === normalizedTargetId
        );

        setIsLoadingEvent(true);
        try {
            // Fetch full event with relationships for accurate editing context
            let latest = renderInline ? sourceEvent : await eventService.getEventWithRelations(targetId);
            if (!isCurrentRequest()) {
                return;
            }
            if (!latest && !renderInline) {
                latest = await eventService.getEvent(targetId);
                if (!isCurrentRequest()) {
                    return;
                }
            }
            const baseEvent = latest || sourceEvent;
            if (!baseEvent) {
                return;
            }

            let resolvedEvent = baseEvent;
            let eventPlayers: UserData[] = Array.isArray(baseEvent.players) ? (baseEvent.players as UserData[]) : [];
            let eventTeams: Team[] = Array.isArray(baseEvent.teams) ? (baseEvent.teams as Team[]) : [];
            let eventFreeAgents: UserData[] = [];

            if (baseEvent.eventType === 'WEEKLY_EVENT' && !baseEvent.parentEvent) {
                if (selectedOccurrence?.slotId && selectedOccurrence?.occurrenceDate) {
                    try {
                        const snapshot = await eventService.getEventParticipants(targetId, selectedOccurrence);
                        if (!isCurrentRequest()) {
                            return;
                        }
                        const failedState = collectPaymentFailedRegistrationState(snapshot.registrations, user?.$id ?? null);
                        setCurrentUserPaymentFailed(failedState.userFailed);
                        setPaymentFailedTeamIds(failedState.teamIds);
                        const refreshedTeamIds = Array.from(new Set(
                            (snapshot.participants.teamIds ?? [])
                                .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                                .filter((teamId): teamId is string => teamId.length > 0),
                        ));
                        const participantUserIds = Array.from(new Set(
                            (snapshot.participants.userIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));
                        const waitListIds = Array.from(new Set(
                            (snapshot.participants.waitListIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));
                        const freeAgentIds = Array.from(new Set(
                            (snapshot.participants.freeAgentIds ?? [])
                                .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                                .filter((userId): userId is string => userId.length > 0),
                        ));

                        const teamsById = new Map((snapshot.teams ?? []).map((team) => [team.$id, team]));
                        const orderedTeams = refreshedTeamIds
                            .map((teamId) => teamsById.get(teamId))
                            .filter((team): team is Team => Boolean(team));
                        const usersById = new Map((snapshot.users ?? []).map((participant) => [participant.$id, participant]));
                        const orderedUsers = participantUserIds
                            .map((userId) => usersById.get(userId))
                            .filter((participant): participant is UserData => Boolean(participant));
                        const orderedFreeAgents = freeAgentIds
                            .map((userId) => usersById.get(userId))
                            .filter((participant): participant is UserData => Boolean(participant));

                        resolvedEvent = {
                            ...baseEvent,
                            teamIds: refreshedTeamIds,
                            teams: orderedTeams,
                            userIds: participantUserIds,
                            players: orderedUsers,
                            waitListIds,
                            freeAgentIds,
                            participantCount: snapshot.participantCount,
                            participantCapacity: snapshot.participantCapacity ?? undefined,
                        } as Event;
                        eventPlayers = orderedUsers;
                        eventTeams = orderedTeams;
                        eventFreeAgents = orderedFreeAgents;
                    } catch (error) {
                        console.error('Failed to load weekly session participants:', error);
                        setCurrentUserPaymentFailed(false);
                        setPaymentFailedTeamIds([]);
                        resolvedEvent = {
                            ...baseEvent,
                            teamIds: [],
                            teams: [],
                            userIds: [],
                            players: [],
                            waitListIds: [],
                            freeAgentIds: [],
                        } as Event;
                        eventPlayers = [];
                        eventTeams = [];
                        eventFreeAgents = [];
                    }
                } else {
                    setCurrentUserPaymentFailed(false);
                    setPaymentFailedTeamIds([]);
                    resolvedEvent = {
                        ...baseEvent,
                        teamIds: [],
                        teams: [],
                        userIds: [],
                        players: [],
                        waitListIds: [],
                        freeAgentIds: [],
                    } as Event;
                    eventPlayers = [];
                    eventTeams = [];
                    eventFreeAgents = [];
                }
            } else {
                try {
                    const snapshot = await eventService.getEventParticipants(targetId);
                    if (!isCurrentRequest()) {
                        return;
                    }
                    const failedState = collectPaymentFailedRegistrationState(snapshot.registrations, user?.$id ?? null);
                    setCurrentUserPaymentFailed(failedState.userFailed);
                    setPaymentFailedTeamIds(failedState.teamIds);
                    const refreshedTeamIds = Array.from(new Set(
                        (snapshot.participants.teamIds ?? [])
                            .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                            .filter((teamId): teamId is string => teamId.length > 0),
                    ));
                    const participantUserIds = Array.from(new Set(
                        (snapshot.participants.userIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const waitListIds = Array.from(new Set(
                        (snapshot.participants.waitListIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const freeAgentIds = Array.from(new Set(
                        (snapshot.participants.freeAgentIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const snapshotTeams = (snapshot.teams ?? [])
                        .map((team) => ({
                            ...team,
                            $id: typeof team.$id === 'string' && team.$id.trim().length > 0
                                ? team.$id
                                : String((team as any).id ?? ''),
                        }))
                        .filter((team): team is Team => team.$id.length > 0);
                    const snapshotUsers = (snapshot.users ?? [])
                        .map((participant) => ({
                            ...participant,
                            $id: typeof participant.$id === 'string' && participant.$id.trim().length > 0
                                ? participant.$id
                                : String((participant as any).id ?? ''),
                        }))
                        .filter((participant): participant is UserData => participant.$id.length > 0);
                    const teamsById = new Map(snapshotTeams.map((team) => [team.$id, team]));
                    const orderedTeams = refreshedTeamIds
                        .map((teamId) => teamsById.get(teamId))
                        .filter((team): team is Team => Boolean(team));
                    const usersById = new Map(snapshotUsers.map((participant) => [participant.$id, participant]));
                    const orderedUsers = participantUserIds
                        .map((userId) => usersById.get(userId))
                        .filter((participant): participant is UserData => Boolean(participant));
                    const orderedFreeAgents = freeAgentIds
                        .map((userId) => usersById.get(userId))
                        .filter((participant): participant is UserData => Boolean(participant));

                    resolvedEvent = {
                        ...baseEvent,
                        teamIds: refreshedTeamIds,
                        teams: orderedTeams,
                        userIds: participantUserIds,
                        players: orderedUsers,
                        waitListIds,
                        freeAgentIds,
                        participantCount: snapshot.participantCount,
                        participantCapacity: snapshot.participantCapacity ?? undefined,
                    } as Event;
                    eventPlayers = orderedUsers;
                    eventTeams = orderedTeams;
                    eventFreeAgents = orderedFreeAgents;
                } catch (error) {
                    console.error('Failed to load event participants:', error);
                    setCurrentUserPaymentFailed(false);
                    setPaymentFailedTeamIds([]);
                    const freeAgentIds = collectUniqueUserIds(baseEvent.freeAgentIds);
                    const shouldLoadFreeAgents = Boolean(baseEvent.teamSignup) && freeAgentIds.length > 0;

                    if (shouldLoadFreeAgents) {
                        try {
                            eventFreeAgents = await userService.getUsersByIds(freeAgentIds, { eventId: baseEvent.$id });
                            if (!isCurrentRequest()) {
                                return;
                            }
                        } catch (freeAgentError) {
                            if (!isCurrentRequest()) {
                                return;
                            }
                            console.error('Failed to load free agents:', freeAgentError);
                            eventFreeAgents = [];
                        }
                    }
                }
            }

            if (!isCurrentRequest()) {
                return;
            }
            setDetailedEvent(resolvedEvent);
            setPlayers(eventPlayers);
            const isSchedulableSlotEvent = resolvedEvent.eventType === 'LEAGUE' || resolvedEvent.eventType === 'TOURNAMENT';
            const filteredTeams = isSchedulableSlotEvent
                ? eventTeams.filter((team) => typeof team.parentTeamId === 'string' && team.parentTeamId.trim().length > 0)
                : eventTeams;
            setTeams(filteredTeams);
            setFreeAgents(eventFreeAgents);

        } catch (error) {
            if (!isCurrentRequest()) {
                return;
            }
            console.error('Failed to load event details:', error);
        } finally {
            if (isCurrentRequest()) {
                setIsLoadingEvent(false);
            }
        }
    }, [renderInline, selectedWeeklyOccurrenceDate, selectedWeeklyOccurrenceSlotId, user?.$id]);

    useEffect(() => {
        eventRef.current = event;
        setDetailedEvent((previous) => {
            if (!event || !previous || previous.$id !== event.$id) {
                return previous;
            }
            return {
                ...previous,
                fieldIds: Array.isArray(event.fieldIds) ? event.fieldIds : previous.fieldIds,
                fields: Array.isArray(event.fields) ? event.fields : previous.fields,
                timeSlotIds: Array.isArray(event.timeSlotIds) ? event.timeSlotIds : previous.timeSlotIds,
                timeSlots: Array.isArray(event.timeSlots) ? event.timeSlots : previous.timeSlots,
                divisions: Array.isArray(event.divisions) ? event.divisions : previous.divisions,
                divisionDetails: Array.isArray(event.divisionDetails) ? event.divisionDetails : previous.divisionDetails,
                playoffDivisionDetails: Array.isArray(event.playoffDivisionDetails)
                    ? event.playoffDivisionDetails
                    : previous.playoffDivisionDetails,
            } as Event;
        });
    }, [event]);

    useEffect(() => {
        if (isActive && event) {
            setDetailedEvent(event);
            void loadEventDetails(event.$id, { automatic: true });
        } else {
            loadedEventDetailsKeyRef.current = null;
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setFreeAgents([]);
            setCurrentUserPaymentFailed(false);
            setPaymentFailedTeamIds([]);
            setIsLoadingEvent(false);
            setIsLoadingTeams(false);
            setJoinError(null); // Reset error when modal closes
            setJoinNotice(null);
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            setShowCapacityBreakdown(false);
            setPassword('');
            setPasswordError(null);
            setConfirmingPassword(false);
            setRecordingSignature(false);
            setTextAccepted(false);
            setChildren([]);
            setChildrenLoading(false);
            setChildrenError(null);
            setSelectedChildId('');
            setRegisteringChild(false);
            setJoiningChildFreeAgent(false);
            setChildRegistration(null);
            setChildConsent(null);
            setChildRegistrationChildId(null);
            setShowRegistrationQuestionsModal(false);
            setRegistrationQuestions([]);
            setRegistrationQuestionAnswers({});
            setRegistrationQuestionsIntent(null);
            setPaymentPlanPreview(null);
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
        }

        return () => {
            eventDetailsRequestGenerationRef.current += 1;
        };
    }, [event, event?.$id, isActive, loadEventDetails]);

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
    }, [clearEventRegistrationProgress, publicCompletion?.redirectUrl, publicCompletion?.slug, router]);

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }

        const priceCents = normalizePriceCents(selectedDivisionBilling.priceCents);
        if (priceCents <= 0) {
            throw new Error('This event does not have a price set for a payment plan.');
        }

        const installmentAmounts = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentAmountsCents(selectedDivisionBilling.installmentAmounts)
            : [];
        const installmentDueDates = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentDueDateValues(selectedDivisionBilling.installmentDueDates)
            : [];
        const installmentDueRelativeDays = selectedDivisionBilling.allowPaymentPlans
            ? normalizeInstallmentDueRelativeDayValues(selectedDivisionBilling.installmentDueRelativeDays)
            : [];
        const useRelativeDueDates = currentEvent.eventType === 'WEEKLY_EVENT' && !currentEvent.parentEvent;
        if (useRelativeDueDates) {
            if (!selectedWeeklyOccurrence?.slotId || !selectedWeeklyOccurrence?.occurrenceDate) {
                throw new Error('Select a weekly session before starting a payment plan.');
            }
            if (installmentDueRelativeDays.length !== installmentAmounts.length) {
                throw new Error('Weekly payment plans need a due date offset for each installment.');
            }
        }

        return billService.createBill({
            ownerType,
            ownerId,
            totalAmountCents: priceCents,
            eventId: currentEvent.$id,
            slotId: useRelativeDueDates ? selectedWeeklyOccurrence?.slotId ?? null : null,
            occurrenceDate: useRelativeDueDates ? selectedWeeklyOccurrence?.occurrenceDate ?? null : null,
            organizationId: currentEvent.organizationId ?? null,
            installmentAmounts,
            installmentDueDates: useRelativeDueDates ? [] : installmentDueDates,
            installmentDueRelativeDays: useRelativeDueDates ? installmentDueRelativeDays : [],
            allowSplit: ownerType === 'TEAM' ? Boolean(currentEvent.allowTeamSplitDefault) : false,
            paymentPlanEnabled: true,
            timeoutMs: JOIN_API_TIMEOUT_MS,
            event: {
                $id: currentEvent.$id,
                start: currentEvent.start,
                price: priceCents,
                installmentAmounts,
                installmentDueDates: useRelativeDueDates ? [] : installmentDueDates,
                installmentDueRelativeDays: useRelativeDueDates ? installmentDueRelativeDays : [],
            },
            user,
        });
    }, [currentEvent, selectedDivisionBilling, selectedWeeklyOccurrence, user]);

    const registerChildForEvent = useCallback(async (
        childId: string,
        selection: DivisionSelectionPayload = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }
        const resolvedSelection = selectedWeeklyOccurrence
            ? {
                ...selection,
                slotId: selectedWeeklyOccurrence.slotId ?? undefined,
                occurrenceDate: selectedWeeklyOccurrence.occurrenceDate ?? undefined,
            }
            : selection;

        setRegisteringChild(true);
        try {
            const result = await registrationService.registerChildForEvent(currentEvent.$id, childId, resolvedSelection, answers);
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
            await loadEventDetails();
            if (registrationStatus === 'active') {
                navigateToPublicEventCompletion();
            }
        } finally {
            setRegisteringChild(false);
        }
    }, [currentEvent, loadEventDetails, navigateToPublicEventCompletion, selectedWeeklyOccurrence]);

    const loadRequiredSignLinksForIntent = useCallback(async (intent: JoinIntent): Promise<SignStep[]> => {
        if (!currentEvent || !user || !authUser?.email) {
            throw new Error('Sign-in email is required to sign documents.');
        }

        const signerContext: 'participant' | 'parent_guardian' = isChildJoinIntent(intent)
            ? 'parent_guardian'
            : 'participant';

        const parentLinks = await boldsignService.createSignLinks({
            eventId: currentEvent.$id,
            user,
            userEmail: authUser.email,
            signerContext,
            childUserId: intent.childId,
            childEmail: intent.childEmail ?? undefined,
            timeoutMs: JOIN_API_TIMEOUT_MS,
        });

        const shouldCollectChildSignatureInSameSession = isChildJoinIntent(intent) && Boolean(
            intent.childId
            && normalizeEmailValue(authUser.email)
            && normalizeEmailValue(intent.childEmail ?? null)
            && normalizeEmailValue(authUser.email) === normalizeEmailValue(intent.childEmail ?? null),
        );

        if (!shouldCollectChildSignatureInSameSession || !intent.childId) {
            return dedupeSignSteps(parentLinks, signerContext);
        }

        const childLinks = await boldsignService.createSignLinks({
            eventId: currentEvent.$id,
            user,
            userEmail: authUser.email,
            signerContext: 'child',
            childUserId: intent.childId,
            childEmail: intent.childEmail ?? undefined,
            timeoutMs: JOIN_API_TIMEOUT_MS,
        });

        return dedupeSignSteps([...parentLinks, ...childLinks], signerContext);
    }, [authUser?.email, currentEvent, user]);

    const beginSigningFlow = useCallback(async (intent: JoinIntent) => {
        if (!currentEvent || !user) {
            return false;
        }
        const requiredTemplateIds = Array.isArray(currentEvent.requiredTemplateIds)
            ? currentEvent.requiredTemplateIds
            : [];
        if (!requiredTemplateIds.length) {
            return false;
        }
        if (!authUser?.email) {
            throw new Error('Sign-in email is required to sign documents.');
        }
        const links = await loadRequiredSignLinksForIntent(intent);
        if (!links.length) {
            setPendingJoin(null);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            return false;
        }

        setPendingJoin(intent);
        setSignLinks(links);
        setCurrentSignIndex(0);
        setPassword('');
        setPasswordError(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setShowPasswordModal(true);
        return true;
    }, [authUser?.email, currentEvent, loadRequiredSignLinksForIntent, user]);

    const startEventCheckout = useCallback(async ({
        event: checkoutEvent,
        team,
        eventRegistration,
        selection,
        answers,
        discountCode: checkoutDiscountCode,
        billingAddress,
    }: PendingEventCheckoutState & {
        billingAddress?: BillingAddress;
    }) => {
        if (!user) {
            throw new Error('You must be signed in to continue.');
        }

        try {
            const paymentIntent = await paymentService.createPaymentIntent(
                user,
                checkoutEvent,
                team,
                undefined,
                undefined,
                selection,
                billingAddress,
                selectedWeeklyOccurrence,
                answers,
                (checkoutDiscountCode ?? discountCode).trim() || null,
                eventRegistration,
            );
            const holdExpiresAt = paymentIntent.registrationHoldExpiresAt ?? null;
            setRegistrationHoldExpiresAt(holdExpiresAt);
            saveEventRegistrationProgress({
                step: 'checkout',
                answers: answers?.reduce<Record<string, string>>((acc, answer) => {
                    acc[answer.questionId] = answer.answer;
                    return acc;
                }, {}) ?? registrationQuestionAnswers,
                selectedTeamId: (team?.$id ?? selectedTeamId) || null,
                selectedDivisionId: (selection?.divisionId ?? selectedDivisionId) || null,
                selectedDivisionTypeKey: (selection?.divisionTypeKey ?? selectedDivisionTypeKey) || null,
                registrationId: paymentIntent.registrationId ?? null,
                holdExpiresAt,
            });
            setPaymentData(paymentIntent);
            setShowPaymentModal(true);
            setPendingEventCheckout(null);
            setShowBillingAddressModal(false);
            setShowCheckoutPreviewModal(false);
            setDiscountPreview(null);
            setDiscountPreviewError(null);
        } catch (error) {
            if (
                isApiRequestError(error)
                && error.data
                && typeof error.data === 'object'
                && 'billingAddressRequired' in error.data
                && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
            ) {
                setPendingEventCheckout({
                    event: checkoutEvent,
                    team,
                    eventRegistration,
                    selection,
                    answers,
                    discountCode: checkoutDiscountCode ?? discountCode,
                });
                setShowBillingAddressModal(true);
                setShowCheckoutPreviewModal(false);
                return;
            }
            throw error;
        }
    }, [
        registrationQuestionAnswers,
        saveEventRegistrationProgress,
        selectedDivisionId,
        selectedDivisionTypeKey,
        selectedTeamId,
        selectedWeeklyOccurrence,
        discountCode,
        user,
    ]);

    const prepareEventCheckout = useCallback(async (checkout: PendingEventCheckoutState) => {
        setPendingEventCheckout(checkout);
        setDiscountCode(checkout.discountCode?.trim() ?? '');
        setDiscountPreview(null);
        setDiscountPreviewError(null);
        setJoinError(null);

        try {
            const profile = await billingAddressService.getBillingAddressProfile();
            if (!hasCompleteBillingAddress(profile.billingAddress)) {
                setShowCheckoutPreviewModal(false);
                setShowBillingAddressModal(true);
                return;
            }
            setShowBillingAddressModal(false);
            setShowCheckoutPreviewModal(true);
        } catch (error) {
            setShowCheckoutPreviewModal(false);
            setShowBillingAddressModal(true);
        }
    }, []);

    const handleApplyDiscountPreview = useCallback(async () => {
        if (!pendingEventCheckout || !user) {
            return;
        }
        const normalizedCode = discountCode.trim();
        if (!normalizedCode) {
            setDiscountPreview(null);
            setDiscountPreviewError(null);
            return;
        }

        setDiscountPreviewLoading(true);
        setDiscountPreviewError(null);
        try {
            const preview = await paymentService.previewEventDiscount({
                user,
                event: pendingEventCheckout.event,
                team: pendingEventCheckout.team,
                selection: pendingEventCheckout.selection,
                occurrence: selectedWeeklyOccurrence,
                answers: pendingEventCheckout.answers,
                discountCode: normalizedCode,
                eventRegistration: pendingEventCheckout.eventRegistration,
            });
            setDiscountPreview(preview);
            setDiscountCode(preview.code ?? normalizedCode);
        } catch (error) {
            setDiscountPreview(null);
            setDiscountPreviewError(error instanceof Error ? error.message : 'Unable to apply discount code.');
        } finally {
            setDiscountPreviewLoading(false);
        }
    }, [discountCode, pendingEventCheckout, selectedWeeklyOccurrence, user]);

    const ensureWeeklyOccurrenceSelected = useCallback((message: string = 'Select a weekly session before continuing.') => {
        if (!weeklySelectionRequired) {
            return true;
        }
        setJoinError(message);
        return false;
    }, [weeklySelectionRequired]);

    const completeChildRegistration = useCallback(async (
        childId: string,
        selection: DivisionSelectionPayload = {},
        answers?: RegistrationQuestionAnswerInput[],
    ) => {
        if (!currentEvent || !user) {
            throw new Error('Event is not loaded.');
        }

        const childPriceCents = normalizePriceCents(selectedDivisionBilling.priceCents);
        if (childPriceCents > 0) {
            if (currentEvent.registrationPaymentMode === 'MANUAL') {
                throw new Error('Child registration requires payment. Manual child payment checkout is not available yet.');
            }
            if (selectedDivisionBilling.allowPaymentPlans) {
                throw new Error('Child registration requires payment. Payment plans for child registration are not available yet.');
            }
            await prepareEventCheckout({
                event: checkoutEvent ?? currentEvent,
                selection,
                answers,
                eventRegistration: {
                    registrantId: childId,
                    registrantType: 'CHILD',
                    parentId: user.$id,
                },
            });
            return;
        }

        await registerChildForEvent(childId, selection, answers);
    }, [
        checkoutEvent,
        currentEvent,
        registerChildForEvent,
        selectedDivisionBilling.allowPaymentPlans,
        selectedDivisionBilling.priceCents,
            prepareEventCheckout,
            user,
        ]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !currentEvent) return;
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
        const selection = resolvedDivisionSelectionPayload;
        trackEventRegistrationStarted(currentEvent, getJoinIntentRegistrationType(intent), {
            division_id: selection?.divisionId,
            division_type_id: selection?.divisionTypeId,
            slot_id: selectedWeeklyOccurrence?.slotId,
            occurrence_date: selectedWeeklyOccurrence?.occurrenceDate,
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
            await eventService.addFreeAgent(currentEvent.$id, intent.childId, selectedWeeklyOccurrence);
            setJoinNotice('Child added to free agent list.');
            await loadEventDetails();
            return;
        }
        if (intent.mode === 'child_waitlist') {
            if (!intent.childId) {
                throw new Error('Select a child to add to waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, intent.childId, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Child added to waitlist.');
            await loadEventDetails();
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
                return userTeams.find((team) => team.$id === selectedTeamId) ?? ({ $id: selectedTeamId } as Team);
            }
            return undefined;
        })();

        const totalParticipants = currentEvent.teamSignup ? teams.length : players.length;
        const participantCapacity = resolveEventParticipantCapacity(currentEvent);
        const eventAtCapacity = participantCapacity > 0 && totalParticipants >= participantCapacity;
        const joinAtCapacity = eventAtCapacity || selectedDivisionAtCapacity;

        if (joinAtCapacity && intent.mode === 'user') {
            await eventService.addToWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (joinAtCapacity && intent.mode === 'team') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, resolvedTeam.$id, 'team', selectedWeeklyOccurrence);
            setJoinNotice('Team added to waitlist.');
            await loadEventDetails();
            return;
        }

        const shouldRegisterSelf = intent.mode === 'user'
            && !currentEvent.teamSignup
            && (isFreeForUser || selectedDivisionBilling.allowPaymentPlans);
        let registrationResult: EventRegistration | null = null;
        const isManualPaidRegistration = currentEvent.registrationPaymentMode === 'MANUAL'
            && !isFreeForUser
            && (intent.mode === 'user' || intent.mode === 'team');

        if (shouldRegisterSelf) {
            const result = await registrationService.registerSelfForEvent(currentEvent.$id, selection, intent.answers);
            registrationResult = result.registration ?? null;
            if (registrationResult?.status && registrationResult.status !== 'active') {
                setJoinNotice(`Registration status: ${registrationResult.status}`);
            }
        }

        if (intent.mode === 'user_waitlist') {
            await eventService.addToWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
            setJoinNotice('Added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (intent.mode === 'team_waitlist') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, resolvedTeam.$id, 'team', selectedWeeklyOccurrence);
            setJoinNotice('Team added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (isManualPaidRegistration) {
            const joinTeam = intent.mode === 'team' ? resolvedTeam : undefined;
            if (intent.mode === 'team' && !joinTeam?.$id) {
                throw new Error('Team is required to register.');
            }
            const joinResult = await paymentService.joinEvent(
                user,
                checkoutEvent ?? currentEvent,
                joinTeam,
                selection,
                JOIN_API_TIMEOUT_MS,
                selectedWeeklyOccurrence,
                intent.answers,
            );
            const billId = joinResult?.bill?.$id ?? (joinResult?.bill as any)?.id;
            if (!billId) {
                throw new Error('Registration was created, but no manual payment bill was returned.');
            }
            const fullBill = await billService.getBill(billId);
            setManualPaymentBill(fullBill ?? joinResult?.bill ?? null);
            setShowManualPaymentModal(true);
            setJoinNotice('Registration started. Send payment to the host, then upload proof for review.');
            await loadEventDetails();
            return;
        }

        if (selectedDivisionBilling.allowPaymentPlans) {
            const eventForJoin = checkoutEvent ?? currentEvent;
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
                    JOIN_API_TIMEOUT_MS,
                    selectedWeeklyOccurrence,
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
                            JOIN_API_TIMEOUT_MS,
                            selectedWeeklyOccurrence,
                        );
                    } catch (rollbackError) {
                        console.error('Failed to rollback payment-plan join after billing error', rollbackError);
                    }
                    throw new Error(message);
                }
            }

            await loadEventDetails();
            navigateToPublicEventCompletion();
            return;
        }

        if (isFreeForUser) {
            if (!shouldRegisterSelf) {
                await paymentService.joinEvent(
                    user,
                    checkoutEvent ?? currentEvent,
                    resolvedTeam,
                    selection,
                    JOIN_API_TIMEOUT_MS,
                    selectedWeeklyOccurrence,
                    intent.answers,
                );
            }
            await loadEventDetails();
            const selfRegistrationPending = Boolean(
                shouldRegisterSelf
                && registrationResult?.status
                && registrationResult.status !== 'active',
            );
            if (!selfRegistrationPending) {
                navigateToPublicEventCompletion();
            }
        } else {
            await prepareEventCheckout({
                event: checkoutEvent ?? currentEvent,
                team: resolvedTeam,
                selection,
                answers: intent.answers,
            });
        }
    }, [
        checkoutEvent,
        completeChildRegistration,
        createBillForOwner,
        currentEvent,
        ensureWeeklyOccurrenceSelected,
        isDivisionSelectionMissing,
        isFreeForUser,
        loadEventDetails,
        navigateToPublicEventCompletion,
        players.length,
        registrationByDivisionType,
        resolvedDivisionSelectionPayload,
        selectedDivisionBilling.allowPaymentPlans,
        selectedDivisionAtCapacity,
        selectedTeamId,
        selectedWeeklyOccurrence,
        prepareEventCheckout,
        teams.length,
        user,
        userTeams,
    ]);

    const buildRegistrationQuestionAnswers = useCallback((): RegistrationQuestionAnswerInput[] => (
        registrationQuestions.map((question) => ({
            questionId: question.id,
            answer: registrationQuestionAnswers[question.id] ?? '',
        }))
    ), [registrationQuestionAnswers, registrationQuestions]);

    const validateRegistrationQuestionAnswers = useCallback((): string | null => {
        const missingRequired = registrationQuestions.find((question) => (
            Boolean(question.required) && String(registrationQuestionAnswers[question.id] ?? '').trim().length === 0
        ));
        if (missingRequired) {
            return `Answer "${missingRequired.prompt}" before continuing.`;
        }
        return null;
    }, [registrationQuestionAnswers, registrationQuestions]);

    const shouldAskRegistrationQuestions = useCallback((intent: JoinIntent): boolean => (
        registrationQuestions.length > 0
        && !intent.answers
        && (intent.mode === 'user' || intent.mode === 'team' || intent.mode === 'child')
    ), [registrationQuestions.length]);

    const openRegistrationQuestionsStep = useCallback((intent: JoinIntent) => {
        setJoinError(null);
        setRegistrationQuestionsIntent(intent);
        setShowRegistrationQuestionsModal(true);
    }, []);

    const submitRegistrationQuestionsStep = useCallback(async () => {
        if (!registrationQuestionsIntent || !currentEvent || !user) {
            return;
        }
        const validationError = validateRegistrationQuestionAnswers();
        if (validationError) {
            setJoinError(validationError);
            return;
        }

        const answers = buildRegistrationQuestionAnswers();
        saveEventRegistrationProgress({
            step: 'signing',
            answers: registrationQuestionAnswers,
        });

        const intent: JoinIntent = {
            ...registrationQuestionsIntent,
            answers,
        };
        setShowRegistrationQuestionsModal(false);
        setRegistrationQuestionsIntent(null);
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (intent.mode === 'user' && isMinor) {
                trackEventRegistrationStarted(currentEvent, 'self', {
                    division_id: resolvedDivisionSelectionPayload?.divisionId,
                    division_type_id: resolvedDivisionSelectionPayload?.divisionTypeId,
                    slot_id: selectedWeeklyOccurrence?.slotId,
                    occurrence_date: selectedWeeklyOccurrence?.occurrenceDate,
                    requires_parent_approval: true,
                    answered_registration_questions: true,
                });
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload, intent.answers);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow(intent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(intent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to continue registration.');
            setShowRegistrationQuestionsModal(true);
            setRegistrationQuestionsIntent(intent);
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    }, [
        beginSigningFlow,
        buildRegistrationQuestionAnswers,
        currentEvent,
        finalizeJoin,
        isMinor,
        loadEventDetails,
        registrationQuestionsIntent,
        registrationQuestionAnswers,
        resolvedDivisionSelectionPayload,
        saveEventRegistrationProgress,
        selectedWeeklyOccurrence,
        user,
        validateRegistrationQuestionAnswers,
    ]);

    const cancelPasswordConfirmation = useCallback(() => {
        setShowPasswordModal(false);
        setPassword('');
        setPasswordError(null);
        setPendingJoin(null);
        setJoining(false);
        setJoinError('Password confirmation canceled.');
    }, []);

    const confirmPasswordAndStartSigning = useCallback(async () => {
        if (!pendingJoin || !currentEvent || !user || !authUser?.email) {
            return;
        }
        if (!password.trim()) {
            setPasswordError('Password is required.');
            return;
        }

        setConfirmingPassword(true);
        setPasswordError(null);
        setJoinError(null);
        setJoinNotice(null);
        let stage: 'confirm_password' | 'finalize_join' = 'confirm_password';
        try {
            stage = 'confirm_password';
            await apiRequest<{ ok: true }>('/api/documents/confirm-password', {
                method: 'POST',
                timeoutMs: JOIN_API_TIMEOUT_MS,
                body: {
                    email: authUser.email,
                    password,
                    eventId: currentEvent.$id,
                },
            });
            const links = signLinks.length ? signLinks : await loadRequiredSignLinksForIntent(pendingJoin);

            if (!links.length) {
                stage = 'finalize_join';
                setShowPasswordModal(false);
                setPassword('');
                const intent = pendingJoin;
                setPendingJoin(null);
                await finalizeJoin(intent);
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }

            setSignLinks(links);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowPasswordModal(false);
            setPassword('');
            setShowSignModal(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to confirm password.';
            if (stage === 'finalize_join') {
                setJoinError(message || 'Failed to complete registration.');
                setPendingJoin(null);
                setShowPasswordModal(false);
                setPassword('');
                setJoining(false);
                setJoiningChildFreeAgent(false);
                return;
            }
            setPasswordError(message);
        } finally {
            setConfirmingPassword(false);
        }
    }, [
        authUser?.email,
        currentEvent,
        finalizeJoin,
        loadRequiredSignLinksForIntent,
        password,
        pendingJoin,
        signLinks,
        user,
    ]);

    const recordSignature = useCallback(async (payload: {
        templateId: string;
        documentId: string;
        type: SignStep['type'];
        signerContext?: SignStep['signerContext'];
    }): Promise<{ operationId?: string; syncStatus?: string }> => {
        if (!user || !currentEvent) {
            throw new Error('User and event are required to sign documents.');
        }
        const fallbackSignerContext =
            pendingJoin?.mode === 'child' || pendingJoin?.mode === 'child_free_agent' || pendingJoin?.mode === 'child_waitlist'
                ? 'parent_guardian'
                : 'participant';
        const signerContext = payload.signerContext ?? fallbackSignerContext;
        const signingUserId = signerContext === 'child' && pendingJoin?.childId
            ? pendingJoin.childId
            : user.$id;
        const response = await fetch('/api/documents/record-signature', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                templateId: payload.templateId,
                documentId: payload.documentId,
                eventId: currentEvent.$id,
                type: payload.type,
                userId: signingUserId,
                childUserId: pendingJoin?.childId,
                signerContext,
                user,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.error) {
            throw new Error(result?.error || 'Failed to record signature.');
        }
        return {
            operationId: typeof result?.operationId === 'string' ? result.operationId : undefined,
            syncStatus: typeof result?.syncStatus === 'string' ? result.syncStatus : undefined,
        };
    }, [currentEvent, pendingJoin?.childId, pendingJoin?.mode, user]);

    const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type === 'TEXT') {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }
        if (!currentLink.documentId) {
            setJoinError('Missing document identifier for signature.');
            return;
        }

        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId: currentLink.documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(currentLink.documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to record signature.');
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setJoining(false);
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignatureOperationId, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks]);

    const handleTextAcceptance = useCallback(async () => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type !== 'TEXT') {
            return;
        }
        if (!textAccepted || pendingSignedDocumentId || pendingSignatureOperationId || recordingSignature) {
            return;
        }

        const documentId = currentLink.documentId || createId();
        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            const signatureResult = await recordSignature({
                templateId: currentLink.templateId,
                documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(documentId);
            setPendingSignatureOperationId(
                signatureResult.operationId || currentLink.operationId || null,
            );
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to record signature.');
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setJoining(false);
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignatureOperationId, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks, textAccepted]);

    useEffect(() => {
        setTextAccepted(false);
    }, [currentSignIndex, signLinks]);

    useEffect(() => {
        if (!showSignModal) {
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
                return;
            }
            const payload = event.data;
            let eventName = '';
            if (typeof payload === 'string') {
                eventName = payload;
            } else if (payload && typeof payload === 'object') {
                eventName = payload.event || payload.eventName || payload.type || payload.name || '';
            }
            const eventLabel = eventName.toString();
            if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
                return;
            }

            const documentId =
                (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
            void handleSignedDocument(
                typeof documentId === 'string' ? documentId : undefined
            );
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleSignedDocument, showSignModal]);

    useEffect(() => {
        if (!pendingSignatureOperationId) {
            return;
        }
        if (!currentEvent || !user) {
            return;
        }

        let cancelled = false;
        const startedAt = Date.now();
        const intervalMs = 1500;
        const timeoutMs = 90_000;

        const poll = async () => {
            try {
                const operation = await boldsignService.getOperationStatus(pendingSignatureOperationId);
                if (cancelled) {
                    return;
                }

                const status = String(operation.status ?? '').toUpperCase();
                if (status === 'CONFIRMED') {
                    const nextIndex = currentSignIndex + 1;
                    if (nextIndex < signLinks.length) {
                        setCurrentSignIndex(nextIndex);
                        setPendingSignedDocumentId(null);
                        setPendingSignatureOperationId(null);
                        setShowSignModal(true);
                        setJoinNotice(null);
                        return;
                    }

                    setPendingSignedDocumentId(null);
                    setPendingSignatureOperationId(null);
                    setSignLinks([]);
                    setCurrentSignIndex(0);
                    setShowSignModal(false);
                    setJoinNotice(null);
                    const intent = pendingJoin;
                    setPendingJoin(null);
                    if (intent) {
                        await finalizeJoin(intent);
                    }
                    setJoining(false);
                    setJoiningChildFreeAgent(false);
                    return;
                }

                if (status === 'FAILED' || status === 'FAILED_RETRYABLE' || status === 'TIMED_OUT') {
                    throw new Error(operation.error || 'Failed to synchronize signature status.');
                }

                if (Date.now() - startedAt > timeoutMs) {
                    throw new Error('Signature sync is delayed. Please try again shortly.');
                }
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const message = error instanceof Error ? error.message : 'Failed to confirm signature.';
                setJoinError(message || 'Failed to confirm signature.');
                setPendingSignedDocumentId(null);
                setPendingSignatureOperationId(null);
                setShowSignModal(false);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setPendingJoin(null);
                setJoining(false);
                setJoiningChildFreeAgent(false);
            }
        };

        const interval = window.setInterval(() => {
            void poll();
        }, intervalMs);
        void poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignatureOperationId, signLinks.length, user]);

    useEffect(() => {
        if (!pendingSignedDocumentId || !currentEvent || !user) {
            return;
        }
        if (pendingSignatureOperationId) {
            return;
        }

        let cancelled = false;
        const poll = async () => {
            try {
                const pendingLink = signLinks[currentSignIndex];
                const pendingSignerUserId = pendingLink?.signerContext === 'child' && pendingJoin?.childId
                    ? pendingJoin.childId
                    : user.$id;
                const signed = await signedDocumentService.isDocumentSigned(pendingSignedDocumentId, pendingSignerUserId);
                if (!signed || cancelled) {
                    return;
                }

                const nextIndex = currentSignIndex + 1;
                if (nextIndex < signLinks.length) {
                    setCurrentSignIndex(nextIndex);
                    setPendingSignedDocumentId(null);
                    setShowSignModal(true);
                    setJoinNotice(null);
                    return;
                }

                setPendingSignedDocumentId(null);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setShowSignModal(false);
                setJoinNotice(null);
                const intent = pendingJoin;
                setPendingJoin(null);
                if (intent) {
                    await finalizeJoin(intent);
                }
                setJoining(false);
                setJoiningChildFreeAgent(false);
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const message = error instanceof Error ? error.message : 'Failed to confirm signature.';
                setJoinError(message || 'Failed to confirm signature.');
                setPendingSignedDocumentId(null);
                setShowSignModal(false);
                setSignLinks([]);
                setCurrentSignIndex(0);
                setPendingJoin(null);
                setJoining(false);
                setJoiningChildFreeAgent(false);
            }
        };

        const interval = window.setInterval(poll, 1000);
        poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignatureOperationId, pendingSignedDocumentId, signLinks, user]);

    const handleRegisterChild = async () => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError(joinClosedMessage);
            return;
        }
        if (!ensureWeeklyOccurrenceSelected('Select a weekly session before registering a child.')) {
            return;
        }
        if (!selectedChildId) {
            setJoinError(isTeamSignup ? 'Select a child to add as a free agent.' : 'Select a child to register.');
            return;
        }
        const bypassEligibilityCheck = (isTeamSignup && selectedChildIsFreeAgent) || (!isTeamSignup && selectedChildIsWaitlisted);
        if (!selectedChildEligible && !bypassEligibilityCheck) {
            setJoinError('Selected child is not eligible for this event.');
            return;
        }
        if (isTeamSignup) {
            setJoinError(null);
            setJoinNotice(null);
            setJoiningChildFreeAgent(true);
            try {
                if (selectedChildIsFreeAgent) {
                    await eventService.removeFreeAgent(currentEvent.$id, selectedChildId, selectedWeeklyOccurrence);
                    setJoinNotice('Child removed from free agent list.');
                } else {
                    const signingStarted = await beginSigningFlow({
                        mode: 'child_free_agent',
                        childId: selectedChildId,
                        childEmail: selectedChild?.email ?? null,
                    });
                    if (signingStarted) {
                        return;
                    }
                    await finalizeJoin({
                        mode: 'child_free_agent',
                        childId: selectedChildId,
                        childEmail: selectedChild?.email ?? null,
                    });
                    return;
                }
                await loadEventDetails();
            } catch (error) {
                setJoinError(error instanceof Error ? error.message : 'Failed to update child free agent status.');
            } finally {
                setJoiningChildFreeAgent(false);
            }
            return;
        }
        const eventCapacity = resolveEventParticipantCapacity(currentEvent);
        const eventWaitlistMode = (eventCapacity > 0 && players.length >= eventCapacity) || selectedChildIsWaitlisted;
        if (eventWaitlistMode) {
            setJoinError(null);
            setJoinNotice(null);
            try {
                if (selectedChildIsWaitlisted) {
                    setRegisteringChild(true);
                    await eventService.removeFromWaitlist(currentEvent.$id, selectedChildId, 'user', selectedWeeklyOccurrence);
                    setJoinNotice('Child removed from waitlist.');
                    await loadEventDetails();
                    return;
                }
                if (selectedChildIsRegistered) {
                    setJoinNotice('Child is already registered for this event.');
                    return;
                }
                const signingStarted = await beginSigningFlow({
                    mode: 'child_waitlist',
                    childId: selectedChildId,
                    childEmail: selectedChild?.email ?? null,
                });
                if (signingStarted) {
                    return;
                }
                await finalizeJoin({
                    mode: 'child_waitlist',
                    childId: selectedChildId,
                    childEmail: selectedChild?.email ?? null,
                });
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
            childEmail: selectedChild?.email ?? null,
        };
        if (shouldAskRegistrationQuestions(childIntent)) {
            openRegistrationQuestionsStep(childIntent);
            return;
        }
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow(childIntent);
            if (signingStarted) {
                return;
            }
            await finalizeJoin(childIntent);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to register child.');
        }
    };

    const openFreeAgentActions = useCallback((agent: UserData) => {
        setSelectedFreeAgentActionUser(agent);
    }, []);

    const handleInviteFreeAgentToTeam = useCallback(() => {
        if (!selectedFreeAgentActionUser || !currentEvent?.$id) {
            return;
        }
        const params = new URLSearchParams({
            event: currentEvent.$id,
            freeAgent: selectedFreeAgentActionUser.$id,
        });
        setShowFreeAgentsDropdown(false);
        setSelectedFreeAgentActionUser(null);
        router.push(`/teams?${params.toString()}`);
    }, [currentEvent?.$id, router, selectedFreeAgentActionUser]);

    // Update the join event handlers
    const handleJoinEvent = async (skipPaymentPlanPreview = false) => {
        if (!user || !currentEvent) return;
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
            && selectedDivisionBilling.allowPaymentPlans
            && normalizePriceCents(selectedDivisionBilling.priceCents) > 0
        ) {
            setPaymentPlanPreview({
                intent: { mode: 'user' },
                ownerLabel: 'You',
            });
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
                trackEventRegistrationStarted(currentEvent, 'self', {
                    division_id: resolvedDivisionSelectionPayload?.divisionId,
                    division_type_id: resolvedDivisionSelectionPayload?.divisionTypeId,
                    slot_id: selectedWeeklyOccurrence?.slotId,
                    occurrence_date: selectedWeeklyOccurrence?.occurrenceDate,
                    requires_parent_approval: true,
                });
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
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
        if (!user || !currentEvent) return;
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
                trackEventRegistrationStarted(currentEvent, 'waitlist', {
                    division_id: resolvedDivisionSelectionPayload?.divisionId,
                    division_type_id: resolvedDivisionSelectionPayload?.divisionTypeId,
                    slot_id: selectedWeeklyOccurrence?.slotId,
                    occurrence_date: selectedWeeklyOccurrence?.occurrenceDate,
                    requires_parent_approval: true,
                });
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, resolvedDivisionSelectionPayload);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
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
        if (!user || !currentEvent || !selectedTeamId) return;
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

        const team = userTeams.find((t) => t.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);
        let signingStarted = false;
        try {
            if (selectedTeamIsWaitlisted) {
                await eventService.removeFromWaitlist(currentEvent.$id, selectedTeamId, 'team', selectedWeeklyOccurrence);
                setJoinNotice('Team removed from waitlist.');
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow({ mode: 'team_waitlist', team });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'team_waitlist', team });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to update team waitlist status');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    // Team-signup: join as team or free agent
    const handleJoinAsTeam = async (skipPaymentPlanPreview = false, teamOverride?: Team) => {
        if (!user || !currentEvent || (!selectedTeamId && !teamOverride?.$id)) return;
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
            ?? userTeams.find((t) => t.$id === selectedTeamId)
            ?? ({ $id: selectedTeamId } as Team);
        const joinIntent: JoinIntent = { mode: 'team', team };
        if (
            !skipPaymentPlanPreview
            && selectedDivisionBilling.allowPaymentPlans
            && normalizePriceCents(selectedDivisionBilling.priceCents) > 0
        ) {
            const teamName = typeof team?.name === 'string' && team.name.trim().length > 0
                ? team.name.trim()
                : 'Your team';
            setPaymentPlanPreview({
                intent: { mode: 'team', team },
                ownerLabel: teamName,
            });
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
        if (!user || !currentEvent || !selectedTeamId) return;
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

        const selectedTeam = userTeams.find((team) => team.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);

        try {
            await paymentService.leaveEvent(
                user,
                currentEvent,
                selectedTeam,
                undefined,
                undefined,
                JOIN_API_TIMEOUT_MS,
                selectedWeeklyOccurrence,
            );

            setJoinNotice('Team withdrawn from this event.');
            await loadEventDetails();
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to withdraw team');
        } finally {
            setJoining(false);
        }
    };

    const cancelSigning = useCallback(() => {
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setPendingSignedDocumentId(null);
        setPendingSignatureOperationId(null);
        setShowPasswordModal(false);
        setPassword('');
        setPasswordError(null);
        setConfirmingPassword(false);
        setRecordingSignature(false);
        setTextAccepted(false);
        setJoining(false);
        setJoinError('Signature process canceled.');
    }, []);

    // After successful payment, poll for up to 30s until the webhook-backed registration is reflected
    const confirmRegistrationAfterPayment = async ({ pendingPayment = false }: { pendingPayment?: boolean } = {}) => {
        if (!user || !currentEvent) return;
        setConfirmingPurchase(true);
        setJoinError(null);

        const deadline = Date.now() + 30_000; // 30 seconds
        const pollIntervalMs = 2000; // 2 seconds
        const targetTeamId = selectedTeamId || null;

        try {
            if (currentEvent.teamSignup && !targetTeamId) {
                throw new Error('Team is required to complete registration.');
            }

            while (Date.now() < deadline) {
                if (selectedWeeklyOccurrence) {
                    const snapshot = await eventService.getEventParticipants(currentEvent.$id, selectedWeeklyOccurrence);
                    const participantTeamIds = Array.from(new Set(
                        (snapshot.participants.teamIds ?? [])
                            .map((teamId) => (typeof teamId === 'string' ? teamId.trim() : ''))
                            .filter((teamId): teamId is string => teamId.length > 0),
                    ));
                    const participantUserIds = Array.from(new Set(
                        (snapshot.participants.userIds ?? [])
                            .map((userId) => (typeof userId === 'string' ? userId.trim() : ''))
                            .filter((userId): userId is string => userId.length > 0),
                    ));
                    const participantTeams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
                    const targetTeamRegistered = Boolean(
                        targetTeamId
                        && (
                            participantTeamIds.includes(targetTeamId)
                            || participantTeams.some((team) => {
                                const teamRecord = team as { $id?: unknown; id?: unknown; parentTeamId?: unknown };
                                const eventTeamId = typeof teamRecord.$id === 'string'
                                    ? teamRecord.$id.trim()
                                    : typeof teamRecord.id === 'string'
                                        ? teamRecord.id.trim()
                                        : '';
                                const parentTeamId = typeof teamRecord.parentTeamId === 'string'
                                    ? teamRecord.parentTeamId.trim()
                                    : '';
                                return eventTeamId === targetTeamId || parentTeamId === targetTeamId;
                            })
                        ),
                    );
                    const registered = currentEvent.teamSignup
                        ? targetTeamRegistered
                        : participantUserIds.includes(user.$id);

                    if (registered) {
                        await loadEventDetails();
                        setConfirmingPurchase(false);
                        if (pendingPayment) {
                            setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                            return;
                        }
                        navigateToPublicEventCompletion();
                        return;
                    }
                } else {
                    const latest = await eventService.getEventWithRelations(currentEvent.$id);
                    if (latest) {
                        const registered = latest.teamSignup
                            ? (targetTeamId
                                ? Object.values(latest.teams || {}).some(t => t.parentTeamId === targetTeamId || t.$id === targetTeamId)
                                : Object.values(latest.teams || {}).some(t => (t.playerIds || []).includes(user.$id)))
                            : (latest.players || []).some(p => p.$id === user.$id);

                        if (registered) {
                            await loadEventDetails();
                            setConfirmingPurchase(false);
                            if (pendingPayment) {
                                setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
                                return;
                            }
                            navigateToPublicEventCompletion();
                            return;
                        }
                    }
                }

                await new Promise(res => setTimeout(res, pollIntervalMs));
            }

            if (pendingPayment) {
                await loadEventDetails();
                setJoinNotice('Payment submitted. Your registration is pending until the bank payment clears.');
            } else {
                setJoinError('Timed out');
            }
        } catch (e) {
            setJoinError(e instanceof Error ? e.message : 'Error confirming purchase.');
        } finally {
            setConfirmingPurchase(false);
        }
    };

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
        const nowMs = Date.now();
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
    const childPrimaryActionLabel = isTeamSignup
        ? (joiningChildFreeAgent
            ? 'Updating…'
            : (selectedChildIsFreeAgent ? 'Remove child from free agents' : 'Add child as free agent'))
        : childWaitlistMode
            ? (registeringChild
                ? 'Updating…'
                : (selectedChildIsWaitlisted ? 'Remove child from waitlist' : 'Add child to waitlist'))
            : (registeringChild ? 'Registering…' : 'Register child');
    const childJoinDisabled = !canRegisterChild
        || !selectedChildId
        || (isTeamSignup
            ? (!selectedChildEligible || joiningChildFreeAgent)
            : childWaitlistMode
                ? (
                    registeringChild
                    || (!selectedChildIsWaitlisted && (weeklySelectionRequired || !selectedChildEligible || isDivisionSelectionMissing || selectedChildIsRegistered))
                )
                : (weeklySelectionRequired || !selectedChildEligible || registeringChild || isDivisionSelectionMissing));
    const childRegistrationPanel = shouldShowChildRegistrationPanel ? (
        <Paper withBorder p="sm" radius="md" className="space-y-3">
            <Text size="sm" fw={600}>
                {isTeamSignup ? 'Child Free Agent' : (childWaitlistMode ? 'Child Waitlist' : 'Register a child')}
            </Text>
            {childrenError && (
                <Alert color="red" variant="light">
                    {childrenError}
                </Alert>
            )}
            {childrenLoading ? (
                <Text size="sm" c="dimmed">Loading children...</Text>
            ) : (
                <MantineSelect
                    placeholder="Select a child"
                    data={childOptions}
                    value={selectedChildId}
                    onChange={(value) => setSelectedChildId(value || '')}
                    comboboxProps={sharedComboboxProps}
                />
            )}
            {!childrenLoading && childOptions.length === 0 && (
                <Text size="xs" c="dimmed">
                    No active children linked yet. Add one from your profile.
                </Text>
            )}
            {isTeamSignup && (
                <Text size="xs" c="dimmed">
                    Team registration is only for teams. Child profiles can join as free agents.
                </Text>
            )}
            {!isTeamSignup && childWaitlistMode && (
                <Text size="xs" c="dimmed">
                    Manage the selected child&apos;s waitlist status.
                </Text>
            )}
            {selectedChild && !selectedChildHasEmail && !isTeamSignup && (
                <Alert color="yellow" variant="light">
                    The selected child can register now, but child-signature steps remain pending until an email is added.
                </Alert>
            )}
            {!isTeamSignup && childWaitlistMode && selectedChildIsRegistered && (
                <Alert color="green" variant="light">
                    The selected child is already registered for this event.
                </Alert>
            )}
            {!isTeamSignup && childWaitlistMode && selectedChildIsWaitlisted && (
                <Alert color="blue" variant="light">
                    The selected child is currently on the waitlist.
                </Alert>
            )}
            <Button
                fullWidth
                variant="light"
                onClick={handleRegisterChild}
                disabled={childJoinDisabled}
            >
                {childPrimaryActionLabel}
            </Button>
            {hasAgeLimits && (
                <Text size="xs" c="dimmed">
                    Eligible ages: {formatAgeRange(eventMinAge, eventMaxAge)}.
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && childRegistration?.status && (
                <Text size="xs" c="dimmed">
                    Registration status: {childRegistration.status}
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && childConsent?.status && (
                <Text size="xs" c="dimmed">
                    Consent status: {childConsent.status}
                </Text>
            )}
            {!isTeamSignup && showChildRegistrationStatus && (childConsent?.parentSignLink || childConsent?.childSignLink) && (
                <Group gap="xs">
                    {childConsent.parentSignLink && (
                        <Button
                            component="a"
                            href={childConsent.parentSignLink}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                        >
                            Parent Sign
                        </Button>
                    )}
                    {childConsent.childSignLink && (
                        <Button
                            component="a"
                            href={childConsent.childSignLink}
                            target="_blank"
                            rel="noreferrer"
                            size="xs"
                            variant="light"
                        >
                            Child Sign
                        </Button>
                    )}
                </Group>
            )}
        </Paper>
    ) : null;

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
                                <>
                                    {/* Event Info */}
                                    <div>
                                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
                                        <Paper withBorder p="md" radius="md" className="space-y-3">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-sm text-gray-600">Type</span>
                                                    <p className="font-medium">{formatEnumDisplayLabel(currentEvent.eventType, 'Event')}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Registration</span>
                                                    <p className="font-medium">{isTeamSignup ? 'Team registration' : 'Individual registration'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Price</span>
                                                    <p className="font-medium">
                                                        {selectedDivisionBilling.priceCents === 0
                                                            ? 'Free'
                                                            : `${formatPrice(selectedDivisionBilling.priceCents)}`}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-600">Sport</span>
                                                    <p className="font-medium">
                                                        {currentEvent.sport?.name || currentEvent.sportId || 'TBD'}
                                                    </p>
                                                </div>
                                                {(typeof eventMinAge === 'number' || typeof eventMaxAge === 'number') && (
                                                    <div>
                                                        <span className="text-sm text-gray-600">Age Range</span>
                                                        <p className="font-medium">{formatAgeRange(eventMinAge, eventMaxAge)}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {eventDivisionLabels.length > 0 && (
                                                <div>
                                                    <span className="text-sm text-gray-600">Divisions</span>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {eventDivisionLabels.map((divisionLabel, index) => (
                                                            <span key={index} className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                                                {divisionLabel}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </Paper>
                                    </div>

                                    {/* Description */}
                                    <Paper withBorder p="md" radius="md">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                                        <p className="text-gray-700 leading-relaxed">{currentEvent.description}</p>
                                    </Paper>

                                    {mapEmbedSrc && (
                                        <Paper withBorder p="md" radius="md" className="space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <Text size="sm" c="dimmed">Location</Text>
                                                    <Text fw={600}>{currentEvent.location || 'Location coming soon'}</Text>
                                                    {hasValidCoords && (
                                                        <Text size="xs" c="dimmed">
                                                            {mapLat.toFixed(4)}, {mapLng.toFixed(4)}
                                                        </Text>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="overflow-hidden rounded-md border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
                                                <iframe
                                                    title="Event location preview"
                                                    src={mapEmbedSrc}
                                                    className="w-full h-full"
                                                    loading="lazy"
                                                    allowFullScreen
                                                />
                                            </div>
                                        </Paper>
                                    )}

                                    {/* Tournament Details */}
                                    {currentEvent.eventType === 'TOURNAMENT' && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Tournament Format</h3>
                                            <Paper withBorder p="md" radius="md" className="space-y-2">
                                                {currentEvent.doubleElimination && (
                                                    <p><span className="font-medium">Format:</span> Double Elimination</p>
                                                )}
                                                {currentEvent.prize && (
                                                    <p><span className="font-medium">Prize:</span> {currentEvent.prize}</p>
                                                )}
                                                {currentEvent.winnerSetCount && (
                                                    <p><span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}</p>
                                                )}
                                            </Paper>
                                        </div>
                                    )}

                                    {/* League Playoff Details */}
                                    {currentEvent.eventType === 'LEAGUE' && currentEvent.includePlayoffs && (
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Playoff Format</h3>
                                            <Paper withBorder p="md" radius="md" className="space-y-2">
                                                <p>
                                                    <span className="font-medium">Teams Included:</span>{' '}
                                                    {currentEvent.playoffTeamCount ?? 'Configured'}
                                                </p>
                                                {typeof currentEvent.doubleElimination === 'boolean' && (
                                                    <p>
                                                        <span className="font-medium">Format:</span>{' '}
                                                        {currentEvent.doubleElimination ? 'Double Elimination' : 'Single Elimination'}
                                                    </p>
                                                )}
                                                {typeof currentEvent.winnerSetCount === 'number' && currentEvent.winnerSetCount > 0 && (
                                                    <p>
                                                        <span className="font-medium">Sets to Win:</span> {currentEvent.winnerSetCount}
                                                    </p>
                                                )}
                                            </Paper>
                                        </div>
                                    )}

                                    {/* Event Stats */}
                                    <Paper withBorder p="md" radius="md">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Stats</h3>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Max Participants:</span>
                                                <span className="font-medium">{formatNotSpecifiedValue(participantCapacity)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Team Size:</span>
                                                <span className="font-medium">{currentEvent.teamSizeLimit}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Registration Cutoff:</span>
                                                <span className="font-medium">{registrationCutoffSummary}</span>
                                            </div>
                                        </div>
                                    </Paper>
                                </>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6 lg:self-start">
                            {showParticipantsSection && (
                                <>
                            {/* Participants */}
                            <h3 className="mb-4 text-lg font-semibold text-slate-950">Participants</h3>

                            <Paper withBorder p="md" radius="md" className="space-y-3 border-slate-200 bg-white shadow-sm">
                                <Group justify="space-between" align="flex-start" gap="xs">
                                    <div>
                                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Teams' : 'Spots'}</Text>
                                        <Text fw={600}>
                                            {participantCapacity > 0
                                                ? `${totalParticipants}/${participantCapacity}`
                                                : totalParticipants}
                                        </Text>
                                    </div>
                                    <div>
                                        <Text size="xs" c="dimmed">{isTeamSignup ? 'Free Agents' : 'Waitlist'}</Text>
                                        <Text fw={600}>
                                            {isTeamSignup
                                                ? normalizedFreeAgentIds.length
                                                : normalizedWaitlistIds.length}
                                        </Text>
                                    </div>
                                    <div>
                                        <Text size="xs" c="dimmed">Left</Text>
                                        <Text fw={600}>{participantCapacity > 0 ? spotsLeft : '—'}</Text>
                                    </div>
                                </Group>
                                <Progress value={eventFillPercent} />
                                <Text size="xs" c="dimmed">
                                    {participantCapacity > 0
                                        ? `${eventFillPercent}% full • ${spotsLeft} left`
                                        : 'No capacity configured'}
                                </Text>

                                {divisionCapacityBreakdown.length > 0 && (
                                    <>
                                        <Button
                                            variant="subtle"
                                            size="xs"
                                            px={0}
                                            onClick={() => setShowCapacityBreakdown((prev) => !prev)}
                                        >
                                            {showCapacityBreakdown ? 'Hide division breakdown' : 'Show division breakdown'}
                                        </Button>
                                        <Collapse in={showCapacityBreakdown}>
                                            <div className="space-y-2 pt-2">
                                                {divisionCapacityBreakdown.map((divisionRow) => {
                                                    const sportInput = typeof currentEvent?.sport === 'string'
                                                        ? currentEvent.sport
                                                        : currentEvent?.sport?.name ?? currentEvent?.sportId ?? null;
                                                    const divisionLabel = resolveDivisionDisplayName({
                                                        division: divisionRow.divisionId,
                                                        divisionNameIndex: divisionDisplayNameIndex,
                                                        sportInput,
                                                    }) ?? divisionRow.name ?? 'Division';
                                                    const divisionLeft = divisionRow.capacity > 0
                                                        ? Math.max(0, divisionRow.capacity - divisionRow.filled)
                                                        : 0;
                                                    const divisionPercent = divisionRow.capacity > 0
                                                        ? Math.min(100, Math.round((divisionRow.filled / divisionRow.capacity) * 100))
                                                        : 0;
                                                    return (
                                                        <Paper
                                                            key={divisionRow.divisionId}
                                                            withBorder
                                                            p="sm"
                                                            radius="md"
                                                            className="space-y-2"
                                                        >
                                                            <Group justify="space-between" align="center" gap="xs">
                                                                <Text size="sm" fw={600}>
                                                                    {divisionLabel}
                                                                </Text>
                                                                <Text size="sm" c="dimmed" fw={600}>
                                                                    {divisionRow.capacity > 0
                                                                        ? `${divisionRow.filled}/${divisionRow.capacity}`
                                                                        : divisionRow.filled}
                                                                </Text>
                                                            </Group>
                                                            <Progress value={divisionPercent} size="sm" />
                                                            <Text size="xs" c="dimmed">
                                                                {divisionRow.capacity > 0
                                                                    ? `${divisionPercent}% full • ${divisionLeft} left`
                                                                    : 'No capacity configured'}
                                                            </Text>
                                                        </Paper>
                                                    );
                                                })}
                                            </div>
                                        </Collapse>
                                    </>
                                )}
                            </Paper>

                            {/* Players Section */}
                            {!isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Players"
                                        participants={players}
                                        totalCount={players.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowPlayersDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No players registered yet"
                                    />
                                </div>
                            )}

                            {/* Teams Section */}
                            {isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Teams"
                                        participants={teams}
                                        totalCount={teams.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowTeamsDropdown(true)}
                                        getAvatarUrl={(participant) => getTeamAvatarUrl(participant as Team, 32)}
                                        emptyMessage="No teams registered yet"
                                    />
                                </div>
                            )}

                            {/* Free Agents Section */}
                            {isTeamSignup && (
                                <div className="mb-4">
                                    <ParticipantsPreview
                                        title="Free Agents"
                                        participants={freeAgents}
                                        totalCount={normalizedFreeAgentIds.length}
                                        isLoading={isLoadingEvent}
                                        onClick={() => setShowFreeAgentsDropdown(true)}
                                        getAvatarUrl={(participant) => getUserAvatarUrl(participant as UserData, 32)}
                                        emptyMessage="No free agents yet"
                                    />
                                </div>
                            )}
                                </>
                            )}

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
                                                                onClick={async () => {
                                                                    if (!user) return;
                                                                    setJoining(true);
                                                                    setJoinError(null);
                                                                    try {
                                                                        await eventService.removeFromWaitlist(currentEvent.$id, user.$id, 'user', selectedWeeklyOccurrence);
                                                                        setJoinNotice('Removed from waitlist.');
                                                                        await loadEventDetails();
                                                                    } catch (e) {
                                                                        setJoinError(e instanceof Error ? e.message : 'Failed to leave waitlist');
                                                                    } finally {
                                                                        setJoining(false);
                                                                    }
                                                                }}
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
                                                            onClick={async () => {
                                                                if (!user) return;
                                                                setJoining(true);
                                                                setJoinError(null);
                                                                try {
                                                                    await eventService.removeFreeAgent(currentEvent.$id, user.$id, selectedWeeklyOccurrence);
                                                                    await loadEventDetails();
                                                                } catch (e) {
                                                                    setJoinError(e instanceof Error ? e.message : 'Failed to leave free agents');
                                                                } finally {
                                                                    setJoining(false);
                                                                }
                                                            }}
                                                            disabled={joining || eventHasStarted}
                                                            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${(joining || eventHasStarted) ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                                                        >
                                                            {eventHasStarted ? 'Unavailable' : (joining ? 'Updating…' : 'Leave Free Agent List')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={async () => {
                                                            if (!user) return;
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
                                                                    trackEventRegistrationStarted(currentEvent, 'free_agent', {
                                                                        division_id: resolvedDivisionSelectionPayload?.divisionId,
                                                                        division_type_id: resolvedDivisionSelectionPayload?.divisionTypeId,
                                                                        slot_id: selectedWeeklyOccurrence?.slotId,
                                                                        occurrence_date: selectedWeeklyOccurrence?.occurrenceDate,
                                                                        requires_parent_approval: true,
                                                                    });
                                                                    const result = await registrationService.registerSelfForEvent(
                                                                        currentEvent.$id,
                                                                        resolvedDivisionSelectionPayload,
                                                                    );
                                                                    if (result.requiresParentApproval) {
                                                                        setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                                                                    } else {
                                                                        setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                                                                    }
                                                                    await loadEventDetails();
                                                                    return;
                                                                }
                                                                // Free Agent listing is free; no payment
                                                                await eventService.addFreeAgent(currentEvent.$id, user.$id, selectedWeeklyOccurrence);
                                                                await loadEventDetails();
                                                            } catch (e) {
                                                                setJoinError(e instanceof Error ? e.message : 'Failed to join as free agent');
                                                            } finally {
                                                                setJoining(false);
                                                            }
                                                        }}
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

    const renderEventTeamParticipant = (team: Team | UserData) => {
        const teamRow = team as Team;
        const organizationName = getOrganizationName(currentEvent.organization) ?? currentEvent.location ?? 'Event';
        const sportInput = typeof currentEvent?.sport === 'string'
            ? currentEvent.sport
            : currentEvent?.sport?.name ?? currentEvent?.sportId ?? null;
        const divisionLabel = resolveDivisionDisplayName({
            division: teamRow.division,
            divisionNameIndex: divisionDisplayNameIndex,
            sportInput,
        }) ?? 'Division';
        const divisionSuffix = /\bdivision\b/i.test(divisionLabel) ? '' : ' Division';

        return (
            <TeamRegistrationFlow
                team={teamRow}
                user={user}
                paymentSummary={{
                    name: teamRow.name || 'Team',
                    location: organizationName,
                    eventType: currentEvent.eventType,
                    price: Math.max(0, Math.round(Number(teamRow.registrationPriceCents ?? 0))),
                }}
                organization={{
                    $id: currentEvent.organizationId ?? undefined,
                    name: organizationName,
                }}
                onRequireAuth={openAuthModal}
                onTeamUpdated={() => {
                    void loadEventDetails(currentEvent.$id, { automatic: false });
                }}
                onCompleted={async () => {
                    setJoinNotice(`You joined ${teamRow.name || 'this team'}.`);
                    await loadEventDetails(currentEvent.$id, { automatic: false });
                }}
            >
                {(flow) => (
                    <div className="space-y-2 rounded-lg p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                            <Image
                                src={getTeamAvatarUrl(teamRow, 40)}
                                alt={teamRow.name || 'Team'}
                                width={40}
                                height={40}
                                unoptimized
                                className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-gray-900">{teamRow.name || 'Unnamed Team'}</div>
                                <div className="text-sm text-gray-500">
                                    {teamRow.currentSize} members &bull; {divisionLabel}{divisionSuffix}
                                </div>
                            </div>
                            <div className="text-xs text-gray-400">
                                Team
                            </div>
                        </div>
                        {flow.registrationError ? (
                            <Alert color="red" variant="light" py="xs">
                                <Text size="xs">{flow.registrationError}</Text>
                            </Alert>
                        ) : null}
                        {flow.currentUserActiveMember && !flow.shouldOfferDocumentReview ? (
                            <Text size="xs" c="green" fw={600}>
                                Already on this team
                            </Text>
                        ) : null}
                        {flow.actionVisible ? (
                            <Button
                                size="xs"
                                fullWidth
                                loading={flow.actionLoading}
                                disabled={flow.actionDisabled}
                                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                                    event.stopPropagation();
                                    flow.openFlow();
                                }}
                            >
                                {flow.actionLabel}
                            </Button>
                        ) : null}
                    </div>
                )}
            </TeamRegistrationFlow>
        );
    };

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

            {/* Players Dropdown */}
            {showParticipantsSection && !isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showPlayersDropdown}
                    onClose={() => setShowPlayersDropdown(false)}
                    title="Event Players"
                    participants={players}
                    isLoading={isLoadingEvent}
                    renderParticipant={(player) => (
                        <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                            {(() => {
                                const participant = player as UserData;
                                const participantName = getUserFullName(participant);
                                const participantHandle = getUserHandle(participant);
                                return (
                                    <>
                                        <Image
                                            src={getUserAvatarUrl(participant, 40)}
                                            alt={participantName}
                                            width={40}
                                            height={40}
                                            unoptimized
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                        <div>
                                            <div className="font-medium text-gray-900">{participantName}</div>
                                            {participantHandle && (
                                                <div className="text-sm text-gray-500">{participantHandle}</div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    emptyMessage="No players have joined this event yet."
                />
            )}

            {/* Teams Dropdown */}
            {showParticipantsSection && isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showTeamsDropdown}
                    onClose={() => setShowTeamsDropdown(false)}
                    title="Event Teams"
                    participants={teams}
                    isLoading={isLoadingEvent}
                    renderParticipant={renderEventTeamParticipant}
                    emptyMessage="No teams have registered for this event yet."
                />
            )}

            {/* Free Agents Dropdown */}
            {showParticipantsSection && isTeamSignup && (
                <ParticipantsDropdown
                    isOpen={showFreeAgentsDropdown}
                    onClose={() => setShowFreeAgentsDropdown(false)}
                    title="Free Agents"
                    participants={freeAgents}
                    isLoading={isLoadingEvent}
                    renderParticipant={(agent) => (
                        <div className="p-1">
                            <UserCard
                                user={agent as UserData}
                                onClick={() => openFreeAgentActions(agent as UserData)}
                            />
                        </div>
                    )}
                    emptyMessage="No free agents have listed for this event yet."
                />
            )}

            <Modal
                opened={showAuthModal}
                onClose={closeAuthModal}
                centered
                title={authModalMode === 'login' ? 'Sign in to register' : 'Create account'}
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form onSubmit={handleAuthModalSubmit}>
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                            {authModalMode === 'login'
                                ? 'Sign in to continue with registration.'
                                : 'Create an account to continue with registration.'}
                        </Text>
                        {authModalMode === 'signup' && (
                            <>
                                <TextInput
                                    label="First name"
                                    value={authModalForm.firstName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('firstName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Last name"
                                    value={authModalForm.lastName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('lastName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Username"
                                    value={authModalForm.userName}
                                    onChange={(changeEvent) => handleAuthModalInputChange('userName', changeEvent.currentTarget.value)}
                                    required
                                />
                                <TextInput
                                    label="Date of birth"
                                    type="date"
                                    value={authModalForm.dateOfBirth}
                                    onChange={(changeEvent) => handleAuthModalInputChange('dateOfBirth', changeEvent.currentTarget.value)}
                                    max={maxAuthDob}
                                    required
                                />
                            </>
                        )}
                        <TextInput
                            label="Email address"
                            type="email"
                            value={authModalForm.email}
                            onChange={(changeEvent) => handleAuthModalInputChange('email', changeEvent.currentTarget.value)}
                            required
                        />
                        <PasswordInput
                            label="Password"
                            value={authModalForm.password}
                            onChange={(changeEvent) => handleAuthModalInputChange('password', changeEvent.currentTarget.value)}
                            required
                            minLength={8}
                        />
                        {authVerificationMessage && (
                            <Alert color={authVerificationMessageType === 'success' ? 'green' : 'yellow'} variant="light">
                                <Text size="sm">{authVerificationMessage}</Text>
                                {authVerificationEmail && (
                                    <Button
                                        type="button"
                                        variant="subtle"
                                        size="compact-sm"
                                        mt="xs"
                                        loading={authResendingVerification}
                                        onClick={() => { void handleAuthModalResendVerification(); }}
                                    >
                                        Resend verification email
                                    </Button>
                                )}
                            </Alert>
                        )}
                        {authModalError && (
                            <Alert color="red" variant="light">
                                {authModalError}
                            </Alert>
                        )}
                        <Button type="submit" fullWidth loading={authModalLoading}>
                            {authModalMode === 'login' ? 'Sign in' : 'Create account'}
                        </Button>
                        <Button
                            type="button"
                            variant="subtle"
                            onClick={toggleAuthModalMode}
                        >
                            {authModalMode === 'login'
                                ? "Don't have an account? Sign up"
                                : 'Already have an account? Sign in'}
                        </Button>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <div className="h-px flex-1 bg-gray-200" />
                            <Text size="xs" c="dimmed">or</Text>
                            <div className="h-px flex-1 bg-gray-200" />
                        </Group>
                        <Button
                            type="button"
                            fullWidth
                            variant="default"
                            onClick={() => { void handleAuthModalGoogle(); }}
                            disabled={authModalLoading}
                        >
                            Continue with Google
                        </Button>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={Boolean(selectedFreeAgentActionUser)}
                onClose={() => setSelectedFreeAgentActionUser(null)}
                centered
                title={selectedFreeAgentActionUser ? getUserFullName(selectedFreeAgentActionUser) : 'Free Agent Actions'}
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    {selectedFreeAgentActionUser && getUserHandle(selectedFreeAgentActionUser) && (
                        <Text size="sm" c="dimmed">
                            {getUserHandle(selectedFreeAgentActionUser)}
                        </Text>
                    )}
                    <Button
                        onClick={handleInviteFreeAgentToTeam}
                        disabled={!selectedFreeAgentActionUser || !currentEvent?.$id}
                    >
                        Invite to Team
                    </Button>
                    <Button
                        variant="default"
                        onClick={() => setSelectedFreeAgentActionUser(null)}
                    >
                        Close
                    </Button>
                </Stack>
            </Modal>

            <Modal
                opened={showRegistrationQuestionsModal}
                onClose={() => {
                    setShowRegistrationQuestionsModal(false);
                    setRegistrationQuestionsIntent(null);
                }}
                centered
                size="lg"
                title="Registration questions"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submitRegistrationQuestionsStep();
                    }}
                >
                    <Stack gap="sm">
                        {registrationQuestions.length > 0 ? (
                            <Stack gap="md">
                                {registrationQuestions.map((question) => (
                                    <Textarea
                                        key={question.id}
                                        label={question.prompt}
                                        required={Boolean(question.required)}
                                        autosize
                                        minRows={question.answerType === 'LONG_TEXT' ? 4 : 2}
                                        value={registrationQuestionAnswers[question.id] ?? ''}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            const nextAnswers = {
                                                ...registrationQuestionAnswers,
                                                [question.id]: value,
                                            };
                                            setRegistrationQuestionAnswers(nextAnswers);
                                            saveEventRegistrationProgress({
                                                step: 'questions',
                                                answers: nextAnswers,
                                            });
                                        }}
                                    />
                                ))}
                            </Stack>
                        ) : (
                            <Text size="sm" c="dimmed">
                                Continue to finish registration.
                            </Text>
                        )}
                        {joinError ? (
                            <Alert color="red" variant="light">
                                {joinError}
                            </Alert>
                        ) : null}
                        <Group justify="flex-end" wrap="wrap">
                            <Button
                                variant="default"
                                onClick={() => {
                                    setShowRegistrationQuestionsModal(false);
                                    setRegistrationQuestionsIntent(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={joining || registeringChild}>
                                Continue
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={Boolean(paymentPlanPreview)}
                onClose={() => setPaymentPlanPreview(null)}
                centered
                title="Payment plan preview"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        Continuing will join this event and start a payment plan for {paymentPlanPreview?.ownerLabel ?? 'you'}.
                    </Text>
                    {selectedDivisionOption?.name && (
                        <Text size="xs" c="dimmed">
                            Division: {selectedDivisionOption.name}
                        </Text>
                    )}
                    <Paper withBorder p="sm" radius="md">
                        <Group justify="space-between" align="center">
                            <Text fw={600}>Plan total</Text>
                            <Text fw={700}>{formatPaymentPlanPreviewPrice(selectedDivisionBilling.priceCents)}</Text>
                        </Group>
                    </Paper>
                    {paymentPlanPreviewRows.length > 0 ? (
                        <Paper withBorder p="sm" radius="md" className="space-y-2">
                            {paymentPlanPreviewRows.map((row) => (
                                <Group key={row.id} justify="space-between" align="flex-start" gap="xs">
                                    <div>
                                        <Text size="sm" fw={500}>
                                            Installment {row.installmentNumber}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Due {row.dueDateLabel}
                                        </Text>
                                    </div>
                                    <Text size="sm" fw={600}>
                                        {formatPaymentPlanPreviewPrice(row.amountCents)}
                                    </Text>
                                </Group>
                            ))}
                        </Paper>
                    ) : (
                        <Alert color="yellow" variant="light">
                            No installment schedule was configured. The plan will be created with event-level defaults.
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setPaymentPlanPreview(null)}>
                            Cancel
                        </Button>
                        <Button onClick={continuePaymentPlanPreview}>
                            Continue with Payment Plan
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={showPasswordModal}
                onClose={cancelPasswordConfirmation}
                centered
                title="Confirm your password"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void confirmPasswordAndStartSigning();
                    }}
                >
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">
                            Please confirm your password before signing required documents.
                        </Text>
                        <PasswordInput
                            label="Password"
                            value={password}
                            onChange={(event) => setPassword(event.currentTarget.value)}
                            error={passwordError ?? undefined}
                            required
                        />
                        <Group justify="flex-end">
                            <Button variant="default" onClick={cancelPasswordConfirmation}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={confirmingPassword}
                                disabled={!password.trim()}
                            >
                                Continue
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            <Modal
                opened={showSignModal}
                onClose={cancelSigning}
                centered
                size="xl"
                title="Sign required documents"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                {signLinks.length > 0 ? (
                    <div>
                        <Text size="sm" c="dimmed" mb="xs">
                            Document {currentSignIndex + 1} of {signLinks.length}
                            {signLinks[currentSignIndex]?.title ? ` • ${signLinks[currentSignIndex]?.title}` : ''}
                        </Text>
                        {signLinks[currentSignIndex]?.requiredSignerLabel && (
                            <Text size="xs" c="dimmed" mb="xs">
                                Required signer: {signLinks[currentSignIndex]?.requiredSignerLabel}
                            </Text>
                        )}
                        {signLinks[currentSignIndex]?.type === 'TEXT' ? (
                            <Stack gap="sm">
                                <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                                        {signLinks[currentSignIndex]?.content || 'No waiver text provided.'}
                                    </Text>
                                </Paper>
                                <Checkbox
                                    label="I agree to the waiver above."
                                    checked={textAccepted}
                                    onChange={(event) => setTextAccepted(event.currentTarget.checked)}
                                />
                                <Group justify="flex-end">
                                    <Button
                                        onClick={() => void handleTextAcceptance()}
                                        loading={recordingSignature}
                                        disabled={!textAccepted || recordingSignature}
                                    >
                                        Accept and continue
                                    </Button>
                                </Group>
                            </Stack>
                        ) : (
                            <Stack gap="xs">
                                <div style={{ height: 600 }}>
                                    <iframe
                                        src={signLinks[currentSignIndex]?.url}
                                        title="BoldSign Signing"
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                    />
                                </div>
                                <Group justify="flex-end">
                                    <Button
                                        variant="default"
                                        onClick={() => void handleSignedDocument()}
                                        loading={recordingSignature}
                                        disabled={recordingSignature}
                                    >
                                        I finished signing
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </div>
                ) : (
                    <Text size="sm" c="dimmed">Preparing documents...</Text>
                )}
            </Modal>

            <Modal
                opened={showCheckoutPreviewModal && Boolean(pendingEventCheckout)}
                onClose={() => {
                    setShowCheckoutPreviewModal(false);
                    setPendingEventCheckout(null);
                    setDiscountPreview(null);
                    setDiscountPreviewError(null);
                }}
                centered
                title="Checkout preview"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    {(() => {
                        const normalizedCode = discountCode.trim();
                        const appliedCode = discountPreview?.code?.trim() ?? '';
                        const canContinueWithDiscount = !normalizedCode
                            || normalizedCode.toUpperCase() === appliedCode.toUpperCase();
                        return (
                            <>
                    <Text size="sm" c="dimmed">
                        Review the registration price before checkout. Add a discount code here if you have one.
                    </Text>
                    <Paper withBorder radius="md" p="sm" className="space-y-2">
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">Original price</Text>
                            <Text size="sm" fw={700}>
                                {formatPrice(discountPreview?.originalAmountCents ?? normalizePriceCents(selectedDivisionBilling.priceCents))}
                            </Text>
                        </Group>
                        {discountPreview ? (
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Discount</Text>
                                <Text size="sm" fw={700} c="green">
                                    -{formatPrice(discountPreview.discountAmountCents)}
                                </Text>
                            </Group>
                        ) : null}
                        <Group justify="space-between">
                            <Text size="sm" fw={800}>New price</Text>
                            <Text size="lg" fw={900}>
                                {formatPrice(discountPreview?.discountedAmountCents ?? normalizePriceCents(selectedDivisionBilling.priceCents))}
                            </Text>
                        </Group>
                    </Paper>
                    <TextInput
                        label="Discount code"
                        placeholder="Enter code"
                        value={discountCode}
                        onChange={(event) => {
                            setDiscountCode(event.currentTarget.value);
                            setDiscountPreview(null);
                            setDiscountPreviewError(null);
                        }}
                    />
                    {discountPreviewError ? (
                        <Alert color="red" variant="light">
                            {discountPreviewError}
                        </Alert>
                    ) : null}
                    {joinError ? (
                        <Alert color="red" variant="light">
                            {joinError}
                        </Alert>
                    ) : null}
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => {
                                setDiscountCode('');
                                setDiscountPreview(null);
                                setDiscountPreviewError(null);
                            }}
                        >
                            Clear
                        </Button>
                        <Button
                            variant="light"
                            loading={discountPreviewLoading}
                            disabled={!discountCode.trim()}
                            onClick={() => { void handleApplyDiscountPreview(); }}
                        >
                            Apply
                        </Button>
                        <Button
                            loading={joining}
                            disabled={!canContinueWithDiscount}
                            onClick={async () => {
                                if (!pendingEventCheckout) {
                                    return;
                                }
                                const normalizedCode = discountCode.trim();
                                const appliedCode = discountPreview?.code?.trim() ?? '';
                                if (normalizedCode && normalizedCode.toUpperCase() !== appliedCode.toUpperCase()) {
                                    setDiscountPreviewError('Apply the discount code before continuing to payment.');
                                    return;
                                }
                                setJoining(true);
                                setJoinError(null);
                                try {
                                    await startEventCheckout({
                                        ...pendingEventCheckout,
                                        discountCode: normalizedCode || null,
                                    });
                                } catch (error) {
                                    setJoinError(error instanceof Error ? error.message : 'Unable to start checkout.');
                                } finally {
                                    setJoining(false);
                                }
                            }}
                        >
                            Checkout
                        </Button>
                    </Group>
                            </>
                        );
                    })()}
                </Stack>
            </Modal>

            <BillingAddressModal
                opened={showBillingAddressModal}
                onClose={() => {
                    setShowBillingAddressModal(false);
                    setShowCheckoutPreviewModal(false);
                    setPendingEventCheckout(null);
                }}
                onSaved={async (billingAddress) => {
                    if (!pendingEventCheckout) {
                        setShowBillingAddressModal(false);
                        return;
                    }
                    setShowBillingAddressModal(false);
                    setShowCheckoutPreviewModal(true);
                }}
            />

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null); // Clear payment data
                }}
                event={checkoutEvent ?? currentEvent}
                paymentData={paymentData} // Pass the already-created payment intent
                onPaymentSuccess={async () => {
                    setPaymentData(null);
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment();
                }}
                onPaymentPending={async () => {
                    setPaymentData(null);
                    clearEventRegistrationProgress();
                    await confirmRegistrationAfterPayment({ pendingPayment: true });
                }}
            />
            <ManualPaymentProofModal
                opened={showManualPaymentModal}
                event={checkoutEvent ?? currentEvent}
                bill={manualPaymentBill}
                onClose={() => setShowManualPaymentModal(false)}
                onSubmitted={async () => {
                    setShowManualPaymentModal(false);
                    setManualPaymentBill(null);
                    clearEventRegistrationProgress();
                    await loadEventDetails();
                    setJoinNotice('Payment proof uploaded. The host will review it and confirm your payment.');
                }}
            />
            <RegistrationHoldTimer
                expiresAt={registrationHoldExpiresAt}
                onExpire={handleEventRegistrationHoldExpired}
            />
        </>
    );
}

