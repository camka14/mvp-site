'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Team, UserData } from '@/types';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import Navigation from '@/components/layout/Navigation';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import Loading from '@/components/ui/Loading';
import TeamDetailModal from '@/components/ui/TeamDetailModal';

export default function TeamsPage() {
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-teams' | 'invitations'>('my-teams');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedTeamForDetails, setSelectedTeamForDetails] = useState<Team | null>(null);
  const [showTeamDetailModal, setShowTeamDetailModal] = useState(false);

  // Create Team Form State - UPDATED with playerCount
  const [createForm, setCreateForm] = useState({
    name: '',
    division: 'Open',
    sport: 'Volleyball',
    playerCount: 6,
    profileImage: ''
  });
  const [creating, setCreating] = useState(false);

  // Invite Players State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserData[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);

  const router = useRouter();

  // Sport-specific player count suggestions
  const sportPlayerCounts: Record<string, number> = {
    'Volleyball': 6,
    'Basketball': 5,
    'Soccer': 11,
    'Football': 11,
    'Hockey': 11,
    'Baseball': 9,
    'Tennis': 2,
    'Pickleball': 4,
    'Swimming': 8,
    'Other': 8
  };

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      loadTeamsData();
    }
  }, [user, authLoading, isAuthenticated, router]);

  // Update player count when sport changes
  useEffect(() => {
    setCreateForm(prev => ({
      ...prev,
      playerCount: sportPlayerCounts[prev.sport] || 8
    }));
  }, [createForm.sport]);

  const loadTeamsData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const userTeams = await teamService.getTeamsByUserId(user.$id);
      setTeams(userTeams);

      if (user.teamInvites && user.teamInvites.length > 0) {
        const invitationPromises = user.teamInvites.map(teamId =>
          teamService.getTeamById(teamId, true)
        );
        const invitations = await Promise.all(invitationPromises);
        setTeamInvitations(invitations.filter(team => team !== undefined) as Team[]);
      }
    } catch (error) {
      console.error('Failed to load teams data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !createForm.name.trim()) return;

    setCreating(true);
    try {
      const newTeam = await teamService.createTeam(
        createForm.name.trim(),
        user.$id,
        createForm.division,
        createForm.sport,
        createForm.playerCount,
        createForm.profileImage || undefined
      );

      if (newTeam) {
        setTeams(prev => [...prev, newTeam]);
        setCreateForm({
          name: '',
          division: 'Open',
          sport: 'Volleyball',
          playerCount: 6,
          profileImage: ''
        });
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to create team:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleAcceptInvitation = async (teamId: string) => {
    if (!user) return;

    try {
      const success = await teamService.acceptTeamInvitation(teamId, user.$id);
      if (success) {
        loadTeamsData();
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error);
    }
  };

  const handleRejectInvitation = async (teamId: string) => {
    if (!user) return;

    try {
      const success = await teamService.rejectTeamInvitation(teamId, user.$id);
      if (success) {
        setTeamInvitations(prev => prev.filter(team => team.$id !== teamId));
      }
    } catch (error) {
      console.error('Failed to reject invitation:', error);
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
        !selectedTeam?.playerIds.includes(searchUser.$id) &&
        !selectedTeam?.pending.includes(searchUser.$id) &&
        searchUser.$id !== user?.$id
      );
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Failed to search users:', error);
    }
  };

  const handleInvitePlayer = async (playerId: string) => {
    if (!selectedTeam || inviting) return;

    setInviting(playerId);
    try {
      const success = await teamService.invitePlayerToTeam(selectedTeam.$id, playerId);
      if (success) {
        loadTeamsData();
        setShowInviteModal(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedTeam(null);
      }
    } catch (error) {
      console.error('Failed to invite player:', error);
    } finally {
      setInviting(null);
    }
  };

  const divisions = ['Open', 'Recreational', 'Competitive', 'Elite'];
  const sports = Object.keys(sportPlayerCounts);

  if (authLoading || loading) {
    return <Loading fullScreen text="Loading teams..." />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
      <Navigation />
      <div className="container-responsive py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Management</h1>
            <p className="text-gray-600">Manage your teams and invitations</p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary whitespace-nowrap"
          >
            + Create Team
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-8 w-fit">
          <button
            onClick={() => setActiveTab('my-teams')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${activeTab === 'my-teams'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            My Teams ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 relative ${activeTab === 'invitations'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            Invitations ({teamInvitations.length})
            {teamInvitations.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {teamInvitations.length}
              </span>
            )}
          </button>
        </div>

        {/* Content - same as before... */}
        {activeTab === 'my-teams' ? (
          <div>
            {teams.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {teams.map((team) => (
                  <TeamCard
                    key={team.$id}
                    team={team}
                    onClick={() => {
                      setSelectedTeamForDetails(team);
                      setShowTeamDetailModal(true);
                    }}
                    actions={
                      team.captainId === user.$id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeam(team);
                            setShowInviteModal(true);
                          }}
                          className="btn-ghost text-xs py-1 px-2"
                          title="Invite Players"
                        >
                          + Invite
                        </button>
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">No teams yet</h3>
                <p className="text-gray-600 mb-6 max-w-sm mx-auto">
                  Create your first team to start organizing players and competing in events.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary"
                >
                  Create Your First Team
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {teamInvitations.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Pending Team Invitations
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamInvitations.map((team) => (
                    <div key={team.$id} className="card">
                      <div className="card-content">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-gray-900 mb-1">
                              {team.name || 'Unnamed Team'}
                            </h3>
                            <p className="text-sm text-gray-600">{team.division} Division</p>
                          </div>
                          <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                            Invited
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                          <span>{team.teamSize} members</span>
                          <span>{team.winRate}% win rate</span>
                        </div>

                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleAcceptInvitation(team.$id)}
                            className="btn-primary flex-1 text-sm py-2"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectInvitation(team.$id)}
                            className="btn-secondary flex-1 text-sm py-2"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">No invitations</h3>
                <p className="text-gray-600">
                  When teams invite you to join, they'll appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* UPDATED Create Team Modal with Player Count */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-900">Create New Team</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div>
                    <label className="form-label">Team Name</label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="form-input"
                      placeholder="Enter team name"
                      required
                      maxLength={50}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Choose a unique name for your team (max 50 characters)
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Sport</label>
                    <select
                      value={createForm.sport}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, sport: e.target.value }))}
                      className="form-input"
                    >
                      {sports.map(sport => (
                        <option key={sport} value={sport}>{sport}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Select the sport your team will play
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Division</label>
                    <select
                      value={createForm.division}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, division: e.target.value }))}
                      className="form-input"
                    >
                      {divisions.map(division => (
                        <option key={division} value={division}>{division}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Select the competitive level for your team
                    </p>
                  </div>

                  {/* Player Count Field */}
                  <div>
                    <label className="form-label">Maximum Players</label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="number"
                        min="2"
                        max="50"
                        value={createForm.playerCount}
                        onChange={(e) => setCreateForm(prev => ({
                          ...prev,
                          playerCount: parseInt(e.target.value) || 2
                        }))}
                        className="form-input flex-1"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setCreateForm(prev => ({
                          ...prev,
                          playerCount: sportPlayerCounts[prev.sport] || 8
                        }))}
                        className="btn-ghost text-sm py-2 px-3 whitespace-nowrap"
                      >
                        Use Default ({sportPlayerCounts[createForm.sport]})
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Set the maximum number of players for your team (typically {sportPlayerCounts[createForm.sport]} for {createForm.sport})
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Team Logo (Optional)</label>
                    <input
                      type="url"
                      value={createForm.profileImage || ''}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, profileImage: e.target.value }))}
                      className="form-input"
                      placeholder="Enter image URL"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Add a team logo or leave blank to use initials
                    </p>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="btn-secondary flex-1"
                      disabled={creating}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary flex-1"
                      disabled={creating || !createForm.name.trim()}
                    >
                      {creating ? 'Creating...' : 'Create Team'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Invite Players Modal - same as before... */}
        {showInviteModal && selectedTeam && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">Invite Players</h3>
                    <p className="text-sm text-gray-600">
                      Add players to {selectedTeam.name}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowInviteModal(false);
                      setSelectedTeam(null);
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
                          <UserCard
                            user={searchUser}
                            className="!p-0 !shadow-none flex-1"
                          />
                          <button
                            onClick={() => handleInvitePlayer(searchUser.$id)}
                            disabled={inviting === searchUser.$id}
                            className="btn-primary text-sm py-2 px-4 ml-3"
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

        {/* Team Detail Modal */}
        <TeamDetailModal
          team={selectedTeamForDetails}
          isOpen={showTeamDetailModal}
          onClose={() => {
            setShowTeamDetailModal(false);
            setSelectedTeamForDetails(null);
          }}
          onTeamUpdated={(updatedTeam) => {
            setTeams(prev => prev.map(team => team.$id === updatedTeam.$id ? updatedTeam : team));
            setSelectedTeamForDetails(updatedTeam);
          }}
          onTeamDeleted={(teamId) => {
            setTeams(prev => prev.filter(team => team.$id !== teamId));
            setShowTeamDetailModal(false);
            setSelectedTeamForDetails(null);
          }}
        />
      </div>
    </>
  );
}
