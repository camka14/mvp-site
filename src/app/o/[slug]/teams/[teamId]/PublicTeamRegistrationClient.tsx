'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useApp } from '@/app/providers';
import TeamRegistrationFlow from '@/components/ui/TeamRegistrationFlow';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import type {
  PublicOrganizationSummary,
  PublicOrganizationTeamRegistrationData,
} from '@/server/publicOrganizationCatalog';
import type { Team } from '@/types';
import { formatPrice } from '@/types';

type PublicTeamRegistrationClientProps = {
  slug: string;
  organization: PublicOrganizationSummary;
  team: PublicOrganizationTeamRegistrationData['team'];
};

const getTeamCapacityLabel = (
  team: PublicOrganizationTeamRegistrationData['team'],
): string => (
  team.teamSize > 0
    ? `${team.currentSize}/${team.teamSize} full`
    : `${team.currentSize} members`
);

const getTeamCapacityFill = (
  team: PublicOrganizationTeamRegistrationData['team'],
): number => (
  team.teamSize > 0
    ? Math.max(0, Math.min(100, Math.round((team.currentSize / team.teamSize) * 100)))
    : 0
);

const buildCheckoutTeam = (
  team: PublicOrganizationTeamRegistrationData['team'],
  organizationId: string,
): Team => ({
  $id: team.id,
  name: team.name,
  division: team.division ?? 'Open',
  sport: team.sport ?? 'Sport TBD',
  playerIds: [],
  captainId: '',
  managerId: '',
  pending: [],
  teamSize: team.teamSize,
  organizationId,
  openRegistration: team.openRegistration,
  registrationPriceCents: team.registrationPriceCents,
  currentSize: team.currentSize,
  isFull: team.isFull,
  avatarUrl: team.imageUrl,
  requiredTemplateIds: team.requiredTemplateIds,
});

export default function PublicTeamRegistrationClient({
  slug,
  organization,
  team,
}: PublicTeamRegistrationClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useApp();
  const checkoutTeam = useMemo(
    () => buildCheckoutTeam(team, organization.id),
    [organization.id, team],
  );
  const capacityLabel = useMemo(() => getTeamCapacityLabel(team), [team]);
  const capacityFill = useMemo(() => getTeamCapacityFill(team), [team]);

  return (
    <Container size="sm" py="xl">
      <Paper withBorder radius="md" p="xl">
        <TeamRegistrationFlow
          team={checkoutTeam}
          user={user}
          paymentSummary={{
            name: team.name,
            location: organization.name,
            eventType: 'EVENT',
            price: team.registrationPriceCents,
          }}
          organization={{ $id: organization.id, name: organization.name }}
          onRequireAuth={() => {
            router.push('/login');
          }}
          onCompleted={async () => {
            navigateToPublicCompletion({
              router,
              slug,
              kind: 'team',
              redirectUrl: organization.publicCompletionRedirectUrl,
            });
          }}
        >
          {(flow) => (
            <Stack gap="lg">
              <div>
                <Text size="sm" c="dimmed">{organization.name}</Text>
                <Title order={1}>{team.name}</Title>
                <Text c="dimmed">
                  {team.sport ?? 'Sport TBD'} - {team.division ?? 'Open'}
                </Text>
              </div>

              <Image
                src={team.imageUrl}
                alt=""
                width={960}
                height={540}
                style={{ width: '100%', height: 'auto', borderRadius: 12, objectFit: 'cover' }}
                unoptimized
              />

              <Group justify="space-between">
                <div>
                  <Text fw={600}>Registration</Text>
                  <Text size="sm" c="dimmed">
                    {team.teamSize > 0 ? `Roster limit ${team.teamSize}` : 'Open roster'}
                  </Text>
                </div>
                <Text fw={700}>{formatPrice(team.registrationPriceCents)}</Text>
              </Group>

              <Stack gap={6}>
                <Group justify="space-between" gap="sm">
                  <Text fw={600}>Team capacity</Text>
                  <Text size="sm" c={team.isFull ? 'red' : 'dimmed'}>{capacityLabel}</Text>
                </Group>
                {team.teamSize > 0 ? (
                  <div
                    aria-hidden="true"
                    style={{
                      height: 8,
                      overflow: 'hidden',
                      borderRadius: 999,
                      background: '#dbe6df',
                    }}
                  >
                    <div
                      style={{
                        width: `${capacityFill}%`,
                        height: '100%',
                        borderRadius: 'inherit',
                        background: team.isFull
                          ? 'linear-gradient(90deg, #d94841, #f08c7e)'
                          : 'linear-gradient(90deg, #0f766e, #f59e0b)',
                      }}
                    />
                  </div>
                ) : null}
              </Stack>

              {team.isFull && !flow.currentUserPendingRegistration ? (
                <Alert color="yellow" title="Team full">
                  <Text size="sm">This team is currently full. Registration is unavailable.</Text>
                </Alert>
              ) : null}

              {authLoading ? (
                <Group gap="sm">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Checking your session.</Text>
                </Group>
              ) : null}

              {!authLoading && !user && !team.isFull ? (
                <Alert color="yellow" title="Sign in required">
                  <Stack gap="sm">
                    <Text size="sm">Sign in before registering for this team.</Text>
                    <Button onClick={() => router.push('/login')}>Sign in to register</Button>
                  </Stack>
                </Alert>
              ) : null}

              {flow.registrationError ? (
                <Alert color="red" title="Registration unavailable">
                  <Text size="sm">{flow.registrationError}</Text>
                </Alert>
              ) : null}

              {!authLoading && user && flow.currentUserActiveMember && !flow.shouldOfferDocumentReview ? (
                <Alert color="green" title="Already on this team">
                  <Text size="sm">You are already registered for this team.</Text>
                </Alert>
              ) : null}

              {!authLoading && user && flow.actionVisible ? (
                <Button
                  loading={flow.actionLoading}
                  onClick={() => { flow.openFlow(); }}
                  disabled={flow.actionDisabled}
                >
                  {flow.actionLabel}
                </Button>
              ) : null}
            </Stack>
          )}
        </TeamRegistrationFlow>
      </Paper>
    </Container>
  );
}
