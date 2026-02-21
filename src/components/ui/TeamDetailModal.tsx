// components/ui/TeamDetailModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { notifications } from '@mantine/notifications';
import { Modal, Group, Text, Title, Button, Paper, SimpleGrid, Avatar, Badge, Alert, TextInput, ScrollArea, SegmentedControl, NumberInput } from '@mantine/core';
import { Invite, InviteType, Team, UserData, Event, getUserFullName, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';
import { useApp } from '@/app/providers';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { ImageSelectionModal } from './ImageSelectionModal';

interface TeamDetailModalProps {
    currentTeam: Team;
    isOpen: boolean;
    onClose: () => void;
    canManage?: boolean;
    onTeamUpdated?: (team: Team) => void;
    onTeamDeleted?: (teamId: string) => void;
    eventContext?: Event;
    eventFreeAgents?: UserData[];
    selectedFreeAgentId?: string;
    selectedFreeAgentUser?: UserData;
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
type TeamInviteRoleType = Extract<InviteType, 'player' | 'team_manager' | 'team_head_coach' | 'team_assistant_coach'>;
const TEAM_ROLE_INVITE_TYPES: TeamInviteRoleType[] = ['team_manager', 'team_head_coach', 'team_assistant_coach'];
const getUserHandle = (candidate?: Pick<UserData, 'userName'> | null): string => {
    const normalized = candidate?.userName?.trim();
    return `@${normalized && normalized.length ? normalized : 'user'}`;
};

export default function TeamDetailModal({
    currentTeam,
    isOpen,
    onClose,
    canManage,
    onTeamUpdated,
    onTeamDeleted,
    eventContext,
    eventFreeAgents = [],
    selectedFreeAgentId,
    selectedFreeAgentUser,
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
    const [localFreeAgents, setLocalFreeAgents] = useState<UserData[]>(eventFreeAgents);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(currentTeam.name || '');
    const [editingDetails, setEditingDetails] = useState(false);
    const [draftSport, setDraftSport] = useState(currentTeam.sport || '');
    const [draftDivision, setDraftDivision] = useState(
        typeof currentTeam.division === 'string'
            ? currentTeam.division
            : (currentTeam.division?.name || currentTeam.division?.skillLevel || 'Open'),
    );
    const [draftTeamSize, setDraftTeamSize] = useState(currentTeam.teamSize || 0);
    const [draftSeed, setDraftSeed] = useState(currentTeam.seed || 0);
    const [draftWins, setDraftWins] = useState(currentTeam.wins || 0);
    const [draftLosses, setDraftLosses] = useState(currentTeam.losses || 0);
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

    const isTeamCaptain = currentTeam.captainId === user?.$id || currentTeam.managerId === user?.$id;
    const canManageTeam = canManage ?? isTeamCaptain;
    const normalizedInviteEmail = emailInviteInput.trim().toLowerCase();
    const inviteEmailValid = EMAIL_REGEX.test(normalizedInviteEmail);
    const assistantCoachIds = useMemo(() => (
        Array.isArray(currentTeam.assistantCoachIds)
            ? currentTeam.assistantCoachIds
            : (Array.isArray(currentTeam.coachIds) ? currentTeam.coachIds : [])
    ), [currentTeam.assistantCoachIds, currentTeam.coachIds]);
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

    const fetchRoleInvites = useCallback(async () => {
        const invites = await userService.listInvites({
            teamId: currentTeam.$id,
            types: TEAM_ROLE_INVITE_TYPES,
        });
        const pendingInvites = invites.filter((invite) => invite.status === 'pending');
        const inviteUserIds = pendingInvites
            .map((invite) => invite.userId)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        const invitedUsers = inviteUserIds.length > 0 ? await userService.getUsersByIds(inviteUserIds) : [];
        const invitedUserMap = new Map(invitedUsers.map((invitedUser) => [invitedUser.$id, invitedUser]));
        setPendingRoleInvites(
            pendingInvites.map((invite) => ({
                invite,
                invitedUser: invite.userId ? invitedUserMap.get(invite.userId) : undefined,
            })),
        );
    }, [currentTeam.$id]);

    const isRoleInvitePending = useCallback((userId: string, roleType: TeamInviteRoleType): boolean => {
        if (roleType === 'player') {
            return currentTeam.pending.includes(userId);
        }
        return pendingRoleInvites.some(
            (entry) => entry.invite.type === roleType && entry.invite.userId === userId && entry.invite.status === 'pending',
        );
    }, [currentTeam.pending, pendingRoleInvites]);

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
                const players = await userService.getUsersByIds(currentTeam.playerIds);
                setTeamPlayers(players);
            } else {
                setTeamPlayers([]);
            }

            if (currentTeam.pending.length > 0) {
                const pending = await userService.getUsersByIds(currentTeam.pending);
                setPendingPlayers(pending);
            } else {
                setPendingPlayers([]);
            }

            const managerId = currentTeam.managerId ?? currentTeam.captainId;
            const roleUserIds = [managerId, currentTeam.headCoachId, ...assistantCoachIds]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
            const roleUsers = roleUserIds.length > 0 ? await userService.getUsersByIds(roleUserIds) : [];
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
    }, [assistantCoachIds, currentTeam.captainId, currentTeam.headCoachId, currentTeam.managerId, currentTeam.pending, currentTeam.playerIds, fetchRoleInvites]);

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
        if (isOpen) {
            void fetchTeamDetails();
        }
    }, [isOpen, fetchTeamDetails]);

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
        setLocalFreeAgents(eventFreeAgents);
    }, [eventFreeAgents]);

    useEffect(() => {
        setNewName(currentTeam.name || '');
    }, [currentTeam.$id, currentTeam.name]);

    useEffect(() => {
        setDraftSport(currentTeam.sport || '');
        setDraftDivision(
            typeof currentTeam.division === 'string'
                ? currentTeam.division
                : (currentTeam.division?.name || currentTeam.division?.skillLevel || 'Open'),
        );
        setDraftTeamSize(currentTeam.teamSize || 0);
        setDraftSeed(currentTeam.seed || 0);
        setDraftWins(currentTeam.wins || 0);
        setDraftLosses(currentTeam.losses || 0);
    }, [currentTeam.$id, currentTeam.division, currentTeam.losses, currentTeam.seed, currentTeam.sport, currentTeam.teamSize, currentTeam.wins]);

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
        const nextDivision = draftDivision.trim();
        const nextTeamSize = Number(draftTeamSize) || 0;
        const nextSeed = Number(draftSeed) || 0;
        const nextWins = Number(draftWins) || 0;
        const nextLosses = Number(draftLosses) || 0;

        if (!nextSport) {
            setError('Sport is required.');
            return;
        }
        if (!nextDivision) {
            setError('Division is required.');
            return;
        }
        if (nextTeamSize < 1) {
            setError('Team size must be at least 1.');
            return;
        }
        if (nextWins < 0 || nextLosses < 0 || nextSeed < 0) {
            setError('Wins, losses, and seed cannot be negative.');
            return;
        }

        const updated = await teamService.updateTeamDetails(currentTeam.$id, {
            sport: nextSport,
            division: nextDivision,
            teamSize: nextTeamSize,
            seed: nextSeed,
            wins: nextWins,
            losses: nextLosses,
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

        if (selectedInviteRole === 'player' && eventContext && filteredFreeAgents.length > 0) {
            const freeAgentsNotInResults = filteredFreeAgents.filter(
                agent => !users.some(user => user.$id === agent.$id)
            );
            users = [...freeAgentsNotInResults, ...users];
        }

        return users;
    };

    const handleInviteUser = async (userId: string) => {
        try {
            const user = await userService.getUserById(userId);
            if (!user) throw new Error('User not found');
            if (!canInviteUserForRole(user.$id, selectedInviteRole)) {
                notifications.show({ color: 'yellow', message: `${selectedRoleLabel} already assigned or invited.` });
                return;
            }
            const success = await teamService.inviteUserToTeamRole(currentTeam, user, selectedInviteRole);

            if (success) {
                if (selectedInviteRole === 'player') {
                    const invitedUser = await userService.getUserById(userId);
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
                const invitedUser = await userService.getUserById(ensuredUser.$id);
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
            const success = await teamService.removePlayerFromTeam(currentTeam.$id, playerId);

            if (success) {
                setTeamPlayers(prev => prev.filter(player => player.$id !== playerId));

                const updatedTeam = {
                    ...currentTeam,
                    playerIds: currentTeam.playerIds.filter(id => id !== playerId)
                };
                onTeamUpdated?.(updatedTeam);
            }
        } catch (error) {
            console.error('Failed to remove player:', error);
            setError('Failed to remove player');
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
                                <Text c="dimmed">{typeof currentTeam.division === 'string' ? currentTeam.division : currentTeam.division?.name || currentTeam.division?.skillLevel || 'Division'} Division • {currentTeam.sport}</Text>
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
                    {/* Event Context Banner */}
                    {eventContext && (
                        <Alert color="blue" variant="light" mb="md" title={`Managing team for: ${eventContext.name}`}>
                            <Text size="sm" c="blue">{eventContext.location} • {eventContext.sport?.name}</Text>
                            {getFilteredFreeAgents().length > 0 && (
                                <Text size="sm" c="blue">{getFilteredFreeAgents().length} free agents available to invite.</Text>
                            )}
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
                                <TextInput
                                    label="Sport"
                                    value={draftSport}
                                    onChange={(event) => setDraftSport(event.currentTarget.value)}
                                />
                                <TextInput
                                    label="Division"
                                    value={draftDivision}
                                    onChange={(event) => setDraftDivision(event.currentTarget.value)}
                                />
                                <NumberInput
                                    label="Team Size"
                                    min={1}
                                    value={draftTeamSize}
                                    onChange={(value) => setDraftTeamSize(Number(value) || 1)}
                                />
                                <NumberInput
                                    label="Seed"
                                    min={0}
                                    value={draftSeed}
                                    onChange={(value) => setDraftSeed(Number(value) || 0)}
                                />
                                <NumberInput
                                    label="Wins"
                                    min={0}
                                    value={draftWins}
                                    onChange={(value) => setDraftWins(Number(value) || 0)}
                                />
                                <NumberInput
                                    label="Losses"
                                    min={0}
                                    value={draftLosses}
                                    onChange={(value) => setDraftLosses(Number(value) || 0)}
                                />
                            </SimpleGrid>
                            <Group justify="flex-end" mt="sm">
                                <Button variant="default" onClick={() => setEditingDetails(false)}>Cancel</Button>
                                <Button onClick={() => { void handleSaveDetails(); }}>Save Team Details</Button>
                            </Group>
                        </Paper>
                    )}

                    {/* Team Stats */}
                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md" mb="md">
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{currentTeam.wins}</Title>
                            <Text c="dimmed">Wins</Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{currentTeam.losses}</Title>
                            <Text c="dimmed">Losses</Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{currentTeam.winRate}%</Title>
                            <Text c="dimmed">Win Rate</Text>
                        </Paper>
                        <Paper withBorder p="md" radius="md" ta="center">
                            <Title order={3}>{teamPlayers.length}/{currentTeam.teamSize}</Title>
                            <Text c="dimmed">Players</Text>
                        </Paper>
                    </SimpleGrid>

                    {/* Team Members */}
                    <div className="mb-6">
                        <Title order={5} mb="sm">Team Members ({teamPlayers.length})</Title>
                        {teamPlayers.length > 0 ? (
                            <ScrollArea.Autosize mah={240} type="auto">
                                <div className="space-y-3">
                                    {teamPlayers.map(player => (
                                        <Paper key={player.$id} withBorder radius="md" p="sm">
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar src={getUserAvatarUrl(player, 40)} alt={getUserFullName(player)} size={40} radius="xl" />
                                                    <div>
                                                        <Text fw={500}>{getUserFullName(player)}</Text>
                                                        <Text size="xs" c="dimmed">{getUserHandle(player)}</Text>
                                                        {player.$id === currentTeam.captainId && (
                                                            <Badge color="blue" variant="light" size="xs">Captain</Badge>
                                                        )}
                                                    </div>
                                                </Group>
                                                {canManageTeam && player.$id !== currentTeam.captainId && (
                                                    <Button color="red" variant="subtle" size="xs" onClick={() => handleRemovePlayer(player.$id)}>Remove</Button>
                                                )}
                                            </Group>
                                        </Paper>
                                    ))}
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
                                    const isFromEvent = eventFreeAgents.some(agent => agent.$id === player.$id);
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
                                                    <p className="text-xs text-gray-500">{getUserHandle(player)}</p>
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
                                <Text c="dimmed" size="sm">
                                    {managerUser ? getUserFullName(managerUser) : 'Unassigned'}
                                </Text>
                            </Group>
                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>Head Coach</Text>
                                <Text c="dimmed" size="sm">
                                    {headCoachUser ? getUserFullName(headCoachUser) : 'Unassigned'}
                                </Text>
                            </Group>
                            <Group justify="space-between">
                                <Text fw={500}>Assistant Coaches</Text>
                                <Text c="dimmed" size="sm">
                                    {assistantCoachUsers.length
                                        ? assistantCoachUsers.map((assistantCoach) => getUserFullName(assistantCoach)).join(', ')
                                        : 'Unassigned'}
                                </Text>
                            </Group>
                        </Paper>
                    </div>

                    {/* Pending Staff Invitations */}
                    {pendingRoleInvites.length > 0 && (
                        <div className="mb-6">
                            <Title order={5} mb="sm">Pending Staff Invitations ({pendingRoleInvites.length})</Title>
                            <div className="space-y-3">
                                {pendingRoleInvites.map(({ invite, invitedUser }) => {
                                    const inviteRoleLabel = invite.type === 'team_manager'
                                        ? 'Manager'
                                        : invite.type === 'team_head_coach'
                                        ? 'Head Coach'
                                        : 'Assistant Coach';
                                    const isCancellingInvite = cancellingRoleInviteIds.has(invite.$id);
                                    return (
                                        <Paper key={invite.$id} withBorder radius="md" p="sm" bg="yellow.0">
                                            <Group justify="space-between">
                                                <div>
                                                    <Text fw={500}>{invitedUser ? getUserFullName(invitedUser) : invite.email ?? 'Unknown user'}</Text>
                                                    {invitedUser && (
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
                                                        <Text size="xs" c="dimmed">{getUserHandle(suggestedFreeAgent)}</Text>
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
                                                                    <Text size="xs" c="dimmed">{getUserHandle(agent)}</Text>
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
                                                                        <Text size="xs" c="dimmed">{getUserHandle(user)}</Text>
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
        </>
    );
}
