import React, { useState, useEffect } from 'react';
import { Team, UserData, getTeamAvatarUrl, getUserAvatarUrl } from '@/types';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { useApp } from '@/app/providers';
import UserCard from './UserCard';

interface TeamDetailModalProps {
    team: Team | null;
    isOpen: boolean;
    onClose: () => void;
    onTeamUpdated: (updatedTeam: Team) => void;
    onTeamDeleted: (teamId: string) => void;
}

export default function TeamDetailModal({
    team,
    isOpen,
    onClose,
    onTeamUpdated,
    onTeamDeleted
}: TeamDetailModalProps) {
    const { user } = useApp();
    const [detailedTeam, setDetailedTeam] = useState<Team | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false); // Changed: specific loading state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserData[]>([]);
    const [inviting, setInviting] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const isTeamCaptain = team && user && team.captainId === user.$id;
    const currentTeam = detailedTeam || team; // Use detailed team if available, fallback to basic team

    useEffect(() => {
        if (isOpen && team) {
            // Set the basic team immediately to prevent flicker
            setDetailedTeam(team);

            // Only load details if we don't have them yet
            if (!team.players || team.players.length === 0) {
                loadTeamDetails();
            }
        } else {
            // Reset when modal closes
            setDetailedTeam(null);
            setIsLoadingDetails(false);
        }
    }, [isOpen, team]);

    const loadTeamDetails = async () => {
        if (!team) return;

        setIsLoadingDetails(true);
        try {
            const updatedTeam = await teamService.getTeamById(team.$id, true);
            if (updatedTeam) {
                setDetailedTeam(updatedTeam);
                onTeamUpdated(updatedTeam);
            }
        } catch (error) {
            console.error('Failed to load team details:', error);
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleSearchUsers = async (query: string) => {
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        try {
            const results = await userService.searchUsers(query);
            const filteredResults = results.filter(searchUser =>
                !currentTeam?.playerIds.includes(searchUser.$id) &&
                !currentTeam?.pending.includes(searchUser.$id)
            );
            setSearchResults(filteredResults);
        } catch (error) {
            console.error('Failed to search users:', error);
        }
    };

    const handleInvitePlayer = async (playerId: string) => {
        if (!currentTeam || inviting) return;

        setInviting(playerId);
        try {
            const success = await teamService.invitePlayerToTeam(currentTeam.$id, playerId);
            if (success) {
                await loadTeamDetails(); // Refresh team data
                setShowInviteModal(false);
                setSearchQuery('');
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Failed to invite player:', error);
            alert('Failed to invite player. Team might be full.');
        } finally {
            setInviting(null);
        }
    };

    const handleRemovePlayer = async (playerId: string, playerName: string) => {
        if (!currentTeam || !confirm(`Are you sure you want to remove ${playerName} from the team?`)) {
            return;
        }

        try {
            const success = await teamService.removePlayerFromTeam(currentTeam.$id, playerId);
            if (success) {
                await loadTeamDetails(); // Refresh team data
            }
        } catch (error) {
            console.error('Failed to remove player:', error);
            alert('Failed to remove player from team.');
        }
    };

    const handleDeleteTeam = async () => {
        if (!currentTeam || !confirm(`Are you sure you want to delete "${currentTeam.name}"? This action cannot be undone.`)) {
            return;
        }

        setDeleting(true);
        try {
            const success = await teamService.deleteTeam(currentTeam.$id);
            if (success) {
                onTeamDeleted(currentTeam.$id);
                onClose();
            }
        } catch (error) {
            console.error('Failed to delete team:', error);
            alert('Failed to delete team.');
        } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    if (!isOpen || !currentTeam) return null;

    return (
        <>
            {/* Team Detail Modal */}
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                    {/* Header - Shows immediately with basic data */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200">
                        <div className="flex items-center space-x-4">
                            <img
                                src={getTeamAvatarUrl(currentTeam, 64)}
                                alt={currentTeam.name || 'Team'}
                                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                            />
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {currentTeam.name || 'Unnamed Team'}
                                </h2>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className="text-sm text-gray-600">{currentTeam.division} Division</span>
                                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                                        {currentTeam.sport}
                                    </span>
                                    {currentTeam.isFull && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800">
                                            Full
                                        </span>
                                    )}
                                    {/* Loading indicator for details */}
                                    {isLoadingDetails && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center">
                                            <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Loading...
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            {isTeamCaptain && (
                                <>
                                    <button
                                        onClick={() => setShowInviteModal(true)}
                                        disabled={currentTeam.isFull || isLoadingDetails}
                                        className="btn-primary text-sm"
                                        title={currentTeam.isFull ? 'Team is full' : 'Invite players'}
                                    >
                                        + Invite
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={isLoadingDetails}
                                        className="btn-secondary text-red-600 border-red-300 hover:bg-red-50 text-sm"
                                    >
                                        Delete Team
                                    </button>
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Team Stats - Shows immediately with basic data */}
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <div className="grid grid-cols-4 gap-4 text-center">
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{currentTeam.currentSize}</div>
                                <div className="text-xs text-gray-600">Members</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{currentTeam.wins}</div>
                                <div className="text-xs text-gray-600">Wins</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{currentTeam.losses}</div>
                                <div className="text-xs text-gray-600">Losses</div>
                            </div>
                            <div>
                                <div className="text-lg font-semibold text-gray-900">{currentTeam.winRate}%</div>
                                <div className="text-xs text-gray-600">Win Rate</div>
                            </div>
                        </div>
                    </div>

                    {/* Content - Shows basic data immediately, then loads details */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                            {/* Team Members */}
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 mb-4">
                                    Team Members ({currentTeam.currentSize}/{currentTeam.teamSize})
                                </h3>
                                <div className="space-y-2">
                                    {currentTeam.players && currentTeam.players.length > 0 ? (
                                        currentTeam.players.map((player) => (
                                            <UserCard
                                                key={player.$id}
                                                user={player}
                                                showRole
                                                role={player.$id === currentTeam.captainId ? 'Captain' : 'Player'}
                                                actions={
                                                    isTeamCaptain && player.$id !== currentTeam.captainId && (
                                                        <button
                                                            onClick={() => handleRemovePlayer(player.$id, player.fullName)}
                                                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                            disabled={isLoadingDetails}
                                                        >
                                                            Remove
                                                        </button>
                                                    )
                                                }
                                                className="!shadow-none !border border-gray-200 hover:!border-gray-300"
                                            />
                                        ))
                                    ) : (
                                        // Show basic member info while loading details
                                        <div className="space-y-2">
                                            <UserCard
                                                key={currentTeam.captainId}
                                                user={{
                                                    $id: currentTeam.captainId,
                                                    firstName: 'Team',
                                                    lastName: 'Captain',
                                                    userName: 'captain',
                                                    teamIds: [],
                                                    friendIds: [],
                                                    friendRequestIds: [],
                                                    friendRequestSentIds: [],
                                                    followingIds: [],
                                                    teamInvites: [],
                                                    eventInvites: [],
                                                    tournamentInvites: [],
                                                    hasStripeAccount: false,
                                                    uploadedImages: [],
                                                    fullName: 'Team Captain',
                                                    avatarUrl: ''
                                                } as UserData}
                                                showRole
                                                role="Captain"
                                                className="!shadow-none !border border-gray-200 opacity-75"
                                            />
                                            {isLoadingDetails && (
                                                <div className="text-center py-4">
                                                    <div className="inline-flex items-center text-sm text-gray-500">
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Loading team members...
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pending Invitations */}
                            {currentTeam.pendingPlayers && currentTeam.pendingPlayers.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                                        Pending Invitations ({currentTeam.pendingPlayers.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {currentTeam.pendingPlayers.map((player) => (
                                            <UserCard
                                                key={player.$id}
                                                user={player}
                                                showRole
                                                role="Invited"
                                                className="!shadow-none !border border-orange-200 bg-orange-50"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Empty State - only show if we have complete data and team size is 1 */}
                            {currentTeam.players && currentTeam.currentSize === 1 && (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-lg font-medium text-gray-900 mb-2">Just getting started</h4>
                                    <p className="text-gray-600">
                                        {isTeamCaptain ? 'Invite some players to build your team!' : 'This team is just getting started.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Rest of the modals remain the same... */}
            {/* Invite Players Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-900">Invite Players</h3>
                                    <p className="text-sm text-gray-600">Add players to {currentTeam.name}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowInviteModal(false);
                                        setSearchQuery('');
                                        setSearchResults([]);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        handleSearchUsers(e.target.value);
                                    }}
                                    className="form-input"
                                    placeholder="Search players by name or username..."
                                />
                            </div>

                            <div className="max-h-64 overflow-y-auto">
                                {searchQuery.length < 2 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>Type at least 2 characters to search for players</p>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    <div className="space-y-2">
                                        {searchResults.map((searchUser) => (
                                            <div key={searchUser.$id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                                                <div className="flex items-center space-x-3">
                                                    <img
                                                        src={getUserAvatarUrl(searchUser, 40)}
                                                        alt={searchUser.fullName}
                                                        className="w-10 h-10 rounded-full"
                                                    />
                                                    <div>
                                                        <div className="text-sm font-medium">{searchUser.fullName}</div>
                                                        <div className="text-xs text-gray-500">@{searchUser.userName}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleInvitePlayer(searchUser.$id)}
                                                    disabled={inviting === searchUser.$id}
                                                    className="btn-primary text-sm py-2 px-4"
                                                >
                                                    {inviting === searchUser.$id ? 'Inviting...' : 'Invite'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>No players found matching "{searchQuery}"</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex items-center mb-4">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Delete Team</h3>
                                    <p className="text-sm text-gray-600">This action cannot be undone</p>
                                </div>
                            </div>

                            <p className="text-gray-700 mb-6">
                                Are you sure you want to delete <strong>"{currentTeam.name}"</strong>? This will permanently remove the team and all its data.
                            </p>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="btn-secondary flex-1"
                                    disabled={deleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteTeam}
                                    className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 flex-1"
                                    disabled={deleting}
                                >
                                    {deleting ? 'Deleting...' : 'Delete Team'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
