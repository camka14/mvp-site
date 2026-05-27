'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { isApiRequestError } from '@/lib/apiClient';
import type { BillingAddress, Event, Invite, Organization, PaymentIntent, Team, TeamPlayerRegistration, UserData } from '@/types';
import { userService } from '@/lib/userService';
import { organizationService } from '@/lib/organizationService';
import { paymentService } from '@/lib/paymentService';
import { teamService, type TeamRegistrationCheckoutTarget } from '@/lib/teamService';
import { eventService } from '@/lib/eventService';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal, { type PaymentEventSummary } from '@/components/ui/PaymentModal';
import OrganizationCard from '@/components/ui/OrganizationCard';
import TeamCard from '@/components/ui/TeamCard';
import EventCard from '@/components/ui/EventCard';

type ProfileInvitesSectionProps = {
  userId: string;
  currentUser?: UserData | null;
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

const normalizeText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getAcceptedChildUserId = (invite: Invite): string | null => {
  if (invite.type !== 'TEAM' || !invite.viewerCanAcceptForChild) {
    return null;
  }
  return normalizeText(invite.childUserId) || normalizeText(invite.userId) || null;
};

const isPayableTeamRegistration = (
  registration: TeamPlayerRegistration,
  childUserId: string,
): boolean => {
  if (normalizeText(registration.userId) !== childUserId) {
    return false;
  }
  const status = normalizeText(registration.status).toUpperCase();
  return status === 'STARTED' || status === 'PENDING';
};

export const buildAcceptedChildTeamCheckoutTarget = (
  teamId: string,
  registration: TeamPlayerRegistration,
): TeamRegistrationCheckoutTarget => ({
  id: normalizeText(registration.id) || undefined,
  teamId,
  registrantId: normalizeText(registration.registrantId ?? registration.userId) || undefined,
  userId: normalizeText(registration.userId) || undefined,
  parentId: normalizeText(registration.parentId) || null,
  registrantType: normalizeText(registration.registrantType) || 'CHILD',
  rosterRole: normalizeText(registration.rosterRole) || 'PARTICIPANT',
  consentDocumentId: normalizeText(registration.consentDocumentId) || null,
  consentStatus: normalizeText(registration.consentStatus) || null,
});

const buildTeamPaymentSummary = (team: Team): PaymentEventSummary => ({
  name: team.name || 'Team registration',
  location: '',
  eventType: 'TOURNAMENT',
  price: team.registrationPriceCents ?? 0,
  imageId: team.profileImageId,
});

const buildUserFullName = (user?: UserData | null): string | null => {
  const fullName = [normalizeText(user?.firstName), normalizeText(user?.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || normalizeText(user?.userName) || null;
};

export default function ProfileInvitesSection({ userId, currentUser }: ProfileInvitesSectionProps) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [organizationsById, setOrganizationsById] = useState<Record<string, Organization>>({});
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({});
  const [eventsById, setEventsById] = useState<Record<string, Event>>({});
  const [loading, setLoading] = useState(true);
  const [actingInviteId, setActingInviteId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [paymentTeam, setPaymentTeam] = useState<Team | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [pendingCheckoutTarget, setPendingCheckoutTarget] = useState<TeamRegistrationCheckoutTarget | null>(null);

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

  const startAcceptedChildTeamCheckout = useCallback(async (
    team: Team,
    checkoutTarget: TeamRegistrationCheckoutTarget,
    billingAddress?: BillingAddress,
  ) => {
    if (!currentUser) {
      throw new Error('You must be signed in to continue.');
    }

    try {
      const organization = team.organizationId ? organizationsById[team.organizationId] : undefined;
      const nextPaymentData = await paymentService.createTeamRegistrationPaymentIntent(
        currentUser,
        team,
        checkoutTarget,
        organization,
        billingAddress,
      );
      setPaymentTeam(team);
      setPaymentData(nextPaymentData);
      setShowPaymentModal(true);
      setShowBillingAddressModal(false);
      setPendingCheckoutTarget(null);
    } catch (error) {
      if (
        isApiRequestError(error)
        && error.data
        && typeof error.data === 'object'
        && 'billingAddressRequired' in error.data
        && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
      ) {
        setPaymentTeam(team);
        setPendingCheckoutTarget(checkoutTarget);
        setShowBillingAddressModal(true);
        return;
      }
      throw error;
    }
  }, [currentUser, organizationsById]);

  const maybeStartAcceptedChildTeamPayment = useCallback(async (invite: Invite) => {
    const childUserId = getAcceptedChildUserId(invite);
    if (!childUserId || !invite.teamId) {
      return;
    }

    const acceptedTeam = await teamService.getTeamById(invite.teamId, true);
    if (!acceptedTeam) {
      setPaymentError('Invite accepted, but the team could not be reloaded for checkout.');
      return;
    }

    setTeamsById((current) => ({
      ...current,
      [acceptedTeam.$id]: acceptedTeam,
    }));

    if ((acceptedTeam.registrationPriceCents ?? 0) <= 0) {
      return;
    }

    const registration = (acceptedTeam.playerRegistrations ?? [])
      .find((candidate) => isPayableTeamRegistration(candidate, childUserId));
    if (!registration) {
      setPaymentError('Invite accepted, but the child registration could not be found for checkout.');
      return;
    }

    await startAcceptedChildTeamCheckout(
      acceptedTeam,
      buildAcceptedChildTeamCheckoutTarget(acceptedTeam.$id, registration),
    );
  }, [startAcceptedChildTeamCheckout]);

  const acceptInvite = async (invite: Invite) => {
    const inviteId = invite.$id;
    setActingInviteId(inviteId);
    setPaymentError(null);
    try {
      await userService.acceptInvite(inviteId);
      await maybeStartAcceptedChildTeamPayment(invite);
      await loadInvites();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept invite.';
      console.error('Failed to accept invite:', error);
      setPaymentError(message);
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

      {paymentError ? (
        <Alert color="red" variant="light" onClose={() => setPaymentError(null)} withCloseButton>
          {paymentError}
        </Alert>
      ) : null}

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
                    <Button size="xs" loading={actingInviteId === invite.$id} onClick={() => { void acceptInvite(invite); }}>
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
            const isChildSelfInvite = Boolean(currentUser?.isMinor && invite.userId === userId && !invite.viewerCanAcceptForChild);
            return (
              <TeamCard
                key={invite.$id}
                team={team}
                onClick={() => router.push(`/teams`)}
                actions={(
                  <Stack gap={6}>
                    <Text size="xs" c="dimmed">{getTeamInviteRoleLabel(invite, team)}</Text>
                    {invite.viewerCanAcceptForChild ? (
                      <Text size="xs" c="dimmed">For {invite.childFullName || 'child'}</Text>
                    ) : null}
                    {isChildSelfInvite ? (
                      <Text size="xs" c="dimmed">
                        A parent or guardian must accept this invitation.
                      </Text>
                    ) : null}
                    <Button size="xs" loading={actingInviteId === invite.$id} onClick={(event) => {
                      event.stopPropagation();
                      void acceptInvite(invite);
                    }} disabled={isChildSelfInvite}>
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
                ? invite.staffTypes.map((type) => (type === 'OFFICIAL' ? 'Official' : 'Host')).join(' + ')
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
                          void acceptInvite(invite);
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

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => {
          setShowBillingAddressModal(false);
          setPendingCheckoutTarget(null);
        }}
        onSaved={async (billingAddress) => {
          if (!paymentTeam || !pendingCheckoutTarget) {
            return;
          }
          await startAcceptedChildTeamCheckout(paymentTeam, pendingCheckoutTarget, billingAddress);
        }}
      />
      {paymentTeam ? (
        <PaymentModal
          isOpen={showPaymentModal && Boolean(paymentData)}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentData(null);
          }}
          event={buildTeamPaymentSummary(paymentTeam)}
          paymentData={paymentData}
          payerName={buildUserFullName(currentUser)}
          onPaymentSuccess={async () => {
            const refreshed = await teamService.getTeamById(paymentTeam.$id, true);
            if (refreshed) {
              setTeamsById((current) => ({
                ...current,
                [refreshed.$id]: refreshed,
              }));
            }
            await loadInvites();
            notifications.show({
              color: 'green',
              message: `Payment complete for ${paymentTeam.name}.`,
            });
          }}
          onPaymentPending={async () => {
            const refreshed = await teamService.getTeamById(paymentTeam.$id, true);
            if (refreshed) {
              setTeamsById((current) => ({
                ...current,
                [refreshed.$id]: refreshed,
              }));
            }
            await loadInvites();
            notifications.show({
              color: 'yellow',
              message: `Payment submitted for ${paymentTeam.name}. Registration is pending until the bank payment clears.`,
            });
          }}
        />
      ) : null}
    </Stack>
  );
}
