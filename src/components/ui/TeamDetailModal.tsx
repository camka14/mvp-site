// components/ui/TeamDetailModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import { Modal, Group, Text, Title, Button, Paper, SimpleGrid, Avatar, Badge, Alert, TextInput, ScrollArea, SegmentedControl, NumberInput, Select as MantineSelect, Checkbox, MultiSelect, Loader, Stack, Collapse } from '@mantine/core';
import { Invite, Team, UserData, Event, SPORTS_LIST, getUserFullName, getUserAvatarUrl, getTeamAvatarUrl, getUserHandle, formatPrice } from '@/types';
import type { RegistrationQuestionDraft, TeamJoinPolicy, TeamJoinRequest, TeamPlayerRegistration } from '@/types';
import type { TeamComplianceSummary, TeamComplianceUserSummary, TeamMemberComplianceResponse } from '@/lib/eventTeamCompliance';
import { formatBillPaidInFullSummary, formatBillPaidProgress, formatBillTotalBreakdown } from '@/lib/billDisplay';
import { useApp } from '@/app/providers';
import { apiRequest } from '@/lib/apiClient';
import { teamService, type TeamInviteFreeAgentContext } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import ResponsiveCardGrid from './ResponsiveCardGrid';
import ScheduleCalendarPanel from '@/components/schedule/ScheduleCalendarPanel';
import {
    buildDivisionName,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import { ImageSelectionModal } from './ImageSelectionModal';
import TeamFinancePanel from './TeamFinancePanel';
import TeamRegistrationFlow from './TeamRegistrationFlow';
import { type PaymentEventSummary } from './PaymentModal';
import InvitePlayersModal from '@/app/teams/components/InvitePlayersModal';
import { describeDeleteOutcome } from '@/lib/deleteOutcome';

export type TeamDetailPageTab = 'roster' | 'schedule' | 'finance';

interface TeamDetailModalProps {
    currentTeam: Team;
    isOpen: boolean;
    onClose: () => void;
    canManage?: boolean;
    onTeamUpdated?: (team: Team) => void;
    onTeamDeleted?: (teamId: string) => void;
    selectedFreeAgentId?: string;
    selectedFreeAgentUser?: UserData;
    canChargeRegistration?: boolean;
    variant?: 'modal' | 'page';
    activeTab?: TeamDetailPageTab;
    onActiveTabChange?: (tab: TeamDetailPageTab) => void;
}

type TeamInviteRoleType = 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';
const TEAM_ROLE_INVITE_TYPES = ['TEAM'] as const;
const DIVISION_GENDER_OPTIONS = [
    { value: 'M', label: "Men's" },
    { value: 'F', label: "Women's" },
    { value: 'C', label: 'Coed' },
] as const;
type DivisionGenderInput = 'M' | 'F' | 'C' | '';
const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';
const PREFERRED_AGE_DIVISION_IDS = ['18plus', '19plus', 'u18', '18u', 'u19', '19u'] as const;
const EMPTY_FREE_AGENTS: UserData[] = [];
const EMPTY_INVITE_FREE_AGENT_CONTEXT: TeamInviteFreeAgentContext = {
    users: EMPTY_FREE_AGENTS,
    eventIds: [],
    freeAgentIds: [],
    eventTeams: [],
    freeAgentEventsByUserId: {},
    freeAgentEventTeamIdsByUserId: {},
};
const EMPTY_REGISTRATION_QUESTIONS: RegistrationQuestionDraft[] = [];
const EMPTY_JOIN_REQUESTS: TeamJoinRequest[] = [];

const normalizeDivisionToken = (value: unknown): string => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildCompositeDivisionTypeId = (skillDivisionTypeId: string, ageDivisionTypeId: string): string => {
    const normalizedSkill = normalizeDivisionToken(skillDivisionTypeId) || 'open';
    const normalizedAge = normalizeDivisionToken(ageDivisionTypeId) || DEFAULT_AGE_DIVISION_FALLBACK;
    return `skill_${normalizedSkill}_age_${normalizedAge}`;
};

const parseCompositeDivisionTypeId = (
    value: unknown,
): { skillDivisionTypeId: string; ageDivisionTypeId: string } | null => {
    const normalized = normalizeDivisionToken(value);
    if (!normalized.length) {
        return null;
    }
    const match = normalized.match(/^skill_([a-z0-9_]+)_age_([a-z0-9_]+)$/);
    if (!match) {
        return null;
    }
    return {
        skillDivisionTypeId: match[1],
        ageDivisionTypeId: match[2],
    };
};

const getDefaultDivisionTypeSelections = (sportInput: string | null | undefined): {
    skillDivisionTypeId: string;
    ageDivisionTypeId: string;
} => {
    const options = getDivisionTypeOptionsForSport(sportInput);
    const skill = options.find((option) => option.ratingType === 'SKILL' && option.id === 'open')
        ?? options.find((option) => option.ratingType === 'SKILL');
    let age: (typeof options)[number] | undefined;
    for (const preferredAgeId of PREFERRED_AGE_DIVISION_IDS) {
        age = options.find((option) => option.ratingType === 'AGE' && option.id === preferredAgeId);
        if (age) break;
    }
    if (!age) {
        age = options.find((option) => option.ratingType === 'AGE');
    }
    return {
        skillDivisionTypeId: skill?.id ?? 'open',
        ageDivisionTypeId: age?.id ?? DEFAULT_AGE_DIVISION_FALLBACK,
    };
};
const getPendingInviteRole = (
    team: Team,
    invite: Invite,
): TeamInviteRoleType => {
    if (invite.userId && Array.isArray(team.pending) && team.pending.includes(invite.userId)) {
        return 'player';
    }
    if (invite.userId && team.managerId === invite.userId) {
        return 'team_manager';
    }
    if (invite.userId && team.headCoachId === invite.userId) {
        return 'team_head_coach';
    }
    return 'team_assistant_coach';
};

const ACTIVE_PLAYER_REGISTRATION_STATUSES = new Set(['ACTIVE', 'PENDING', 'STARTED']);
const isActivePlayerRegistration = (registration: TeamPlayerRegistration): boolean => (
    ACTIVE_PLAYER_REGISTRATION_STATUSES.has(String(registration.status ?? '').trim().toUpperCase())
);

const formatCompliancePaymentLabel = (payment?: TeamComplianceUserSummary['payment']): string => {
    if (!payment) {
        return 'Payment unavailable';
    }
    if (!payment.hasBill) {
        if (payment.paymentPending) {
            return 'Payment pending';
        }
        return 'No bill yet';
    }
    const status = String(payment.status ?? '').toUpperCase();
    if (status === 'DISPUTED') {
        return 'Payment disputed';
    }
    if (status === 'FAILED') {
        return 'Payment failed';
    }
    if (payment.manualPaymentProofStatus === 'SUBMITTED') {
        return `Payment proof submitted (${formatBillTotalBreakdown(payment)})`;
    }
    if (payment.manualPaymentProofStatus === 'ACCEPTED') {
        return `Payment proof accepted (${formatBillPaidProgress(payment) ?? formatBillTotalBreakdown(payment)})`;
    }
    if (status === 'PENDING') {
        return `Bill pending (${formatBillTotalBreakdown(payment)})`;
    }
    if (status === 'PROCESSING') {
        return `Payment processing (${formatBillTotalBreakdown(payment)})`;
    }
    if (payment.isPaidInFull) {
        return formatBillPaidInFullSummary(payment);
    }
    return formatBillPaidProgress(payment) ?? formatBillTotalBreakdown(payment);
};

const documentComplianceLabel = (documents?: TeamComplianceUserSummary['documents']): string => {
    if (!documents || documents.requiredCount <= 0) {
        return 'No required documents';
    }
    return `${documents.signedCount}/${documents.requiredCount} signed`;
};

export default function TeamDetailModal({
    currentTeam,
    isOpen,
    onClose,
    canManage,
    onTeamUpdated,
    onTeamDeleted,
    selectedFreeAgentId,
    selectedFreeAgentUser,
    canChargeRegistration,
    variant = 'modal',
    activeTab,
    onActiveTabChange,
}: TeamDetailModalProps) {
    const isPageMode = variant === 'page';
    const detailIsActive = isPageMode || isOpen;
    const showTeamDetailTabs = isPageMode;
    const financeTabAvailable = showTeamDetailTabs && Boolean(currentTeam.organizationId);
    const requestedDetailTab = showTeamDetailTabs ? activeTab ?? 'roster' : 'roster';
    const detailTab = requestedDetailTab === 'finance' && !financeTabAvailable ? 'roster' : requestedDetailTab;
    const showRosterTab = !showTeamDetailTabs || detailTab === 'roster';
    const showScheduleTab = showTeamDetailTabs && detailTab === 'schedule';
    const showFinanceTab = financeTabAvailable && detailTab === 'finance';
    const detailTabs = useMemo(() => {
        const tabs: Array<{ label: string; value: TeamDetailPageTab }> = [
            { label: 'Roster', value: 'roster' },
            { label: 'Schedule', value: 'schedule' },
        ];
        if (financeTabAvailable) {
            tabs.push({ label: 'Finance', value: 'finance' });
        }
        return tabs;
    }, [financeTabAvailable]);
    const { user } = useApp();
    const [showAddPlayers, setShowAddPlayers] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [teamPlayers, setTeamPlayers] = useState<UserData[]>([]);
    const [pendingPlayers, setPendingPlayers] = useState<UserData[]>([]);
    const [localFreeAgents, setLocalFreeAgents] = useState<UserData[]>(EMPTY_FREE_AGENTS);
    const [inviteFreeAgentContext, setInviteFreeAgentContext] = useState<TeamInviteFreeAgentContext>(EMPTY_INVITE_FREE_AGENT_CONTEXT);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(currentTeam.name || '');
    const [editingDetails, setEditingDetails] = useState(false);
    const [draftSport, setDraftSport] = useState(currentTeam.sport || '');
    const [draftDivision, setDraftDivision] = useState('');
    const [draftDivisionGender, setDraftDivisionGender] = useState<DivisionGenderInput>('');
    const [draftSkillDivisionTypeId, setDraftSkillDivisionTypeId] = useState('open');
    const [draftAgeDivisionTypeId, setDraftAgeDivisionTypeId] = useState(DEFAULT_AGE_DIVISION_FALLBACK);
    const [draftTeamSize, setDraftTeamSize] = useState(currentTeam.teamSize || 0);
    const [draftJoinPolicy, setDraftJoinPolicy] = useState<TeamJoinPolicy>(currentTeam.joinPolicy ?? (currentTeam.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED'));
    const [draftRegistrationPriceDollars, setDraftRegistrationPriceDollars] = useState(
        ((currentTeam.registrationPriceCents ?? 0) / 100),
    );
    const [draftAffiliateUrl, setDraftAffiliateUrl] = useState(currentTeam.affiliateUrl ?? '');
    const [draftRegistrationQuestions, setDraftRegistrationQuestions] = useState<RegistrationQuestionDraft[]>(EMPTY_REGISTRATION_QUESTIONS);
    const [registrationQuestionsCollapsed, setRegistrationQuestionsCollapsed] = useState(true);
    const [questionsLoading, setQuestionsLoading] = useState(false);
    const [joinRequests, setJoinRequests] = useState<TeamJoinRequest[]>(EMPTY_JOIN_REQUESTS);
    const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
    const [reviewingRequestIds, setReviewingRequestIds] = useState<Set<string>>(new Set());
    const [draftRequiredTemplateIds, setDraftRequiredTemplateIds] = useState<string[]>(
        Array.isArray(currentTeam.requiredTemplateIds)
            ? currentTeam.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [],
    );
    const [templateOptions, setTemplateOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [jerseyNumbersByUserId, setJerseyNumbersByUserId] = useState<Record<string, string>>({});
    const [savingJerseyNumberIds, setSavingJerseyNumberIds] = useState<Set<string>>(new Set());
    const [leavingTeam, setLeavingTeam] = useState(false);
    const [imagePickerOpen, setImagePickerOpen] = useState(false);
    const [cancellingInviteIds, setCancellingInviteIds] = useState<Set<string>>(new Set());
    const [pendingRoleInvites, setPendingRoleInvites] = useState<Array<{ invite: Invite; invitedUser?: UserData }>>([]);
    const [cancellingRoleInviteIds, setCancellingRoleInviteIds] = useState<Set<string>>(new Set());
    const [removingPlayerIds, setRemovingPlayerIds] = useState<Set<string>>(new Set());
    const [billingPlayerIds, setBillingPlayerIds] = useState<Set<string>>(new Set());
    const [managerUser, setManagerUser] = useState<UserData | null>(null);
    const [headCoachUser, setHeadCoachUser] = useState<UserData | null>(null);
    const [assistantCoachUsers, setAssistantCoachUsers] = useState<UserData[]>([]);
    const [draftCaptainId, setDraftCaptainId] = useState(currentTeam.captainId || '');
    const [updatingRoleAction, setUpdatingRoleAction] = useState<string | null>(null);
    const [memberCompliance, setMemberCompliance] = useState<TeamComplianceSummary | null>(null);
    const [memberComplianceLoading, setMemberComplianceLoading] = useState(false);
    const [memberComplianceError, setMemberComplianceError] = useState<string | null>(null);
    const [expandedComplianceUserIds, setExpandedComplianceUserIds] = useState<string[]>([]);

    const isTeamCaptain = currentTeam.captainId === user?.$id || currentTeam.managerId === user?.$id;
    const canManageTeam = canManage ?? isTeamCaptain;
    const canChargeForTeamRegistration = canChargeRegistration ?? Boolean(user?.hasStripeAccount || (currentTeam.registrationPriceCents ?? 0) > 0);
    const registrationPriceCents = Math.max(0, Math.round(currentTeam.registrationPriceCents ?? 0));
    const effectiveJoinPolicy = currentTeam.joinPolicy ?? (currentTeam.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED');
    const currentAffiliateUrl = typeof currentTeam.affiliateUrl === 'string' ? currentTeam.affiliateUrl.trim() : '';
    const draftRegistrationEnabled = draftJoinPolicy === 'OPEN_REGISTRATION' || draftJoinPolicy === 'REQUEST_TO_JOIN';
    const draftShowDivisionFields = draftRegistrationEnabled && draftAffiliateUrl.trim().length === 0 && draftSport.trim().length > 0;
    const draftRequestOnly = draftJoinPolicy === 'REQUEST_TO_JOIN';
    const assistantCoachIds = useMemo(() => (
        Array.isArray(currentTeam.assistantCoachIds)
            ? currentTeam.assistantCoachIds
            : (Array.isArray(currentTeam.coachIds) ? currentTeam.coachIds : [])
    ), [currentTeam.assistantCoachIds, currentTeam.coachIds]);
    const assistantCoachEntries = useMemo(() => {
        const usersById = new Map(assistantCoachUsers.map((assistantCoach) => [assistantCoach.$id, assistantCoach]));
        return assistantCoachIds.map((assistantCoachId) => ({
            id: assistantCoachId,
            user: usersById.get(assistantCoachId),
        }));
    }, [assistantCoachIds, assistantCoachUsers]);
    const activePlayerRegistrationByUserId = useMemo(() => {
        const registrations = Array.isArray(currentTeam.playerRegistrations)
            ? currentTeam.playerRegistrations
            : [];
        const byUserId = new Map<string, TeamPlayerRegistration>();
        registrations.forEach((registration) => {
            if (!registration.userId || !isActivePlayerRegistration(registration)) {
                return;
            }
            byUserId.set(registration.userId, registration);
        });
        return byUserId;
    }, [currentTeam.playerRegistrations]);
    const playerInviteCapacityUserIds = useMemo(() => {
        const userIds = new Set<string>();
        currentTeam.playerIds.forEach((playerId) => {
            if (playerId.trim().length > 0) {
                userIds.add(playerId);
            }
        });
        currentTeam.pending.forEach((playerId) => {
            if (playerId.trim().length > 0) {
                userIds.add(playerId);
            }
        });
        teamPlayers.forEach((player) => {
            if (player.$id.trim().length > 0) {
                userIds.add(player.$id);
            }
        });
        pendingPlayers.forEach((player) => {
            if (player.$id.trim().length > 0) {
                userIds.add(player.$id);
            }
        });
        if (Array.isArray(currentTeam.playerRegistrations)) {
            currentTeam.playerRegistrations.forEach((registration) => {
                const userId = registration.userId?.trim();
                const status = String(registration.status ?? '').trim().toUpperCase();
                if (userId && (status === 'STARTED' || status === 'PENDING')) {
                    userIds.add(userId);
                }
            });
        }
        return userIds;
    }, [currentTeam.pending, currentTeam.playerIds, currentTeam.playerRegistrations, pendingPlayers, teamPlayers]);
    const playerInviteCapacityCount = playerInviteCapacityUserIds.size;
    const playerInviteLimit = Math.max(0, Math.trunc(currentTeam.teamSize || 0));
    const canInviteAnotherPlayer = playerInviteLimit <= 0 || playerInviteCapacityCount < playerInviteLimit;
    const showSelfServiceRegistrationActions = Boolean(user?.$id) && !canManageTeam;
    const complianceByUserId = useMemo(() => {
        const byId = new Map<string, TeamComplianceUserSummary>();
        (memberCompliance?.users ?? []).forEach((summary) => {
            byId.set(summary.userId, summary);
        });
        return byId;
    }, [memberCompliance?.users]);
    const normalizedSelectedFreeAgentId = selectedFreeAgentId?.trim() || null;
    const divisionTypeOptions = useMemo(
        () => getDivisionTypeOptionsForSport(draftSport || currentTeam.sport || ''),
        [currentTeam.sport, draftSport],
    );
    const skillDivisionOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'SKILL')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const sportOptions = useMemo(
        () => Array.from(
            new Set(
                [...SPORTS_LIST, draftSport, currentTeam.sport]
                    .map((value) => (typeof value === 'string' ? value.trim() : ''))
                    .filter((value) => value.length > 0),
            ),
        ).map((value) => ({ value, label: value })),
        [currentTeam.sport, draftSport],
    );
    const ageDivisionOptions = useMemo(
        () => divisionTypeOptions
            .filter((option) => option.ratingType === 'AGE')
            .map((option) => ({ value: option.id, label: option.name })),
        [divisionTypeOptions],
    );
    const resolveDraftDivisionDisplayName = useCallback((
        gender: DivisionGenderInput,
        skillDivisionTypeId: string,
        ageDivisionTypeId: string,
        sportInput: string | null | undefined,
    ): string => {
        if (!gender || !skillDivisionTypeId || !ageDivisionTypeId) {
            return '';
        }
        return buildDivisionName({
            gender,
            sportInput,
            skillDivisionTypeId,
            ageDivisionTypeId,
        });
    }, []);
    const teamDivisionLabel = useMemo(() => {
        const sportInput = draftSport || currentTeam.sport || '';

        const toDisplayDivisionLabel = (value: unknown): string | null => {
            if (typeof value !== 'string') {
                return null;
            }
            const trimmed = value.trim();
            if (!trimmed.length) {
                return null;
            }

            const normalized = normalizeDivisionToken(trimmed);
            const looksLikeDivisionId = trimmed.toLowerCase().includes('__division__')
                || normalized.startsWith('division_')
                || normalized.startsWith('div_');
            const looksLikeDivisionToken = /^(m|f|c)_(age|skill)_[a-z0-9_]+$/.test(normalized);
            const looksLikeCompositeDivisionType = normalized.startsWith('skill_') && normalized.includes('_age_');

            if (!looksLikeDivisionId && !looksLikeDivisionToken && !looksLikeCompositeDivisionType) {
                return trimmed;
            }

            const inferred = inferDivisionDetails({
                identifier: trimmed,
                sportInput,
                fallbackName: trimmed,
            });
            const compositeDivisionType = parseCompositeDivisionTypeId(inferred.divisionTypeId);
            if (compositeDivisionType) {
                return resolveDraftDivisionDisplayName(
                    inferred.gender,
                    compositeDivisionType.skillDivisionTypeId,
                    compositeDivisionType.ageDivisionTypeId,
                    sportInput,
                );
            }

            return inferred.defaultName;
        };

        const directDivisionLabel = toDisplayDivisionLabel(currentTeam.division);
        if (directDivisionLabel) {
            return directDivisionLabel;
        }

        if (currentTeam.division && typeof currentTeam.division === 'object') {
            const divisionNameLabel = toDisplayDivisionLabel(currentTeam.division.name);
            if (divisionNameLabel) {
                return divisionNameLabel;
            }
            const divisionSkillLabel = toDisplayDivisionLabel(currentTeam.division.skillLevel);
            if (divisionSkillLabel) {
                return divisionSkillLabel;
            }
        }
        const divisionTypeIdLabel = toDisplayDivisionLabel(currentTeam.divisionTypeId);
        if (divisionTypeIdLabel) {
            return divisionTypeIdLabel;
        }

        return 'Division';
    }, [
        currentTeam.division,
        currentTeam.divisionTypeId,
        currentTeam.sport,
        draftSport,
        resolveDraftDivisionDisplayName,
    ]);
    const teamPaymentSummary: PaymentEventSummary = useMemo(() => ({
        name: currentTeam.name,
        location: teamDivisionLabel,
        eventType: 'EVENT' as Event['eventType'],
        price: registrationPriceCents,
    }), [currentTeam.name, registrationPriceCents, teamDivisionLabel]);

    const fetchRoleInvites = useCallback(async () => {
        const invites = await userService.listInvites({
            teamId: currentTeam.$id,
            types: TEAM_ROLE_INVITE_TYPES,
        });
        const pendingInvites = invites.filter((invite) => invite.status === 'PENDING' && !currentTeam.pending.includes(invite.userId ?? ''));
        const inviteUserIds = pendingInvites
            .map((invite) => invite.userId)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        const invitedUsers = inviteUserIds.length > 0
            ? await userService.getUsersByIds(inviteUserIds, { teamId: currentTeam.$id })
            : [];
        const invitedUserMap = new Map(invitedUsers.map((invitedUser) => [invitedUser.$id, invitedUser]));
        setPendingRoleInvites(
            pendingInvites.map((invite) => ({
                invite,
                invitedUser: invite.userId ? invitedUserMap.get(invite.userId) : undefined,
            })),
        );
    }, [currentTeam.$id, currentTeam.pending]);

    const fetchRegistrationQuestions = useCallback(async () => {
        if (!currentTeam.$id || !canManageTeam) {
            setDraftRegistrationQuestions(EMPTY_REGISTRATION_QUESTIONS);
            return;
        }
        setQuestionsLoading(true);
        try {
            const questions = await teamService.getRegistrationQuestions('TEAM', currentTeam.$id, 'edit');
            setDraftRegistrationQuestions(questions.map((question) => ({
                id: question.id,
                prompt: question.prompt,
                answerType: question.answerType,
                required: question.required,
                sortOrder: question.sortOrder,
            })));
        } catch (loadError) {
            console.error('Failed to load team registration questions:', loadError);
            setDraftRegistrationQuestions(EMPTY_REGISTRATION_QUESTIONS);
        } finally {
            setQuestionsLoading(false);
        }
    }, [canManageTeam, currentTeam.$id]);

    const fetchJoinRequests = useCallback(async () => {
        if (!currentTeam.$id || !canManageTeam) {
            setJoinRequests(EMPTY_JOIN_REQUESTS);
            return;
        }
        setJoinRequestsLoading(true);
        try {
            setJoinRequests(await teamService.listTeamJoinRequests(currentTeam.$id));
        } catch (loadError) {
            console.error('Failed to load team join requests:', loadError);
            setJoinRequests(EMPTY_JOIN_REQUESTS);
        } finally {
            setJoinRequestsLoading(false);
        }
    }, [canManageTeam, currentTeam.$id]);

    const fetchTeamDetails = useCallback(async () => {
        try {
            setLoading(true);

            if (currentTeam.playerIds.length > 0) {
                const players = await userService.getUsersByIds(currentTeam.playerIds, { teamId: currentTeam.$id });
                setTeamPlayers(players);
            } else {
                setTeamPlayers([]);
            }

            if (currentTeam.pending.length > 0) {
                const pending = await userService.getUsersByIds(currentTeam.pending, { teamId: currentTeam.$id });
                setPendingPlayers(pending);
            } else {
                setPendingPlayers([]);
            }

            const managerId = currentTeam.managerId ?? currentTeam.captainId;
            const roleUserIds = [managerId, currentTeam.headCoachId, ...assistantCoachIds]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
            const roleUsers = roleUserIds.length > 0
                ? await userService.getUsersByIds(roleUserIds, { teamId: currentTeam.$id })
                : [];
            const roleUserMap = new Map(roleUsers.map((roleUser) => [roleUser.$id, roleUser]));
            setManagerUser(managerId ? roleUserMap.get(managerId) ?? null : null);
            setHeadCoachUser(currentTeam.headCoachId ? roleUserMap.get(currentTeam.headCoachId) ?? null : null);
            setAssistantCoachUsers(
                assistantCoachIds
                    .map((assistantCoachId) => roleUserMap.get(assistantCoachId))
                    .filter((roleUser): roleUser is UserData => Boolean(roleUser)),
            );

            await fetchRoleInvites();
        } catch (error) {
            console.error('Failed to fetch team details:', error);
            setError('Failed to load team details');
        } finally {
            setLoading(false);
        }
    }, [assistantCoachIds, currentTeam.$id, currentTeam.captainId, currentTeam.headCoachId, currentTeam.managerId, currentTeam.pending, currentTeam.playerIds, fetchRoleInvites]);

    useEffect(() => {
        let cancelled = false;

        if (!detailIsActive || !canManageTeam) {
            setLocalFreeAgents(EMPTY_FREE_AGENTS);
            setInviteFreeAgentContext(EMPTY_INVITE_FREE_AGENT_CONTEXT);
            return () => {
                cancelled = true;
            };
        }

        void (async () => {
            try {
                const freeAgentContext = await teamService.getInviteFreeAgentContext(currentTeam.$id);
                if (!cancelled) {
                    setInviteFreeAgentContext(freeAgentContext);
                    setLocalFreeAgents(freeAgentContext.users);
                }
            } catch (fetchError) {
                console.error('Failed to load invite free agents:', fetchError);
                if (!cancelled) {
                    setInviteFreeAgentContext(EMPTY_INVITE_FREE_AGENT_CONTEXT);
                    setLocalFreeAgents(EMPTY_FREE_AGENTS);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [canManageTeam, currentTeam.$id, detailIsActive]);

    useEffect(() => {
        if (detailIsActive) {
            void fetchTeamDetails();
        }
    }, [detailIsActive, fetchTeamDetails]);

    useEffect(() => {
        if (detailIsActive && canManageTeam) {
            void fetchRegistrationQuestions();
            void fetchJoinRequests();
        }
    }, [canManageTeam, fetchJoinRequests, fetchRegistrationQuestions, detailIsActive]);

    useEffect(() => {
        setDraftCaptainId(currentTeam.captainId || '');
    }, [currentTeam.$id, currentTeam.captainId]);

    useEffect(() => {
        if (teamPlayers.length === 0) {
            if (draftCaptainId) {
                setDraftCaptainId('');
            }
            return;
        }
        if (draftCaptainId && teamPlayers.some((player) => player.$id === draftCaptainId)) {
            return;
        }
        const nextCaptainId = teamPlayers.find((player) => player.$id === currentTeam.captainId)?.$id
            ?? teamPlayers[0]?.$id
            ?? '';
        if (nextCaptainId !== draftCaptainId) {
            setDraftCaptainId(nextCaptainId);
        }
    }, [currentTeam.captainId, draftCaptainId, teamPlayers]);

    useEffect(() => {
        if (!detailIsActive || !normalizedSelectedFreeAgentId) {
            return;
        }
        setShowAddPlayers(true);
    }, [detailIsActive, normalizedSelectedFreeAgentId]);

    useEffect(() => {
        setNewName(currentTeam.name || '');
    }, [currentTeam.$id, currentTeam.name]);

    useEffect(() => {
        setDraftSport(currentTeam.sport || '');
        const nextJoinPolicy = currentTeam.joinPolicy ?? (currentTeam.openRegistration ? 'OPEN_REGISTRATION' : 'CLOSED');
        const isJoinableTeam = nextJoinPolicy === 'OPEN_REGISTRATION' || nextJoinPolicy === 'REQUEST_TO_JOIN';
        const sportInput = currentTeam.sport || '';
        const inferred = inferDivisionDetails({
            identifier: (
                (typeof currentTeam.divisionTypeId === 'string' && currentTeam.divisionTypeId.trim().length > 0
                    ? currentTeam.divisionTypeId
                    : null)
                ?? (typeof currentTeam.division === 'string'
                    ? currentTeam.division
                : (currentTeam.division?.name || currentTeam.division?.skillLevel || 'open'))
            ),
            sportInput,
        });
        const defaults = getDefaultDivisionTypeSelections(sportInput);
        const composite = parseCompositeDivisionTypeId(currentTeam.divisionTypeId ?? inferred.divisionTypeId);
        const skillDivisionTypeId = composite?.skillDivisionTypeId
            ?? (inferred.ratingType === 'SKILL' ? inferred.divisionTypeId : defaults.skillDivisionTypeId);
        const ageDivisionTypeId = composite?.ageDivisionTypeId
            ?? (inferred.ratingType === 'AGE' ? inferred.divisionTypeId : defaults.ageDivisionTypeId);
        const gender = inferred.gender;
        setDraftDivisionGender(isJoinableTeam ? gender : '');
        setDraftSkillDivisionTypeId(isJoinableTeam ? skillDivisionTypeId : '');
        setDraftAgeDivisionTypeId(isJoinableTeam ? ageDivisionTypeId : '');
        setDraftDivision(isJoinableTeam ? resolveDraftDivisionDisplayName(gender, skillDivisionTypeId, ageDivisionTypeId, sportInput) : '');
        setDraftTeamSize(currentTeam.teamSize || 0);
        setDraftJoinPolicy(nextJoinPolicy);
        setDraftRegistrationPriceDollars((Math.max(0, Math.round(currentTeam.registrationPriceCents ?? 0)) / 100));
        setDraftAffiliateUrl(currentTeam.affiliateUrl ?? '');
    }, [
        currentTeam.$id,
        currentTeam.affiliateUrl,
        currentTeam.division,
        currentTeam.divisionTypeId,
        currentTeam.joinPolicy,
        currentTeam.openRegistration,
        currentTeam.registrationPriceCents,
        currentTeam.requiredTemplateIds,
        currentTeam.sport,
        currentTeam.teamSize,
        resolveDraftDivisionDisplayName,
    ]);

    useEffect(() => {
        setDraftRequiredTemplateIds(
            Array.isArray(currentTeam.requiredTemplateIds)
                ? currentTeam.requiredTemplateIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                : [],
        );
    }, [currentTeam.requiredTemplateIds]);

    useEffect(() => {
        if (!detailIsActive) {
            return;
        }
        if (!currentTeam.organizationId) {
            setTemplateOptions([]);
            setTemplatesLoading(false);
            return;
        }

        let cancelled = false;
        const loadTemplates = async () => {
            try {
                setTemplatesLoading(true);
                const response = await apiRequest<{ templates?: any[] }>(`/api/organizations/${currentTeam.organizationId}/templates`);
                if (cancelled) {
                    return;
                }
                const rows = Array.isArray(response.templates) ? response.templates : [];
                const options = rows
                    .map((row) => ({
                        value: String(row.$id ?? row.id ?? '').trim(),
                        label: String(row.title ?? 'Untitled template'),
                        status: String(row.status ?? '').trim().toUpperCase(),
                    }))
                    .filter((row) => row.value.length > 0 && row.status !== 'ARCHIVED')
                    .map(({ value, label }) => ({ value, label }));
                setTemplateOptions(options);
            } catch (loadError) {
                if (!cancelled) {
                    setTemplateOptions([]);
                }
            } finally {
                if (!cancelled) {
                    setTemplatesLoading(false);
                }
            }
        };

        void loadTemplates();
        return () => {
            cancelled = true;
        };
    }, [currentTeam.organizationId, detailIsActive]);

    useEffect(() => {
        if (!detailIsActive || !canManageTeam || !currentTeam.$id) {
            setMemberCompliance(null);
            setMemberComplianceError(null);
            setMemberComplianceLoading(false);
            setExpandedComplianceUserIds([]);
            return;
        }
        if (typeof fetch !== 'function') {
            setMemberCompliance(null);
            setMemberComplianceError(null);
            setMemberComplianceLoading(false);
            setExpandedComplianceUserIds([]);
            return;
        }

        let cancelled = false;
        setMemberComplianceLoading(true);
        setMemberComplianceError(null);
        apiRequest<TeamMemberComplianceResponse>(`/api/teams/${currentTeam.$id}/compliance`)
            .then((response) => {
                if (cancelled) return;
                setMemberCompliance(response.team ?? null);
            })
            .catch((loadError) => {
                if (cancelled) return;
                console.error('Failed to load team member compliance:', loadError);
                setMemberCompliance(null);
                setMemberComplianceError(loadError instanceof Error ? loadError.message : 'Failed to load billing and document status.');
            })
            .finally(() => {
                if (!cancelled) {
                    setMemberComplianceLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [canManageTeam, currentTeam.$id, detailIsActive]);

    useEffect(() => {
        const nextJerseyNumbers: Record<string, string> = {};
        const registrations = Array.isArray(currentTeam.playerRegistrations) ? currentTeam.playerRegistrations : [];
        registrations.forEach((registration) => {
            if (!registration.userId) {
                return;
            }
            nextJerseyNumbers[registration.userId] = registration.jerseyNumber ?? '';
        });
        setJerseyNumbersByUserId(nextJerseyNumbers);
    }, [currentTeam.$id, currentTeam.playerRegistrations]);

    useEffect(() => {
        if (!draftShowDivisionFields) {
            if (draftDivisionGender) {
                setDraftDivisionGender('');
            }
            if (draftSkillDivisionTypeId) {
                setDraftSkillDivisionTypeId('');
            }
            if (draftAgeDivisionTypeId) {
                setDraftAgeDivisionTypeId('');
            }
            return;
        }
        const normalizedSkill = normalizeDivisionToken(draftSkillDivisionTypeId);
        const normalizedAge = normalizeDivisionToken(draftAgeDivisionTypeId);
        const hasSkill = normalizedSkill.length > 0 && skillDivisionOptions.some((option) => option.value === normalizedSkill);
        const hasAge = normalizedAge.length > 0 && ageDivisionOptions.some((option) => option.value === normalizedAge);
        const nextSkill = hasSkill ? normalizedSkill : '';
        const nextAge = hasAge ? normalizedAge : '';
        if (nextSkill !== draftSkillDivisionTypeId) {
            setDraftSkillDivisionTypeId(nextSkill);
        }
        if (nextAge !== draftAgeDivisionTypeId) {
            setDraftAgeDivisionTypeId(nextAge);
        }
    }, [
        ageDivisionOptions,
        currentTeam.sport,
        draftAgeDivisionTypeId,
        draftDivisionGender,
        draftShowDivisionFields,
        draftSkillDivisionTypeId,
        draftSport,
        skillDivisionOptions,
    ]);

    useEffect(() => {
        if (!draftShowDivisionFields) {
            setDraftDivision('');
            return;
        }
        setDraftDivision(
            resolveDraftDivisionDisplayName(
                draftDivisionGender,
                draftSkillDivisionTypeId,
                draftAgeDivisionTypeId,
                draftSport || currentTeam.sport || '',
            ),
        );
    }, [
        currentTeam.sport,
        draftAgeDivisionTypeId,
        draftDivisionGender,
        draftShowDivisionFields,
        draftSkillDivisionTypeId,
        draftSport,
        resolveDraftDivisionDisplayName,
    ]);

    const extractFileIdFromUrl = (url: string): string => {
        try {
            const match = url.match(/\/files\/([^/]+)\/preview/);
            return match ? match[1] : '';
        } catch { return ''; }
    };

    const handleChangeImage = async (imageUrl: string) => {
        try {
            const fileId = extractFileIdFromUrl(imageUrl);
            if (!fileId) return;
            const updated = await teamService.updateTeamProfileImage(currentTeam.$id, fileId);
            if (updated) {
                onTeamUpdated?.(updated);
            }
        } catch (e) {
            console.error('Failed to update team image:', e);
            setError('Failed to update team image');
        }
    };

    const handleSaveName = async () => {
        if (!newName.trim() || newName === currentTeam.name) {
            setEditingName(false);
            return;
        }
        try {
            const updated = await teamService.updateTeamName(currentTeam.$id, newName.trim());
            if (updated) {
                onTeamUpdated?.(updated);
                setEditingName(false);
            }
        } catch (e) {
            console.error('Failed to update team name:', e);
            setError('Failed to update team name');
        }
    };

    const buildPlayerRegistrationPayload = useCallback((captainId: string) => (
        teamPlayers.map((player) => {
            const existingRegistration = activePlayerRegistrationByUserId.get(player.$id);
            return {
                id: existingRegistration?.id ?? `${currentTeam.$id}__${player.$id}`,
                teamId: currentTeam.$id,
                userId: player.$id,
                status: existingRegistration?.status ?? 'ACTIVE',
                jerseyNumber: (jerseyNumbersByUserId[player.$id] ?? '').trim() || null,
                position: existingRegistration?.position ?? null,
                isCaptain: player.$id === captainId,
            };
        })
    ), [activePlayerRegistrationByUserId, currentTeam.$id, jerseyNumbersByUserId, teamPlayers]);

    const handleSaveDetails = async () => {
        const nextSport = draftSport.trim();
        const nextTeamSize = Number(draftTeamSize) || 0;
        const nextCaptainId = draftCaptainId.trim();
        const nextAffiliateUrl = draftAffiliateUrl.trim();
        const nextJoinPolicy = nextAffiliateUrl ? 'OPEN_REGISTRATION' : draftJoinPolicy;
        const nextRegistrationEnabled = nextJoinPolicy === 'OPEN_REGISTRATION' || nextJoinPolicy === 'REQUEST_TO_JOIN';
        const nextRequiresDivision = nextRegistrationEnabled && !nextAffiliateUrl;
        const nextDivisionGender = draftDivisionGender;
        const nextSkillDivisionTypeId = normalizeDivisionToken(draftSkillDivisionTypeId);
        const nextAgeDivisionTypeId = normalizeDivisionToken(draftAgeDivisionTypeId);
        const nextDivisionTypeId = nextRequiresDivision
            ? buildCompositeDivisionTypeId(nextSkillDivisionTypeId, nextAgeDivisionTypeId)
            : null;
        const nextDivision = nextRequiresDivision
            ? buildDivisionName({
                gender: nextDivisionGender || 'C',
                sportInput: nextSport,
                skillDivisionTypeId: nextSkillDivisionTypeId,
                ageDivisionTypeId: nextAgeDivisionTypeId,
            })
            : '';
        const nextRegistrationPriceCents = nextJoinPolicy === 'REQUEST_TO_JOIN'
            ? Math.max(0, Math.round((Number(draftRegistrationPriceDollars) || 0) * 100))
            : nextJoinPolicy === 'OPEN_REGISTRATION' && canChargeForTeamRegistration && !nextAffiliateUrl
            ? Math.max(0, Math.round((Number(draftRegistrationPriceDollars) || 0) * 100))
            : 0;

        if (!nextSport) {
            setError('Sport is required.');
            return;
        }
        if (nextRequiresDivision && (!nextDivisionGender || !nextSkillDivisionTypeId || !nextAgeDivisionTypeId || !nextDivision)) {
            setError('Select gender, skill division, and age division.');
            return;
        }
        if (nextTeamSize < 1) {
            setError('Team size must be at least 1.');
            return;
        }
        if (teamPlayers.length > 0 && !nextCaptainId) {
            setError('Select a team captain.');
            return;
        }
        if (nextCaptainId && !teamPlayers.some((player) => player.$id === nextCaptainId)) {
            setError('Team captain must be selected from current team players.');
            return;
        }

        const nextQuestions = draftRegistrationEnabled
            ? draftRegistrationQuestions
                .map((question, index) => ({
                    ...question,
                    prompt: String(question.prompt ?? '').trim(),
                    answerType: question.answerType ?? 'TEXT',
                    sortOrder: index,
                }))
                .filter((question) => question.prompt.length > 0)
            : [];
        if (draftRegistrationEnabled && draftRegistrationQuestions.some((question) => String(question.prompt ?? '').trim().length === 0)) {
            setError('Registration questions cannot be blank.');
            return;
        }

        const updated = await teamService.updateTeamDetails(currentTeam.$id, {
            sport: nextSport,
            division: nextDivision,
            divisionTypeId: nextDivisionTypeId,
            teamSize: nextTeamSize,
            captainId: nextCaptainId,
            joinPolicy: nextJoinPolicy,
            openRegistration: nextJoinPolicy === 'OPEN_REGISTRATION',
            registrationPriceCents: nextRegistrationPriceCents,
            affiliateUrl: nextAffiliateUrl || null,
            requiredTemplateIds: currentTeam.organizationId ? draftRequiredTemplateIds : [],
            playerRegistrations: buildPlayerRegistrationPayload(nextCaptainId),
        });
        if (!updated) {
            setError('Failed to update team details');
            return;
        }
        await teamService.saveRegistrationQuestions('TEAM', currentTeam.$id, nextQuestions);
        await fetchRegistrationQuestions();

        onTeamUpdated?.(updated);
        setEditingDetails(false);
    };

    const handleSaveJerseyNumber = async (playerId: string) => {
        setSavingJerseyNumberIds((current) => new Set(current).add(playerId));
        setError(null);
        try {
            const updated = await teamService.updateTeamDetails(currentTeam.$id, {
                playerRegistrations: buildPlayerRegistrationPayload(currentTeam.captainId),
            });
            if (!updated) {
                setError('Failed to update jersey number');
                return;
            }
            onTeamUpdated?.(updated);
            notifications.show({ color: 'green', message: 'Jersey number updated.' });
        } catch (saveError) {
            console.error('Failed to update jersey number:', saveError);
            setError('Failed to update jersey number');
        } finally {
            setSavingJerseyNumberIds((current) => {
                const next = new Set(current);
                next.delete(playerId);
                return next;
            });
        }
    };

    const getFilteredFreeAgents = () => {
        if (!canInviteAnotherPlayer) {
            return [];
        }
        const filtered = localFreeAgents.filter((agent) => (
            !playerInviteCapacityUserIds.has(agent.$id)
                && !currentTeam.playerIds.includes(agent.$id)
                && !currentTeam.pending.includes(agent.$id)
        ));
        const limited = filtered.slice(0, 10);
        if (!normalizedSelectedFreeAgentId) {
            return limited;
        }
        const prioritized = filtered.find((agent) => agent.$id === normalizedSelectedFreeAgentId);
        if (!prioritized) {
            return limited;
        }
        return [prioritized, ...limited.filter((agent) => agent.$id !== normalizedSelectedFreeAgentId)];
    };

    const handlePlayerInviteSent = useCallback((invitedUser: UserData) => {
        const nextPendingPlayers = pendingPlayers.some((player) => player.$id === invitedUser.$id)
            ? pendingPlayers
            : [...pendingPlayers, invitedUser];
        setPendingPlayers(nextPendingPlayers);
        onTeamUpdated?.({
            ...currentTeam,
            pending: Array.from(new Set([
                ...currentTeam.pending,
                ...nextPendingPlayers.map((player) => player.$id),
            ])),
        });
    }, [currentTeam, onTeamUpdated, pendingPlayers]);

    const handleCancelRoleInvite = async (inviteId: string) => {
        setCancellingRoleInviteIds((previous) => new Set(previous).add(inviteId));
        try {
            await userService.deleteInviteById(inviteId);
            setPendingRoleInvites((previous) => previous.filter((entry) => entry.invite.$id !== inviteId));
        } catch (cancelError) {
            console.error('Failed to cancel role invite:', cancelError);
            setError('Failed to cancel role invite');
        } finally {
            setCancellingRoleInviteIds((previous) => {
                const next = new Set(previous);
                next.delete(inviteId);
                return next;
            });
        }
    };

    const handleRemovePlayer = async (playerId: string) => {
        if (removingPlayerIds.has(playerId)) {
            return;
        }
        setRemovingPlayerIds((previous) => new Set(previous).add(playerId));
        setError(null);
        try {
            if (playerId === currentTeam.captainId) {
                const nextCaptainId = draftCaptainId.trim();
                if (!editingDetails || !nextCaptainId || nextCaptainId === currentTeam.captainId) {
                    setError('Select a new captain in edit mode before removing the current captain.');
                    return;
                }
                const captainUpdated = await teamService.updateTeamRosterAndRoles(currentTeam.$id, {
                    captainId: nextCaptainId,
                });
                if (!captainUpdated) {
                    setError('Failed to update team captain.');
                    return;
                }
                onTeamUpdated?.(captainUpdated);
            }

            const updated = await teamService.removePlayerFromTeam(currentTeam.$id, playerId);

            if (!updated) {
                setError('Failed to remove player');
                return;
            }

            setTeamPlayers(prev => prev.filter(player => player.$id !== playerId));
            onTeamUpdated?.(updated);
        } catch (error) {
            console.error('Failed to remove player:', error);
            setError('Failed to remove player');
        } finally {
            setRemovingPlayerIds((previous) => {
                const next = new Set(previous);
                next.delete(playerId);
                return next;
            });
        }
    };

    const handleReviewJoinRequest = async (requestId: string, action: 'APPROVE' | 'DECLINE') => {
        if (reviewingRequestIds.has(requestId)) {
            return;
        }
        setReviewingRequestIds((previous) => new Set(previous).add(requestId));
        setError(null);
        try {
            await teamService.reviewTeamJoinRequest(currentTeam.$id, requestId, action);
            await fetchJoinRequests();
            const refreshed = await teamService.getTeamById(currentTeam.$id, true, { teamId: currentTeam.$id });
            if (refreshed) {
                onTeamUpdated?.(refreshed);
            }
            notifications.show({
                color: action === 'APPROVE' ? 'green' : 'blue',
                message: action === 'APPROVE'
                    ? 'Request approved. Use the player actions to send a bill.'
                    : 'Request declined.',
            });
        } catch (reviewError) {
            const message = reviewError instanceof Error ? reviewError.message : 'Failed to review join request.';
            setError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setReviewingRequestIds((previous) => {
                const next = new Set(previous);
                next.delete(requestId);
                return next;
            });
        }
    };

    const handleSendTeamMemberBill = async (playerId: string) => {
        if (billingPlayerIds.has(playerId)) {
            return;
        }
        const amountCents = Math.max(0, Math.round(currentTeam.registrationPriceCents ?? 0));
        if (amountCents <= 0) {
            setError('Set a team registration cost before sending a bill.');
            return;
        }
        setBillingPlayerIds((previous) => new Set(previous).add(playerId));
        setError(null);
        try {
            await teamService.createTeamMemberBill(currentTeam.$id, {
                userId: playerId,
                amountCents,
                label: `Team registration - ${currentTeam.name}`,
            });
            notifications.show({ color: 'green', message: 'Bill sent.' });
            const response = await apiRequest<TeamMemberComplianceResponse>(`/api/teams/${currentTeam.$id}/compliance`);
            setMemberCompliance(response.team ?? null);
        } catch (billError) {
            const message = billError instanceof Error ? billError.message : 'Failed to send bill.';
            setError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setBillingPlayerIds((previous) => {
                const next = new Set(previous);
                next.delete(playerId);
                return next;
            });
        }
    };

    const handleLeaveTeam = async () => {
        if (!user || leavingTeam) {
            return;
        }
        setLeavingTeam(true);
        setError(null);
        try {
            const updated = await teamService.leaveTeam(currentTeam.$id);
            if (updated) {
                onTeamUpdated?.(updated);
            }
            notifications.show({ color: 'green', message: 'You left the team.' });
        } catch (leaveError) {
            const message = leaveError instanceof Error ? leaveError.message : 'Failed to leave team.';
            setError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setLeavingTeam(false);
        }
    };

    const handleRemoveManager = async () => {
        setUpdatingRoleAction('manager');
        try {
            const updated = await teamService.updateTeamRosterAndRoles(currentTeam.$id, { managerId: '' });
            if (!updated) {
                setError('Failed to remove manager.');
                return;
            }
            onTeamUpdated?.(updated);
        } catch (roleError) {
            console.error('Failed to remove manager:', roleError);
            setError('Failed to remove manager.');
        } finally {
            setUpdatingRoleAction(null);
        }
    };

    const handleRemoveHeadCoach = async () => {
        setUpdatingRoleAction('headCoach');
        try {
            const updated = await teamService.updateTeamRosterAndRoles(currentTeam.$id, { headCoachId: null });
            if (!updated) {
                setError('Failed to remove head coach.');
                return;
            }
            onTeamUpdated?.(updated);
        } catch (roleError) {
            console.error('Failed to remove head coach:', roleError);
            setError('Failed to remove head coach.');
        } finally {
            setUpdatingRoleAction(null);
        }
    };

    const handleRemoveAssistantCoach = async (assistantCoachId: string) => {
        const nextAssistantCoachIds = assistantCoachIds.filter((coachId) => coachId !== assistantCoachId);
        const actionKey = `assistant:${assistantCoachId}`;
        setUpdatingRoleAction(actionKey);
        try {
            const updated = await teamService.updateTeamRosterAndRoles(currentTeam.$id, {
                assistantCoachIds: nextAssistantCoachIds,
                coachIds: nextAssistantCoachIds,
            });
            if (!updated) {
                setError('Failed to remove assistant coach.');
                return;
            }
            onTeamUpdated?.(updated);
        } catch (roleError) {
            console.error('Failed to remove assistant coach:', roleError);
            setError('Failed to remove assistant coach.');
        } finally {
            setUpdatingRoleAction(null);
        }
    };

    const handleCancelInvite = async (playerId: string) => {
        // Add this player to the cancelling set to show loading spinner
        setCancellingInviteIds(prev => new Set(prev).add(playerId));

        try {
            const success = await teamService.removeTeamInvitation(currentTeam.$id, playerId);

            if (success) {
                // Update local state
                setPendingPlayers(prev => prev.filter(player => player.$id !== playerId));

                // Update parent component
                const updatedTeam = {
                    ...currentTeam,
                    pending: currentTeam.pending.filter(id => id !== playerId)
                };
                onTeamUpdated?.(updatedTeam);
            }
        } catch (error) {
            console.error('Failed to cancel invite:', error);
            setError('Failed to cancel invitation');
        } finally {
            // Remove this player from the cancelling set
            setCancellingInviteIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(playerId);
                return newSet;
            });
        }
    };

    const handleDeleteTeam = async () => {
        try {
            const outcome = await teamService.deleteTeamResult(currentTeam.$id);
            if (outcome.deleted || outcome.archived || outcome.action) {
                notifications.show({
                    color: 'green',
                    message: describeDeleteOutcome(outcome, {
                        deleted: 'Team deleted.',
                        archived: 'Team archived because it has history.',
                        fallback: 'Team removed from active lists.',
                    }),
                });
                onTeamDeleted?.(currentTeam.$id);
                onClose();
            }
        } catch (error) {
            console.error('Failed to delete team:', error);
            setError('Failed to delete team');
        }
    };

    const rosterSectionClass = (pageClassName: string, modalClassName = 'mb-6') => (
        isPageMode ? pageClassName : modalClassName
    );

    const renderRosterPlayerCards = () => (
        <ResponsiveCardGrid maxCardWidth={352} className="team-roster-player-grid">
            {teamPlayers.map(player => {
                const playerRegistration = activePlayerRegistrationByUserId.get(player.$id);
                const compliance = complianceByUserId.get(player.$id);
                const expanded = expandedComplianceUserIds.includes(player.$id);
                const canExpandCompliance = canManageTeam && Boolean(compliance);
                const playerName = getUserFullName(player);
                const currentJerseyNumber = playerRegistration?.jerseyNumber ?? '';
                const jerseyDraftValue = jerseyNumbersByUserId[player.$id] ?? '';
                const jerseyNumberChanged = jerseyDraftValue.trim() !== currentJerseyNumber;
                const savingJerseyNumber = savingJerseyNumberIds.has(player.$id);
                return (
                    <Paper
                        key={player.$id}
                        withBorder
                        radius="md"
                        p="sm"
                        className="team-roster-player-card"
                        onClick={() => {
                            if (!canExpandCompliance) return;
                            setExpandedComplianceUserIds((current) => (
                                current.includes(player.$id)
                                    ? current.filter((id) => id !== player.$id)
                                    : [...current, player.$id]
                            ));
                        }}
                        style={{ cursor: canExpandCompliance ? 'pointer' : 'default' }}
                    >
                        <Stack gap="sm" h="100%">
                            <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
                                <Group align="flex-start" gap="sm" wrap="nowrap" style={{ flex: '1 1 18rem', minWidth: 0 }}>
                                    <Avatar
                                        src={getUserAvatarUrl(player, 40, playerRegistration?.jerseyNumber)}
                                        alt={playerName}
                                        size={40}
                                        radius="xl"
                                        style={{ flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text fw={500} truncate>{playerName}</Text>
                                        {getUserHandle(player) && <Text size="xs" c="dimmed" truncate>{getUserHandle(player)}</Text>}
                                        <Group gap={6} mt={4} wrap="wrap">
                                            {player.$id === currentTeam.captainId && (
                                                <Badge color="blue" variant="light" size="xs">Captain</Badge>
                                            )}
                                            {canManageTeam && compliance ? (
                                                <>
                                                    <Badge
                                                        color={compliance.payment.isPaidInFull ? 'green' : compliance.payment.paymentPending || compliance.payment.hasBill ? 'yellow' : 'gray'}
                                                        variant="light"
                                                        size="xs"
                                                    >
                                                        {formatCompliancePaymentLabel(compliance.payment)}
                                                    </Badge>
                                                    <Badge
                                                        color={compliance.documents.requiredCount > 0 && compliance.documents.signedCount < compliance.documents.requiredCount ? 'yellow' : 'green'}
                                                        variant="light"
                                                        size="xs"
                                                    >
                                                        {documentComplianceLabel(compliance.documents)}
                                                    </Badge>
                                                </>
                                            ) : null}
                                        </Group>
                                        <Group gap="xs" mt="xs" align="flex-end" wrap="wrap" onClick={(event) => event.stopPropagation()}>
                                            {canManageTeam ? (
                                                <Group gap={6} align="flex-end" wrap="nowrap">
                                                    <TextInput
                                                        label="Jersey #"
                                                        aria-label={`Jersey number for ${playerName}`}
                                                        value={jerseyDraftValue}
                                                        placeholder="--"
                                                        size="xs"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        className="team-roster-jersey-input"
                                                        onClick={(event) => event.stopPropagation()}
                                                        onFocus={(event) => event.stopPropagation()}
                                                        onChange={(event) => {
                                                            const value = event.currentTarget.value.replace(/\D/g, '');
                                                            setJerseyNumbersByUserId((current) => ({
                                                                ...current,
                                                                [player.$id]: value,
                                                            }));
                                                        }}
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        disabled={!jerseyNumberChanged}
                                                        loading={savingJerseyNumber}
                                                        aria-label={`Save jersey number for ${playerName}`}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void handleSaveJerseyNumber(player.$id);
                                                        }}
                                                    >
                                                        Save
                                                    </Button>
                                                </Group>
                                            ) : currentJerseyNumber ? (
                                                <Badge variant="light" color="gray">#{currentJerseyNumber}</Badge>
                                            ) : null}
                                            {canExpandCompliance ? (
                                                <Button
                                                    variant="light"
                                                    size="xs"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setExpandedComplianceUserIds((current) => (
                                                            current.includes(player.$id)
                                                                ? current.filter((id) => id !== player.$id)
                                                                : [...current, player.$id]
                                                        ));
                                                    }}
                                                >
                                                    {expanded ? 'Collapse' : 'Details'}
                                                </Button>
                                            ) : null}
                                            {canManageTeam && (
                                                (player.$id !== currentTeam.captainId)
                                                || (editingDetails && draftCaptainId.trim().length > 0 && draftCaptainId !== currentTeam.captainId)
                                            ) && (
                                                <Button
                                                    color="red"
                                                    variant="subtle"
                                                    size="xs"
                                                    loading={removingPlayerIds.has(player.$id)}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handleRemovePlayer(player.$id);
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            )}
                                        </Group>
	                                    </div>
	                                </Group>
	                            </Group>
                            {expanded && compliance ? (
                                <Paper withBorder radius="sm" p="sm" bg="gray.0">
                                    <Stack gap="xs">
                                        <Group justify="space-between" wrap="wrap">
                                            <Text size="sm" fw={600}>Billing</Text>
                                            <Group gap="xs">
                                                <Text size="sm" c={compliance.payment.isPaidInFull ? 'green' : 'yellow'}>
                                                    {formatCompliancePaymentLabel(compliance.payment)}
                                                </Text>
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    loading={billingPlayerIds.has(player.$id)}
                                                    disabled={registrationPriceCents <= 0}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handleSendTeamMemberBill(player.$id);
                                                    }}
                                                >
                                                    Send Bill
                                                </Button>
                                            </Group>
                                        </Group>
                                        <Group justify="space-between" wrap="wrap">
                                            <Text size="sm" fw={600}>Documents</Text>
                                            <Text size="sm" c={compliance.documents.requiredCount > 0 && compliance.documents.signedCount < compliance.documents.requiredCount ? 'yellow' : 'green'}>
                                                {documentComplianceLabel(compliance.documents)}
                                            </Text>
                                        </Group>
                                        {compliance.requiredDocuments.length > 0 ? (
                                            <Stack gap={6}>
                                                {compliance.requiredDocuments.map((document) => (
                                                    <Group key={document.key} justify="space-between" align="center" wrap="wrap">
                                                        <div>
                                                            <Text size="sm">{document.title}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                {document.signerLabel}
                                                                {document.signOnce ? ' - Sign once' : ' - Team-specific'}
                                                            </Text>
                                                        </div>
                                                        <Badge color={document.status === 'SIGNED' ? 'green' : 'yellow'} variant="light">
                                                            {document.status === 'SIGNED' ? 'Signed' : 'Needs signature'}
                                                        </Badge>
                                                    </Group>
                                                ))}
                                            </Stack>
                                        ) : (
                                            <Text size="xs" c="dimmed">No required documents for this user.</Text>
                                        )}
                                        {(compliance.registrationAnswers ?? []).length > 0 ? (
                                            <Stack gap={6}>
                                                <Text size="sm" fw={600}>Registration answers</Text>
                                                {(compliance.registrationAnswers ?? []).map((answer) => (
                                                    <div key={answer.questionId} className="rounded-md border border-gray-200 bg-white p-2">
                                                        <Text size="xs" c="dimmed">{answer.prompt}</Text>
                                                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                                            {answer.answer || 'No answer'}
                                                        </Text>
                                                    </div>
                                                ))}
                                            </Stack>
                                        ) : (
                                            <Text size="xs" c="dimmed">No registration answers submitted.</Text>
                                        )}
                                    </Stack>
                                </Paper>
                            ) : null}
                        </Stack>
                    </Paper>
                );
            })}
        </ResponsiveCardGrid>
    );

    const editDetailsModal = canManageTeam ? (
        <Modal
            opened={editingDetails}
            onClose={() => setEditingDetails(false)}
            title="Edit Team Details"
            size="lg"
            centered
            scrollAreaComponent={ScrollArea.Autosize}
        >
            <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <NumberInput
                        label="Team Size"
                        min={1}
                        value={draftTeamSize}
                        onChange={(value) => setDraftTeamSize(Number(value) || 1)}
                    />
                    <MantineSelect
                        label="Sport"
                        data={sportOptions}
                        value={draftSport || null}
                        onChange={(value) => setDraftSport(value || '')}
                        searchable
                        clearable
                        nothingFoundMessage="No sports found"
                    />
                    <div>
                        <Text size="sm" fw={500} mb={4}>Join mode</Text>
                        <SegmentedControl
                            fullWidth
                            data={[
                                { value: 'CLOSED', label: 'Closed' },
                                { value: 'OPEN_REGISTRATION', label: 'Open' },
                                { value: 'REQUEST_TO_JOIN', label: 'Request' },
                            ]}
                            value={draftJoinPolicy}
                            onChange={(value) => {
                                const nextPolicy = value as TeamJoinPolicy;
                                setDraftJoinPolicy(nextPolicy);
                                if (nextPolicy === 'CLOSED') {
                                    setDraftAffiliateUrl('');
                                }
                            }}
                        />
                        <Text size="xs" c="dimmed" mt={4}>
                            {draftRequestOnly
                                ? 'Players submit a request and wait for manager approval.'
                                : draftJoinPolicy === 'OPEN_REGISTRATION'
                                    ? 'Players can join immediately from the team view.'
                                    : 'Players cannot join from the team view.'}
                        </Text>
                    </div>
                    <MantineSelect
                        label="Team Captain"
                        placeholder={teamPlayers.length > 0 ? 'Select a captain' : 'No team players available'}
                        data={teamPlayers.map((player) => ({
                            value: player.$id,
                            label: getUserFullName(player),
                        }))}
                        value={draftCaptainId || null}
                        onChange={(value) => setDraftCaptainId(value || '')}
                        disabled={teamPlayers.length === 0}
                        allowDeselect={false}
                    />
                    {draftRegistrationEnabled ? (
                        <>
                            {!draftAffiliateUrl.trim() ? (
                                <NumberInput
                                    label="Registration cost"
                                    description={
                                        draftRequestOnly
                                            ? 'Shown as an expected cost and default bill amount. Players are not prompted to pay when requesting.'
                                            : canChargeForTeamRegistration
                                                ? 'Leave at $0 for free registration.'
                                                : 'Connect Stripe to charge for registration. Free registration is still available.'
                                    }
                                    min={0}
                                    decimalScale={2}
                                    fixedDecimalScale
                                    prefix="$"
                                    value={draftRegistrationPriceDollars}
                                    onChange={(value) => {
                                        const numeric = typeof value === 'number' ? value : Number(value);
                                        setDraftRegistrationPriceDollars(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
                                    }}
                                    disabled={draftJoinPolicy === 'OPEN_REGISTRATION' && !canChargeForTeamRegistration}
                                />
                            ) : null}
                            <TextInput
                                label="Affiliate registration link"
                                description="When present, search results send players to this external registration page."
                                value={draftAffiliateUrl}
                                onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    setDraftAffiliateUrl(value);
                                    if (value.trim()) {
                                        setDraftJoinPolicy('OPEN_REGISTRATION');
                                    }
                                }}
                                placeholder="https://example.com/team-registration"
                            />
                        </>
                    ) : null}
                    {draftShowDivisionFields ? (
                        <>
                            <MantineSelect
                                label="Gender"
                                data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                value={draftDivisionGender || null}
                                onChange={(value) => setDraftDivisionGender((value as DivisionGenderInput) || '')}
                                clearable
                            />
                            <MantineSelect
                                label="Skill Division"
                                data={skillDivisionOptions}
                                value={draftSkillDivisionTypeId || null}
                                onChange={(value) => setDraftSkillDivisionTypeId(value || '')}
                                searchable
                                clearable
                            />
                            <MantineSelect
                                label="Age Division"
                                data={ageDivisionOptions}
                                value={draftAgeDivisionTypeId || null}
                                onChange={(value) => setDraftAgeDivisionTypeId(value || '')}
                                searchable
                                clearable
                            />
                            <TextInput
                                label="Division Preview"
                                value={draftDivision}
                                readOnly
                            />
                        </>
                    ) : null}
                </SimpleGrid>

                {draftRequestOnly && (
                    <Alert color="yellow" variant="light">
                        Players will not be prompted for payment during request submission. Use player actions after approval to send a bill.
                    </Alert>
                )}

                {draftRegistrationEnabled && (
                    <Paper withBorder radius="md" p="sm">
                        <Group justify="space-between" mb="xs">
                            <div>
                                <Text fw={500} size="sm">Registration questions</Text>
                                <Text size="xs" c="dimmed">Players answer these before joining or requesting to join.</Text>
                            </div>
                            <Group gap="xs">
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    aria-expanded={!registrationQuestionsCollapsed}
                                    aria-controls="team-registration-questions-content"
                                    onClick={() => setRegistrationQuestionsCollapsed((current) => !current)}
                                >
                                    {registrationQuestionsCollapsed ? 'Expand' : 'Collapse'}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => {
                                        setRegistrationQuestionsCollapsed(false);
                                        setDraftRegistrationQuestions((current) => [
                                            ...current,
                                            {
                                                prompt: '',
                                                answerType: 'TEXT',
                                                required: false,
                                                sortOrder: current.length,
                                            },
                                        ]);
                                    }}
                                >
                                    Add Question
                                </Button>
                            </Group>
                        </Group>
                        <Collapse in={!registrationQuestionsCollapsed}>
                            <Stack id="team-registration-questions-content" gap="xs">
                                {questionsLoading ? (
                                    <Group gap={6}>
                                        <Loader size="xs" />
                                        <Text size="xs" c="dimmed">Loading questions</Text>
                                    </Group>
                                ) : draftRegistrationQuestions.length > 0 ? (
                                    <Stack gap="xs">
                                        {draftRegistrationQuestions.map((question, index) => (
                                            <Stack key={question.id ?? `draft-${index}`} gap={6}>
                                                <TextInput
                                                    label={`Question ${index + 1}`}
                                                    value={question.prompt}
                                                    onChange={(event) => {
                                                        const value = event.currentTarget.value;
                                                        setDraftRegistrationQuestions((current) => current.map((entry, entryIndex) => (
                                                            entryIndex === index ? { ...entry, prompt: value } : entry
                                                        )));
                                                    }}
                                                />
                                                <Group justify="space-between">
                                                    <Checkbox
                                                        label="Required"
                                                        checked={Boolean(question.required)}
                                                        onChange={(event) => {
                                                            const checked = event.currentTarget.checked;
                                                            setDraftRegistrationQuestions((current) => current.map((entry, entryIndex) => (
                                                                entryIndex === index ? { ...entry, required: checked } : entry
                                                            )));
                                                        }}
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        color="red"
                                                        onClick={() => setDraftRegistrationQuestions((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Group>
                                            </Stack>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Text size="xs" c="dimmed">No registration questions yet.</Text>
                                )}
                            </Stack>
                        </Collapse>
                    </Paper>
                )}

                {currentTeam.organizationId && (
                    <div>
                        <MultiSelect
                            label="Required Documents"
                            data={templateOptions}
                            value={draftRequiredTemplateIds}
                            onChange={setDraftRequiredTemplateIds}
                            placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
                            searchable
                            clearable
                            disabled={templatesLoading}
                            nothingFoundMessage="No templates found"
                        />
                        {!templatesLoading && templateOptions.length === 0 && (
                            <Text size="xs" c="dimmed" mt={4}>
                                No templates available for this organization yet.
                            </Text>
                        )}
                    </div>
                )}

                <Group justify="flex-end">
                    <Button variant="default" onClick={() => setEditingDetails(false)}>Cancel</Button>
                    <Button onClick={() => { void handleSaveDetails(); }}>Save Team Details</Button>
                </Group>
            </Stack>
        </Modal>
    ) : null;

    const detailContent = (
        <>
                <div style={{ padding: isPageMode ? 0 : 16 }}>
                    <Group justify="space-between" align="center" mb="sm">
                        <Group gap="md" align="center">
                            <Avatar src={getTeamAvatarUrl(currentTeam, 60)} alt={currentTeam.name} size={60} radius="xl" />
                            <div>
                                {editingName ? (
                                    <Group gap="xs">
                                        <TextInput value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
                                        <Button size="xs" onClick={handleSaveName}>Save</Button>
                                        <Button size="xs" variant="subtle" onClick={() => { setEditingName(false); setNewName(currentTeam.name || ''); }}>Cancel</Button>
                                    </Group>
                                ) : (
                                    <Title order={3}>{currentTeam.name}</Title>
                                )}
                                <Text c="dimmed">{currentTeam.sport ? `${teamDivisionLabel} - ${currentTeam.sport}` : teamDivisionLabel}</Text>
                            </div>
                        </Group>
                        {canManageTeam && (
                            <Group gap="xs">
                                {!editingName && (
                                    <Button variant="subtle" size="xs" onClick={() => setEditingName(true)}>Edit Name</Button>
                                )}
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={() => setEditingDetails(true)}
                                >
                                    Edit Team Details
                                </Button>
                                <Button variant="default" size="xs" onClick={() => setImagePickerOpen(true)}>Change Image</Button>
                            </Group>
                        )}
                    </Group>
                </div>
                <div style={{ padding: isPageMode ? 0 : 24, paddingTop: 0 }}>
                    {canManageTeam && getFilteredFreeAgents().length > 0 && (
                        <Alert color="blue" variant="light" mb="md" title="Current event free agents">
                            <Text size="sm" c="blue">
                                {getFilteredFreeAgents().length} free agents available to invite.
                            </Text>
                        </Alert>
                    )}

                    {/* Error Display */}
                    {error && (
                        <Alert color="red" variant="light" mb="md" withCloseButton onClose={() => setError(null)}>{error}</Alert>
                    )}

                    {showTeamDetailTabs && (
                        <SegmentedControl
                            value={detailTab}
                            onChange={(value) => onActiveTabChange?.((value as TeamDetailPageTab) || 'roster')}
                            data={detailTabs}
                            className="org-tab-segmented"
                            radius="xl"
                            mb="lg"
                        />
                    )}

                    {showScheduleTab && (
                        <div className="org-tab-content">
                            <ScheduleCalendarPanel
                                endpoint={`/api/teams/${encodeURIComponent(currentTeam.$id)}/schedule?limit=300`}
                                title="Team Schedule"
                                description="Events and matches for this team."
                                loadingText="Loading team schedule..."
                                errorText="Failed to load team schedule. Please try again."
                                emptyText="No team schedule entries found."
                                emptyAgendaText="No upcoming team schedule entries found."
                                titleOrder={4}
                                minHeight={620}
                                className="team-schedule-calendar-shell"
                            />
                        </div>
                    )}

                    {showFinanceTab && canManageTeam && currentTeam.organizationId && (
                        <div className="org-tab-content">
                            <TeamFinancePanel
                                teamId={currentTeam.$id}
                                organizationId={currentTeam.organizationId}
                                isActive={detailIsActive}
                                canManage={canManageTeam}
                            />
                        </div>
                    )}

                    {showFinanceTab && !canManageTeam && (
                        <div className="org-tab-content">
                            <Paper withBorder radius="md" p="xl" ta="center" className="org-tab-surface">
                                <Text fw={700}>Finance is available to team managers.</Text>
                                <Text size="sm" c="dimmed" mt={4}>
                                    Ask an organization administrator for access if you need team finance details.
                                </Text>
                            </Paper>
                        </div>
                    )}

                    {showRosterTab && (
                        <div className={isPageMode ? 'org-tab-content team-detail-roster-grid' : undefined}>

                    {/* Team Stats */}
                    <SimpleGrid
                        cols={isPageMode ? { base: 1, sm: 2, lg: 1 } : { base: 1, md: 2 }}
                        spacing="md"
                        mb={isPageMode ? 0 : 'md'}
                        className={isPageMode ? 'team-detail-roster-side team-detail-roster-stats' : undefined}
                    >
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{playerInviteCapacityCount}/{currentTeam.teamSize}</Title>
                            <Text c="dimmed">Player Slots</Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{pendingPlayers.length}</Title>
                            <Text c="dimmed">Pending Invites</Text>
                        </Paper>
                    </SimpleGrid>

                    {/* Team Staff Roles */}
                    <div className={rosterSectionClass('team-detail-roster-side')}>
                        <Title order={5} mb="sm">Team Staff</Title>
                        <Paper withBorder radius="md" p="md">
                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>Manager</Text>
                                <Group gap="xs" align="center">
                                    <Text c="dimmed" size="sm">
                                        {managerUser ? getUserFullName(managerUser) : 'Unassigned'}
                                    </Text>
                                    {canManageTeam && editingDetails && currentTeam.managerId && (
                                        <Button
                                            color="red"
                                            variant="subtle"
                                            size="xs"
                                            onClick={() => { void handleRemoveManager(); }}
                                            loading={updatingRoleAction === 'manager'}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </Group>
                            </Group>
                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>Head Coach</Text>
                                <Group gap="xs" align="center">
                                    <Text c="dimmed" size="sm">
                                        {headCoachUser ? getUserFullName(headCoachUser) : 'Unassigned'}
                                    </Text>
                                    {canManageTeam && editingDetails && currentTeam.headCoachId && (
                                        <Button
                                            color="red"
                                            variant="subtle"
                                            size="xs"
                                            onClick={() => { void handleRemoveHeadCoach(); }}
                                            loading={updatingRoleAction === 'headCoach'}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </Group>
                            </Group>
                            <div>
                                <Text fw={500} mb={4}>Assistant Coaches</Text>
                                {assistantCoachEntries.length > 0 ? (
                                    <div className="space-y-2">
                                        {assistantCoachEntries.map((entry) => {
                                            const actionKey = `assistant:${entry.id}`;
                                            return (
                                                <Group key={entry.id} justify="space-between" gap="xs">
                                                    <Text c="dimmed" size="sm">
                                                        {entry.user ? getUserFullName(entry.user) : entry.id}
                                                    </Text>
                                                    {canManageTeam && editingDetails && (
                                                        <Button
                                                            color="red"
                                                            variant="subtle"
                                                            size="xs"
                                                            onClick={() => { void handleRemoveAssistantCoach(entry.id); }}
                                                            loading={updatingRoleAction === actionKey}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </Group>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Text c="dimmed" size="sm">Unassigned</Text>
                                )}
                            </div>
                        </Paper>
                    </div>

                    {/* Pending Staff Invitations */}
                    {pendingRoleInvites.length > 0 && (
                        <div className={rosterSectionClass('team-detail-roster-side')}>
                            <Title order={5} mb="sm">Pending Staff Invitations ({pendingRoleInvites.length})</Title>
                            <div className="space-y-3">
                                {pendingRoleInvites.map(({ invite, invitedUser }) => {
                                    const inviteRole = getPendingInviteRole(currentTeam, invite);
                                    const inviteRoleLabel = inviteRole === 'team_manager'
                                        ? 'Manager'
                                        : inviteRole === 'team_head_coach'
                                        ? 'Head Coach'
                                        : 'Assistant Coach';
                                    const isCancellingInvite = cancellingRoleInviteIds.has(invite.$id);
                                    return (
                                        <Paper key={invite.$id} withBorder radius="md" p="sm" bg="yellow.0">
                                            <Group justify="space-between">
                                                <div>
                                                    <Text fw={500}>{invitedUser ? getUserFullName(invitedUser) : invite.email ?? 'Unknown user'}</Text>
                                                    {invitedUser && getUserHandle(invitedUser) && (
                                                        <Text size="xs" c="dimmed">{getUserHandle(invitedUser)}</Text>
                                                    )}
                                                    <Text size="xs" c="dimmed">Role: {inviteRoleLabel}</Text>
                                                </div>
                                                {canManageTeam && (
                                                    <Button
                                                        color="red"
                                                        variant="subtle"
                                                        size="xs"
                                                        onClick={() => handleCancelRoleInvite(invite.$id)}
                                                        loading={isCancellingInvite}
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                            </Group>
                                        </Paper>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {canManageTeam && currentTeam.organizationId && !showTeamDetailTabs && (
                        <div className={rosterSectionClass('team-detail-roster-main')}>
                            <TeamFinancePanel
                                teamId={currentTeam.$id}
                                organizationId={currentTeam.organizationId}
                                isActive={detailIsActive}
                                canManage={canManageTeam}
                            />
                        </div>
                    )}

                    {canManageTeam && (
                        <div className={rosterSectionClass('team-detail-roster-main')}>
                            <Group justify="space-between" mb="sm">
                                <Title order={5}>Join Requests ({joinRequests.filter((request) => request.status === 'PENDING').length})</Title>
                                {joinRequestsLoading ? (
                                    <Group gap={6}>
                                        <Loader size="xs" />
                                        <Text size="xs" c="dimmed">Loading requests</Text>
                                    </Group>
                                ) : null}
                            </Group>
                            {joinRequests.filter((request) => request.status === 'PENDING').length > 0 ? (
                                <Stack gap="sm">
                                    {joinRequests.filter((request) => request.status === 'PENDING').map((request) => {
                                        const applicant = request.registrant
                                            ? ({ ...request.registrant, $id: request.registrantUserId } as UserData)
                                            : null;
                                        return (
                                            <Paper key={request.id} withBorder radius="md" p="sm">
                                                <Stack gap="sm">
                                                    <Group justify="space-between" align="flex-start">
                                                        <div>
                                                            <Text fw={600}>{applicant ? getUserFullName(applicant) : request.registrantUserId}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                {request.registrantType === 'CHILD' ? 'Child player request' : 'Player request'}
                                                            </Text>
                                                        </div>
                                                        <Badge variant="light" color="yellow">Pending</Badge>
                                                    </Group>
                                                    <Stack gap={6}>
                                                        {(request.answers ?? []).length > 0 ? request.answers?.map((answer) => (
                                                            <Paper key={answer.questionId} withBorder radius="sm" p="xs" bg="gray.0">
                                                                <Text size="xs" fw={600}>{answer.prompt}</Text>
                                                                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                                                    {answer.answer.trim() || 'No answer'}
                                                                </Text>
                                                            </Paper>
                                                        )) : (
                                                            <Text size="xs" c="dimmed">No answers submitted.</Text>
                                                        )}
                                                    </Stack>
                                                    <Group justify="flex-end">
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            loading={reviewingRequestIds.has(request.id)}
                                                            onClick={() => { void handleReviewJoinRequest(request.id, 'DECLINE'); }}
                                                        >
                                                            Decline
                                                        </Button>
                                                        <Button
                                                            size="xs"
                                                            loading={reviewingRequestIds.has(request.id)}
                                                            onClick={() => { void handleReviewJoinRequest(request.id, 'APPROVE'); }}
                                                        >
                                                            Approve
                                                        </Button>
                                                    </Group>
                                                </Stack>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            ) : (
                                <Text size="sm" c="dimmed">No pending join requests.</Text>
                            )}
                        </div>
                    )}

                    {/* Roster */}
                    <div className={rosterSectionClass('team-detail-roster-main')}>
                        <Group justify="space-between" mb="sm">
                            <Title order={5}>Roster ({teamPlayers.length})</Title>
                            {canManageTeam && memberComplianceLoading ? (
                                <Group gap={6}>
                                    <Loader size="xs" />
                                    <Text size="xs" c="dimmed">Loading status</Text>
                                </Group>
                            ) : null}
                        </Group>
                        {canManageTeam && memberComplianceError ? (
                            <Alert color="red" variant="light" mb="sm">
                                {memberComplianceError}
                            </Alert>
                        ) : null}
                        {teamPlayers.length > 0 ? (
                            isPageMode
                                ? renderRosterPlayerCards()
                                : (
                                    <ScrollArea.Autosize mah={360} type="auto">
                                        {renderRosterPlayerCards()}
                                    </ScrollArea.Autosize>
                                )
                        ) : (
                            <Text c="dimmed" ta="center" py={8}>
                                {canManageTeam ? 'Invite some players to build your team!' : 'This team is just getting started.'}
                            </Text>
                        )}
                    </div>

                    {/* Pending Invitations */}
                    {pendingPlayers.length > 0 && (
                        <div className={rosterSectionClass('team-detail-roster-main')}>
                            <h4 className="text-lg font-semibold mb-4">Pending Invitations ({pendingPlayers.length})</h4>
                            <ResponsiveCardGrid maxCardWidth={352} className="team-roster-player-grid">
                                {pendingPlayers.map(player => {
                                    const isFromEvent = localFreeAgents.some(agent => agent.$id === player.$id);
                                    const isCancelling = cancellingInviteIds.has(player.$id);

                                    return (
                                        <div
                                            key={player.$id}
                                            className={`flex h-full items-start justify-between gap-3 p-3 rounded-lg border ${isFromEvent
                                                ? 'bg-blue-50 border-blue-200'
                                                : 'bg-yellow-50 border-yellow-200'
                                                }`}
                                        >
                                            <div className="flex min-w-0 items-start space-x-3">
                                                <Image
                                                    src={getUserAvatarUrl(player, 40)}
                                                    alt={getUserFullName(player)}
                                                    width={40}
                                                    height={40}
                                                    unoptimized
                                                    className="w-10 h-10 rounded-full object-cover shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{getUserFullName(player)}</p>
                                                    {getUserHandle(player) && (
                                                        <p className="text-xs text-gray-500 truncate">{getUserHandle(player)}</p>
                                                    )}
                                                    <span className={`text-xs font-medium ${isFromEvent ? 'text-blue-600' : 'text-yellow-600'
                                                        }`}>
                                                        {isFromEvent ? 'Free Agent - Invitation pending' : 'Invitation pending'}
                                                    </span>
                                                </div>
                                            </div>
                                            {canManageTeam && (
                                                <button
                                                    onClick={() => handleCancelInvite(player.$id)}
                                                    disabled={isCancelling}
                                                    className={`flex shrink-0 items-center space-x-1 text-sm transition-colors ${isCancelling
                                                        ? 'text-gray-400 cursor-not-allowed'
                                                        : 'text-red-600 hover:text-red-800'
                                                        }`}
                                                >
                                                    {isCancelling ? (
                                                        <>
                                                            <svg
                                                                className="animate-spin h-4 w-4"
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <circle
                                                                    className="opacity-25"
                                                                    cx="12"
                                                                    cy="12"
                                                                    r="10"
                                                                    stroke="currentColor"
                                                                    strokeWidth="4"
                                                                />
                                                                <path
                                                                    className="opacity-75"
                                                                    fill="currentColor"
                                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                                />
                                                            </svg>
                                                            <span>Cancelling...</span>
                                                        </>
                                                    ) : (
                                                        <span>Cancel</span>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </ResponsiveCardGrid>
                        </div>
                    )}

                    {/* Add Team Role Invites Section */}
                    {canManageTeam && (
                        <div className={rosterSectionClass('team-detail-roster-main')}>
                            <Button onClick={() => setShowAddPlayers(true)} mb="sm">
                                Invite Roster Members
                            </Button>
                            <InvitePlayersModal
                                isOpen={showAddPlayers}
                                onClose={() => setShowAddPlayers(false)}
                                team={currentTeam}
                                freeAgentContext={inviteFreeAgentContext}
                                selectedFreeAgentId={selectedFreeAgentId}
                                selectedFreeAgentUser={selectedFreeAgentUser}
                                pendingRoleInvites={pendingRoleInvites}
                                onPlayerInviteSent={handlePlayerInviteSent}
                                onRoleInvitesChanged={fetchRoleInvites}
                                onTeamUpdated={onTeamUpdated}
                                onInvitesSent={fetchTeamDetails}
                            />
                        </div>
                    )}

                    {showSelfServiceRegistrationActions && currentAffiliateUrl && (
                        <div className={rosterSectionClass('team-detail-roster-main', '')}>
                            <Paper withBorder radius="md" p="md" mb={isPageMode ? 0 : 'md'}>
                                <Group justify="space-between" align="center">
                                    <div>
                                        <Title order={5}>Team registration</Title>
                                        <Text size="sm" c="dimmed">
                                            Registration happens on the linked site.
                                        </Text>
                                    </div>
                                    <Button
                                        onClick={() => window.open(currentAffiliateUrl, '_blank', 'noopener,noreferrer')}
                                    >
                                        Register
                                    </Button>
                                </Group>
                            </Paper>
                        </div>
                    )}

                    {showSelfServiceRegistrationActions && !currentAffiliateUrl && (
                        <div className={rosterSectionClass('team-detail-roster-main', '')}>
                            <TeamRegistrationFlow
                                team={currentTeam}
                                user={user}
                                paymentSummary={teamPaymentSummary}
                                onRequireAuth={() => {
                                    notifications.show({ color: 'red', message: 'Sign in to register for this team.' });
                                }}
                                onTeamUpdated={(updatedTeam) => {
                                    onTeamUpdated?.(updatedTeam);
                                }}
                                onErrorChange={setError}
                            >
                                {(flow) => (
                                    <Paper withBorder radius="md" p="md" mb={isPageMode ? 0 : 'md'}>
                                        {flow.currentUserActiveMember ? (
                                            <Group justify="space-between" align="center">
                                                <div>
                                                    <Title order={5}>Team membership</Title>
                                                    <Text size="sm" c="dimmed">You are on this team.</Text>
                                                </div>
                                                <Group>
                                                    {flow.actionVisible && flow.shouldOfferDocumentReview && (
                                                        <Button
                                                            variant="default"
                                                            loading={flow.actionLoading}
                                                            onClick={() => { flow.openFlow(); }}
                                                            disabled={flow.actionDisabled}
                                                        >
                                                            {flow.actionLabel}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        color="red"
                                                        variant="light"
                                                        loading={leavingTeam}
                                                        onClick={() => { void handleLeaveTeam(); }}
                                                    >
                                                        Leave Team
                                                    </Button>
                                                </Group>
                                            </Group>
                                        ) : (
                                            <Group justify="space-between" align="center">
                                                <div>
                                                    <Title order={5}>Team registration</Title>
                                                    <Text size="sm" c="dimmed">
                                                        {flow.team.openRegistration
                                                            ? `Registration is ${formatPrice(Math.max(0, Math.round(flow.team.registrationPriceCents ?? 0)))}.`
                                                            : 'Registration is not open for this team.'}
                                                    </Text>
                                                    {flow.currentUserPaymentPending ? (
                                                        <Text size="xs" c="dimmed">Your bank payment is processing. Registration is pending until it clears.</Text>
                                                    ) : flow.currentUserPendingRegistration ? (
                                                        <Text size="xs" c="dimmed">Your registration is waiting for payment confirmation.</Text>
                                                    ) : null}
                                                    {flow.team.openRegistration && !flow.teamHasCapacity && !flow.currentUserPendingRegistration && !flow.currentUserPaymentPending && (
                                                        <Text size="xs" c="red">This team is full.</Text>
                                                    )}
                                                </div>
                                                {flow.actionVisible && (
                                                    <Button
                                                        disabled={flow.actionDisabled}
                                                        loading={flow.actionLoading}
                                                        onClick={() => { flow.openFlow(); }}
                                                    >
                                                        {flow.actionLabel}
                                                    </Button>
                                                )}
                                            </Group>
                                        )}
                                    </Paper>
                                )}
                            </TeamRegistrationFlow>
                        </div>
                    )}

                    {/* Delete Team Section */}
                    {canManageTeam && (
                        <div className={isPageMode ? 'team-detail-roster-side team-detail-roster-danger' : 'border-t pt-6'}>
                            <Paper withBorder radius="md" p="md" bg={'red.0'}>
                                <Title order={5} c="red" mb={4}>Danger Zone</Title>
                                <Text c="red" size="sm" mb="sm">Teams with history are archived so registrations, bills, and schedules stay traceable.</Text>
                                <Button color="red" onClick={() => setShowDeleteConfirm(true)}>Delete Team</Button>
                            </Paper>
                        </div>
                    )}
                        </div>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <Modal opened={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Team" centered>
                        <Text c="dimmed" mb="sm">Referenced teams will be archived instead of permanently deleted.</Text>
                        <Text size="sm" mb="md">
                            Are you sure you want to delete <strong>{`"${currentTeam.name}"`}</strong>? If it has registrations, billing, or schedule history, it will be hidden from active lists and kept for records.
                        </Text>
                        <Group grow>
                            <Button variant="default" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                            <Button color="red" onClick={handleDeleteTeam}>Delete Team</Button>
                        </Group>
                    </Modal>
                )}
        </>
    );

    return (
        <>
            {isPageMode ? (
                detailContent
            ) : (
                <Modal opened={isOpen} onClose={onClose} size="xl" centered withCloseButton>
                    {detailContent}
                </Modal>
            )}
            {editDetailsModal}
            <ImageSelectionModal
                onSelect={handleChangeImage}
                onClose={() => setImagePickerOpen(false)}
                isOpen={imagePickerOpen}
            />
        </>
    );
}
