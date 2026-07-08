import type { Field, Organization } from '@/types';

const normalizeSportValue = (value: string): string => value.trim().toLowerCase();

const normalizeSportList = (values: unknown): Set<string> => (
  new Set(
    (Array.isArray(values) ? values : [])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => normalizeSportValue(value))
      .filter((value) => value.length > 0),
  )
);

export const organizationMatchesSports = (organization: Organization, selectedSports: string[]): boolean => {
  if (!selectedSports.length) {
    return true;
  }

  const organizationSports = normalizeSportList(organization.sports);

  if (!organizationSports.size) {
    return false;
  }

  return selectedSports.some((sport) => organizationSports.has(normalizeSportValue(sport)));
};

export const rentalResourceMatchesSports = (
  listing: { organization: Organization; field?: Field | null },
  selectedSports: string[],
): boolean => {
  if (!selectedSports.length) {
    return true;
  }

  const resourceSports = normalizeSportList(listing.field?.sportIds);
  if (!resourceSports.size) {
    return organizationMatchesSports(listing.organization, selectedSports);
  }

  return selectedSports.some((sport) => resourceSports.has(normalizeSportValue(sport)));
};
