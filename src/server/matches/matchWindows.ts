export const OFFICIAL_MATCH_OPEN_MINUTES_BEFORE = 60;

export const getOpenAt = (
  start: Date | string | null | undefined,
  openMinutesBefore: number,
): Date | null => {
  if (!start) return null;
  const startDate = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const minutes = Math.max(0, Math.trunc(openMinutesBefore));
  return new Date(startDate.getTime() - minutes * 60_000);
};

export const isWindowOpen = (
  start: Date | string | null | undefined,
  openMinutesBefore: number,
  now = new Date(),
): boolean => {
  const openAt = getOpenAt(start, openMinutesBefore);
  return !openAt || now.getTime() >= openAt.getTime();
};

export const assertWindowOpen = (
  start: Date | string | null | undefined,
  openMinutesBefore: number,
  message: string,
  now = new Date(),
): void => {
  if (!isWindowOpen(start, openMinutesBefore, now)) {
    throw new Response(message, { status: 409 });
  }
};
