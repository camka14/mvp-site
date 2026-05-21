export type AccountVisibility = 'PUBLIC' | 'PRIVATE_TO_ORGS';

export const PUBLIC_ACCOUNT_VISIBILITY: AccountVisibility = 'PUBLIC';
export const PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY: AccountVisibility = 'PRIVATE_TO_ORGS';

const ACCOUNT_VISIBILITY_VALUES = new Set<AccountVisibility>([
  PUBLIC_ACCOUNT_VISIBILITY,
  PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY,
]);

const normalizeVisibilityString = (value: string): string => (
  value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
);

export const parseAccountVisibility = (value: unknown): AccountVisibility | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeVisibilityString(value);
  if (normalized === 'PRIVATE' || normalized === 'PRIVATE_TO_ORG' || normalized === 'ORG_PRIVATE') {
    return PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY;
  }
  if (ACCOUNT_VISIBILITY_VALUES.has(normalized as AccountVisibility)) {
    return normalized as AccountVisibility;
  }
  return null;
};

export const normalizeAccountVisibility = (value: unknown): AccountVisibility => (
  parseAccountVisibility(value) ?? PUBLIC_ACCOUNT_VISIBILITY
);

export const isPrivateToOrganizationsVisibility = (value: unknown): boolean => (
  normalizeAccountVisibility(value) === PRIVATE_TO_ORGS_ACCOUNT_VISIBILITY
);
