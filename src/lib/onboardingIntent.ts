export const ONBOARDING_INTENT_VALUES = [
  'ORGANIZATION',
  'INDIVIDUAL_EVENTS',
  'DISCOVER_EVENTS',
] as const;

export type OnboardingIntent = (typeof ONBOARDING_INTENT_VALUES)[number];

const ONBOARDING_INTENT_SET = new Set<string>(ONBOARDING_INTENT_VALUES);

export const ONBOARDING_PATH = '/onboarding';

export const normalizeOnboardingIntent = (value: unknown): OnboardingIntent | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return ONBOARDING_INTENT_SET.has(normalized) ? (normalized as OnboardingIntent) : null;
};

export const hasOnboardingIntent = (value: unknown): boolean => (
  normalizeOnboardingIntent(value) !== null
);
