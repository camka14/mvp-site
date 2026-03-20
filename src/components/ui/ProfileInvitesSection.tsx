'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { Event, Invite, Organization, Team } from '@/types';
import { userService } from '@/lib/userService';
import { organizationService } from '@/lib/organizationService';
import { teamService } from '@/lib/teamService';
import { eventService } from '@/lib/eventService';
import OrganizationCard from '@/components/ui/OrganizationCard';
import TeamCard from '@/components/ui/TeamCard';
import EventCard from '@/components/ui/EventCard';

type ProfileInvitesSectionProps = {
  userId: string;
};

const getTeamInviteRoleLabel = (invite: Invite, team: Team | null): string => {
  if (!team || !invite.userId) {
    return 'Team Invite';
  }
  if (Array.isArray(team.pending) && team.pending.includes(invite.userId)) {
    return 'Player';
  }
  if (team.managerId === invite.userId) {
    return 'Manager';
  }
  if (team.headCoachId === invite.userId) {
    return 'Head Coach';
  }
  if (Array.isArray(team.coachIds) && team.coachIds.includes(invite.userId)) {
    return 'Assistant Coach';
  }
  return 'Team Invite';
};

export default function ProfileInvitesSection({ userId }: ProfileInvitesSectionProps) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [organizationsById, setOrganizationsById] = useState<Record<string, Organization>>({});
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({});
  const [eventsById, setEventsById] = useState<Record<string, Event>>({});
  const [loading, setLoading] = useState(true);
  const [actingInviteId, setActingInviteId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    try {
      const nextInvites = (await userService.listInvites({ userId }))
        .filter((invite) => invite.status === 'PENDING');
      setInvites(nextInvites);

      const organizationIds = Array.from(new Set(nextInvites.map((invite) => invite.organizationId).filter((value): value is string => Boolean(value))));
      const teamIds = Array.from(new Set(nextInvites.map((invite) => invite.teamId).filter((value): value is string => Boolean(value))));
      const eventIds = Array.from(new Set(nextInvites.map((invite) => invite.eventId).filter((value): value is string => Boolean(value))));

      const [organizations, teams, events] = await Promise.all([
        organizationIds.length ? organizationService.getOrganizationsByIds(organizationIds) : Promise.resolve([]),
        teamIds.length ? teamService.getTeamsByIds(teamIds, true) : Promise.resolve([]),
        eventIds.length ? Promise.all(eventIds.map((eventId) => eventService.getEvent(eventId))) : Promise.resolve([]),
      ]);

      setOrganizationsById(Object.fromEntries(organizations.map((organization) => [organization.$id, organization])));
      setTeamsById(Object.fromEntries(teams.map((team) => [team.$id, team])));
      setEventsById(Object.fromEntries(events.filter((event): event is Event => Boolean(event)).map((event) => [event.$id, event])));
    } catch (error) {
      console.error('Failed to load profile invites:', error);
      setInvites([]);
      setOrganizationsById({});
      setTeamsById({});
      setEventsById({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const hasInvites = invites.length > 0;

  const organizationInvites = useMemo(
    () => invites.filter((invite) => invite.type === 'STAFF' && invite.organizationId),
    [invites],
  );
  const teamInvites = useMemo(
    () => invites.filter((invite) => invite.type === 'TEAM' && invite.teamId),
    [invites],
  );
  const eventInvites = useMemo(
    () => invites.filter((invite) => (
      invite.eventId
      && (invite.type === 'EVENT' || (invite.type === 'STAFF' && !invite.organizationId))
    )),
    [invites],
  );

  const acceptInvite = async (inviteId: string) => {
    setActingInviteId(inviteId);
    try {
      await userService.acceptInvite(inviteId);
      await loadInvites();
    } finally {
      setActingInviteId(null);
    }
  };

  const declineInvite = async (inviteId: string) => {
    setActingInviteId(inviteId);
    try {
      await userService.declineInvite(inviteId);
      await loadInvites();
    } finally {
      setActingInviteId(null);
    }
  };

  if (loading && !hasInvites) {
    return (
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed">Loading invites...</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={4}>Invites</Title>
        <Text size="sm" c="dimmed">
          Review organization, team, and event invites waiting on you.
        </Text>
      </Stack>

      {!hasInvites ? (
        <Paper withBorder radius="md" p="md">
          <Text size="sm" c="dimmed">No pending invites.</Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {organizationInvites.map((invite) => {
            const organization = invite.organizationId ? organizationsById[invite.organizationId] : null;
            if (!organization) {
              return null;
            }
            return (
              <OrganizationCard
                key={invite.$id}
                organization={organization}
                actions={(
                  <Stack gap={6}>
                    <Button size="xs" loading={actingInviteId === invite.$id} onClick={() => { void acceptInvite(invite.$id); }}>
                      Accept Invite
                    </Button>
                    <Button size="xs" variant="default" onClick={() => { void declineInvite(invite.$id); }}>
                      Decline
                    </Button>
                  </Stack>
                )}
              />
            );
          })}

          {teamInvites.map((invite) => {
            const team = invite.teamId ? teamsById[invite.teamId] : null;
            if (!team) {
              return null;
            }
            return (
              <TeamCard
                key={invite.$id}
                team={team}
                onClick={() => router.push(`/teams`)}
                actions={(
                  <Stack gap={6}>
                    <Text size="xs" c="dimmed">{getTeamInviteRoleLabel(invite, team)}</Text>
                    <Button size="xs" loading={actingInviteId === invite.$id} onClick={(event) => {
                      event.stopPropagation();
                      void acceptInvite(invite.$id);
                    }}>
                      Accept Invite
                    </Button>
                    <Button size="xs" variant="default" onClick={(event) => {
                      event.stopPropagation();
                      void declineInvite(invite.$id);
                    }}>
                      Decline
                    </Button>
                  </Stack>
                )}
              />
            );
          })}

          {eventInvites.map((invite) => {
            const event = invite.eventId ? eventsById[invite.eventId] : null;
            if (!event) {
              return null;
            }
            const staffRoleLabel = invite.type === 'STAFF'
              ? Array.isArray(invite.staffTypes) && invite.staffTypes.length > 0
                ? invite.staffTypes.map((type) => (type === 'REFEREE' ? 'Referee' : 'Host')).join(' + ')
                : 'Staff'
              : null;
            return (
              <Paper key={invite.$id} withBorder radius="md" p="sm">
                <Stack gap="sm">
                  <EventCard event={event} onClick={() => router.push(`/events/${event.$id}?tab=details`)} />
                  {staffRoleLabel ? (
                    <Text size="xs" c="dimmed">{staffRoleLabel}</Text>
                  ) : null}
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      onClick={() => {
                        if (invite.type === 'STAFF') {
                          void acceptInvite(invite.$id);
                          return;
                        }
                        router.push(`/events/${event.$id}?tab=details`);
                      }}
                    >
                      Accept Invite
                    </Button>
                    <Button size="xs" variant="default" onClick={() => { void declineInvite(invite.$id); }}>
                      Decline
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}
