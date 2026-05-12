export const ORGANIZATION_STATUSES = ['LISTED', 'UNLISTED'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const DEFAULT_ORGANIZATION_STATUS: OrganizationStatus = 'LISTED';

export const isOrganizationStatus = (value: unknown): value is OrganizationStatus => (
  typeof value === 'string' && ORGANIZATION_STATUSES.includes(value as OrganizationStatus)
);

export const normalizeOrganizationStatus = (value: unknown): OrganizationStatus => {
  if (typeof value !== 'string') {
    throw new Error('Organization status must be LISTED or UNLISTED.');
  }
  const normalized = value.trim().toUpperCase();
  if (!isOrganizationStatus(normalized)) {
    throw new Error('Organization status must be LISTED or UNLISTED.');
  }
  return normalized;
};

export const getOrganizationStatus = (value: unknown): OrganizationStatus => {
  if (typeof value !== 'string') {
    return DEFAULT_ORGANIZATION_STATUS;
  }
  const normalized = value.trim().toUpperCase();
  return isOrganizationStatus(normalized) ? normalized : DEFAULT_ORGANIZATION_STATUS;
};
