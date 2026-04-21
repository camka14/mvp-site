// components/ui/TeamDetailModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import { Modal, Group, Text, Title, Button, Paper, SimpleGrid, Avatar, Badge, Alert, TextInput, ScrollArea, SegmentedControl, NumberInput, Select as MantineSelect, Checkbox } from '@mantine/core';
import { Invite, Team, UserData, Event, PaymentIntent, SPORTS_LIST, getUserFullName, getUserAvatarUrl, getTeamAvatarUrl, getUserHandle, formatPrice } from '@/types';
import type { TeamPlayerRegistration } from '@/types';
import { useApp } from '@/app/providers';
import { teamService } from '@/lib/teamService';
import { paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import {
    buildDivisionName,
    getDivisionTypeById,
    getDivisionTypeOptionsForSport,
    inferDivisionDetails,
} from '@/lib/divisionTypes';
import { ImageSelectionModal } from './ImageSelectionModal';
import PaymentModal, { type PaymentEventSummary } from './PaymentModal';

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
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
type TeamInviteRoleType = 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach';
const TEAM_ROLE_INVITE_TYPES = ['TEAM'] as const;
const DIVISION_GENDER_OPTIONS = [
    { value: 'M', label: 'Mens' },
    { value: 'F', label: 'Womens' },
    { value: 'C', label: 'CoEd' },
] as const;
const DEFAULT_AGE_DIVISION_FALLBACK = '18plus';
const PREFERRED_AGE_DIVISION_IDS = ['18plus', '19plus', 'u18', '18u', 'u19', '19u'] as const;
const EMPTY_FREE_AGENTS: UserData[] = [];

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

const humanizeDivisionTypeId = (value: string): string => value
    .split('_')
    .filter(Boolean)
    .map((chunk) => (chunk.length <= 3 ? chunk.toUpperCase() : `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}`))
    .join(' ');

const resolveDivisionTypeName = (
    sportInput: string | null | undefined,
    divisionTypeId: string,
    ratingType: 'AGE' | 'SKILL',
): string => {
    const normalizedId = normalizeDivisionToken(divisionTypeId);
    if (!normalizedId.length) {
        return ratingType === 'SKILL' ? 'Open' : '18+';
    }
    return getDivisionTypeById(sportInput ?? null, normalizedId, ratingType)?.name ?? humanizeDivisionTypeId(normalizedId);
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

const ACTIVE_PLAYER_REGISTRATION_STATUSES = new Set(['ACTIVE', 'STARTED']);

const isActivePlayerRegistration = (registration: TeamPlayerRegistration): boolean => (
    ACTIVE_PLAYER_REGISTRATION_STATUSES.has(String(registration.status ?? '').trim().toUpperCase())
);

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
}: TeamDetailModalProps) {
    const { user } = useApp();
    const [showAddPlayers, setShowAddPlayers] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserData[]>([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [teamPlayers, setTeamPlayers] = useState<UserData[]>([]);
    const [pendingPlayers, setPendingPlayers] = useState<UserData[]>([]);
    const [localFreeAgents, setLocalFreeAgents] = useState<UserData[]>(EMPTY_FREE_AGENTS);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(currentTeam.name || '');
    const [editingDetails, setEditingDetails] = useState(false);
    const [draftSport, setDraftSport] = useState(currentTeam.sport || '');
    const [draftDivision, setDraftDivision] = useState('');
    const [draftDivisionGender, setDraftDivisionGender] = useState<'M' | 'F' | 'C'>('C');
    const [draftSkillDivisionTypeId, setDraftSkillDivisionTypeId] = useState('open');
    const [draftAgeDivisionTypeId, setDraftAgeDivisionTypeId] = useState(DEFAULT_AGE_DIVISION_FALLBACK);
    const [draftTeamSize, setDraftTeamSize] = useState(currentTeam.teamSize || 0);
    const [draftOpenRegistration, setDraftOpenRegistration] = useState(Boolean(currentTeam.openRegistration));
    const [draftRegistrationPriceDollars, setDraftRegistrationPriceDollars] = useState(
        ((currentTeam.registrationPriceCents ?? 0) / 100),
    );
    const [jerseyNumbersByUserId, setJerseyNumbersByUserId] = useState<Record<string, string>>({});
    const [registeringForTeam, setRegisteringForTeam] = useState(false);
    const [leavingTeam, setLeavingTeam] = useState(false);
    const [teamRegistrationPaymentData, setTeamRegistrationPaymentData] = useState<PaymentIntent | null>(null);
    const [teamRegistrationPaymentOpen, setTeamRegistrationPaymentOpen] = useState(false);
    const [imagePickerOpen, setImagePickerOpen] = useState(false);
    const [inviteMode, setInviteMode] = useState<'search' | 'email'>('search');
    const [emailInviteInput, setEmailInviteInput] = useState('');
    const [invitingByEmail, setInvitingByEmail] = useState(false);
    const [selectedInviteRole, setSelectedInviteRole] = useState<TeamInviteRoleType>('player');
    const [cancellingInviteIds, setCancellingInviteIds] = useState<Set<string>>(new Set());
    const [pendingRoleInvites, setPendingRoleInvites] = useState<Array<{ invite: Invite; invitedUser?: UserData }>>([]);
    const [cancellingRoleInviteIds, setCancellingRoleInviteIds] = useState<Set<string>>(new Set());
    const [managerUser, setManagerUser] = useState<UserData | null>(null);
    const [headCoachUser, setHeadCoachUser] = useState<UserData | null>(null);
    const [assistantCoachUsers, setAssistantCoachUsers] = useState<UserData[]>([]);
    const [draftCaptainId, setDraftCaptainId] = useState(currentTeam.captainId || '');
    const [updatingRoleAction, setUpdatingRoleAction] = useState<string | null>(null);

    const isTeamCaptain = currentTeam.captainId === user?.$id || currentTeam.managerId === user?.$id;
    const canManageTeam = canManage ?? isTeamCaptain;
    const canChargeForTeamRegistration = canChargeRegistration ?? Boolean(user?.hasStripeAccount || (currentTeam.registrationPriceCents ?? 0) > 0);
    const registrationPriceCents = Math.max(0, Math.round(currentTeam.registrationPriceCents ?? 0));
    const normalizedInviteEmail = emailInviteInput.trim().toLowerCase();
    const inviteEmailValid = EMAIL_REGEX.test(normalizedInviteEmail);
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
    const currentUserRegistration = useMemo(() => {
        if (!user?.$id || !Array.isArray(currentTeam.playerRegistrations)) {
            return null;
        }
        return currentTeam.playerRegistrations.find((registration) => registration.userId === user.$id) ?? null;
    }, [currentTeam.playerRegistrations, user?.$id]);
    const currentUserRegistrationStatus = String(currentUserRegistration?.status ?? '').trim().toUpperCase();
    const isCurrentUserActiveMember = currentUserRegistrationStatus === 'ACTIVE' || currentTeam.playerIds.includes(user?.$id ?? '');
    const isCurrentUserPendingTeamRegistration = currentUserRegistrationStatus === 'STARTED';
    const reservedOrActiveRegistrationCount = useMemo(() => {
        const registrations = Array.isArray(currentTeam.playerRegistrations) ? currentTeam.playerRegistrations : [];
        const counted = registrations.filter((registration) => {
            const status = String(registration.status ?? '').trim().toUpperCase();
            return status === 'ACTIVE' || status === 'STARTED';
        });
        return Math.max(counted.length, currentTeam.playerIds.length);
    }, [currentTeam.playerIds.length, currentTeam.playerRegistrations]);
    const teamHasCapacity = !currentTeam.teamSize || reservedOrActiveRegistrationCount < currentTeam.teamSize;
    const showSelfServiceRegistrationActions = Boolean(user?.$id) && !canManageTeam;
    const canStartTeamRegistration = showSelfServiceRegistrationActions
        && Boolean(currentTeam.openRegistration)
        && !isCurrentUserActiveMember
        && (isCurrentUserPendingTeamRegistration || teamHasCapacity);
    const selectedRoleLabel = (() => {
        switch (selectedInviteRole) {
            case 'team_manager':
                return 'Manager';
            case 'team_head_coach':
                return 'Head Coach';
            case 'team_assistant_coach':
                return 'Assistant Coach';
            default:
                return 'Player';
        }
    })();
    const normalizedSelectedFreeAgentId = selectedFreeAgentId?.trim() || null;
    const suggestedFreeAgent = (() => {
        if (selectedFreeAgentUser && normalizedSelectedFreeAgentId && selectedFreeAgentUser.$id === normalizedSelectedFreeAgentId) {
            return selectedFreeAgentUser;
        }
        if (!normalizedSelectedFreeAgentId) {
            return selectedFreeAgentUser ?? null;
        }
        return localFreeAgents.find((agent) => agent.$id === normalizedSelectedFreeAgentId)
            ?? selectedFreeAgentUser
            ?? null;
    })();
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
        gender: 'M' | 'F' | 'C',
        skillDivisionTypeId: string,
        ageDivisionTypeId: string,
        sportInput: string | null | undefined,
    ): string => {
        const skillName = resolveDivisionTypeName(sportInput, skillDivisionTypeId, 'SKILL');
        const ageName = resolveDivisionTypeName(sportInput, ageDivisionTypeId, 'AGE');
        return buildDivisionName({
            gender,
            divisionTypeName: `${skillName} • ${ageName}`,
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
        if (typeof currentTeam.divisionTypeName === 'string' && currentTeam.divisionTypeName.trim().length > 0) {
            return currentTeam.divisionTypeName.trim();
        }

        const divisionTypeIdLabel = toDisplayDivisionLabel(currentTeam.divisionTypeId);
        if (divisionTypeIdLabel) {
            return divisionTypeIdLabel;
        }

        return 'Division';
    }, [
        currentTeam.division,
        currentTeam.divisionTypeId,
        currentTeam.divisionTypeName,
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

    const isRoleInvitePending = useCallback((userId: string, roleType: TeamInviteRoleType): boolean => {
        if (roleType === 'player') {
            return currentTeam.pending.includes(userId);
        }
        return pendingRoleInvites.some(
            (entry) => getPendingInviteRole(currentTeam, entry.invite) === roleType
                && entry.invite.userId === userId
                && entry.invite.status === 'PENDING',
        );
    }, [currentTeam, pendingRoleInvites]);

    const canInviteUserForRole = useCallback((userId: string, roleType: TeamInviteRoleType): boolean => {
        if (roleType === 'player') {
            return !currentTeam.playerIds.includes(userId) && !currentTeam.pending.includes(userId);
        }
        if (roleType === 'team_manager') {
            return currentTeam.managerId !== userId && !isRoleInvitePending(userId, roleType);
        }
        if (roleType === 'team_head_coach') {
            return currentTeam.headCoachId !== userId && !isRoleInvitePending(userId, roleType);
        }
        if (roleType === 'team_assistant_coach') {
            return !assistantCoachIds.includes(userId) && !isRoleInvitePending(userId, roleType);
        }
        return false;
    }, [assistantCoachIds, currentTeam.headCoachId, currentTeam.managerId, currentTeam.pending, currentTeam.playerIds, isRoleInvitePending]);

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

    const performSearch = useCallback(async () => {
        setSearching(true);
        try {
            const results = await userService.searchUsers(searchQuery);
            const filteredResults = results.filter((result) => canInviteUserForRole(result.$id, selectedInviteRole));
            setSearchResults(filteredResults);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setSearching(false);
        }
    }, [canInviteUserForRole, searchQuery, selectedInviteRole]);

    useEffect(() => {
        let cancelled = false;

        if (!isOpen || !canManageTeam) {
            setLocalFreeAgents(EMPTY_FREE_AGENTS);
            return () => {
                cancelled = true;
            };
        }

        void (async () => {
            try {
                const freeAgents = await teamService.getInviteFreeAgents(currentTeam.$id);
                if (!cancelled) {
                    setLocalFreeAgents(freeAgents);
                }
            } catch (fetchError) {
                console.error('Failed to load invite free agents:', fetchError);
                if (!cancelled) {
                    setLocalFreeAgents(EMPTY_FREE_AGENTS);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [canManageTeam, currentTeam.$id, isOpen]);

    useEffect(() => {
        if (isOpen) {
            void fetchTeamDetails();
        }
    }, [isOpen, fetchTeamDetails]);

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
        if (!isOpen || !normalizedSelectedFreeAgentId) {
            return;
        }
        setShowAddPlayers(true);
        setSelectedInviteRole('player');
        setInviteMode('search');
        setSearchQuery('');
        setSearchResults([]);
    }, [isOpen, normalizedSelectedFreeAgentId]);

    useEffect(() => {
        setNewName(currentTeam.name || '');
    }, [currentTeam.$id, currentTeam.name]);

    useEffect(() => {
        setDraftSport(currentTeam.sport || '');
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
        setDraftDivisionGender(gender);
        setDraftSkillDivisionTypeId(skillDivisionTypeId);
        setDraftAgeDivisionTypeId(ageDivisionTypeId);
        setDraftDivision(resolveDraftDivisionDisplayName(gender, skillDivisionTypeId, ageDivisionTypeId, sportInput));
        setDraftTeamSize(currentTeam.teamSize || 0);
        setDraftOpenRegistration(Boolean(currentTeam.openRegistration));
        setDraftRegistrationPriceDollars((Math.max(0, Math.round(currentTeam.registrationPriceCents ?? 0)) / 100));
    }, [
        currentTeam.$id,
        currentTeam.division,
        currentTeam.divisionTypeId,
        currentTeam.openRegistration,
        currentTeam.registrationPriceCents,
        currentTeam.sport,
        currentTeam.teamSize,
        resolveDraftDivisionDisplayName,
    ]);

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
        const fallback = getDefaultDivisionTypeSelections(draftSport || currentTeam.sport || '');
        const normalizedSkill = normalizeDivisionToken(draftSkillDivisionTypeId);
        const normalizedAge = normalizeDivisionToken(draftAgeDivisionTypeId);
        const hasSkill = skillDivisionOptions.some((option) => option.value === normalizedSkill);
        const hasAge = ageDivisionOptions.some((option) => option.value === normalizedAge);
        const nextSkill = hasSkill ? normalizedSkill : fallback.skillDivisionTypeId;
        const nextAge = hasAge ? normalizedAge : fallback.ageDivisionTypeId;
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
        draftSkillDivisionTypeId,
        draftSport,
        skillDivisionOptions,
    ]);

    useEffect(() => {
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
        draftSkillDivisionTypeId,
        draftSport,
        resolveDraftDivisionDisplayName,
    ]);

    useEffect(() => {
        if (inviteMode !== 'search') {
            setSearchResults([]);
            return;
        }
        if (searchQuery.length >= 2) {
            performSearch();
        } else {
            setSearchResults([]);
        }
    }, [searchQuery, inviteMode, performSearch]);

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

    const handleSaveDetails = async () => {
        const nextSport = draftSport.trim();
        const nextDivisionGender = draftDivisionGender;
        const nextSkillDivisionTypeId = normalizeDivisionToken(draftSkillDivisionTypeId);
        const nextAgeDivisionTypeId = normalizeDivisionToken(draftAgeDivisionTypeId);
        const nextDivisionTypeId = buildCompositeDivisionTypeId(nextSkillDivisionTypeId, nextAgeDivisionTypeId);
        const nextSkillDivisionTypeName = resolveDivisionTypeName(nextSport, nextSkillDivisionTypeId, 'SKILL');
        const nextAgeDivisionTypeName = resolveDivisionTypeName(nextSport, nextAgeDivisionTypeId, 'AGE');
        const nextDivisionTypeName = `${nextSkillDivisionTypeName} • ${nextAgeDivisionTypeName}`;
        const nextDivision = buildDivisionName({
            gender: nextDivisionGender,
            divisionTypeName: nextDivisionTypeName,
        });
        const nextTeamSize = Number(draftTeamSize) || 0;
        const nextCaptainId = draftCaptainId.trim();
        const nextRegistrationPriceCents = draftOpenRegistration && canChargeForTeamRegistration
            ? Math.max(0, Math.round((Number(draftRegistrationPriceDollars) || 0) * 100))
            : 0;

        if (!nextSport) {
            setError('Sport is required.');
            return;
        }
        if (!nextDivision) {
            setError('Division is required.');
            return;
        }
        if (!nextSkillDivisionTypeId || !nextAgeDivisionTypeId) {
            setError('Select both skill and age divisions.');
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

        const updated = await teamService.updateTeamDetails(currentTeam.$id, {
            sport: nextSport,
            division: nextDivision,
            divisionTypeId: nextDivisionTypeId,
            divisionTypeName: nextDivisionTypeName,
            teamSize: nextTeamSize,
            captainId: nextCaptainId,
            openRegistration: draftOpenRegistration,
            registrationPriceCents: nextRegistrationPriceCents,
            playerRegistrations: teamPlayers.map((player) => {
                const existingRegistration = activePlayerRegistrationByUserId.get(player.$id);
                return {
                    id: existingRegistration?.id ?? `${currentTeam.$id}__${player.$id}`,
                    teamId: currentTeam.$id,
                    userId: player.$id,
                    status: existingRegistration?.status ?? 'ACTIVE',
                    jerseyNumber: (jerseyNumbersByUserId[player.$id] ?? '').trim() || null,
                    position: existingRegistration?.position ?? null,
                    isCaptain: player.$id === nextCaptainId,
                };
            }),
        });
        if (!updated) {
            setError('Failed to update team details');
            return;
        }

        onTeamUpdated?.(updated);
        setEditingDetails(false);
    };

    const getFilteredFreeAgents = () => {
        if (selectedInviteRole !== 'player') {
            return [];
        }
        const filtered = localFreeAgents.filter(agent =>
            canInviteUserForRole(agent.$id, 'player')
        );
        if (!normalizedSelectedFreeAgentId) {
            return filtered;
        }
        const prioritized = filtered.find((agent) => agent.$id === normalizedSelectedFreeAgentId);
        if (!prioritized) {
            return filtered;
        }
        return [prioritized, ...filtered.filter((agent) => agent.$id !== normalizedSelectedFreeAgentId)];
    };

    const getAvailableUsers = () => {
        let users = [...searchResults];
        const filteredFreeAgents = getFilteredFreeAgents();

        if (selectedInviteRole === 'player' && filteredFreeAgents.length > 0) {
            const freeAgentsNotInResults = filteredFreeAgents.filter(
                agent => !users.some(user => user.$id === agent.$id)
            );
            users = [...freeAgentsNotInResults, ...users];
        }

        return users;
    };

    const handleInviteUser = async (userId: string) => {
        try {
            const user = await userService.getUserById(userId, { teamId: currentTeam.$id });
            if (!user) throw new Error('User not found');
            if (!canInviteUserForRole(user.$id, selectedInviteRole)) {
                notifications.show({ color: 'yellow', message: `${selectedRoleLabel} already assigned or invited.` });
                return;
            }
            const success = await teamService.inviteUserToTeamRole(currentTeam, user, selectedInviteRole);

            if (success) {
                if (selectedInviteRole === 'player') {
                    const invitedUser = await userService.getUserById(userId, { teamId: currentTeam.$id });
                    if (invitedUser) {
                        setPendingPlayers(prev => (
                            prev.some(player => player.$id === invitedUser.$id) ? prev : [...prev, invitedUser]
                        ));
                        const updatedTeam = {
                            ...currentTeam,
                            pending: Array.from(new Set([...currentTeam.pending, userId]))
                        };
                        onTeamUpdated?.(updatedTeam);
                    }
                } else {
                    await fetchRoleInvites();
                }
                setSearchResults(prev => prev.filter(searchUser => searchUser.$id !== userId));
            }
        } catch (error) {
            console.error('Failed to invite user:', error);
            setError('Failed to send invitation');
        }
    };

    const handleToggleInviteMode = () => {
        if (inviteMode === 'search') {
            setInviteMode('email');
            setSearchQuery('');
            setSearchResults([]);
            return;
        }

        setInviteMode('search');
        setEmailInviteInput('');
    };

    const handleInviteByEmail = async () => {
        if (!user) {
            notifications.show({ color: 'red', message: 'You must be logged in to send team invites.' });
            return;
        }
        if (!inviteEmailValid) {
            notifications.show({ color: 'red', message: 'Enter a valid email address.' });
            return;
        }
        if (invitingByEmail) {
            return;
        }

        setInvitingByEmail(true);

        try {
            const ensuredUser = await userService.ensureUserByEmail(normalizedInviteEmail);
            if (!canInviteUserForRole(ensuredUser.$id, selectedInviteRole)) {
                notifications.show({ color: 'yellow', message: `${selectedRoleLabel} already assigned or invited.` });
                return;
            }

            const success = await teamService.inviteUserToTeamRole(currentTeam, ensuredUser, selectedInviteRole);
            if (!success) {
                notifications.show({ color: 'red', message: 'Failed to send invite.' });
                return;
            }

            if (selectedInviteRole === 'player') {
                const invitedUser = await userService.getUserById(ensuredUser.$id, { teamId: currentTeam.$id });
                if (invitedUser) {
                    setPendingPlayers(prev => (
                        prev.some(player => player.$id === invitedUser.$id) ? prev : [...prev, invitedUser]
                    ));
                }
                onTeamUpdated?.({
                    ...currentTeam,
                    pending: Array.from(new Set([...currentTeam.pending, ensuredUser.$id])),
                });
            } else {
                await fetchRoleInvites();
            }

            notifications.show({ color: 'green', message: `${selectedRoleLabel} invite sent to ${normalizedInviteEmail}.` });
            setEmailInviteInput('');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send invite';
            notifications.show({ color: 'red', message });
        } finally {
            setInvitingByEmail(false);
        }
    };

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

            const success = await teamService.removePlayerFromTeam(currentTeam.$id, playerId);

            if (success) {
                setTeamPlayers(prev => prev.filter(player => player.$id !== playerId));

                const updatedTeam = {
                    ...currentTeam,
                    captainId:
                        playerId === currentTeam.captainId
                            ? draftCaptainId.trim()
                            : currentTeam.captainId,
                    playerIds: currentTeam.playerIds.filter(id => id !== playerId)
                };
                onTeamUpdated?.(updatedTeam);
            }
        } catch (error) {
            console.error('Failed to remove player:', error);
            setError('Failed to remove player');
        }
    };

    const handleRegisterForTeam = async () => {
        if (!user) {
            notifications.show({ color: 'red', message: 'Sign in to register for this team.' });
            return;
        }
        if (registeringForTeam) {
            return;
        }
        setRegisteringForTeam(true);
        setError(null);
        try {
            if (registrationPriceCents > 0) {
                const paymentData = await paymentService.createTeamRegistrationPaymentIntent(user, currentTeam);
                setTeamRegistrationPaymentData(paymentData);
                setTeamRegistrationPaymentOpen(true);
                return;
            }

            const updated = await teamService.registerForTeam(currentTeam.$id);
            if (updated) {
                onTeamUpdated?.(updated);
            }
            notifications.show({ color: 'green', message: 'You are registered for this team.' });
        } catch (registerError) {
            const message = registerError instanceof Error ? registerError.message : 'Failed to register for team.';
            setError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setRegisteringForTeam(false);
        }
    };

    const handleTeamRegistrationPaymentSuccess = async () => {
        const refreshed = await teamService.getTeamById(currentTeam.$id, true);
        if (refreshed) {
            onTeamUpdated?.(refreshed);
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
            const success = await teamService.deleteTeam(currentTeam.$id);
            if (success) {
                onTeamDeleted?.(currentTeam.$id);
                onClose();
            }
        } catch (error) {
            console.error('Failed to delete team:', error);
            setError('Failed to delete team');
        }
    };

    return (
        <>
            <Modal opened={isOpen} onClose={onClose} size="xl" centered withCloseButton>
                <div style={{ padding: 16 }}>
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
                                <Text c="dimmed">{currentTeam.sport ? `${teamDivisionLabel} • ${currentTeam.sport}` : teamDivisionLabel}</Text>
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
                                    onClick={() => setEditingDetails((value) => !value)}
                                >
                                    {editingDetails ? 'Close Team Details' : 'Edit Team Details'}
                                </Button>
                                <Button variant="default" size="xs" onClick={() => setImagePickerOpen(true)}>Change Image</Button>
                            </Group>
                        )}
                    </Group>
                </div>
                <div style={{ padding: 24, paddingTop: 0 }}>
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

                    {editingDetails && canManageTeam && (
                        <Paper withBorder radius="md" p="md" mb="md">
                            <Title order={5} mb="sm">Edit Team Details</Title>
                            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                                <MantineSelect
                                    label="Sport"
                                    data={sportOptions}
                                    value={draftSport || null}
                                    onChange={(value) => setDraftSport(value || '')}
                                    searchable
                                    allowDeselect={false}
                                    nothingFoundMessage="No sports found"
                                />
                                <MantineSelect
                                    label="Division Gender"
                                    data={DIVISION_GENDER_OPTIONS.map((option) => ({ ...option }))}
                                    value={draftDivisionGender}
                                    onChange={(value) => setDraftDivisionGender((value as 'M' | 'F' | 'C') || 'C')}
                                    allowDeselect={false}
                                />
                                <MantineSelect
                                    label="Skill Division"
                                    data={skillDivisionOptions}
                                    value={draftSkillDivisionTypeId}
                                    onChange={(value) => setDraftSkillDivisionTypeId(value || 'open')}
                                    searchable
                                    allowDeselect={false}
                                />
                                <MantineSelect
                                    label="Age Division"
                                    data={ageDivisionOptions}
                                    value={draftAgeDivisionTypeId}
                                    onChange={(value) => setDraftAgeDivisionTypeId(value || DEFAULT_AGE_DIVISION_FALLBACK)}
                                    searchable
                                    allowDeselect={false}
                                />
                                <TextInput
                                    label="Division Preview"
                                    value={draftDivision}
                                    readOnly
                                />
                                <NumberInput
                                    label="Team Size"
                                    min={1}
                                    value={draftTeamSize}
                                    onChange={(value) => setDraftTeamSize(Number(value) || 1)}
                                />
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
                                <Checkbox
                                    label="Open registration"
                                    description="Allow players to register from the readonly team view."
                                    checked={draftOpenRegistration}
                                    onChange={(event) => setDraftOpenRegistration(event.currentTarget.checked)}
                                />
                                <NumberInput
                                    label="Registration cost"
                                    description={
                                        canChargeForTeamRegistration
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
                                    disabled={!draftOpenRegistration || !canChargeForTeamRegistration}
                                />
                            </SimpleGrid>
                            {teamPlayers.length > 0 && (
                                <Paper withBorder radius="md" p="sm" mt="sm">
                                    <Text fw={500} size="sm" mb="xs">Player jersey numbers</Text>
                                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                                        {teamPlayers.map((player) => (
                                            <TextInput
                                                key={player.$id}
                                                label={getUserFullName(player)}
                                                placeholder="Jersey number"
                                                value={jerseyNumbersByUserId[player.$id] ?? ''}
                                                onChange={(event) => {
                                                    const value = event.currentTarget.value;
                                                    setJerseyNumbersByUserId((current) => ({
                                                        ...current,
                                                        [player.$id]: value,
                                                    }));
                                                }}
                                            />
                                        ))}
                                    </SimpleGrid>
                                </Paper>
                            )}
                            <Group justify="flex-end" mt="sm">
                                <Button variant="default" onClick={() => setEditingDetails(false)}>Cancel</Button>
                                <Button onClick={() => { void handleSaveDetails(); }}>Save Team Details</Button>
                            </Group>
                        </Paper>
                    )}

                    {/* Team Stats */}
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="md">
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{teamPlayers.length}/{currentTeam.teamSize}</Title>
                            <Text c="dimmed">Players</Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{pendingPlayers.length}</Title>
                            <Text c="dimmed">Pending Invites</Text>
                        </Paper>
                    </SimpleGrid>

                    {/* Team Members */}
                    <div className="mb-6">
                        <Title order={5} mb="sm">Team Members ({teamPlayers.length})</Title>
                        {teamPlayers.length > 0 ? (
                            <ScrollArea.Autosize mah={240} type="auto">
                                <div className="space-y-3">
                                    {teamPlayers.map(player => {
                                        const playerRegistration = activePlayerRegistrationByUserId.get(player.$id);
                                        return (
                                            <Paper key={player.$id} withBorder radius="md" p="sm">
                                                <Group justify="space-between">
                                                    <Group>
                                                        <Avatar
                                                            src={getUserAvatarUrl(player, 40, playerRegistration?.jerseyNumber)}
                                                            alt={getUserFullName(player)}
                                                            size={40}
                                                            radius="xl"
                                                        />
                                                        <div>
                                                            <Text fw={500}>{getUserFullName(player)}</Text>
                                                            {getUserHandle(player) && <Text size="xs" c="dimmed">{getUserHandle(player)}</Text>}
                                                            {player.$id === currentTeam.captainId && (
                                                                <Badge color="blue" variant="light" size="xs">Captain</Badge>
                                                            )}
                                                        </div>
                                                    </Group>
                                                    {canManageTeam && (
                                                        (player.$id !== currentTeam.captainId)
                                                        || (editingDetails && draftCaptainId.trim().length > 0 && draftCaptainId !== currentTeam.captainId)
                                                    ) && (
                                                        <Button color="red" variant="subtle" size="xs" onClick={() => handleRemovePlayer(player.$id)}>Remove</Button>
                                                    )}
                                                </Group>
                                            </Paper>
                                        );
                                    })}
                                </div>
                            </ScrollArea.Autosize>
                        ) : (
                            <Text c="dimmed" ta="center" py={8}>
                                {canManageTeam ? 'Invite some players to build your team!' : 'This team is just getting started.'}
                            </Text>
                        )}
                    </div>

                    {/* Pending Invitations */}
                    {pendingPlayers.length > 0 && (
                        <div className="mb-6">
                            <h4 className="text-lg font-semibold mb-4">Pending Invitations ({pendingPlayers.length})</h4>
                            <div className="space-y-3">
                                {pendingPlayers.map(player => {
                                    const isFromEvent = localFreeAgents.some(agent => agent.$id === player.$id);
                                    const isCancelling = cancellingInviteIds.has(player.$id);

                                    return (
                                        <div
                                            key={player.$id}
                                            className={`flex items-center justify-between p-3 rounded-lg border ${isFromEvent
                                                ? 'bg-blue-50 border-blue-200'
                                                : 'bg-yellow-50 border-yellow-200'
                                                }`}
                                        >
                                            <div className="flex items-center space-x-3">
                                                <Image
                                                    src={getUserAvatarUrl(player, 40)}
                                                    alt={getUserFullName(player)}
                                                    width={40}
                                                    height={40}
                                                    unoptimized
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                                <div>
                                                    <p className="font-medium">{getUserFullName(player)}</p>
                                                    {getUserHandle(player) && (
                                                        <p className="text-xs text-gray-500">{getUserHandle(player)}</p>
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
                                                    className={`flex items-center space-x-1 text-sm transition-colors ${isCancelling
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
                            </div>
                        </div>
                    )}

                    {/* Team Staff Roles */}
                    <div className="mb-6">
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
                        <div className="mb-6">
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

                    {/* Add Team Role Invites Section */}
                    {canManageTeam && (
                        <div className="mb-6">
                            <Button onClick={() => setShowAddPlayers(!showAddPlayers)} mb="sm">
                                {showAddPlayers ? 'Close' : 'Invite Team Members'}
                            </Button>
                            {showAddPlayers && (
                                <Paper withBorder radius="md" p="md">
                                    <Title order={6} mb="sm">Invite to {currentTeam.name}</Title>
                                    <SegmentedControl
                                        mb="sm"
                                        value={selectedInviteRole}
                                        onChange={(value) => {
                                            setSelectedInviteRole(value as TeamInviteRoleType);
                                            setSearchQuery('');
                                            setSearchResults([]);
                                        }}
                                        data={[
                                            { label: 'Player', value: 'player' },
                                            { label: 'Manager', value: 'team_manager' },
                                            { label: 'Head Coach', value: 'team_head_coach' },
                                            { label: 'Assistant Coach', value: 'team_assistant_coach' },
                                        ]}
                                        fullWidth
                                    />
                                    <Group align="flex-end" wrap="nowrap" mb="sm">
                                        <TextInput
                                            style={{ flex: 1 }}
                                            placeholder={
                                                inviteMode === 'search'
                                                    ? `Search ${selectedRoleLabel.toLowerCase()} (min 2 characters)`
                                                    : 'name@example.com'
                                            }
                                            value={inviteMode === 'search' ? searchQuery : emailInviteInput}
                                            onChange={(e) => {
                                                if (inviteMode === 'search') {
                                                    setSearchQuery(e.currentTarget.value);
                                                } else {
                                                    setEmailInviteInput(e.currentTarget.value);
                                                }
                                            }}
                                            error={
                                                inviteMode === 'email' && emailInviteInput.trim().length > 0 && !inviteEmailValid
                                                    ? 'Enter a valid email address'
                                                    : undefined
                                            }
                                        />
                                        <Button onClick={handleToggleInviteMode}>
                                            {inviteMode === 'search' ? 'Invite by Email' : 'Search Players'}
                                        </Button>
                                    </Group>

                                    {inviteMode === 'search' && searching && (
                                        <Group justify="center" py="sm">
                                            <Text c="dimmed" size="sm">Searching...</Text>
                                        </Group>
                                    )}
                                    {inviteMode === 'search' && !searching && searchQuery.length >= 2 && getAvailableUsers().length === 0 && (
                                        <Text c="dimmed" ta="center" py={8}>
                                            {`No ${selectedRoleLabel.toLowerCase()} found matching "${searchQuery}"`}
                                        </Text>
                                    )}
                                    {selectedInviteRole === 'player' && inviteMode === 'search' && suggestedFreeAgent && (
                                        <Paper withBorder radius="md" p="sm" mb="sm" bg={'green.0'}>
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar
                                                        src={getUserAvatarUrl(suggestedFreeAgent, 40)}
                                                        alt={getUserFullName(suggestedFreeAgent)}
                                                        size={40}
                                                        radius="xl"
                                                    />
                                                    <div>
                                                        <Text fw={500}>{getUserFullName(suggestedFreeAgent)}</Text>
                                                        {getUserHandle(suggestedFreeAgent) && (
                                                            <Text size="xs" c="dimmed">{getUserHandle(suggestedFreeAgent)}</Text>
                                                        )}
                                                        <Text size="xs" c="green">Suggested from event free agents</Text>
                                                    </div>
                                                </Group>
                                                <Button
                                                    size="xs"
                                                    disabled={!canInviteUserForRole(suggestedFreeAgent.$id, 'player')}
                                                    onClick={() => handleInviteUser(suggestedFreeAgent.$id)}
                                                >
                                                    Invite
                                                </Button>
                                            </Group>
                                        </Paper>
                                    )}
                                    {selectedInviteRole === 'player' && inviteMode === 'search' && !searching && (searchQuery.length < 2 && getFilteredFreeAgents().length > 0) && (
                                        <div className="mb-4">
                                            <Text fw={500} size="sm" c="blue" mb={4}>Available Free Agents from Event:</Text>
                                            <div className="space-y-2">
                                                {getFilteredFreeAgents().map(agent => (
                                                    <Paper key={agent.$id} withBorder radius="md" p="sm" bg={'blue.0'}>
                                                        <Group justify="space-between">
                                                            <Group>
                                                                <Avatar src={getUserAvatarUrl(agent, 40)} alt={getUserFullName(agent)} size={40} radius="xl" />
                                                                <div>
                                                                    <Text fw={500}>{getUserFullName(agent)}</Text>
                                                                    {getUserHandle(agent) && (
                                                                        <Text size="xs" c="dimmed">{getUserHandle(agent)}</Text>
                                                                    )}
                                                                    <Text size="xs" c="blue">Free Agent from Event</Text>
                                                                </div>
                                                            </Group>
                                                            <Button size="xs" onClick={() => handleInviteUser(agent.$id)}>Invite</Button>
                                                        </Group>
                                                    </Paper>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {inviteMode === 'search' && !searching && getAvailableUsers().length > 0 && searchQuery.length >= 2 && (
                                        <ScrollArea.Autosize mah={300}>
                                            <div className="space-y-2">
                                                {getAvailableUsers().map(user => {
                                                    const isFreeAgent = getFilteredFreeAgents().some(agent => agent.$id === user.$id);
                                                    return (
                                                        <Paper key={user.$id} withBorder radius="md" p="sm" bg={isFreeAgent ? 'blue.0' : undefined}>
                                                            <Group justify="space-between">
                                                                <Group>
                                                                    <Avatar src={getUserAvatarUrl(user, 40)} alt={getUserFullName(user)} size={40} radius="xl" />
                                                                    <div>
                                                                        <Text fw={500}>{getUserFullName(user)}</Text>
                                                                        {getUserHandle(user) && (
                                                                            <Text size="xs" c="dimmed">{getUserHandle(user)}</Text>
                                                                        )}
                                                                        {isFreeAgent && <Text size="xs" c="blue">Free Agent from Event</Text>}
                                                                    </div>
                                                                </Group>
                                                                <Button size="xs" onClick={() => handleInviteUser(user.$id)}>Invite</Button>
                                                            </Group>
                                                        </Paper>
                                                    );
                                                })}
                                            </div>
                                        </ScrollArea.Autosize>
                                    )}

                                    {inviteMode === 'email' && (
                                        <Paper withBorder radius="md" p="md" mt="sm">
                                            <Text size="sm" c="dimmed" mb="sm">
                                                Invite by email will ensure the account exists and send a {selectedRoleLabel.toLowerCase()} invite.
                                            </Text>
                                            <Group justify="flex-end">
                                                <Button
                                                    onClick={handleInviteByEmail}
                                                    loading={invitingByEmail}
                                                    disabled={!inviteEmailValid}
                                                >
                                                    Send {selectedRoleLabel} Invite
                                                </Button>
                                            </Group>
                                        </Paper>
                                    )}
                                </Paper>
                            )}
                        </div>
                    )}

                    {showSelfServiceRegistrationActions && (
                        <Paper withBorder radius="md" p="md" mb="md">
                            {isCurrentUserActiveMember ? (
                                <Group justify="space-between" align="center">
                                    <div>
                                        <Title order={5}>Team membership</Title>
                                        <Text size="sm" c="dimmed">You are on this team.</Text>
                                    </div>
                                    <Button
                                        color="red"
                                        variant="light"
                                        loading={leavingTeam}
                                        onClick={() => { void handleLeaveTeam(); }}
                                    >
                                        Leave Team
                                    </Button>
                                </Group>
                            ) : (
                                <Group justify="space-between" align="center">
                                    <div>
                                        <Title order={5}>Team registration</Title>
                                        <Text size="sm" c="dimmed">
                                            {currentTeam.openRegistration
                                                ? `Registration is ${formatPrice(registrationPriceCents)}.`
                                                : 'Registration is not open for this team.'}
                                        </Text>
                                        {isCurrentUserPendingTeamRegistration && (
                                            <Text size="xs" c="dimmed">Your registration is waiting for payment confirmation.</Text>
                                        )}
                                        {currentTeam.openRegistration && !teamHasCapacity && !isCurrentUserPendingTeamRegistration && (
                                            <Text size="xs" c="red">This team is full.</Text>
                                        )}
                                    </div>
                                    <Button
                                        disabled={!canStartTeamRegistration}
                                        loading={registeringForTeam}
                                        onClick={() => { void handleRegisterForTeam(); }}
                                    >
                                        {isCurrentUserPendingTeamRegistration
                                            ? 'Resume Payment'
                                            : teamHasCapacity
                                            ? 'Register for Team'
                                            : 'Team Full'}
                                    </Button>
                                </Group>
                            )}
                        </Paper>
                    )}

                    {/* Delete Team Section */}
                    {canManageTeam && (
                        <div className="border-t pt-6">
                            <Paper withBorder radius="md" p="md" bg={'red.0'}>
                                <Title order={5} c="red" mb={4}>Danger Zone</Title>
                                <Text c="red" size="sm" mb="sm">Once you delete a team, there is no going back. Please be certain.</Text>
                                <Button color="red" onClick={() => setShowDeleteConfirm(true)}>Delete Team</Button>
                            </Paper>
                        </div>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <Modal opened={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Team" centered>
                        <Text c="dimmed" mb="sm">This action cannot be undone</Text>
                        <Text size="sm" mb="md">
                            Are you sure you want to delete <strong>{`"${currentTeam.name}"`}</strong>? This will permanently remove the team and all its data.
                        </Text>
                        <Group grow>
                            <Button variant="default" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                            <Button color="red" onClick={handleDeleteTeam}>Delete Team</Button>
                        </Group>
                    </Modal>
                )}
            </Modal>
            <ImageSelectionModal
                onSelect={handleChangeImage}
                onClose={() => setImagePickerOpen(false)}
                isOpen={imagePickerOpen}
            />
            <PaymentModal
                isOpen={teamRegistrationPaymentOpen}
                onClose={() => setTeamRegistrationPaymentOpen(false)}
                event={teamPaymentSummary}
                paymentData={teamRegistrationPaymentData}
                onPaymentSuccess={handleTeamRegistrationPaymentSuccess}
            />
        </>
    );
}
