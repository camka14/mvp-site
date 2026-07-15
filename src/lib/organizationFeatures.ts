import type { OrganizationFeature } from '@/types';

export const ORGANIZATION_FEATURE_OPTIONS: Array<{
  value: OrganizationFeature;
  label: string;
  description: string;
}> = [
  {
    value: 'CLUB_TEAMS',
    label: 'Club and team tools',
    description: 'Manage club divisions, teams, and tryout events.',
  },
  {
    value: 'FACILITIES_RENTALS',
    label: 'Facility and rental tools',
    description: 'Manage facilities, resources, availability, and rentals.',
  },
  {
    value: 'EVENT_MANAGEMENT',
    label: 'Event management tools',
    description: 'Create and manage events, leagues, tournaments, and schedules.',
  },
];

const ORGANIZATION_FEATURE_VALUES = new Set<OrganizationFeature>(
  ORGANIZATION_FEATURE_OPTIONS.map((option) => option.value),
);

export const isOrganizationFeature = (value: unknown): value is OrganizationFeature => (
  typeof value === 'string' && ORGANIZATION_FEATURE_VALUES.has(value as OrganizationFeature)
);

export const normalizeOrganizationFeatures = (
  value: unknown,
  fallback: OrganizationFeature[] = ['EVENT_MANAGEMENT'],
): OrganizationFeature[] => {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(new Set(value.filter(isOrganizationFeature)));
};

export const organizationHasFeature = (
  value: unknown,
  feature: OrganizationFeature,
): boolean => normalizeOrganizationFeatures(value).includes(feature);
