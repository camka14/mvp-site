const normalizeSportValue = (value: string): string => value.trim();

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

export const normalizePublicRentalOrderSports = (organizationSports: unknown): string[] => (
  Array.isArray(organizationSports)
    ? Array.from(new Set(
        organizationSports
          .map((entry) => (typeof entry === 'string' ? normalizeSportValue(entry) : ''))
          .filter((entry) => entry.length > 0),
      ))
    : []
);

export const resolvePublicRentalOrderSportId = ({
  organizationName,
  organizationSports,
  requestedSportId,
}: {
  organizationName: string;
  organizationSports: unknown;
  requestedSportId?: string | null;
}): string | null => {
  const sports = normalizePublicRentalOrderSports(organizationSports);
  const normalizedRequestedSportId =
    typeof requestedSportId === 'string' ? normalizeSportValue(requestedSportId) : '';

  if (normalizedRequestedSportId) {
    return sports.includes(normalizedRequestedSportId) ? normalizedRequestedSportId : null;
  }

  if (!sports.length) {
    return 'Other';
  }

  if (sports.length === 1) {
    return sports[0];
  }

  const normalizedName = normalizeLookup(organizationName);
  const matchedSport = sports.find((sport) => normalizedName.includes(normalizeLookup(sport)));
  if (matchedSport) {
    return matchedSport;
  }

  return 'Other';
};
