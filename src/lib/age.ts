export const calculateAgeOnDate = (dateOfBirth: Date, onDate: Date): number => {
  if (Number.isNaN(dateOfBirth.getTime()) || Number.isNaN(onDate.getTime())) {
    return Number.NaN;
  }

  const yearDiff = onDate.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = onDate.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDiff = onDate.getUTCDate() - dateOfBirth.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    return yearDiff - 1;
  }

  return yearDiff;
};

export const isAgeWithinRange = (
  age: number,
  minAge?: number | null,
  maxAge?: number | null,
): boolean => {
  if (!Number.isFinite(age)) return false;

  const hasMin = typeof minAge === 'number' && Number.isFinite(minAge);
  const hasMax = typeof maxAge === 'number' && Number.isFinite(maxAge);

  if (hasMin && age < (minAge as number)) return false;
  if (hasMax && age > (maxAge as number)) return false;
  return true;
};

export const formatAgeRange = (minAge?: number | null, maxAge?: number | null): string => {
  const hasMin = typeof minAge === 'number' && Number.isFinite(minAge);
  const hasMax = typeof maxAge === 'number' && Number.isFinite(maxAge);

  if (hasMin && hasMax) return `${minAge}-${maxAge}`;
  if (hasMin) return `${minAge}+`;
  if (hasMax) return `Up to ${maxAge}`;
  return 'All ages';
};

