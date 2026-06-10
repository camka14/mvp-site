'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Container, Group, Paper, Stack, Text } from '@mantine/core';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import TeamDetailModal, { type TeamDetailPageTab } from '@/components/ui/TeamDetailModal';
import { useApp } from '@/app/providers';
import { ORG_PERMISSIONS } from '@/lib/organizationPermissions';
import { organizationService } from '@/lib/organizationService';
import { teamService } from '@/lib/teamService';
import { userService } from '@/lib/userService';
import type { Organization, Team, UserData } from '@/types';
import { buildOrganizationTabPath } from '@/app/organizations/[id]/organizationTabs';
import { buildTeamManagementPath, teamDetailTabFromPathSegment } from '../teamRoutes';

type TeamManagementPageClientProps = {
  teamId: string;
  initialTabSegment?: string | null;
};

type SearchParamReader = {
  get(name: string): string | null;
};

const teamDetailQueryString = (searchParams: SearchParamReader | null): string => {
  if (!searchParams) {
    return '';
  }
  const nextParams = new URLSearchParams();
  const freeAgent = searchParams.get('freeAgent')?.trim();
  const eventId = searchParams.get('event')?.trim();
  if (freeAgent) {
    nextParams.set('freeAgent', freeAgent);
  }
  if (eventId) {
    nextParams.set('event', eventId);
  }
  const query = nextParams.toString();
  return query ? `?${query}` : '';
};

export default function TeamManagementPageClient({
  teamId,
  initialTabSegment,
}: TeamManagementPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, loading: authLoading, isAuthenticated } = useApp();
  const [team, setTeam] = useState<Team | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [selectedFreeAgent, setSelectedFreeAgent] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TeamDetailPageTab>(() => (
    teamDetailTabFromPathSegment(initialTabSegment)
  ));

  const selectedFreeAgentId = searchParams?.get('freeAgent')?.trim() || null;

  useEffect(() => {
    setActiveTab(teamDetailTabFromPathSegment(initialTabSegment));
  }, [initialTabSegment]);

  const loadTeam = useCallback(async () => {
    const normalizedTeamId = teamId.trim();
    if (!normalizedTeamId) {
      setTeam(null);
      setOrganization(null);
      setError('Team not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextTeam = await teamService.getTeamById(normalizedTeamId, true);
      if (!nextTeam) {
        setTeam(null);
        setOrganization(null);
        setError('Team not found.');
        return;
      }

      setTeam(nextTeam);
      if (nextTeam.organizationId) {
        const nextOrganization = await organizationService.getOrganizationById(nextTeam.organizationId, false);
        setOrganization(nextOrganization ?? null);
      } else {
        setOrganization(null);
      }
    } catch (loadError) {
      console.error('Failed to load team:', loadError);
      setTeam(null);
      setOrganization(null);
      setError('Failed to load team.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }
    void loadTeam();
  }, [authLoading, isAuthenticated, loadTeam, router, user]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedFreeAgent = async () => {
      if (!selectedFreeAgentId) {
        setSelectedFreeAgent(null);
        return;
      }
      try {
        const nextFreeAgent = await userService.getUserById(selectedFreeAgentId);
        if (!cancelled) {
          setSelectedFreeAgent(nextFreeAgent ?? null);
        }
      } catch (loadError) {
        console.error('Failed to load selected free agent:', loadError);
        if (!cancelled) {
          setSelectedFreeAgent(null);
        }
      }
    };

    void loadSelectedFreeAgent();
    return () => {
      cancelled = true;
    };
  }, [selectedFreeAgentId]);

  const viewerCanManageOrgTeams = useMemo(() => (
    Boolean(
      organization?.viewerCanManageOrganization
        || organization?.viewerPermissions?.includes(ORG_PERMISSIONS.TEAMS_MANAGE),
    )
  ), [organization?.viewerCanManageOrganization, organization?.viewerPermissions]);

  const canManageTeam = useMemo(() => {
    if (!team || !user) {
      return false;
    }
    return Boolean(
      authUser?.isAdmin === true
        || team.captainId === user.$id
        || team.managerId === user.$id
        || viewerCanManageOrgTeams,
    );
  }, [authUser?.isAdmin, team, user, viewerCanManageOrgTeams]);

  const backPath = team?.organizationId
    ? buildOrganizationTabPath(team.organizationId, 'teams')
    : '/teams';

  const handleTabChange = useCallback((nextTab: TeamDetailPageTab) => {
    setActiveTab(nextTab);
    router.push(`${buildTeamManagementPath(teamId, nextTab)}${teamDetailQueryString(searchParams)}`);
  }, [router, searchParams, teamId]);

  const handleTeamUpdated = useCallback((updatedTeam: Team) => {
    setTeam(updatedTeam);
    if (updatedTeam.organizationId && updatedTeam.organizationId !== organization?.$id) {
      void organizationService.getOrganizationById(updatedTeam.organizationId, false)
        .then((nextOrganization) => setOrganization(nextOrganization ?? null));
    }
    if (!updatedTeam.organizationId) {
      setOrganization(null);
    }
  }, [organization?.$id]);

  const handleTeamDeleted = useCallback(() => {
    router.push(backPath);
  }, [backPath, router]);

  if (authLoading || loading) {
    return (
      <>
        <Navigation />
        <Loading fullScreen belowNavigation text="Loading team..." />
      </>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (error || !team) {
    return (
      <>
        <Navigation />
        <Container fluid py="xl">
          <Paper withBorder radius="md" p="xl">
            <Stack gap="sm">
              <Alert color="red">{error ?? 'Team not found.'}</Alert>
              <Button variant="default" onClick={() => router.push('/teams')}>
                Back to teams
              </Button>
            </Stack>
          </Paper>
        </Container>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <Container fluid py="xl" className="org-page-shell">
        <Group mb="lg">
          <Button variant="default" onClick={() => router.push(backPath)}>
            {team.organizationId ? 'Back to organization teams' : 'Back to teams'}
          </Button>
          {organization?.name ? (
            <Text size="sm" c="dimmed">
              {organization.name}
            </Text>
          ) : null}
        </Group>

        <TeamDetailModal
          currentTeam={team}
          isOpen
          onClose={() => router.push(backPath)}
          canManage={canManageTeam}
          canChargeRegistration={team.organizationId ? Boolean(organization?.hasStripeAccount) : undefined}
          onTeamUpdated={handleTeamUpdated}
          onTeamDeleted={handleTeamDeleted}
          selectedFreeAgentId={selectedFreeAgentId ?? undefined}
          selectedFreeAgentUser={selectedFreeAgent ?? undefined}
          variant="page"
          activeTab={activeTab}
          onActiveTabChange={handleTabChange}
        />
      </Container>
    </>
  );
}
