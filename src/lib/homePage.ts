import { ONBOARDING_PATH, hasOnboardingIntent } from '@/lib/onboardingIntent';

const DEFAULT_HOME_PATH = '/discover';

type HomePathUser = {
  homePageOrganizationId?: string | null;
  onboardingIntent?: unknown;
};

export const getHomePathForUser = (
  user: HomePathUser | null | undefined,
): string => {
  if (user && !hasOnboardingIntent(user.onboardingIntent)) {
    return ONBOARDING_PATH;
  }

  const homeOrganizationId = typeof user?.homePageOrganizationId === 'string'
    ? user.homePageOrganizationId.trim()
    : '';

  if (!homeOrganizationId) {
    return DEFAULT_HOME_PATH;
  }

  return `/organizations/${encodeURIComponent(homeOrganizationId)}`;
};
