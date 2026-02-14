// components/ui/TeamDetailModal.tsx
import React, { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { Modal, Group, Text, Title, Button, Paper, SimpleGrid, Avatar, Badge, Alert, TextInput, ScrollArea } from '@mantine/core';
import { Team, UserData, Event, getUserFullName, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';
import { useApp } from '@/app/providers';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { ImageSelectionModal } from './ImageSelectionModal';

interface TeamDetailModalProps {
    currentTeam: Team;
    isOpen: boolean;
    onClose: () => void;
    onTeamUpdated?: (team: Team) => void;
    onTeamDeleted?: (teamId: string) => void;
    eventContext?: Event;
    eventFreeAgents?: UserData[];
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function TeamDetailModal({
    currentTeam,
    isOpen,
    onClose,
    onTeamUpdated,
    onTeamDeleted,
    eventContext,
    eventFreeAgents = []
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
    const [imagePickerOpen, setImagePickerOpen] = useState(false);
    const [inviteMode, setInviteMode] = useState<'search' | 'email'>('search');
    const [emailInviteInput, setEmailInviteInput] = useState('');
    const [invitingByEmail, setInvitingByEmail] = useState(false);
    const [cancellingInviteIds, setCancellingInviteIds] = useState<Set<string>>(new Set());

    const isTeamCaptain = currentTeam.captainId === user?.$id;
    const normalizedInviteEmail = emailInviteInput.trim().toLowerCase();
    const inviteEmailValid = EMAIL_REGEX.test(normalizedInviteEmail);

    useEffect(() => {
        if (isOpen) {
            fetchTeamDetails();
        }
    }, [isOpen, currentTeam.$id]);

    useEffect(() => {
        setLocalFreeAgents(eventFreeAgents);
    }, [eventFreeAgents]);

    useEffect(() => {
        setNewName(currentTeam.name || '');
    }, [currentTeam.$id]);

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
    }, [searchQuery, inviteMode]);

    const fetchTeamDetails = async () => {
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
        } catch (error) {
            console.error('Failed to fetch team details:', error);
            setError('Failed to load team details');
        } finally {
            setLoading(false);
        }
    };

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

    const performSearch = async () => {
        if (searching) return;

        setSearching(true);
        try {
            const results = await userService.searchUsers(searchQuery);
            const filteredResults = results.filter(result =>
                !currentTeam.playerIds.includes(result.$id) &&
                !currentTeam.pending.includes(result.$id)
            );
            setSearchResults(filteredResults);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setSearching(false);
        }
    };

    const getFilteredFreeAgents = () => {
        return localFreeAgents.filter(agent =>
            !currentTeam.playerIds.includes(agent.$id) &&
            !currentTeam.pending.includes(agent.$id)
        );
    };

    const getAvailableUsers = () => {
        let users = [...searchResults];
        const filteredFreeAgents = getFilteredFreeAgents();

        if (eventContext && filteredFreeAgents.length > 0) {
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
            const success = await teamService.invitePlayerToTeam(currentTeam, user);

            if (success) {
                const invitedUser = await userService.getUserById(userId);
                if (invitedUser) {
                    setPendingPlayers(prev => (
                        prev.some(player => player.$id === invitedUser.$id) ? prev : [...prev, invitedUser]
                    ));
                    setSearchResults(prev => prev.filter(user => user.$id !== userId));

                    const updatedTeam = {
                        ...currentTeam,
                        pending: Array.from(new Set([...currentTeam.pending, userId]))
                    };
                    onTeamUpdated?.(updatedTeam);
                }
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
            const alreadyOnTeam = currentTeam.playerIds.includes(ensuredUser.$id);
            const alreadyPending =
                currentTeam.pending.includes(ensuredUser.$id) ||
                pendingPlayers.some((player) => player.$id === ensuredUser.$id);
            if (alreadyOnTeam) {
                notifications.show({ color: 'yellow', message: 'This player is already on the team.' });
                return;
            }
            if (alreadyPending) {
                notifications.show({ color: 'yellow', message: 'This player already has a pending invite.' });
                return;
            }

            const success = await teamService.invitePlayerToTeam(currentTeam, ensuredUser);
            if (!success) {
                notifications.show({ color: 'red', message: 'Failed to send invite.' });
                return;
            }

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

            notifications.show({ color: 'green', message: `Invite sent to ${normalizedInviteEmail}.` });
            setEmailInviteInput('');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send invite';
            notifications.show({ color: 'red', message });
        } finally {
            setInvitingByEmail(false);
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
                        {isTeamCaptain && (
                            <Group gap="xs">
                                {!editingName && (
                                    <Button variant="subtle" size="xs" onClick={() => setEditingName(true)}>Edit Name</Button>
                                )}
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
                                                        {player.$id === currentTeam.captainId && (
                                                            <Badge color="blue" variant="light" size="xs">Captain</Badge>
                                                        )}
                                                    </div>
                                                </Group>
                                                {isTeamCaptain && player.$id !== currentTeam.captainId && (
                                                    <Button color="red" variant="subtle" size="xs" onClick={() => handleRemovePlayer(player.$id)}>Remove</Button>
                                                )}
                                            </Group>
                                        </Paper>
                                    ))}
                                </div>
                            </ScrollArea.Autosize>
                        ) : (
                            <Text c="dimmed" ta="center" py={8}>
                                {isTeamCaptain ? 'Invite some players to build your team!' : 'This team is just getting started.'}
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
                                                <img
                                                    src={getUserAvatarUrl(player, 40)}
                                                    alt={getUserFullName(player)}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                                <div>
                                                    <p className="font-medium">{getUserFullName(player)}</p>
                                                    <span className={`text-xs font-medium ${isFromEvent ? 'text-blue-600' : 'text-yellow-600'
                                                        }`}>
                                                        {isFromEvent ? 'Free Agent - Invitation pending' : 'Invitation pending'}
                                                    </span>
                                                </div>
                                            </div>
                                            {isTeamCaptain && (
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

                    {/* Add Players Section */}
                    {isTeamCaptain && (
                        <div className="mb-6">
                            <Button onClick={() => setShowAddPlayers(!showAddPlayers)} mb="sm">
                                {showAddPlayers ? 'Close' : 'Add Players'}
                            </Button>
                            {showAddPlayers && (
                                <Paper withBorder radius="md" p="md">
                                    <Title order={6} mb="sm">Add players to {currentTeam.name}</Title>
                                    <Group align="flex-end" wrap="nowrap" mb="sm">
                                        <TextInput
                                            style={{ flex: 1 }}
                                            placeholder={
                                                inviteMode === 'search'
                                                    ? 'Search players (min 2 characters)'
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
                                            {`No players found matching "${searchQuery}"`}
                                        </Text>
                                    )}
                                    {inviteMode === 'search' && !searching && (searchQuery.length < 2 && getFilteredFreeAgents().length > 0) && (
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
                                                Invite by email will ensure the player account exists, add them to team pending,
                                                and send an invite email for invite-created accounts.
                                            </Text>
                                            <Group justify="flex-end">
                                                <Button
                                                    onClick={handleInviteByEmail}
                                                    loading={invitingByEmail}
                                                    disabled={!inviteEmailValid}
                                                >
                                                    Send Email Invite
                                                </Button>
                                            </Group>
                                        </Paper>
                                    )}
                                </Paper>
                            )}
                        </div>
                    )}

                    {/* Delete Team Section */}
                    {isTeamCaptain && (
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
