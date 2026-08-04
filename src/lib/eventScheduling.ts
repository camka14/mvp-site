export const WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE =
  'Add at least one weekly repeating timeslot for this Weekly Event.';

export const hasWeeklyRepeatingTimeSlot = (
  slots: Array<{ repeating?: boolean | null }> | null | undefined,
): boolean => (
  Array.isArray(slots) && slots.some((slot) => slot.repeating !== false)
);
