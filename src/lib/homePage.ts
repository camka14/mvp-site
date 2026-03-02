import type { UserData } from '@/types';

const DEFAULT_HOME_PATH = '/discover';

export const getHomePathForUser = (
  user: Pick<UserData, 'homePageOrganizationId'> | null | undefined,
): string => {
  const homeOrganizationId = typeof user?.homePageOrganizationId === 'string'
    ? user.homePageOrganizationId.trim()
    : '';

  if (!homeOrganizationId) {
    return DEFAULT_HOME_PATH;
  }

  return `/organizations/${encodeURIComponent(homeOrganizationId)}`;
};
