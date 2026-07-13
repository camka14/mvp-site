import { buildIndividualEventCreateUrl } from '@/lib/eventCreateNavigation';
import type { OnboardingIntent } from '@/lib/onboardingIntent';

export const GUEST_ONBOARDING_VERSION = 1;
export const GUEST_ONBOARDING_COOKIE = 'bracketiq_guest_onboarding_v1';
export const GUEST_ONBOARDING_STORAGE_KEY = 'bracketiq:first-visit-onboarding:v1';
export const DEFAULT_ONBOARDING_DISTANCE_MILES = 50;

export type GuestSearchTarget = 'events' | 'clubs' | 'rentals';
export type GuestCreateTarget = 'organization' | 'club' | 'event';
export type GuestOnboardingTarget = GuestSearchTarget | GuestCreateTarget;

export type GuestOnboardingCompletion = {
  version: typeof GUEST_ONBOARDING_VERSION;
  target: GuestOnboardingTarget;
  completedAt: string;
};

export type GuestSearchDestination = {
  target: GuestSearchTarget;
  sport?: string | null;
  skillDivisionTypeId?: string | null;
  location?: {
    lat: number;
    lng: number;
    label?: string | null;
  } | null;
  distanceMiles?: number | null;
};

const CREATE_INTENTS: Record<GuestCreateTarget, OnboardingIntent> = {
  organization: 'ORGANIZATION',
  club: 'ORGANIZATION',
  event: 'INDIVIDUAL_EVENTS',
};

const normalizeText = (value: string | null | undefined): string => value?.trim() ?? '';

export const isGuestOnboardingCookieComplete = (value: string | null | undefined): boolean => (
  value === String(GUEST_ONBOARDING_VERSION)
);

export const getCreateOnboardingIntent = (target: GuestCreateTarget): OnboardingIntent => (
  CREATE_INTENTS[target]
);

export const buildGuestCreateDestination = (target: GuestCreateTarget, eventId: string): string => {
  if (target === 'event') {
    return buildIndividualEventCreateUrl(eventId);
  }
  const params = new URLSearchParams({ create: '1' });
  if (target === 'club') {
    params.set('preset', 'club');
  }
  return `/organizations?${params.toString()}`;
};

export const buildGuestDiscoverDestination = ({
  target,
  sport,
  skillDivisionTypeId,
  location,
  distanceMiles = DEFAULT_ONBOARDING_DISTANCE_MILES,
}: GuestSearchDestination): string => {
  const params = new URLSearchParams();
  params.set('tab', target === 'clubs' ? 'organizations' : target);

  const normalizedSport = normalizeText(sport);
  if (normalizedSport) {
    params.append('sport', normalizedSport);
  }

  const normalizedSkill = normalizeText(skillDivisionTypeId);
  if (normalizedSkill && target !== 'rentals') {
    params.append('skillDivisionTypeIds', normalizedSkill);
  }

  if (target === 'clubs') {
    params.append('tags', 'club');
  }

  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    params.set('lat', String(location.lat));
    params.set('lng', String(location.lng));
    const label = normalizeText(location.label);
    if (label) {
      params.set('location', label);
    }
    if (typeof distanceMiles === 'number' && Number.isFinite(distanceMiles) && distanceMiles > 0) {
      params.set('distanceMiles', String(Math.round(distanceMiles)));
    }
  }

  return `/discover?${params.toString()}`;
};

export const buildGuestSignupDestination = ({
  target,
  next,
}: {
  target: GuestCreateTarget;
  next: string;
}): string => {
  const params = new URLSearchParams({
    mode: 'signup',
    onboardingIntent: getCreateOnboardingIntent(target),
    next,
  });
  return `/login?${params.toString()}`;
};

export const markGuestOnboardingComplete = (target: GuestOnboardingTarget): void => {
  if (typeof window === 'undefined') return;
  const completion: GuestOnboardingCompletion = {
    version: GUEST_ONBOARDING_VERSION,
    target,
    completedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(GUEST_ONBOARDING_STORAGE_KEY, JSON.stringify(completion));
  } catch {
    // The cookie still gives server routing a completion signal when storage is unavailable.
  }
  document.cookie = `${GUEST_ONBOARDING_COOKIE}=${GUEST_ONBOARDING_VERSION}; Path=/; Max-Age=31536000; SameSite=Lax`;
};
