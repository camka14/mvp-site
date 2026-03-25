type UserNameFields = {
  firstName?: string | null;
  lastName?: string | null;
};

export const toNameCase = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  return trimmed
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `${token[0]?.toUpperCase() ?? ''}${token.slice(1)}`)
    .join(' ');
};

export const normalizeOptionalName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = toNameCase(value);
  return normalized.length ? normalized : null;
};

export const formatNameParts = (firstName?: string | null, lastName?: string | null): string => {
  return [normalizeOptionalName(firstName), normalizeOptionalName(lastName)]
    .filter((part): part is string => Boolean(part))
    .join(' ');
};

export const applyNameCaseToUserFields = <T extends UserNameFields>(value: T): T => {
  return {
    ...value,
    firstName: value.firstName == null ? value.firstName : toNameCase(value.firstName),
    lastName: value.lastName == null ? value.lastName : toNameCase(value.lastName),
  };
};
