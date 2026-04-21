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
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import BillingAddressModal from '@/components/ui/BillingAddressModal';
import PaymentModal from '@/components/ui/PaymentModal';
import { isApiRequestError } from '@/lib/apiClient';
import { paymentService } from '@/lib/paymentService';
import { navigateToPublicCompletion } from '@/lib/publicCompletionRedirect';
import { teamService } from '@/lib/teamService';
import type {
  PublicOrganizationSummary,
  PublicOrganizationTeamRegistrationData,
} from '@/server/publicOrganizationCatalog';
import type { BillingAddress, PaymentIntent, Team } from '@/types';
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
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [startingRegistration, setStartingRegistration] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const startTeamRegistration = useCallback(async (billingAddress?: BillingAddress) => {
    if (team.isFull) {
      setRegistrationError('This team is full.');
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    setStartingRegistration(true);
    setRegistrationError(null);
    try {
      if (team.registrationPriceCents > 0) {
        const intent = await paymentService.createTeamRegistrationPaymentIntent(
          user,
          checkoutTeam,
          { $id: organization.id, name: organization.name },
          billingAddress,
        );
        setPaymentData(intent);
        setShowBillingAddressModal(false);
        setShowPaymentModal(true);
        return;
      }

      await teamService.registerForTeam(checkoutTeam.$id);
      notifications.show({
        color: 'green',
        message: `You are registered for ${team.name}.`,
      });
      navigateToPublicCompletion({
        router,
        slug,
        kind: 'team',
        redirectUrl: organization.publicCompletionRedirectUrl,
      });
    } catch (error) {
      if (
        isApiRequestError(error)
        && error.data
        && typeof error.data === 'object'
        && 'billingAddressRequired' in error.data
        && Boolean((error.data as { billingAddressRequired?: boolean }).billingAddressRequired)
      ) {
        setShowBillingAddressModal(true);
        return;
      }
      setRegistrationError(error instanceof Error ? error.message : 'Unable to start team registration.');
    } finally {
      setStartingRegistration(false);
    }
  }, [
    checkoutTeam,
    organization.id,
    organization.name,
    organization.publicCompletionRedirectUrl,
    router,
    slug,
    team.isFull,
    team.name,
    team.registrationPriceCents,
    user,
  ]);

  const handlePaymentSuccess = useCallback(() => {
    notifications.show({
      color: 'green',
      message: `You are registered for ${team.name}.`,
    });
    setShowPaymentModal(false);
    setPaymentData(null);
    navigateToPublicCompletion({
      router,
      slug,
      kind: 'team',
      redirectUrl: organization.publicCompletionRedirectUrl,
    });
  }, [organization.publicCompletionRedirectUrl, router, slug, team.name]);

  return (
    <Container size="sm" py="xl">
      <Paper withBorder radius="md" p="xl">
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

          {team.isFull ? (
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

          {registrationError ? (
            <Alert color="red" title="Registration unavailable">
              <Text size="sm">{registrationError}</Text>
            </Alert>
          ) : null}

          {!authLoading && user ? (
            <Button
              loading={startingRegistration}
              onClick={() => void startTeamRegistration()}
              disabled={team.isFull}
            >
              {team.isFull ? 'Team full' : team.registrationPriceCents > 0 ? 'Open payment' : 'Join team'}
            </Button>
          ) : null}
        </Stack>
      </Paper>

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => setShowBillingAddressModal(false)}
        onSaved={async (billingAddress) => {
          await startTeamRegistration(billingAddress);
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
      />

      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData)}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentData(null);
        }}
        event={{
          name: team.name,
          location: organization.name,
          eventType: 'EVENT',
          price: team.registrationPriceCents,
        }}
        paymentData={paymentData}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </Container>
  );
}
