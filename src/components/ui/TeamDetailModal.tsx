// components/ui/TeamDetailModal.tsx
import React, { useState, useEffect } from 'react';
import ModalShell from './ModalShell';
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

    const [cancellingInviteIds, setCancellingInviteIds] = useState<Set<string>>(new Set());

    const isTeamCaptain = currentTeam.captainId === user?.$id;

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
        if (searchQuery.length >= 2) {
            performSearch();
        } else {
            setSearchResults([]);
        }
    }, [searchQuery]);

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
            const success = await teamService.invitePlayerToTeam(currentTeam.$id, userId);

            if (success) {
                const invitedUser = await userService.getUserById(userId);
                if (invitedUser) {
                    setPendingPlayers(prev => [...prev, invitedUser]);
                    setSearchResults(prev => prev.filter(user => user.$id !== userId));

                    const updatedTeam = {
                        ...currentTeam,
                        pending: [...currentTeam.pending, userId]
                    };
                    onTeamUpdated?.(updatedTeam);
                }
            }
        } catch (error) {
            console.error('Failed to invite user:', error);
            setError('Failed to send invitation');
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

    if (!isOpen) return null;

    return (
        <>
            <ModalShell
                isOpen={isOpen}
                onClose={onClose}
                maxWidth="4xl"
                contentClassName="!p-0"
                header={
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center space-x-4">
                            <img
                                src={getTeamAvatarUrl(currentTeam, 60)}
                                alt={currentTeam.name}
                                className="w-15 h-15 rounded-lg object-cover"
                            />
                            <div>
                                {editingName ? (
                                    <div className="flex items-center space-x-2">
                                        <input
                                            className="text-2xl font-bold text-gray-900 border-b border-gray-300 focus:outline-none"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                        />
                                        <button onClick={handleSaveName} className="text-blue-600 text-sm">Save</button>
                                        <button onClick={() => { setEditingName(false); setNewName(currentTeam.name || ''); }} className="text-gray-600 text-sm">Cancel</button>
                                    </div>
                                ) : (
                                    <h3 className="text-2xl font-bold text-gray-900">{currentTeam.name}</h3>
                                )}
                                <p className="text-gray-600">{currentTeam.division} Division • {currentTeam.sport}</p>
                            </div>
                        </div>
                        {isTeamCaptain && (
                            <div className="flex items-center gap-2">
                                {!editingName && (
                                    <button onClick={() => setEditingName(true)} className="btn-ghost text-sm">Edit Name</button>
                                )}
                                <button onClick={() => setImagePickerOpen(true)} className="btn-secondary text-sm">Change Image</button>
                            </div>
                        )}
                    </div>
                }
            >
                {/* Content */}
                <div className="p-6">
                    {/* Event Context Banner */}
                    {eventContext && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-semibold text-blue-900 mb-2">
                                Managing team for: {eventContext.name}
                            </h4>
                            <p className="text-sm text-blue-700 mb-2">
                                {eventContext.location} • {eventContext.sport}
                            </p>
                            {getFilteredFreeAgents().length > 0 && (
                                <p className="text-sm text-blue-600">
                                    <strong>{getFilteredFreeAgents().length} free agents</strong> from this event are available to invite (highlighted below).
                                </p>
                            )}
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-red-600 text-sm">{error}</p>
                            <button
                                onClick={() => setError(null)}
                                className="text-red-800 hover:text-red-900 text-xs underline mt-1"
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* Team Stats */}
                    <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="text-2xl font-bold text-gray-900">{currentTeam.wins}</div>
                            <div className="text-sm text-gray-600">Wins</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="text-2xl font-bold text-gray-900">{currentTeam.losses}</div>
                            <div className="text-sm text-gray-600">Losses</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="text-2xl font-bold text-gray-900">{currentTeam.winRate}%</div>
                            <div className="text-sm text-gray-600">Win Rate</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <div className="text-2xl font-bold text-gray-900">{teamPlayers.length}/{currentTeam.teamSize}</div>
                            <div className="text-sm text-gray-600">Players</div>
                        </div>
                    </div>

                    {/* Team Members */}
                    <div className="mb-6">
                        <h4 className="text-lg font-semibold mb-4">Team Members ({teamPlayers.length})</h4>
                        {teamPlayers.length > 0 ? (
                            <div className="space-y-3">
                                {teamPlayers.map(player => (
                                    <div key={player.$id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center space-x-3">
                                            <img
                                                src={getUserAvatarUrl(player, 40)}
                                                alt={getUserFullName(player)}
                                                className="w-10 h-10 rounded-full object-cover"
                                            />
                                            <div>
                                                <p className="font-medium">{getUserFullName(player)}</p>
                                                {player.$id === currentTeam.captainId && (
                                                    <span className="text-xs text-blue-600 font-medium">Captain</span>
                                                )}
                                            </div>
                                        </div>
                                        {isTeamCaptain && player.$id !== currentTeam.captainId && (
                                            <button
                                                onClick={() => handleRemovePlayer(player.$id)}
                                                className="text-red-600 hover:text-red-800 text-sm"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {isTeamCaptain ? 'Invite some players to build your team!' : 'This team is just getting started.'}
                            </p>
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
                            <button
                                onClick={() => setShowAddPlayers(!showAddPlayers)}
                                className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                {showAddPlayers ? 'Close' : 'Add Players'}
                            </button>

                            {showAddPlayers && (
                                <div className="border border-gray-200 rounded-lg p-4">
                                    <h4 className="font-medium mb-3">Add players to {currentTeam.name}</h4>

                                    <div className="mb-4">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            placeholder="Type at least 2 characters to search for players"
                                        />
                                    </div>

                                    {searching && (
                                        <div className="text-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                                            <p className="text-gray-500 text-sm mt-2">Searching...</p>
                                        </div>
                                    )}

                                    {!searching && searchQuery.length >= 2 && getAvailableUsers().length === 0 && (
                                        <p className="text-gray-500 text-center py-4">
                                            No players found matching "{searchQuery}"
                                        </p>
                                    )}

                                    {!searching && (searchQuery.length < 2 && getFilteredFreeAgents().length > 0) && (
                                        <div className="mb-4">
                                            <h5 className="font-medium text-sm text-blue-900 mb-2">Available Free Agents from Event:</h5>
                                            <div className="space-y-2">
                                                {getFilteredFreeAgents().map(agent => (
                                                    <div
                                                        key={agent.$id}
                                                        className="flex items-center justify-between p-3 border-blue-300 bg-blue-50 border rounded-lg"
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <img
                                                                src={getUserAvatarUrl(agent, 40)}
                                                                alt={getUserFullName(agent)}
                                                                className="w-10 h-10 rounded-full object-cover"
                                                            />
                                                            <div>
                                                                <p className="font-medium">{getUserFullName(agent)}</p>
                                                                <span className="text-xs text-blue-600 font-medium">
                                                                    Free Agent from Event
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleInviteUser(agent.$id)}
                                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                                                        >
                                                            Invite
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!searching && getAvailableUsers().length > 0 && searchQuery.length >= 2 && (
                                        <div className="max-h-60 overflow-y-auto space-y-2">
                                            {getAvailableUsers().map(user => {
                                                const isFreeAgent = getFilteredFreeAgents().some(agent => agent.$id === user.$id);

                                                return (
                                                    <div
                                                        key={user.$id}
                                                        className={`flex items-center justify-between p-3 border rounded-lg ${isFreeAgent
                                                            ? 'border-blue-300 bg-blue-50'
                                                            : 'border-gray-200 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <img
                                                                src={getUserAvatarUrl(user, 40)}
                                                                alt={getUserFullName(user)}
                                                                className="w-10 h-10 rounded-full object-cover"
                                                            />
                                                            <div>
                                                                <p className="font-medium">{getUserFullName(user)}</p>
                                                                {isFreeAgent && (
                                                                    <span className="text-xs text-blue-600 font-medium">
                                                                        Free Agent from Event
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleInviteUser(user.$id)}
                                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                                                        >
                                                            Invite
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Delete Team Section */}
                    {isTeamCaptain && (
                        <div className="border-t pt-6">
                            <div className="bg-red-50 p-4 rounded-lg">
                                <h4 className="text-lg font-semibold text-red-900 mb-2">Danger Zone</h4>
                                <p className="text-red-700 text-sm mb-4">
                                    Once you delete a team, there is no going back. Please be certain.
                                </p>
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Delete Team
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-lg max-w-md w-full p-6">
                            <h3 className="text-lg font-semibold mb-4">Delete Team</h3>
                            <div className="mb-6">
                                <p className="text-gray-600 mb-2">This action cannot be undone</p>
                                <p className="text-sm text-gray-500">
                                    Are you sure you want to delete <strong>"{currentTeam.name}"</strong>?
                                    This will permanently remove the team and all its data.
                                </p>
                            </div>
                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteTeam}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                    Delete Team
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </ModalShell>
            <ImageSelectionModal
                bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!}
                currentUser={user as UserData}
                onSelect={handleChangeImage}
                onClose={() => setImagePickerOpen(false)}
                isOpen={imagePickerOpen}
            />
        </>
    );
}
