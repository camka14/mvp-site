'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
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
import { buildIndividualEventCreateUrl } from '@/lib/eventCreateNavigation';
import { getHomePathForUser } from '@/lib/homePage';
import {
  hasOnboardingIntent,
  type OnboardingIntent,
} from '@/lib/onboardingIntent';

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

  const handleSelect = async (intent: OnboardingIntent) => {
    if (savingIntent) return;

    selectionInProgressRef.current = true;
    setSavingIntent(intent);
    setError('');

    try {
      if (user && isAuthenticated && !isGuest) {
        const updated = await updateUser({ onboardingIntent: intent });
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
                    disabled={Boolean(savingIntent)}
                    onClick={() => handleSelect(option.intent)}
                    style={{
                      minHeight: 220,
                      cursor: savingIntent ? 'default' : 'pointer',
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

                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={700} size="sm" c="blue">
                          Continue
                        </Text>
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
