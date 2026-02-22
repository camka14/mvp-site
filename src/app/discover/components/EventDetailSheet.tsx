import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Drawer, Button, Select as MantineSelect, Paper, Alert, Text, ActionIcon, Group, Modal, Checkbox, PasswordInput, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { Event, UserData, Team, getEventDateTime, getUserAvatarUrl, getTeamAvatarUrl, PaymentIntent, getEventImageUrl, formatPrice } from '@/types';
import { eventService } from '@/lib/eventService';
import { userService } from '@/lib/userService';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { billService } from '@/lib/billService';
import { createId } from '@/lib/id';
import { boldsignService, SignStep } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { familyService, FamilyChild } from '@/lib/familyService';
import { registrationService, ConsentLinks, EventRegistration } from '@/lib/registrationService';
import { calculateAgeOnDate, formatAgeRange, isAgeWithinRange } from '@/lib/age';
import {
    buildDivisionToken,
    evaluateDivisionAgeEligibility,
    extractDivisionTokenFromId,
    getDivisionGenderLabel,
    inferDivisionDetails,
    normalizeDivisionGender,
    normalizeDivisionRatingType,
    parseDivisionToken,
} from '@/lib/divisionTypes';
import { useApp } from '@/app/providers';
import ParticipantsPreview from '@/components/ui/ParticipantsPreview';
import ParticipantsDropdown from '@/components/ui/ParticipantsDropdown';
import PaymentModal from '@/components/ui/PaymentModal';
import RefundSection from '@/components/ui/RefundSection';
import UserCard from '@/components/ui/UserCard';
// Replaced shadcn Select with Mantine Select

interface EventDetailSheetProps {
    event: Event;
    isOpen: boolean;
    onClose: () => void;
    renderInline?: boolean;
}

const SHEET_POPOVER_Z_INDEX = 1800;
const SHEET_CONTENT_MAX_WIDTH = 'var(--mantine-container-size-lg, 1200px)';
const SHEET_CONTENT_WIDTH = `min(${SHEET_CONTENT_MAX_WIDTH}, calc(100vw - 2rem))`; // Match main grid width on large screens
const SIGN_MODAL_Z_INDEX = SHEET_POPOVER_Z_INDEX + 200;
const sharedComboboxProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };
const sharedPopoverProps = { withinPortal: true, zIndex: SHEET_POPOVER_Z_INDEX };

type JoinIntent = {
    mode: 'user' | 'team' | 'child' | 'child_free_agent' | 'user_waitlist' | 'team_waitlist' | 'child_waitlist';
    team?: Team | null;
    childId?: string;
    childEmail?: string | null;
};

const parseDateValue = (value?: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeUserId = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

type EventDivisionOption = {
    id: string;
    key: string;
    name: string;
    divisionTypeId: string;
    divisionTypeName: string;
    divisionTypeKey: string;
    ratingType: 'AGE' | 'SKILL';
    gender: 'M' | 'F' | 'C';
    sportId?: string;
    ageCutoffDate?: string;
    ageCutoffLabel?: string;
    ageCutoffSource?: string;
};

const normalizeDivisionKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
};

const getDivisionIdFromEventEntry = (entry: unknown): string | null => {
    if (typeof entry === 'string') {
        return normalizeDivisionKey(entry);
    }
    if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        return normalizeDivisionKey(row.id)
            ?? normalizeDivisionKey(row.$id)
            ?? normalizeDivisionKey(row.key)
            ?? normalizeDivisionKey(row.name);
    }
    return null;
};

const buildDivisionOptionsForEvent = (event: Event | null): EventDivisionOption[] => {
    if (!event) {
        return [];
    }
    const sportInput = typeof event.sport === 'string'
        ? event.sport
        : event.sport?.name ?? event.sportId ?? '';
    const referenceDate = parseDateValue(event.start ?? null);
    const detailRows = Array.isArray(event.divisionDetails) ? event.divisionDetails : [];
    const detailsById = new Map<string, NonNullable<Event['divisionDetails']>[number]>();
    const detailsByKey = new Map<string, NonNullable<Event['divisionDetails']>[number]>();
    detailRows.forEach((detail) => {
        const detailId = normalizeDivisionKey(detail?.id);
        const detailKey = normalizeDivisionKey(detail?.key);
        if (detailId) {
            detailsById.set(detailId, detail);
            const token = extractDivisionTokenFromId(detailId);
            if (token) {
                detailsByKey.set(token, detail);
            }
        }
        if (detailKey) {
            detailsByKey.set(detailKey, detail);
        }
    });

    const divisionIds = Array.isArray(event.divisions)
        ? Array.from(
            new Set(
                event.divisions
                    .map(getDivisionIdFromEventEntry)
                    .filter((entry): entry is string => Boolean(entry)),
            ),
        )
        : [];

    const orderedIds = divisionIds.length
        ? divisionIds
        : Array.from(detailsById.keys());

    const options: EventDivisionOption[] = [];
    const seen = new Set<string>();

    orderedIds.forEach((divisionId) => {
        const row = detailsById.get(divisionId)
            ?? detailsByKey.get(divisionId)
            ?? detailsByKey.get(extractDivisionTokenFromId(divisionId) ?? '')
            ?? null;

        const inferred = inferDivisionDetails({
            identifier: (row?.key ?? row?.id ?? divisionId) as string,
            sportInput,
            fallbackName: typeof row?.name === 'string' ? row.name : undefined,
        });

        const ratingType = normalizeDivisionRatingType(row?.ratingType) ?? inferred.ratingType;
        const gender = normalizeDivisionGender(row?.gender) ?? inferred.gender;
        const divisionTypeId = normalizeDivisionKey(row?.divisionTypeId) ?? inferred.divisionTypeId;
        const key = normalizeDivisionKey(row?.key) ?? inferred.token;
        const parsedKey = parseDivisionToken(key);
        const divisionTypeKey = parsedKey
            ? key
            : buildDivisionToken({ gender, ratingType, divisionTypeId });
        const ageEligibility = evaluateDivisionAgeEligibility({
            divisionTypeId,
            sportInput: row?.sportId ?? sportInput,
            referenceDate: referenceDate ?? undefined,
        });

        const option: EventDivisionOption = {
            id: row?.id ?? divisionId,
            key,
            name: row?.name ?? inferred.defaultName,
            divisionTypeId,
            divisionTypeName:
                typeof row?.divisionTypeName === 'string' && row.divisionTypeName.trim().length > 0
                    ? row.divisionTypeName.trim()
                    : inferred.divisionTypeName,
            divisionTypeKey,
            ratingType,
            gender,
            sportId: row?.sportId ?? (sportInput || undefined),
            ageCutoffDate: typeof row?.ageCutoffDate === 'string'
                ? row.ageCutoffDate
                : (ageEligibility.applies ? ageEligibility.cutoffDate.toISOString() : undefined),
            ageCutoffLabel: typeof row?.ageCutoffLabel === 'string'
                ? row.ageCutoffLabel
                : ageEligibility.message ?? undefined,
            ageCutoffSource: typeof row?.ageCutoffSource === 'string'
                ? row.ageCutoffSource
                : (ageEligibility.applies ? ageEligibility.cutoffRule.source : undefined),
        };

        if (seen.has(option.id)) {
            return;
        }
        seen.add(option.id);
        options.push(option);
    });

    return options;
};

export default function EventDetailSheet({ event, isOpen, onClose, renderInline = false }: EventDetailSheetProps) {
    const { user, authUser } = useApp();
    const router = useRouter();
    const [detailedEvent, setDetailedEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<UserData[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [freeAgents, setFreeAgents] = useState<UserData[]>([]);
    const [isLoadingEvent, setIsLoadingEvent] = useState(false);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [showPlayersDropdown, setShowPlayersDropdown] = useState(false);
    const [showTeamsDropdown, setShowTeamsDropdown] = useState(false);
    const [showFreeAgentsDropdown, setShowFreeAgentsDropdown] = useState(false);
    const [selectedFreeAgentActionUser, setSelectedFreeAgentActionUser] = useState<UserData | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);
    const [joinNotice, setJoinNotice] = useState<string | null>(null);
    const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
    const [confirmingPurchase, setConfirmingPurchase] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signLinks, setSignLinks] = useState<SignStep[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingJoin, setPendingJoin] = useState<JoinIntent | null>(null);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
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
    const [showJoinChoiceModal, setShowJoinChoiceModal] = useState(false);

    // Team-signup join controls
    const [userTeams, setUserTeams] = useState<Team[]>([]);
    const [showTeamJoinOptions, setShowTeamJoinOptions] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState('');
    const [selectedDivisionTypeKey, setSelectedDivisionTypeKey] = useState('');

    const currentEvent = detailedEvent || event;
    const registrationByDivisionType = Boolean(currentEvent?.registrationByDivisionType);
    const divisionOptions = React.useMemo(
        () => buildDivisionOptionsForEvent(currentEvent),
        [currentEvent],
    );
    const eventDivisionLabels = React.useMemo(() => {
        const nameById = new Map<string, string>();
        divisionOptions.forEach((option) => {
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
    }, [currentEvent?.divisions, currentEvent?.sport, currentEvent?.sportId, divisionOptions]);
    const divisionTypeOptions = React.useMemo(() => {
        const grouped = new Map<string, EventDivisionOption>();
        divisionOptions.forEach((option) => {
            if (!grouped.has(option.divisionTypeKey)) {
                grouped.set(option.divisionTypeKey, option);
            }
        });
        return Array.from(grouped.values()).map((option) => ({
            value: option.divisionTypeKey,
            label: `${getDivisionGenderLabel(option.gender)} ${option.divisionTypeName}`,
        }));
    }, [divisionOptions]);
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
    const isDivisionSelectionMissing = React.useMemo(() => {
        if (!divisionOptions.length) {
            return false;
        }
        if (registrationByDivisionType) {
            return !(selectedDivisionTypeKey || selectedDivisionOption?.divisionTypeKey);
        }
        return !(selectedDivisionId || selectedDivisionOption?.id);
    }, [
        divisionOptions.length,
        registrationByDivisionType,
        selectedDivisionId,
        selectedDivisionOption,
        selectedDivisionTypeKey,
    ]);
    const eventMinAge = typeof currentEvent?.minAge === 'number' ? currentEvent.minAge : undefined;
    const eventMaxAge = typeof currentEvent?.maxAge === 'number' ? currentEvent.maxAge : undefined;
    const hasAgeLimits = typeof eventMinAge === 'number' || typeof eventMaxAge === 'number';
    const eventStartDate = parseDateValue(currentEvent?.start ?? null);
    const eventHasStarted = Boolean(eventStartDate && new Date() >= eventStartDate);
    const userDob = parseDateValue(user?.dateOfBirth ?? null);
    const userAge = userDob ? calculateAgeOnDate(userDob, eventStartDate ?? new Date()) : undefined;
    const hasValidUserAge = typeof userAge === 'number' && Number.isFinite(userAge);
    const isMinor = typeof userAge === 'number' && Number.isFinite(userAge) && userAge < 18;
    const isAdult = typeof userAge === 'number' && Number.isFinite(userAge) && userAge >= 18;
    const ageWithinLimits = !hasAgeLimits
        || (typeof userAge === 'number' && Number.isFinite(userAge) && isAgeWithinRange(userAge, eventMinAge, eventMaxAge));
    const selectedDivisionAgeForUser = React.useMemo(() => {
        if (!selectedDivisionOption || hasAgeLimits) {
            return null;
        }
        return evaluateDivisionAgeEligibility({
            dateOfBirth: userDob ?? undefined,
            divisionTypeId: selectedDivisionOption.divisionTypeId,
            sportInput: selectedDivisionOption.sportId ?? undefined,
            referenceDate: eventStartDate ?? undefined,
        });
    }, [eventStartDate, hasAgeLimits, selectedDivisionOption, userDob]);
    const selfRegistrationBlockedReason = (() => {
        if (!user) return null;
        if (eventHasStarted) {
            return 'This event has already started. Joining is closed.';
        }
        if (!hasValidUserAge) {
            return 'Add your date of birth to your profile to register for events.';
        }
        if (!ageWithinLimits) {
            return `This event is limited to ages ${formatAgeRange(eventMinAge, eventMaxAge)}.`;
        }
        if (
            !hasAgeLimits
            && selectedDivisionAgeForUser?.applies
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
    const isFreeEvent = currentEvent && currentEvent.price === 0;
    const isFreeForUser = isFreeEvent || isEventHost;

    const isActive = renderInline ? Boolean(isOpen) : isOpen;

    useEffect(() => {
        if (!isActive || !user) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const targetEvent = event;
        if (!targetEvent || !targetEvent.teamSignup) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
        if (teamIds.length === 0) {
            setUserTeams([]);
            setIsLoadingTeams(false);
            return;
        }

        setIsLoadingTeams(true);
        let cancelled = false;
        const loadTeams = async () => {
            try {
                const userTeamsAll = await teamService.getTeamsByIds(teamIds, true);
                const targetSport = (targetEvent.sport?.name || '').toLowerCase();
                const relevantTeams = userTeamsAll.filter(
                    (team) => (team.sport || '').toLowerCase() === targetSport
                );
                if (!cancelled) {
                    setUserTeams(relevantTeams);
                }
            } catch (error) {
                console.error('Failed to load user teams:', error);
                if (!cancelled) {
                    setUserTeams([]);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTeams(false);
                }
            }
        };

        loadTeams();

        return () => {
            cancelled = true;
            setIsLoadingTeams(false);
        };
    }, [isActive, event, user]);

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

    const loadEventDetails = useCallback(async (eventId?: string) => {
        const targetId = eventId ?? event?.$id;
        if (!targetId) return;

        setIsLoadingEvent(true);
        try {
            // Fetch full event with relationships for accurate editing context
            let latest = await eventService.getEventWithRelations(targetId);
            if (!latest) {
                latest = await eventService.getEvent(targetId);
            }
            const baseEvent = latest || event;
            if (!baseEvent) {
                return;
            }

            setDetailedEvent(baseEvent);

            const eventPlayers: UserData[] = Array.isArray(baseEvent.players) ? (baseEvent.players as UserData[]) : [];
            const eventTeams: Team[] = Array.isArray(baseEvent.teams) ? (baseEvent.teams as Team[]) : [];

            setPlayers(eventPlayers);
            setTeams(eventTeams);

            const freeAgentIds = collectUniqueUserIds(baseEvent.freeAgentIds);
            const shouldLoadFreeAgents = Boolean(baseEvent.teamSignup) && freeAgentIds.length > 0;

            if (shouldLoadFreeAgents) {
                try {
                    const agents = await userService.getUsersByIds(freeAgentIds);
                    setFreeAgents(agents);
                } catch (error) {
                    console.error('Failed to load free agents:', error);
                    setFreeAgents([]);
                }
            } else {
                setFreeAgents([]);
            }

        } catch (error) {
            console.error('Failed to load event details:', error);
        } finally {
            setIsLoadingEvent(false);
        }
    }, [event]);

    useEffect(() => {
        if (isActive && event) {
            setDetailedEvent(event);
            void loadEventDetails();
        } else {
            setDetailedEvent(null);
            setPlayers([]);
            setTeams([]);
            setFreeAgents([]);
            setIsLoadingEvent(false);
            setIsLoadingTeams(false);
            setJoinError(null); // Reset error when modal closes
            setJoinNotice(null);
            setShowSignModal(false);
            setSignLinks([]);
            setCurrentSignIndex(0);
            setPendingJoin(null);
            setPendingSignedDocumentId(null);
            setShowPasswordModal(false);
            setShowJoinChoiceModal(false);
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
            setSelectedDivisionId('');
            setSelectedDivisionTypeKey('');
        }
    }, [isActive, event, loadEventDetails]);

    const handleViewSchedule = (tab?: string) => {
        const schedulePath = `/events/${currentEvent.$id}/schedule`;
        const target = tab ? `${schedulePath}?tab=${tab}` : schedulePath;
        router.push(target);
        onClose();
    };

    const handleBracketClick = () => {
        if (currentEvent.eventType === 'TOURNAMENT') {
            handleViewSchedule('bracket');
        }
    };

    const createBillForOwner = useCallback(async (ownerType: 'USER' | 'TEAM', ownerId: string) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }

        const priceCents = Math.round(Number(currentEvent.price) || 0);
        if (priceCents <= 0) {
            throw new Error('This event does not have a price set for a payment plan.');
        }

        const installmentAmounts = Array.isArray(currentEvent.installmentAmounts)
            ? currentEvent.installmentAmounts.map((amt) => Math.round(Number(amt) || 0))
            : [];
        const installmentDueDates = Array.isArray(currentEvent.installmentDueDates)
            ? currentEvent.installmentDueDates as string[]
            : [];

        return billService.createBill({
            ownerType,
            ownerId,
            totalAmountCents: priceCents,
            eventId: currentEvent.$id,
            organizationId: currentEvent.organizationId ?? null,
            installmentAmounts,
            installmentDueDates,
            allowSplit: ownerType === 'TEAM' ? Boolean(currentEvent.allowTeamSplitDefault) : false,
            paymentPlanEnabled: true,
            event: {
                $id: currentEvent.$id,
                start: currentEvent.start,
                price: priceCents,
                installmentAmounts,
                installmentDueDates,
            },
            user,
        });
    }, [currentEvent, user]);

    const registerChildForEvent = useCallback(async (childId: string, selection: DivisionSelectionPayload = {}) => {
        if (!currentEvent) {
            throw new Error('Event is not loaded.');
        }

        setRegisteringChild(true);
        try {
            const result = await registrationService.registerChildForEvent(currentEvent.$id, childId, selection);
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
        } finally {
            setRegisteringChild(false);
        }
    }, [currentEvent, loadEventDetails]);

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
        setPendingJoin(intent);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPassword('');
        setPasswordError(null);
        setPendingSignedDocumentId(null);
        setShowPasswordModal(true);
        return true;
    }, [authUser?.email, currentEvent, user]);

    const finalizeJoin = useCallback(async (intent: JoinIntent) => {
        if (!user || !currentEvent) return;
        const requiresDivisionSelection = intent.mode !== 'child_free_agent';
        if (requiresDivisionSelection && isDivisionSelectionMissing) {
            throw new Error(
                registrationByDivisionType
                    ? 'Select a division type before joining.'
                    : 'Select a division before joining.',
            );
        }
        const selection = divisionSelectionPayload;

        if (intent.mode === 'child') {
            if (!intent.childId) {
                throw new Error('Select a child to register.');
            }
            await registerChildForEvent(intent.childId, selection);
            return;
        }
        if (intent.mode === 'child_free_agent') {
            if (!intent.childId) {
                throw new Error('Select a child to add as a free agent.');
            }
            await eventService.addFreeAgent(currentEvent.$id, intent.childId);
            setJoinNotice('Child added to free agent list.');
            await loadEventDetails();
            return;
        }
        if (intent.mode === 'child_waitlist') {
            if (!intent.childId) {
                throw new Error('Select a child to add to waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, intent.childId, 'user');
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

        const shouldRegisterSelf = intent.mode === 'user' && !currentEvent.teamSignup;
        let registrationResult: EventRegistration | null = null;

        if (shouldRegisterSelf) {
            const result = await registrationService.registerSelfForEvent(currentEvent.$id, selection);
            registrationResult = result.registration ?? null;
            if (registrationResult?.status && registrationResult.status !== 'active') {
                setJoinNotice(`Registration status: ${registrationResult.status}`);
            }
        }

        if (intent.mode === 'user_waitlist') {
            await eventService.addToWaitlist(currentEvent.$id, user.$id, 'user');
            setJoinNotice('Added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (intent.mode === 'team_waitlist') {
            if (!resolvedTeam?.$id) {
                throw new Error('Team is required to join the waitlist.');
            }
            await eventService.addToWaitlist(currentEvent.$id, resolvedTeam.$id, 'team');
            setJoinNotice('Team added to waitlist.');
            await loadEventDetails();
            return;
        }

        if (currentEvent.allowPaymentPlans) {
            if (intent.mode === 'team') {
                if (!resolvedTeam?.$id) {
                    throw new Error('Team is required to start a payment plan.');
                }
                await createBillForOwner('TEAM', resolvedTeam.$id);
                setJoinNotice('Payment plan started for your team. A bill was created—you can manage payments from your Profile.');
            } else {
                await createBillForOwner('USER', user.$id);
                setJoinNotice('Payment plan started. A bill was created for you—pay installments from your Profile.');
            }
            await loadEventDetails();
            return;
        }

        if (isFreeForUser) {
            if (!shouldRegisterSelf) {
                await paymentService.joinEvent(user, currentEvent, resolvedTeam, undefined, undefined, selection);
            }
            await loadEventDetails();
        } else {
            const paymentIntent = await paymentService.createPaymentIntent(user, currentEvent, resolvedTeam);
            setPaymentData(paymentIntent);
            setShowPaymentModal(true);
        }
    }, [
        createBillForOwner,
        currentEvent,
        divisionSelectionPayload,
        isDivisionSelectionMissing,
        isFreeForUser,
        loadEventDetails,
        registrationByDivisionType,
        registerChildForEvent,
        selectedTeamId,
        user,
        userTeams,
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
        try {
            const response = await fetch('/api/documents/confirm-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: authUser.email,
                    password: password,
                    eventId: currentEvent.$id,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result?.error) {
                throw new Error(result?.error || 'Password confirmation failed.');
            }

            const signerContext =
                pendingJoin.mode === 'child' || pendingJoin.mode === 'child_free_agent' || pendingJoin.mode === 'child_waitlist'
                    ? 'parent_guardian'
                    : 'participant';
            const parentLinks = await boldsignService.createSignLinks({
                eventId: currentEvent.$id,
                user,
                userEmail: authUser.email,
                signerContext,
                childUserId: pendingJoin.childId,
                childEmail: pendingJoin.childEmail ?? undefined,
            });
            const shouldCollectChildSignatureInSameSession = (
                pendingJoin.mode === 'child' || pendingJoin.mode === 'child_free_agent' || pendingJoin.mode === 'child_waitlist'
            ) && Boolean(
                pendingJoin.childId
                && normalizeEmailValue(authUser.email)
                && normalizeEmailValue(pendingJoin.childEmail ?? null)
                && normalizeEmailValue(authUser.email) === normalizeEmailValue(pendingJoin.childEmail ?? null),
            );
            let links = parentLinks;
            if (shouldCollectChildSignatureInSameSession && pendingJoin.childId) {
                const childLinks = await boldsignService.createSignLinks({
                    eventId: currentEvent.$id,
                    user,
                    userEmail: authUser.email,
                    signerContext: 'child',
                    childUserId: pendingJoin.childId,
                    childEmail: pendingJoin.childEmail ?? undefined,
                });
                const seen = new Set<string>();
                links = [...parentLinks, ...childLinks].filter((link) => {
                    const key = `${link.signerContext ?? signerContext}:${link.templateId}:${link.documentId ?? ''}:${link.type}`;
                    if (seen.has(key)) {
                        return false;
                    }
                    seen.add(key);
                    return true;
                });
            }

            if (!links.length) {
                setShowPasswordModal(false);
                setPassword('');
                const intent = pendingJoin;
                setPendingJoin(null);
                await finalizeJoin(intent);
                setJoining(false);
                return;
            }

            setSignLinks(links);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setShowPasswordModal(false);
            setPassword('');
            setShowSignModal(true);
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : 'Failed to confirm password.');
        } finally {
            setConfirmingPassword(false);
        }
    }, [authUser?.email, currentEvent, finalizeJoin, password, pendingJoin, user]);

    const recordSignature = useCallback(async (payload: {
        templateId: string;
        documentId: string;
        type: SignStep['type'];
        signerContext?: SignStep['signerContext'];
    }) => {
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
    }, [currentEvent, pendingJoin?.childId, pendingJoin?.mode, user]);

    const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type === 'TEXT') {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId || recordingSignature) {
            return;
        }
        if (!currentLink.documentId) {
            setJoinError('Missing document identifier for signature.');
            return;
        }

        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            await recordSignature({
                templateId: currentLink.templateId,
                documentId: currentLink.documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(currentLink.documentId);
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
    }, [currentSignIndex, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks]);

    const handleTextAcceptance = useCallback(async () => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type !== 'TEXT') {
            return;
        }
        if (!textAccepted || pendingSignedDocumentId || recordingSignature) {
            return;
        }

        const documentId = currentLink.documentId || createId();
        setRecordingSignature(true);
        setJoinNotice('Confirming signature...');
        try {
            await recordSignature({
                templateId: currentLink.templateId,
                documentId,
                type: currentLink.type,
                signerContext: currentLink.signerContext,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(documentId);
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
    }, [currentSignIndex, pendingSignedDocumentId, recordSignature, recordingSignature, signLinks, textAccepted]);

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
        if (!pendingSignedDocumentId || !currentEvent || !user) {
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
                setJoinError('Failed to confirm signature.');
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
    }, [currentEvent, currentSignIndex, finalizeJoin, pendingJoin, pendingSignedDocumentId, signLinks, user]);

    const handleRegisterChild = async () => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError('This event has already started. Joining is closed.');
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
                    await eventService.removeFreeAgent(currentEvent.$id, selectedChildId);
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
        const eventWaitlistMode = players.length >= currentEvent.maxParticipants || selectedChildIsWaitlisted;
        if (eventWaitlistMode) {
            setJoinError(null);
            setJoinNotice(null);
            try {
                if (selectedChildIsWaitlisted) {
                    setRegisteringChild(true);
                    await eventService.removeFromWaitlist(currentEvent.$id, selectedChildId, 'user');
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
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow({
                mode: 'child',
                childId: selectedChildId,
                childEmail: selectedChild?.email ?? null,
            });
            if (signingStarted) {
                return;
            }
            await registerChildForEvent(selectedChildId, divisionSelectionPayload);
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
    const handleJoinEvent = async (selection?: 'self' | 'child') => {
        if (!user || !currentEvent) return;
        if (eventHasStarted) {
            setJoinError('This event has already started. Joining is closed.');
            return;
        }
        if (!selection && canRegisterChild && activeChildren.length > 0) {
            setShowJoinChoiceModal(true);
            return;
        }
        if (selection === 'child') {
            setShowJoinChoiceModal(false);
            await handleRegisterChild();
            return;
        }
        setShowJoinChoiceModal(false);
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

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, divisionSelectionPayload);
                if (result.requiresParentApproval) {
                    setJoinNotice('Join request sent. A parent/guardian can approve it from their child management page.');
                } else {
                    setJoinNotice(`Registration status: ${result.registration?.status ?? 'pendingConsent'}`);
                }
                await loadEventDetails();
                return;
            }
            signingStarted = await beginSigningFlow({ mode: 'user' });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'user' });
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
            setJoinError('This event has already started. Joining is closed.');
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

        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        let signingStarted = false;
        try {
            if (isMinor) {
                const result = await registrationService.registerSelfForEvent(currentEvent.$id, divisionSelectionPayload);
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
            setJoinError('This event has already started. Joining is closed.');
            return;
        }
        if (!selectedTeamIsWaitlisted && (teamDivisionTypeMissing || teamDivisionMismatch)) {
            setJoinError(teamDivisionErrorMessage ?? 'Selected team is not eligible for that division type.');
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
                await eventService.removeFromWaitlist(currentEvent.$id, selectedTeamId, 'team');
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
    const handleJoinAsTeam = async () => {
        if (!user || !currentEvent || !selectedTeamId) return;
        if (eventHasStarted) {
            setJoinError('This event has already started. Joining is closed.');
            return;
        }
        if (teamDivisionTypeMissing || teamDivisionMismatch) {
            setJoinError(teamDivisionErrorMessage ?? 'Selected team is not eligible for that division type.');
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
        setJoining(true);
        setJoinError(null);
        setJoinNotice(null);

        const team = userTeams.find((t) => t.$id === selectedTeamId) || ({ $id: selectedTeamId } as Team);
        let signingStarted = false;
        try {
            signingStarted = await beginSigningFlow({ mode: 'team', team });
            if (signingStarted) {
                return;
            }
            await finalizeJoin({ mode: 'team', team });
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Failed to join as team');
        } finally {
            if (!signingStarted) {
                setJoining(false);
            }
        }
    };

    const cancelSigning = useCallback(() => {
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingJoin(null);
        setPendingSignedDocumentId(null);
        setShowPasswordModal(false);
        setPassword('');
        setPasswordError(null);
        setConfirmingPassword(false);
        setRecordingSignature(false);
        setTextAccepted(false);
        setJoining(false);
        setJoinError('Signature process canceled.');
    }, []);

    // After successful payment, poll for up to 30s until the registration is reflected
    const confirmRegistrationAfterPayment = async () => {
        if (!user || !currentEvent) return;
        setConfirmingPurchase(true);
        setJoinError(null);

        const deadline = Date.now() + 30_000; // 30 seconds
        const pollIntervalMs = 2000; // 2 seconds
        const targetTeamId = selectedTeamId || null;

        try {
            while (Date.now() < deadline) {
                const latest = await eventService.getEventWithRelations(currentEvent.$id);
                if (latest) {
                    // Check registration status depending on signup type using relations
                    const registered = latest.teamSignup
                        ? (targetTeamId
                            ? Object.values(latest.teams || {}).some(t => t.$id === targetTeamId)
                            : Object.values(latest.teams || {}).some(t => (t.playerIds || []).includes(user.$id)))
                        : (latest.players || []).some(p => p.$id === user.$id);

                    if (registered) {
                        await loadEventDetails();
                        setConfirmingPurchase(false);
                        return;
                    }
                }

                await new Promise(res => setTimeout(res, pollIntervalMs));
            }

            // Timed out
            setJoinError('Timed out');
        } catch (e) {
            setJoinError('Error confirming purchase.');
        } finally {
            setConfirmingPurchase(false);
        }
    };

    if (!currentEvent) return null;
    // Inline render (schedule page) should only mount when active tab is selected
    if (renderInline && !isActive) return null;

    const { date, time } = getEventDateTime(currentEvent);
    const isTeamSignup = currentEvent.teamSignup;
    const totalParticipants = isTeamSignup ? teams.length : players.length;
    const eventAtCapacity = totalParticipants >= currentEvent.maxParticipants;
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
    const normalizedFreeAgentIdSet = new Set(normalizedFreeAgentIds);
    const normalizedWaitlistIdSet = new Set(normalizedWaitlistIds);
    // Use expanded relations for registration state
    const isUserRegistered = !!user && (
        (!isTeamSignup && players.some(p => p.$id === user.$id)) ||
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
    const activeChildren = children.filter((child) => (child.linkStatus ?? 'active') === 'active');
    const childOptions = activeChildren.map((child) => {
        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim() || 'Child';
        const childDob = parseDateValue(child.dateOfBirth ?? null);
        const childAgeAtEvent = childDob ? calculateAgeOnDate(childDob, eventStartDate ?? new Date()) : undefined;
        const ageLabel = typeof childAgeAtEvent === 'number' && Number.isFinite(childAgeAtEvent)
            ? `${childAgeAtEvent}y at event`
            : 'age unknown';
        const eligible = isChildEligible(child);
        return {
            value: child.userId,
            label: `${name} (${ageLabel})${eligible ? '' : ' - not eligible'}`,
            disabled: !eligible,
        };
    });
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
        && players.some((participant) => participant.$id === selectedChildId),
    );
    const showChildRegistrationStatus = Boolean(selectedChildId && childRegistrationChildId === selectedChildId);
    const hasCoordinates = Array.isArray(currentEvent.coordinates) && currentEvent.coordinates.length >= 2;
    const mapLat = hasCoordinates ? Number(currentEvent.coordinates[1]) : undefined;
    const mapLng = hasCoordinates ? Number(currentEvent.coordinates[0]) : undefined;
    const hasValidCoords = typeof mapLat === 'number' && typeof mapLng === 'number' && !Number.isNaN(mapLat) && !Number.isNaN(mapLng);
    const mapQuery = hasValidCoords
        ? `${mapLat},${mapLng}`
        : (currentEvent.location || '').trim();
    const encodedMapQuery = encodeURIComponent(mapQuery);
    const googleMapsLink = mapQuery
        ? `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`
        : null;
    const mapEmbedSrc = mapQuery
        ? `https://maps.google.com/maps?q=${encodedMapQuery}&z=14&output=embed`
        : null;
    const canShowScheduleButton = isEventHost && !renderInline;
    const scheduleButtonLabel = isEventHost ? 'Manage Event' : 'View Schedule';
    const selectedTeam = selectedTeamId
        ? userTeams.find((team) => team.$id === selectedTeamId) ?? null
        : null;
    const selectedTeamDivisionTypeId = (() => {
        if (!selectedTeam) {
            return null;
        }
        if (typeof selectedTeam.divisionTypeId === 'string' && selectedTeam.divisionTypeId.trim().length > 0) {
            return selectedTeam.divisionTypeId.trim().toLowerCase();
        }
        if (typeof selectedTeam.division === 'string' && selectedTeam.division.trim().length > 0) {
            return inferDivisionDetails({
                identifier: selectedTeam.division,
                sportInput: selectedTeam.sport,
            }).divisionTypeId;
        }
        return null;
    })();
    const teamDivisionMismatch = Boolean(
        selectedTeam
        && selectedDivisionOption?.divisionTypeId
        && selectedTeamDivisionTypeId
        && selectedDivisionOption.divisionTypeId !== selectedTeamDivisionTypeId,
    );
    const teamDivisionTypeMissing = Boolean(
        selectedTeam
        && selectedDivisionOption?.divisionTypeId
        && !selectedTeamDivisionTypeId,
    );
    const teamDivisionErrorMessage = teamDivisionTypeMissing
        ? 'Selected team must have a division type before it can register.'
        : teamDivisionMismatch
            ? `Selected team division type (${selectedTeamDivisionTypeId?.toUpperCase()}) does not match ${selectedDivisionOption?.divisionTypeName ?? 'the selected division type'}.`
            : null;
    const selectedTeamIsWaitlisted = Boolean(selectedTeamId && normalizedWaitlistIdSet.has(selectedTeamId));
    const showSelfWaitlistActions = eventAtCapacity || isUserWaitlisted;
    const childWaitlistMode = !isTeamSignup && (eventAtCapacity || selectedChildIsWaitlisted);
    const showTeamWaitlistActions = eventAtCapacity || selectedTeamIsWaitlisted;
    const selfJoinDisabled = Boolean(selfRegistrationBlockedReason) || joining || confirmingPurchase || isDivisionSelectionMissing;
    const selfWaitlistJoinDisabled = Boolean(selfRegistrationBlockedReason) || joining || isDivisionSelectionMissing;
    const selfWaitlistLeaveDisabled = joining || eventHasStarted;
    const freeAgentJoinBlockedReason = selfRegistrationBlockedReason;
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
                    || (!selectedChildIsWaitlisted && (!selectedChildEligible || isDivisionSelectionMissing || selectedChildIsRegistered))
                )
                : (!selectedChildEligible || registeringChild || isDivisionSelectionMissing));
    const childRegistrationPanel = canRegisterChild ? (
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

    const content = (
        <div className="space-y-6">
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
                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                        }}
                    >
                        ×
                    </ActionIcon>
                </div>
            )}
            
            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                {/* Optional hero banner */}
                <div className="relative">
                    <Image
                        src={getEventImageUrl({ imageId: currentEvent.imageId, width: 800 })}
                        alt={currentEvent.name}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 800px"
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&h=200&fit=crop';
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* Event Info Overlay */}
                    <div className="absolute bottom-4 left-6 text-white">
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {date} at {time}
                            </div>
                            <div className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {currentEvent.location}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Content */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Event Info */}
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">Event Details</h2>
                                <Paper withBorder p="md" radius="md" className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-sm text-gray-600">Type</span>
                                            <p className="font-medium capitalize">{currentEvent.eventType}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-600">Registration</span>
                                            <p className="font-medium">{isTeamSignup ? 'Team registration' : 'Individual registration'}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-600">Price</span>
                                            <p className="font-medium">{currentEvent.price === 0 ? 'Free' : `${formatPrice(currentEvent.price)}`}</p>
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

                            {googleMapsLink && mapEmbedSrc && (
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
                                        <Button
                                            component="a"
                                            href={googleMapsLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            variant="light"
                                            size="sm"
                                        >
                                            Open in Google Maps
                                        </Button>
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
                                        <span className="font-medium">{currentEvent.maxParticipants}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Team Size Limit:</span>
                                        <span className="font-medium">{currentEvent.teamSizeLimit}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Registration Cutoff:</span>
                                        <span className="font-medium">{currentEvent.registrationCutoffHours}h before</span>
                                    </div>
                                </div>
                            </Paper>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            {/* Participants */}
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Participants</h3>

                            {/* Players Section */}
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

                            {/* Join Options (includes total participants) */}
                            <Paper withBorder p="md" radius="md">
                                {joinError && <Alert color="red" variant="light" mb="sm">{joinError}</Alert>}
                                {joinNotice && <Alert color="green" variant="light" mb="sm">{joinNotice}</Alert>}
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
                                {divisionOptions.length > 0 && (
                                    <Paper withBorder p="sm" radius="md" mb="sm" className="space-y-2">
                                        <Text size="sm" fw={600}>
                                            {registrationByDivisionType ? 'Division Type' : 'Division'}
                                        </Text>
                                        <MantineSelect
                                            placeholder={registrationByDivisionType ? 'Select a division type' : 'Select a division'}
                                            data={registrationByDivisionType
                                                ? divisionTypeOptions
                                                : divisionOptions.map((option) => ({
                                                    value: option.id,
                                                    label: option.name,
                                                }))}
                                            value={registrationByDivisionType
                                                ? (selectedDivisionTypeKey || null)
                                                : (selectedDivisionId || null)}
                                            onChange={(value) => {
                                                if (registrationByDivisionType) {
                                                    setSelectedDivisionTypeKey(value || '');
                                                    return;
                                                }
                                                setSelectedDivisionId(value || '');
                                            }}
                                            comboboxProps={sharedComboboxProps}
                                        />
                                        {registrationByDivisionType && selectedDivisionOption && (
                                            <Text size="xs" c="dimmed">
                                                Auto-assigned division: {selectedDivisionOption.name}
                                            </Text>
                                        )}
                                        {!hasAgeLimits && selectedDivisionOption?.ageCutoffLabel && (
                                            <Text size="xs" c="dimmed">
                                                {selectedDivisionOption.ageCutoffLabel}
                                            </Text>
                                        )}
                                    </Paper>
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
                                        <Button fullWidth color="blue" onClick={() => { window.location.href = '/login'; }}>
                                            Sign in to join
                                        </Button>
                                    </div>
                                ) : isUserRegistered ? (
                                    <>
                                        <Text size="sm" c="green" fw={500} ta="center">
                                            {"✓ You're registered for this event"}
                                        </Text>
                                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                                            <Text size="sm" c="dimmed">
                                                {totalParticipants} / {currentEvent.maxParticipants} total participants
                                            </Text>
                                        </div>
                                        {canShowScheduleButton && (
                                            <div className="mt-4 space-y-2">
                                                <Button
                                                    fullWidth
                                                    variant="light"
                                                    onClick={() => handleViewSchedule()}
                                                >
                                                    {scheduleButtonLabel}
                                                </Button>
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
                                                                        await eventService.removeFromWaitlist(currentEvent.$id, user.$id, 'user');
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
                                                                    : currentEvent.price > 0
                                                                    ? `Join Event - ${formatPrice(currentEvent.price)}`
                                                                    : 'Join Event'}
                                                    </Button>
                                                )}

                                                {canShowScheduleButton && (
                                                    <Button
                                                        fullWidth
                                                        variant="light"
                                                        mt="sm"
                                                        onClick={() => handleViewSchedule()}
                                                    >
                                                        {scheduleButtonLabel}
                                                    </Button>
                                                )}

                                                {childRegistrationPanel}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {eventHasStarted && (
                                                    <Alert color="yellow" variant="light">
                                                        This event has already started. Joining and leaving are no longer available.
                                                    </Alert>
                                                )}
                                                <Button fullWidth disabled={eventHasStarted} onClick={() => setShowTeamJoinOptions(prev => !prev)}>
                                                    {showTeamJoinOptions ? 'Hide Team Options' : 'Join as Team'}
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
                                                                            label: `${t.name || 'Team'} (${typeof t.division === 'string' ? t.division : (t.division as any)?.name || 'Division'})`
                                                                        }))}
                                                                        value={selectedTeamId}
                                                                        onChange={(value) => setSelectedTeamId(value || '')}
                                                                        searchable
                                                                        comboboxProps={sharedComboboxProps}
                                                                    />
                                                                </div>
                                                                {teamDivisionErrorMessage && (
                                                                    <Alert color="yellow" variant="light">
                                                                        {teamDivisionErrorMessage}
                                                                    </Alert>
                                                                )}

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
                                                                <div className="flex justify-center pt-2">
                                                                    {showTeamWaitlistActions ? (
                                                                        <Button
                                                                            onClick={() => { void handleJoinTeamWaitlist(); }}
                                                                            disabled={
                                                                                joining
                                                                                || eventHasStarted
                                                                                || !selectedTeamId
                                                                                || (!selectedTeamIsWaitlisted && (teamDivisionTypeMissing || teamDivisionMismatch || isDivisionSelectionMissing))
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
                                                                            onClick={handleJoinAsTeam}
                                                                            disabled={joining || eventHasStarted || !selectedTeamId || confirmingPurchase || teamDivisionTypeMissing || teamDivisionMismatch || isDivisionSelectionMissing}
                                                                            color="green"
                                                                        >
                                                                            {eventHasStarted
                                                                                ? 'Unavailable'
                                                                                : confirmingPurchase
                                                                                ? 'Confirming purchase...'
                                                                                : joining
                                                                                    ? 'Joining...'
                                                                                    : (!isFreeForUser && currentEvent.price > 0)
                                                                                        ? `Join for ${formatPrice(currentEvent.price)}`
                                                                                        : 'Join Event'}
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center space-y-3">
                                                                <p className="text-sm text-gray-600">
                                                                    You have no teams for {currentEvent.sport?.name}.
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
                                                                        {totalParticipants} / {currentEvent.maxParticipants} total participants
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
                                                                    await eventService.removeFreeAgent(currentEvent.$id, user.$id);
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
                                                            setJoining(true);
                                                            setJoinError(null);
                                                            try {
                                                                if (isMinor) {
                                                                    const result = await registrationService.registerSelfForEvent(
                                                                        currentEvent.$id,
                                                                        divisionSelectionPayload,
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
                                                                await eventService.addFreeAgent(currentEvent.$id, user.$id);
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
                                                    <Button
                                                        fullWidth
                                                        variant="light"
                                                        mt="sm"
                                                        onClick={() => handleViewSchedule()}
                                                    >
                                                        {scheduleButtonLabel}
                                                    </Button>
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
                            </Paper>

                            {/* Refund Options */}
                            <RefundSection
                                event={currentEvent}
                                userRegistered={!!isUserRegistered}
                                linkedChildren={activeChildren}
                                onRefundSuccess={loadEventDetails}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const nonInlineContent = (
        <div
            style={{
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: '1.5rem',
                marginRight: '-1.5rem', // push scrollbar to sheet edge while keeping inner padding
                scrollbarGutter: 'stable',
            }}
        >
            {content}
        </div>
    );

    return (
        <>
            {renderInline ? (
                content
            ) : (
                <Drawer
                    opened={isOpen}
                    onClose={onClose}
                    position="bottom"
                    size="100%"
                    withCloseButton={false}
                    keepMounted
                    zIndex={1200}
                    styles={{
                        content: {
                            padding: 0,
                            borderTopLeftRadius: '1rem',
                            borderTopRightRadius: '1rem',
                            height: 'calc(100vh - 80px)',
                            overflow: 'hidden', // keep rounded corners clipped
                            maxWidth: SHEET_CONTENT_WIDTH,
                            width: '100%',
                            margin: '0 auto',
                            boxSizing: 'border-box',
                        },
                        inner: {
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                        },
                        body: {
                            maxWidth: SHEET_CONTENT_WIDTH,
                            width: '100%',
                            margin: '0 auto',
                            padding: '1.5rem',
                            paddingBottom: '2rem',
                            boxSizing: 'border-box',
                            height: '100%',
                        },
                    }}
                    overlayProps={{ opacity: 0.45, blur: 3 }}
                >
                    {nonInlineContent}
                </Drawer>
            )}

            {/* Players Dropdown */}
            <ParticipantsDropdown
                isOpen={showPlayersDropdown}
                onClose={() => setShowPlayersDropdown(false)}
                title="Event Players"
                participants={players}
                isLoading={isLoadingEvent}
                renderParticipant={(player) => (
                    <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <Image
                            src={getUserAvatarUrl(player as UserData, 40)}
                            alt={(player as UserData).fullName}
                            width={40}
                            height={40}
                            unoptimized
                            className="w-10 h-10 rounded-full object-cover"
                        />
                        <div>
                            <div className="font-medium text-gray-900">{(player as UserData).fullName}</div>
                            <div className="text-sm text-gray-500">@{(player as UserData).userName}</div>
                        </div>
                    </div>
                )}
                emptyMessage="No players have joined this event yet."
            />

            {/* Teams Dropdown */}
            <ParticipantsDropdown
                isOpen={showTeamsDropdown}
                onClose={() => setShowTeamsDropdown(false)}
                title="Event Teams"
                participants={teams}
                isLoading={isLoadingEvent}
                renderParticipant={(team) => (
                    <div className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <Image
                            src={getTeamAvatarUrl(team as Team, 40)}
                            alt={(team as Team).name || 'Team'}
                            width={40}
                            height={40}
                            unoptimized
                            className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="flex-1">
                            <div className="font-medium text-gray-900">{(team as Team).name || 'Unnamed Team'}</div>
                            <div className="text-sm text-gray-500">
                                {(team as Team).currentSize} members • {typeof (team as Team).division === 'string' ? (team as Team).division : ((team as Team).division as any)?.name || 'Division'} Division
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">
                            {(team as Team).winRate}% win rate
                        </div>
                    </div>
                )}
                emptyMessage="No teams have registered for this event yet."
            />

            {/* Free Agents Dropdown */}
            {isTeamSignup && (
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
                opened={Boolean(selectedFreeAgentActionUser)}
                onClose={() => setSelectedFreeAgentActionUser(null)}
                centered
                title={selectedFreeAgentActionUser ? `${selectedFreeAgentActionUser.fullName}` : 'Free Agent Actions'}
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        @{selectedFreeAgentActionUser?.userName || 'user'}
                    </Text>
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
                opened={showJoinChoiceModal}
                onClose={() => setShowJoinChoiceModal(false)}
                centered
                title="Join for yourself or child?"
                zIndex={SIGN_MODAL_Z_INDEX}
            >
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        You have linked child profiles. Do you want to join this event yourself, or register a child instead?
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => {
                                void handleJoinEvent('child');
                            }}
                        >
                            Register Child
                        </Button>
                        <Button
                            onClick={() => {
                                void handleJoinEvent('self');
                            }}
                        >
                            Join Myself
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

            <PaymentModal
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentData(null); // Clear payment data
                }}
                event={currentEvent}
                paymentData={paymentData} // Pass the already-created payment intent
                onPaymentSuccess={async () => {
                    setPaymentData(null);
                    await confirmRegistrationAfterPayment();
                }}
            />
        </>
    );
}
