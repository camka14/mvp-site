'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Team, UserData, Invite } from '@/types';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import Navigation from '@/components/layout/Navigation';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import Loading from '@/components/ui/Loading';
import TeamDetailModal from '@/components/ui/TeamDetailModal';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import { Container, Title, Text, Group, Button, SegmentedControl, SimpleGrid, Paper, Badge } from '@mantine/core';

type ManageTeamsProps = {
  showNavigation?: boolean;
  withContainer?: boolean;
};

const TEAM_INVITE_TYPES = ['TEAM'] as const;

export default function TeamsPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading teams..." />}>
      <ManageTeams />
    </Suspense>
  );
}

export function ManageTeams({ showNavigation = true, withContainer = true }: ManageTeamsProps = {}) {
  const content = <TeamsPageContent />;

  return (
    <>
      {showNavigation && <Navigation />}
      {withContainer ? (
        <Container fluid py="xl">
          {content}
        </Container>
      ) : (
        <div className="py-6">
          {content}
        </div>
      )}
    </>
  );
}

function TeamsPageContent() {
  const { user, loading: authLoading, isAuthenticated } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<Array<{ invite: Invite; team: Team | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-teams' | 'invitations'>('my-teams');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeamForDetails, setSelectedTeamForDetails] = useState<Team | null>(null);
  const [showTeamDetailModal, setShowTeamDetailModal] = useState(false);

  const searchParams = useSearchParams();
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<string | null>(null);
  const [selectedFreeAgent, setSelectedFreeAgent] = useState<UserData | null>(null);

  // Local UI state for extracted modals
  const [creating, setCreating] = useState(false);

  const router = useRouter();

  const getDivisionLabel = (division: Team['division']) =>
    typeof division === 'string'
      ? division
      : division?.name || division?.skillLevel || 'Division';

  const getInviteRoleLabel = (invite: Invite, team: Team | null): string => {
    if (!team || !user?.$id) {
      return 'Team Invite';
    }
    if (Array.isArray(team.pending) && team.pending.includes(user.$id)) {
      return 'Player';
    }
    if (team.managerId === user.$id) {
      return 'Manager';
    }
    if (team.headCoachId === user.$id) {
      return 'Head Coach';
    }
    if (Array.isArray(team.coachIds) && team.coachIds.includes(user.$id)) {
      return 'Assistant Coach';
    }
    return 'Team Invite';
  };

  const loadTeamsData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const userTeams = await teamService.getTeamsByUserId(user.$id);
      // Enrich with players so TeamCard can show member avatars
      const detailedTeams = await teamService.getTeamsByIds(userTeams.map(t => t.$id), true);
      setTeams(detailedTeams);

      const invites = await userService.listInvites({ userId: user.$id, types: TEAM_INVITE_TYPES });
      const invitationPromises = invites
        .map(invite => invite.teamId)
        .filter((teamId): teamId is string => typeof teamId === 'string' && !!teamId)
        .map(teamId => teamService.getTeamById(teamId, true));
      const invitationTeams = (await Promise.all(invitationPromises)).filter((team): team is Team => Boolean(team));
      const invitationTeamMap = new Map(invitationTeams.map((team) => [team.$id, team]));
      setTeamInvitations(
        invites.map((invite) => ({
          invite,
          team: invite.teamId ? invitationTeamMap.get(invite.teamId) ?? null : null,
        })),
      );
    } catch (error) {
      console.error('Failed to load teams data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      void loadTeamsData();
    }
  }, [user, authLoading, isAuthenticated, router, loadTeamsData]);

  // Preserve optional selected free-agent focus from navigation while free agents are loaded server-side per team.
  useEffect(() => {
    const focusedFreeAgent = searchParams?.get('freeAgent');
    const normalizedFocusedFreeAgent =
      typeof focusedFreeAgent === 'string' && focusedFreeAgent.trim().length > 0
        ? focusedFreeAgent.trim()
        : null;
    const loadFocusedFreeAgent = async () => {
      setSelectedFreeAgentId(normalizedFocusedFreeAgent);
      if (!normalizedFocusedFreeAgent) {
        setSelectedFreeAgent(null);
        return;
      }
      try {
        const focusedUser = await userService.getUserById(normalizedFocusedFreeAgent);
        setSelectedFreeAgent(focusedUser ?? null);
      } catch (error) {
        console.error('Failed to load focused free agent:', error);
        setSelectedFreeAgent(null);
      }
    };
    void loadFocusedFreeAgent();
  }, [searchParams]);

  // CreateTeamModal manages its own form state

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    return;
  };

  const handleAcceptInvitation = async (inviteId: string) => {
    if (!user) return;

    try {
      const success = await userService.acceptInvite(inviteId);
      if (success) {
        loadTeamsData();
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error);
    }
  };

  const handleRejectInvitation = async (inviteId: string) => {
    if (!user) return;

    try {
      const success = await userService.declineInvite(inviteId);
      if (success) {
        setTeamInvitations(prev => prev.filter((entry) => entry.invite.$id !== inviteId));
      }
    } catch (error) {
      console.error('Failed to reject invitation:', error);
    }
  };

  if (authLoading) {
    return <Loading fullScreen belowNavigation text="Loading teams..." />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Group justify="space-between" align="center" mb="lg">
        <div>
          <Title order={2} mb={4}>Team Management</Title>
          <Text c="dimmed">Manage your teams and invitations</Text>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ Create Team</Button>
      </Group>

      {selectedFreeAgent && (
        <Paper withBorder radius="md" p="md" mb="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={600} mb={4}>Suggested free agent from event</Text>
              <UserCard user={selectedFreeAgent} />
              <Text size="sm" c="dimmed" mt="xs">
                Open a team and invite this player from the event free-agent suggestions.
              </Text>
            </div>
          </Group>
        </Paper>
      )}

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
                    (team.captainId === user.$id || team.managerId === user.$id) && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTeamForDetails(team);
                          setShowTeamDetailModal(true);
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
                {teamInvitations.map(({ invite, team }) => (
                  <Paper key={invite.$id} withBorder radius="md" p="md">
                    <Group justify="space-between" mb="sm">
                      <div>
                        <Text fw={600}>{team?.name || 'Team Invitation'}</Text>
                        {team && (
                          <Text size="sm" c="dimmed">{getDivisionLabel(team.division)} Division</Text>
                        )}
                        <Text size="sm" c="dimmed">Role: {getInviteRoleLabel(invite, team)}</Text>
                      </div>
                      <Badge color="orange" variant="light">Invited</Badge>
                    </Group>
                    <Group justify="space-between" c="dimmed" mb="md">
                      <Text size="sm">{team ? `${team.teamSize} members` : 'Pending invite'}</Text>
                      <Text size="sm">{team ? `${team.currentSize} active` : 'Team loading unavailable'}</Text>
                    </Group>
                    <Group>
                      <Button onClick={() => handleAcceptInvitation(invite.$id)} fullWidth>Accept</Button>
                      <Button variant="default" onClick={() => handleRejectInvitation(invite.$id)} fullWidth>Decline</Button>
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
                {"When teams invite you to join, they'll appear here."}
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
          selectedFreeAgentId={selectedFreeAgentId ?? undefined}
          selectedFreeAgentUser={selectedFreeAgent ?? undefined}
        />
      )}
    </div>
  );
}
