export const formatStandingsPoints = (value: number): string => {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
};

export const formatStandingsDelta = (value: number): string => {
  const formatted = formatStandingsPoints(value);
  return value > 0 ? `(+${formatted})` : `(${formatted})`;
};
