'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
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
import type { Organization } from '@/types';

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
  const [error, setError] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
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
      setSelectedHomeOrganizationId(null);
      setOrganizationError('');
      return;
    }

    let cancelled = false;
    setLoadingOrganizations(true);
    setOrganizationError('');

    organizationService.getOrganizationsByUser(user.$id)
      .then((nextOrganizations) => {
        if (cancelled) return;
        setOrganizations(nextOrganizations);
        const currentHomeOrganizationId = typeof user.homePageOrganizationId === 'string'
          ? user.homePageOrganizationId.trim()
          : '';
        const nextHomeOrganizationId = nextOrganizations.some((organization) => organization.$id === currentHomeOrganizationId)
          ? currentHomeOrganizationId
          : nextOrganizations[0]?.$id ?? null;
        setSelectedHomeOrganizationId(nextHomeOrganizationId || null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setOrganizations([]);
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

  const handleSelect = async (intent: OnboardingIntent) => {
    if (savingIntent || loadingOrganizations) return;

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
                    disabled={Boolean(savingIntent) || loadingOrganizations}
                    onClick={() => handleSelect(option.intent)}
                    style={{
                      minHeight: 220,
                      cursor: savingIntent || loadingOrganizations ? 'default' : 'pointer',
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
