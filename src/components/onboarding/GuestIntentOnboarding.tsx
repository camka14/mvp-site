'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  LocateFixed,
  MapPin,
  Shield,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '@/app/providers';
import { useDebounce } from '@/app/hooks/useDebounce';
import { useLocation } from '@/app/hooks/useLocation';
import { useSports } from '@/app/hooks/useSports';
import { createId } from '@/lib/id';
import {
  buildGuestCreateDestination,
  buildGuestDiscoverDestination,
  buildGuestSignupDestination,
  markGuestOnboardingComplete,
  type GuestCreateTarget,
  type GuestSearchTarget,
} from '@/lib/guestOnboarding';
import { locationService, type LocationInfo } from '@/lib/locationService';
import styles from './GuestIntentOnboarding.module.css';

type IntentChoice = {
  target: GuestSearchTarget | GuestCreateTarget;
  kind: 'find' | 'create';
  title: string;
  description: string;
  icon: LucideIcon;
};

type DivisionOption = { id: string; name: string };
type DivisionTypePayload = {
  sportSkills?: Array<{ sportId: string; skills: DivisionOption[] }>;
};

const FIND_CHOICES: IntentChoice[] = [
  { target: 'events', kind: 'find', title: 'Events', description: 'Games, leagues, tournaments, camps, and tryouts.', icon: CalendarDays },
  { target: 'clubs', kind: 'find', title: 'Clubs', description: 'Programs organized by sport, age group, and skill.', icon: UsersRound },
  { target: 'rentals', kind: 'find', title: 'Rentals', description: 'Courts, fields, gyms, and other sports spaces.', icon: Building2 },
];

const CREATE_CHOICES: IntentChoice[] = [
  { target: 'organization', kind: 'create', title: 'Organization', description: 'Manage events, staff, registrations, and public pages.', icon: Shield },
  { target: 'club', kind: 'create', title: 'Club', description: 'Set up club divisions, teams, events, and tryouts.', icon: UsersRound },
  { target: 'event', kind: 'create', title: 'Event', description: 'Create a one-time event, league, tournament, or weekly session.', icon: CalendarPlus },
];

const targetLabel = (target: GuestSearchTarget | GuestCreateTarget): string => (
  target === 'organization' ? 'organization' : target
);

export default function GuestIntentOnboarding() {
  const router = useRouter();
  const { startGuestSession } = useApp();
  const { sports, sportsByName, loading: sportsLoading } = useSports();
  const {
    locationInfo,
    loading: locationLoading,
    error: locationError,
    requestLocation,
    setLocationFromInfo,
  } = useLocation();
  const [searchTarget, setSearchTarget] = useState<GuestSearchTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<GuestCreateTarget | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [divisionTypes, setDivisionTypes] = useState<DivisionTypePayload>({});
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocationInfo, setSelectedLocationInfo] = useState<LocationInfo | null>(null);
  const [predictions, setPredictions] = useState<Array<{ description: string; placeId: string }>>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const sessionTokenRef = useRef<unknown | null>(null);
  const debouncedLocationQuery = useDebounce(locationQuery, 250);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/division-types', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load skill levels.')))
      .then((body) => setDivisionTypes(body ?? {}))
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError('Skill levels are temporarily unavailable.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!locationInfo) return;
    setSelectedLocationInfo(locationInfo);
    setLocationQuery((current) => current || [locationInfo.city, locationInfo.state].filter(Boolean).join(', '));
  }, [locationInfo]);

  useEffect(() => {
    if (!searchTarget || !debouncedLocationQuery.trim()) {
      setPredictions([]);
      return;
    }
    let cancelled = false;
    setPredictionsLoading(true);
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = locationService.createPlacesSessionToken();
    }
    locationService.getPlacePredictions(debouncedLocationQuery, sessionTokenRef.current ?? undefined)
      .then((nextPredictions) => {
        if (!cancelled) setPredictions(nextPredictions);
      })
      .catch(() => {
        if (!cancelled) setPredictions([]);
      })
      .finally(() => {
        if (!cancelled) setPredictionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedLocationQuery, searchTarget]);

  const sportOptions = useMemo(
    () => sports.map((sport) => ({ value: sport.name, label: sport.name })),
    [sports],
  );
  const selectedSportId = selectedSport
    ? sportsByName.get(selectedSport.toLowerCase())?.$id ?? null
    : null;
  const skillOptions = useMemo(() => {
    if (!selectedSportId) return [];
    return (divisionTypes.sportSkills ?? [])
      .find((group) => group.sportId === selectedSportId)
      ?.skills.map((skill) => ({ value: skill.id, label: skill.name })) ?? [];
  }, [divisionTypes.sportSkills, selectedSportId]);

  useEffect(() => {
    if (selectedSkill && !skillOptions.some((option) => option.value === selectedSkill)) {
      setSelectedSkill(null);
    }
  }, [selectedSkill, skillOptions]);

  const openSearch = (target: GuestSearchTarget) => {
    setCreateTarget(null);
    setSearchTarget(target);
    setError('');
  };

  const openCreate = (target: GuestCreateTarget) => {
    setSearchTarget(null);
    setCreateTarget(target);
    setError('');
  };

  const selectPrediction = async (placeId: string) => {
    setError('');
    try {
      const info = await locationService.getPlaceDetails(placeId, sessionTokenRef.current ?? undefined);
      setLocationFromInfo(info);
      setSelectedLocationInfo(info);
      setLocationQuery([info.city, info.state].filter(Boolean).join(', ') || info.formattedAddress || 'Selected location');
      setPredictions([]);
      sessionTokenRef.current = null;
    } catch {
      setError('Unable to use that location. Try another search.');
    }
  };

  const resolveTypedLocation = async (): Promise<LocationInfo | null> => {
    if (selectedLocationInfo) return selectedLocationInfo;
    if (!locationQuery.trim()) return null;
    const info = await locationService.geocodeLocation(locationQuery.trim());
    setLocationFromInfo(info);
    setSelectedLocationInfo(info);
    return info;
  };

  const handleSearch = async () => {
    if (!searchTarget || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const resolvedLocation = await resolveTypedLocation();
      if (!resolvedLocation) {
        setError('Choose a location to see nearby results.');
        return;
      }
      await startGuestSession();
      markGuestOnboardingComplete(searchTarget);
      router.push(buildGuestDiscoverDestination({
        target: searchTarget,
        sport: selectedSport,
        skillDivisionTypeId: selectedSkill,
        location: {
          lat: resolvedLocation.lat,
          lng: resolvedLocation.lng,
          label: [resolvedLocation.city, resolvedLocation.state].filter(Boolean).join(', ')
            || resolvedLocation.formattedAddress
            || locationQuery,
        },
      }));
    } catch {
      setError('Unable to find that location. Check the search and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = () => {
    if (!createTarget) return;
    const next = buildGuestCreateDestination(createTarget, createId());
    markGuestOnboardingComplete(createTarget);
    router.push(buildGuestSignupDestination({ target: createTarget, next }));
  };

  const handleExploreGuest = async () => {
    if (!createTarget || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await startGuestSession();
      markGuestOnboardingComplete(createTarget);
      router.push('/discover');
    } catch {
      setError('Unable to start guest mode. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSearchTarget(null);
    setCreateTarget(null);
    setError('');
  };

  return (
    <Modal
      opened
      onClose={() => undefined}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      centered
      size={!searchTarget && !createTarget ? 'xl' : 'lg'}
      title={(
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">BIQ</span>
          <span>BracketIQ onboarding</span>
        </div>
      )}
      overlayProps={{
        backgroundOpacity: 0.76,
        blur: 2,
        color: '#101828',
        className: 'guest-onboarding-backdrop',
      }}
      classNames={{
        content: styles.modalContent,
        header: styles.modalHeader,
        body: styles.modalBody,
      }}
    >
      <section className={styles.stage} data-testid="guest-onboarding-dialog-content">
        {!searchTarget && !createTarget ? (
          <Stack gap="xl">
              <Stack gap={8} className={styles.heading}>
                <Text size="sm" fw={700} c="blue.8">Get to the right place</Text>
                <Title order={1} size="2.5rem">What brings you to BracketIQ?</Title>
                <Text c="dimmed" size="lg">Choose what you want to find or create.</Text>
              </Stack>

              <Stack gap="sm">
                <Text fw={700}>I&apos;m looking for</Text>
                <div className={styles.choiceGrid}>
                  {FIND_CHOICES.map((choice) => (
                    <IntentButton key={choice.target} choice={choice} onClick={() => openSearch(choice.target as GuestSearchTarget)} />
                  ))}
                </div>
              </Stack>

              <Divider />

              <Stack gap="sm">
                <Text fw={700}>I want to create</Text>
                <div className={styles.choiceGrid}>
                  {CREATE_CHOICES.map((choice) => (
                    <IntentButton key={choice.target} choice={choice} onClick={() => openCreate(choice.target as GuestCreateTarget)} />
                  ))}
                </div>
              </Stack>
          </Stack>
        ) : null}

        {searchTarget ? (
          <div className={styles.formPanel}>
              <Stack gap="lg">
                <Button variant="subtle" size="compact-sm" leftSection={<ArrowLeft size={16} />} onClick={reset} w="fit-content">
                  Back
                </Button>
                <Stack gap={6}>
                  <Title order={1} size="2rem">Find {targetLabel(searchTarget)}</Title>
                  <Text c="dimmed">Set a few starting filters. You can adjust them in Discover.</Text>
                </Stack>

                {error ? <Alert color="red">{error}</Alert> : null}

                <Select
                  label="Sport"
                  placeholder="Any sport"
                  data={sportOptions}
                  value={selectedSport}
                  onChange={setSelectedSport}
                  searchable
                  clearable
                  disabled={sportsLoading}
                  rightSection={sportsLoading ? <Loader size={16} /> : undefined}
                />

                {searchTarget !== 'rentals' ? (
                  <Select
                    label="Skill level"
                    placeholder={selectedSport ? 'Any skill level' : 'Select a sport first'}
                    data={skillOptions}
                    value={selectedSkill}
                    onChange={setSelectedSkill}
                    searchable
                    clearable
                    disabled={!selectedSport || skillOptions.length === 0}
                  />
                ) : null}

                <Stack gap={8}>
                  <Group justify="space-between" align="end">
                    <Text fw={500} size="sm">Location</Text>
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      leftSection={<LocateFixed size={15} />}
                      loading={locationLoading}
                      onClick={() => void requestLocation()}
                    >
                      Use my location
                    </Button>
                  </Group>
                  <div style={{ position: 'relative' }}>
                    <TextInput
                      aria-label="Location"
                      leftSection={<MapPin size={17} />}
                      placeholder="City, ZIP code, or area"
                      value={locationQuery}
                      onChange={(event) => {
                        setLocationQuery(event.currentTarget.value);
                        setSelectedLocationInfo(null);
                      }}
                    />
                    {predictionsLoading || predictions.length > 0 ? (
                      <div className={styles.locationResults}>
                        {predictionsLoading ? <Text size="sm" c="dimmed" p="xs">Finding locations...</Text> : null}
                        {predictions.map((prediction) => (
                          <UnstyledButton
                            key={prediction.placeId}
                            className={styles.locationOption}
                            onClick={() => void selectPrediction(prediction.placeId)}
                          >
                            {prediction.description}
                          </UnstyledButton>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {selectedLocationInfo ? (
                    <Text size="sm" c="teal.8">
                      Searching near {[selectedLocationInfo.city, selectedLocationInfo.state].filter(Boolean).join(', ') || selectedLocationInfo.formattedAddress || 'your selected location'}
                    </Text>
                  ) : null}
                  {locationError ? <Text size="sm" c="red">{locationError}</Text> : null}
                </Stack>

                <Button
                  size="md"
                  rightSection={<ArrowRight size={17} />}
                  loading={submitting}
                  onClick={() => void handleSearch()}
                >
                  Show {targetLabel(searchTarget)}
                </Button>
              </Stack>
          </div>
        ) : null}

        {createTarget ? (
          <div className={styles.formPanel}>
              <Stack gap="lg">
                <Button variant="subtle" size="compact-sm" leftSection={<ArrowLeft size={16} />} onClick={reset} w="fit-content">
                  Back
                </Button>
                <ThemeIcon size={46} radius={8} className={styles.createGateIcon}>
                  <UserPlus size={24} />
                </ThemeIcon>
                <Stack gap={6}>
                  <Title order={1} size="2rem">Create a free account first</Title>
                  <Text c="dimmed" size="lg">
                    You need an account to create a {targetLabel(createTarget)}. It is free to get started.
                  </Text>
                </Stack>
                {error ? <Alert color="red">{error}</Alert> : null}
                <div className={styles.actionGroup}>
                  <Button size="md" rightSection={<ArrowRight size={17} />} onClick={handleCreateAccount}>
                    Create free account
                  </Button>
                  <Button size="md" variant="default" loading={submitting} onClick={() => void handleExploreGuest()}>
                    Explore as guest
                  </Button>
                </div>
              </Stack>
          </div>
        ) : null}
      </section>
    </Modal>
  );
}

function IntentButton({ choice, onClick }: { choice: IntentChoice; onClick: () => void }) {
  const Icon = choice.icon;
  return (
    <UnstyledButton className={styles.choice} data-tone={choice.kind} onClick={onClick}>
      <Stack gap="sm">
        <ThemeIcon size={38} radius={8} className={styles.choiceIcon} data-tone={choice.kind}>
          <Icon size={20} />
        </ThemeIcon>
        <div>
          <Text fw={750} size="lg">{choice.title}</Text>
          <Text c="dimmed" size="sm" mt={4}>{choice.description}</Text>
        </div>
      </Stack>
    </UnstyledButton>
  );
}
