'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Team, UserData, Event } from '@/types';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import { eventService } from '@/lib/eventService';
import Navigation from '@/components/layout/Navigation';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import Loading from '@/components/ui/Loading';
import TeamDetailModal from '@/components/ui/TeamDetailModal';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import InvitePlayersModal from '@/components/ui/InvitePlayersModal';

export default function TeamsPage() {
  return <Suspense fallback={<Loading fullScreen text="Loading teams..." />}>
    <TeamsPageContent />
  </Suspense>;
}

function TeamsPageContent() {
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

  // Event context for inviting free agents
  const searchParams = useSearchParams();
  const [eventContext, setEventContext] = useState<Event | null>(null);
  const [eventFreeAgents, setEventFreeAgents] = useState<UserData[]>([]);

  // Local UI state for extracted modals
  const [creating, setCreating] = useState(false);

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

  // Load event context (free agents) if arriving from EventJoinModal
  useEffect(() => {
    const eventId = searchParams?.get('event');
    const loadEvent = async () => {
      if (!eventId) {
        setEventContext(null);
        setEventFreeAgents([]);
        return;
      }
      try {
        const evt = await eventService.getEventById(eventId);
        if (evt) {
          setEventContext(evt);
          if (evt.freeAgents && evt.freeAgents.length > 0) {
            const agents = await userService.getUsersByIds(evt.freeAgents);
            setEventFreeAgents(agents);
          } else {
            setEventFreeAgents([]);
          }
        }
      } catch (e) {
        console.error('Failed to load event context:', e);
        setEventContext(null);
        setEventFreeAgents([]);
      }
    };
    loadEvent();
  }, [searchParams]);

  // CreateTeamModal manages its own form state

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
    return;
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
      const success = await teamService.removeTeamInvitation(teamId, user.$id);
      if (success) {
        setTeamInvitations(prev => prev.filter(team => team.$id !== teamId));
      }
    } catch (error) {
      console.error('Failed to reject invitation:', error);
    }
  };

  // Invite flow handled within InvitePlayersModal

  const divisions = ['Open', 'Recreational', 'Competitive', 'Elite'];
  const sports = Object.keys(sportPlayerCounts);

  const extractFileIdFromUrl = (url: string): string => {
    try {
      const match = url.match(/\/files\/([^/]+)\/preview/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  };

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
                            // If we have an event context, open the Team Detail modal
                            // to surface event free agents for inviting
                            if (eventContext) {
                              setSelectedTeamForDetails(team);
                              setShowTeamDetailModal(true);
                            } else {
                              setSelectedTeam(team);
                              setShowInviteModal(true);
                            }
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

        {/* Create Team Modal */}
        <CreateTeamModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          currentUser={user as UserData}
          onTeamCreated={(team) => setTeams(prev => [...prev, team])}
        />

        {/* Invite Players Modal */}
        {selectedTeam && (
          <InvitePlayersModal
            isOpen={showInviteModal}
            onClose={() => {
              setShowInviteModal(false);
              setSelectedTeam(null);
            }}
            team={selectedTeam}
          />
        )}

        {/* Team Detail Modal */}
        {selectedTeamForDetails && (
          <TeamDetailModal
            currentTeam={selectedTeamForDetails}
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
            eventContext={eventContext ?? undefined}
            eventFreeAgents={eventFreeAgents}
          />
        )}
      </div>
    </>
  );
}
