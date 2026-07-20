'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app/providers';
import { Team, UserData, Invite } from '@/types';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import Navigation from '@/components/layout/Navigation';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import Loading from '@/components/ui/Loading';
import TeamBuilderModal from '@/components/ui/TeamBuilderModal';
import { Container, Title, Text, Group, Button, SegmentedControl, SimpleGrid, Paper, Badge } from '@mantine/core';
import { buildTeamManagementPath } from '../teamRoutes';

type ManageTeamsProps = {
  showNavigation?: boolean;
  withContainer?: boolean;
};

const TEAM_INVITE_TYPES = ['TEAM'] as const;

const upsertTeamList = (teams: Team[], team: Team): Team[] => {
  const teamId = team.$id;
  if (!teamId) {
    return teams;
  }
  const exists = teams.some((candidate) => candidate.$id === teamId);
  return exists
    ? teams.map((candidate) => candidate.$id === teamId ? team : candidate)
    : [...teams, team];
};

export default function ManageTeams({ showNavigation = true, withContainer = true }: ManageTeamsProps = {}) {
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
  const { user, loading: authLoading, isAuthenticated, setUserTeams: setCachedUserTeams } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<Array<{ invite: Invite; team: Team | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-teams' | 'invitations'>('my-teams');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const handledTeamDeepLinkRef = useRef<string | null>(null);
  const handledEventBuilderRef = useRef<string | null>(null);

  const searchParams = useSearchParams();
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<string | null>(null);
  const [selectedFreeAgent, setSelectedFreeAgent] = useState<UserData | null>(null);

  const router = useRouter();
  const buildTeamDetailHref = useCallback((teamId: string): string => {
    const nextParams = new URLSearchParams();
    const freeAgentId = searchParams?.get('freeAgent')?.trim();
    const eventId = searchParams?.get('event')?.trim();
    if (freeAgentId) {
      nextParams.set('freeAgent', freeAgentId);
    }
    if (eventId) {
      nextParams.set('event', eventId);
    }
    const query = nextParams.toString();
    return `${buildTeamManagementPath(teamId)}${query ? `?${query}` : ''}`;
  }, [searchParams]);

  const getDivisionLabel = (division: Team['division']) =>
    typeof division === 'string'
      ? division
      : division?.name || division?.skillLevel || 'Division';

  const getInviteRoleLabel = (invite: Invite, team: Team | null): string => {
    const targetUserId = invite.userId ?? user?.$id;
    if (!team || !targetUserId) {
      return 'Team Invite';
    }
    if (Array.isArray(team.pending) && team.pending.includes(targetUserId)) {
      return 'Player';
    }
    if (team.managerId === targetUserId) {
      return 'Manager';
    }
    if (team.headCoachId === targetUserId) {
      return 'Head Coach';
    }
    if (Array.isArray(team.coachIds) && team.coachIds.includes(targetUserId)) {
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
      setCachedUserTeams(detailedTeams, user.$id);

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
  }, [setCachedUserTeams, user]);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      void loadTeamsData();
    }
  }, [user, authLoading, isAuthenticated, router, loadTeamsData]);

  useEffect(() => {
    const teamIdParam = searchParams?.get('teamId')?.trim();
    if (!teamIdParam) {
      if (!teamIdParam) {
        handledTeamDeepLinkRef.current = null;
      }
      return;
    }
    if (handledTeamDeepLinkRef.current === teamIdParam) {
      return;
    }
    handledTeamDeepLinkRef.current = teamIdParam;
    const nextParams = new URLSearchParams();
    const freeAgentId = searchParams?.get('freeAgent')?.trim();
    const eventId = searchParams?.get('event')?.trim();
    if (freeAgentId) {
      nextParams.set('freeAgent', freeAgentId);
    }
    if (eventId) {
      nextParams.set('event', eventId);
    }
    const query = nextParams.toString();
    router.replace(`${buildTeamManagementPath(teamIdParam)}${query ? `?${query}` : ''}`);
  }, [router, searchParams]);

  useEffect(() => {
    const eventId = searchParams?.get('event')?.trim() ?? '';
    const freeAgentId = searchParams?.get('freeAgent')?.trim() ?? '';
    const teamId = searchParams?.get('teamId')?.trim() ?? '';
    if (!eventId || freeAgentId || teamId || handledEventBuilderRef.current === eventId) {
      return;
    }
    handledEventBuilderRef.current = eventId;
    setShowCreateModal(true);
  }, [searchParams]);

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
                    router.push(buildTeamDetailHref(team.$id));
                  }}
                  actions={
                    (team.captainId === user.$id || team.managerId === user.$id) && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(buildTeamDetailHref(team.$id));
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
                {teamInvitations.map(({ invite, team }) => {
                  const isChildSelfInvite = Boolean(user?.isMinor && invite.userId === user.$id && !invite.viewerCanAcceptForChild);
                  return (
                    <Paper key={invite.$id} withBorder radius="md" p="md">
                      <Group justify="space-between" mb="sm">
                        <div>
                          <Text fw={600}>{team?.name || 'Team Invitation'}</Text>
                          {team && (
                            <Text size="sm" c="dimmed">{getDivisionLabel(team.division)} Division</Text>
                          )}
                          <Text size="sm" c="dimmed">Role: {getInviteRoleLabel(invite, team)}</Text>
                          {invite.viewerCanAcceptForChild ? (
                            <Text size="sm" c="dimmed">For {invite.childFullName || 'child'}</Text>
                          ) : null}
                        </div>
                        <Badge color="orange" variant="light">Invited</Badge>
                      </Group>
                      <Group justify="space-between" c="dimmed" mb="md">
                        <Text size="sm">{team ? `${team.teamSize} members` : 'Pending invite'}</Text>
                        <Text size="sm">{team ? `${team.currentSize} active` : 'Team loading unavailable'}</Text>
                      </Group>
                      {isChildSelfInvite ? (
                        <Text size="sm" c="dimmed" mb="sm">
                          A parent or guardian must accept this invitation.
                        </Text>
                      ) : null}
                      <Group>
                        <Button onClick={() => handleAcceptInvitation(invite.$id)} disabled={isChildSelfInvite} fullWidth>Accept</Button>
                        <Button variant="default" onClick={() => handleRejectInvitation(invite.$id)} fullWidth>Decline</Button>
                      </Group>
                    </Paper>
                  );
                })}
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

      {/* Shared four-step team builder */}
      <TeamBuilderModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        currentUser={user as UserData}
        eventId={searchParams?.get('event')?.trim() || null}
        initialFreeAgentId={selectedFreeAgentId}
        onTeamCreated={(team) => {
          setTeams((previous) => {
            const nextTeams = upsertTeamList(previous, team);
            setCachedUserTeams(nextTeams, user.$id);
            return nextTeams;
          });
        }}
      />

    </div>
  );
}
