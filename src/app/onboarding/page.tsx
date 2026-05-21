'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { ArrowRight, Building2, CalendarPlus, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { createId } from '@/lib/id';
import {
  PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY,
  PUBLIC_ACCOUNT_VISIBILITY,
  isPrivateToOrganizationsVisibility,
  type AccountVisibility,
} from '@/lib/accountVisibility';
import { buildIndividualEventCreateUrl } from '@/lib/eventCreateNavigation';
import { getHomePathForUser } from '@/lib/homePage';
import {
  hasOnboardingIntent,
  type OnboardingIntent,
} from '@/lib/onboardingIntent';
import { organizationService } from '@/lib/organizationService';
import { userService } from '@/lib/userService';
import type { Invite, Organization } from '@/types';

type OnboardingOption = {
  intent: OnboardingIntent;
  title: string;
  description: string;
  icon: LucideIcon;
};

const OPTIONS: OnboardingOption[] = [
  {
    intent: 'ORGANIZATION',
    title: 'Create a facility or organization',
    description: 'Set up fields, rentals, hosted events, staff, and public organization pages.',
    icon: Building2,
  },
  {
    intent: 'INDIVIDUAL_EVENTS',
    title: 'Create events as an individual',
    description: 'Start a pickup event, league, tournament, or one-off session under your profile.',
    icon: CalendarPlus,
  },
  {
    intent: 'DISCOVER_EVENTS',
    title: 'Search for events to join',
    description: 'Browse public events, teams, rentals, leagues, and tournaments near you.',
    icon: Search,
  },
];

const getIntentDestination = (intent: OnboardingIntent): string => {
  if (intent === 'ORGANIZATION') {
    return '/organizations';
  }
  if (intent === 'INDIVIDUAL_EVENTS') {
    return buildIndividualEventCreateUrl(createId());
  }
  return '/discover';
};

export default function OnboardingPage() {
  const {
    user,
    loading,
    isAuthenticated,
    isGuest,
    requiresEmailVerification,
    updateUser,
  } = useApp();
  const router = useRouter();
  const selectionInProgressRef = useRef(false);
  const [savingIntent, setSavingIntent] = useState<OnboardingIntent | null>(null);
  const [savingInviteId, setSavingInviteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pendingOrganizationInvites, setPendingOrganizationInvites] = useState<Invite[]>([]);
  const [selectedHomeOrganizationId, setSelectedHomeOrganizationId] = useState<string | null>(null);
  const [privateAccount, setPrivateAccount] = useState(false);

  useEffect(() => {
    setPrivateAccount(isPrivateToOrganizationsVisibility(user?.accountVisibility));
  }, [user?.accountVisibility]);

  useEffect(() => {
    if (loading || selectionInProgressRef.current) {
      return;
    }

    if (user && hasOnboardingIntent(user.onboardingIntent)) {
      router.replace(getHomePathForUser(user));
      return;
    }

    if (!isGuest && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isGuest, loading, router, user]);

  useEffect(() => {
    if (
      loading
      || !user?.$id
      || !isAuthenticated
      || isGuest
      || hasOnboardingIntent(user.onboardingIntent)
    ) {
      setOrganizations([]);
      setPendingOrganizationInvites([]);
      setSelectedHomeOrganizationId(null);
      setOrganizationError('');
      return;
    }

    let cancelled = false;
    setLoadingOrganizations(true);
    setOrganizationError('');

    Promise.all([
      organizationService.getOrganizationsByUser(user.$id),
      userService.listInvites({ userId: user.$id, type: 'STAFF' }),
    ])
      .then(async ([nextOrganizations, staffInvites]) => {
        if (cancelled) return;
        const nextPendingOrganizationInvites = staffInvites.filter((invite) => (
          invite.type === 'STAFF'
          && typeof invite.organizationId === 'string'
          && invite.organizationId.trim().length > 0
          && (invite.status ?? 'PENDING') === 'PENDING'
        ));
        const nextOrganizationById = new Map(nextOrganizations.map((organization) => [organization.$id, organization]));
        const missingInviteOrganizationIds = Array.from(new Set(
          nextPendingOrganizationInvites
            .map((invite) => invite.organizationId?.trim())
            .filter((organizationId): organizationId is string => {
              if (!organizationId) {
                return false;
              }
              return !nextOrganizationById.has(organizationId);
            }),
        ));
        if (missingInviteOrganizationIds.length) {
          const inviteOrganizations = await organizationService.getOrganizationsByIds(missingInviteOrganizationIds);
          for (const organization of inviteOrganizations) {
            nextOrganizationById.set(organization.$id, organization);
          }
        }
        if (cancelled) return;
        const combinedOrganizations = Array.from(nextOrganizationById.values());
        setOrganizations(combinedOrganizations);
        setPendingOrganizationInvites(nextPendingOrganizationInvites);
        const currentHomeOrganizationId = typeof user.homePageOrganizationId === 'string'
          ? user.homePageOrganizationId.trim()
          : '';
        const firstInviteOrganizationId = nextPendingOrganizationInvites[0]?.organizationId?.trim() ?? '';
        const nextHomeOrganizationId = combinedOrganizations.some((organization) => organization.$id === currentHomeOrganizationId)
          ? currentHomeOrganizationId
          : firstInviteOrganizationId || combinedOrganizations[0]?.$id || null;
        setSelectedHomeOrganizationId(nextHomeOrganizationId || null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setOrganizations([]);
        setPendingOrganizationInvites([]);
        setSelectedHomeOrganizationId(null);
        setOrganizationError(loadError instanceof Error ? loadError.message : 'Unable to load your organizations.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOrganizations(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isGuest, loading, user]);

  const organizationOptions = organizations.map((organization) => ({
    value: organization.$id,
    label: organization.name,
  }));
  const hasOrganizationMembership = organizationOptions.length > 0;
  const selectedHomeOrganization = selectedHomeOrganizationId
    ? organizations.find((organization) => organization.$id === selectedHomeOrganizationId)
    : null;
  const selectedOrganizationHasPendingInvite = selectedHomeOrganization
    ? pendingOrganizationInvites.some((invite) => invite.organizationId === selectedHomeOrganization.$id)
    : false;
  const pendingOrganizationInviteOptions = pendingOrganizationInvites
    .map((invite) => {
      const organizationId = invite.organizationId?.trim();
      const organization = organizationId
        ? organizations.find((entry) => entry.$id === organizationId)
        : undefined;
      return organization ? { invite, organization } : null;
    })
    .filter((entry): entry is { invite: Invite; organization: Organization } => Boolean(entry));
  const isSavingAny = Boolean(savingIntent || savingInviteId);

  const getOrganizationLogoUrl = (organization: Organization, size: number = 44): string => {
    if (organization.logoId) {
      return `/api/files/${organization.logoId}/preview?w=${size}&h=${size}&fit=cover`;
    }
    return `/api/avatars/initials?name=${encodeURIComponent(organization.name || 'Org')}&size=${size}`;
  };

  const handleSelect = async (intent: OnboardingIntent) => {
    if (isSavingAny || loadingOrganizations) return;

    selectionInProgressRef.current = true;
    setSavingIntent(intent);
    setError('');

    try {
      if (user && isAuthenticated && !isGuest) {
        const accountVisibility: AccountVisibility = privateAccount
          ? PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY
          : PUBLIC_ACCOUNT_VISIBILITY;
        const updates: {
          onboardingIntent: OnboardingIntent;
          accountVisibility?: AccountVisibility;
          homePageOrganizationId?: string;
        } = { onboardingIntent: intent };
        if (hasOrganizationMembership) {
          updates.accountVisibility = accountVisibility;
          if (
            selectedHomeOrganization?.$id
            && !selectedOrganizationHasPendingInvite
            && selectedHomeOrganization.$id !== user.homePageOrganizationId
          ) {
            updates.homePageOrganizationId = selectedHomeOrganization.$id;
          }
        }
        const updated = await updateUser(updates);
        if (!updated) {
          throw new Error('Unable to save your selection.');
        }
      }
      router.replace(getIntentDestination(intent));
    } catch (selectError: unknown) {
      selectionInProgressRef.current = false;
      setError(selectError instanceof Error ? selectError.message : 'Unable to save your selection.');
      setSavingIntent(null);
    }
  };

  const handleAcceptOrganizationInvite = async (invite: Invite, organization: Organization) => {
    if (isSavingAny || loadingOrganizations) return;

    selectionInProgressRef.current = true;
    setSavingInviteId(invite.$id);
    setError('');

    try {
      if (user && isAuthenticated && !isGuest) {
        const accountVisibility: AccountVisibility = privateAccount
          ? PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY
          : PUBLIC_ACCOUNT_VISIBILITY;
        await userService.acceptInvite(invite.$id);
        const updated = await updateUser({
          onboardingIntent: 'ORGANIZATION',
          accountVisibility,
          homePageOrganizationId: organization.$id,
        });
        if (!updated) {
          throw new Error('Unable to save your selection.');
        }
      }
      router.replace(`/organizations/${encodeURIComponent(organization.$id)}`);
    } catch (selectError: unknown) {
      selectionInProgressRef.current = false;
      setError(selectError instanceof Error ? selectError.message : 'Unable to accept the organization invite.');
      setSavingInviteId(null);
    }
  };

  if (loading) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!isGuest && !isAuthenticated) {
    return <Loading fullScreen text="Redirecting..." />;
  }

  return (
    <>
      <Navigation />
      <Box bg="gray.0" mih="100vh" py={{ base: 40, md: 72 }}>
        <Container size="lg">
          <Stack gap="xl">
            <Stack gap={8} maw={720}>
              <Title order={1}>What are you planning to do first?</Title>
              <Text c="dimmed" size="lg">
                Pick the path that best matches why you are here. You can use every part of BracketIQ later.
              </Text>
            </Stack>

            {error ? (
              <Alert color="red" variant="light" title="Selection not saved">
                {error}
              </Alert>
            ) : null}
            {requiresEmailVerification && !isGuest ? (
              <Alert color="yellow" variant="light" title="Verify your email to create">
                You can browse and join events now. Creating events or organizations is available after email verification.
              </Alert>
            ) : null}
            {organizationError ? (
              <Alert color="yellow" variant="light" title="Organizations not loaded">
                {organizationError}
              </Alert>
            ) : null}
            {hasOrganizationMembership ? (
              <Paper withBorder radius="md" p="lg" bg="white">
                <Stack gap="md">
                  <Stack gap={4}>
                    <Title order={2} size="h3">Account visibility</Title>
                    <Text c="dimmed" size="sm">
                      This controls whether people outside your organizations can find your account in search.
                    </Text>
                  </Stack>
                  {organizationOptions.length > 1 ? (
                    <Select
                      label="Home organization"
                      data={organizationOptions}
                      value={selectedHomeOrganizationId}
                      onChange={setSelectedHomeOrganizationId}
                      allowDeselect={false}
                    />
                  ) : null}
                  <Checkbox
                    label="Private account"
                    description="Only people in your organizations can find your profile in search."
                    checked={privateAccount}
                    onChange={(event) => setPrivateAccount(event.currentTarget.checked)}
                  />
                </Stack>
              </Paper>
            ) : null}

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              {pendingOrganizationInviteOptions.map(({ invite, organization }) => {
                const isSaving = savingInviteId === invite.$id;

                return (
                  <Paper
                    key={invite.$id}
                    component="button"
                    type="button"
                    withBorder
                    radius="md"
                    p="lg"
                    ta="left"
                    disabled={isSavingAny || loadingOrganizations}
                    onClick={() => handleAcceptOrganizationInvite(invite, organization)}
                    style={{
                      minHeight: 220,
                      cursor: isSavingAny || loadingOrganizations ? 'default' : 'pointer',
                      background: 'white',
                    }}
                  >
                    <Stack h="100%" justify="space-between" gap="xl">
                      <Stack gap="md">
                        <Avatar
                          src={getOrganizationLogoUrl(organization)}
                          alt={organization.name}
                          size={44}
                          radius="md"
                        >
                          <Building2 size={22} aria-hidden="true" />
                        </Avatar>
                        <Stack gap={6}>
                          <Title order={3} size="h4">
                            Accept {organization.name} invite
                          </Title>
                          <Text c="dimmed" size="sm" lh={1.5}>
                            Join {organization.name} and open the organization page.
                          </Text>
                        </Stack>
                      </Stack>

                      <Group justify="flex-end" wrap="nowrap">
                        <Button
                          component="span"
                          variant="subtle"
                          size="compact-sm"
                          loading={isSaving}
                          rightSection={<ArrowRight size={16} aria-hidden="true" />}
                        >
                          Accept
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
              {OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSaving = savingIntent === option.intent;

                return (
                  <Paper
                    key={option.intent}
                    component="button"
                    type="button"
                    withBorder
                    radius="md"
                    p="lg"
                    ta="left"
                    disabled={isSavingAny || loadingOrganizations}
                    onClick={() => handleSelect(option.intent)}
                    style={{
                      minHeight: 220,
                      cursor: isSavingAny || loadingOrganizations ? 'default' : 'pointer',
                      background: 'white',
                    }}
                  >
                    <Stack h="100%" justify="space-between" gap="xl">
                      <Stack gap="md">
                        <ThemeIcon size={44} radius="md" variant="light">
                          <Icon size={22} aria-hidden="true" />
                        </ThemeIcon>
                        <Stack gap={6}>
                          <Title order={3} size="h4">
                            {option.title}
                          </Title>
                          <Text c="dimmed" size="sm" lh={1.5}>
                            {option.description}
                          </Text>
                        </Stack>
                      </Stack>

                      <Group justify="flex-end" wrap="nowrap">
                        <Button
                          component="span"
                          variant="subtle"
                          size="compact-sm"
                          loading={isSaving}
                          rightSection={<ArrowRight size={16} aria-hidden="true" />}
                        >
                          Select
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>
    </>
  );
}
