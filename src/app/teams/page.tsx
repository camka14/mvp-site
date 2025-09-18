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
import InvitePlayersModal from './components/InvitePlayersModal';
import { Container, Title, Text, Group, Button, SegmentedControl, SimpleGrid, Paper, Badge } from '@mantine/core';

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
      // Enrich with players so TeamCard can show member avatars
      const detailedTeams = await teamService.getTeamsByIds(userTeams.map(t => t.$id), true);
      setTeams(detailedTeams);

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

  if (authLoading) {
    return <Loading fullScreen text="Loading teams..." />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
      <Navigation />
      <Container size="lg" py="xl">
        {/* Header */}
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={2} mb={4}>Team Management</Title>
            <Text c="dimmed">Manage your teams and invitations</Text>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>+ Create Team</Button>
        </Group>

        {/* Tabs */}
        <Group mb="lg">
          <SegmentedControl
            value={activeTab}
            onChange={(v: any) => setActiveTab(v)}
            data={[
              { label: `My Teams (${teams.length})`, value: 'my-teams' },
              { label: `Invitations (${teamInvitations.length})`, value: 'invitations' },
            ]}
          />
          {teamInvitations.length > 0 && <Badge color="red" variant="filled" size="xs">{teamInvitations.length}</Badge>}
        </Group>

        {/* Content - same as before... */}
        {activeTab === 'my-teams' ? (
          <div>
            {loading ? (
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Paper key={`team-skel-${i}`} withBorder radius="md" p="md" h={220} className="skeleton" />
                ))}
              </SimpleGrid>
            ) : teams.length > 0 ? (
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
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
                        <Button
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
                          title="Invite Players"
                        >
                          + Invite
                        </Button>
                      )
                    }
                  />
                ))}
              </SimpleGrid>
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
                <Button onClick={() => setShowCreateModal(true)}>Create Your First Team</Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {loading ? (
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Paper key={`inv-skel-${i}`} withBorder radius="md" p="md" h={180} className="skeleton" />
                ))}
              </SimpleGrid>
            ) : teamInvitations.length > 0 ? (
              <div className="space-y-4">
                <Title order={4} mb="md">Pending Team Invitations</Title>
                <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                  {teamInvitations.map((team) => (
                    <Paper key={team.$id} withBorder radius="md" p="md">
                      <Group justify="space-between" mb="sm">
                        <div>
                          <Text fw={600}>{team.name || 'Unnamed Team'}</Text>
                          <Text size="sm" c="dimmed">{team.division} Division</Text>
                        </div>
                        <Badge color="orange" variant="light">Invited</Badge>
                      </Group>
                      <Group justify="space-between" c="dimmed" mb="md">
                        <Text size="sm">{team.teamSize} members</Text>
                        <Text size="sm">{team.winRate}% win rate</Text>
                      </Group>
                      <Group>
                        <Button onClick={() => handleAcceptInvitation(team.$id)} fullWidth>Accept</Button>
                        <Button variant="default" onClick={() => handleRejectInvitation(team.$id)} fullWidth>Decline</Button>
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
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
      </Container>
    </>
  );
}
