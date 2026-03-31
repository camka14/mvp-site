import { parseDateInput } from '@/server/legacyFormat';

export type CanonicalTimeSlotInput = {
  id: string;
  dayOfWeek: number | null;
  daysOfWeek: number[];
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  startDate: Date;
  endDate: Date | null;
  repeating: boolean;
  scheduledFieldId: string | null;
  scheduledFieldIds: string[];
  price: number | null;
  divisions: string[];
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

const MINUTE_MS = 60 * 1000;

export const normalizeTimeSlotFieldIds = (slot: Record<string, unknown>): string[] => {
  const fromList = Array.isArray(slot.scheduledFieldIds)
    ? slot.scheduledFieldIds
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0)
    : [];
  if (fromList.length > 0) {
    return Array.from(new Set(fromList));
  }
  if (typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.trim().length > 0) {
    return [slot.scheduledFieldId.trim()];
  }
  return [];
};

export const normalizeTimeSlotDays = (input: { dayOfWeek?: unknown; daysOfWeek?: unknown }): number[] => {
  const source = Array.isArray(input.daysOfWeek) && input.daysOfWeek.length
    ? input.daysOfWeek
    : input.dayOfWeek !== undefined
      ? [input.dayOfWeek]
      : [];

  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

const normalizeSlotId = (slot: Record<string, unknown>, eventId: string, index: number): string => {
  const candidate = typeof slot.$id === 'string' && slot.$id.trim().length > 0
    ? slot.$id.trim()
    : typeof slot.id === 'string' && slot.id.trim().length > 0
      ? slot.id.trim()
      : `${eventId}__slot_${index + 1}`;
  return candidate;
};

const ensureUniqueSlotId = (value: string, seen: Map<string, number>): string => {
  const count = seen.get(value) ?? 0;
  seen.set(value, count + 1);
  if (count === 0) {
    return value;
  }
  return `${value}__dup${count}`;
};

const normalizeRequiredTemplateIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizePrice = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const normalizeMinuteValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
};

type CanonicalizeSlotsParams = {
  eventId: string;
  slots: Array<Record<string, unknown>>;
  fallbackStartDate: Date;
  fallbackDivisionKeys: string[];
  enforceAllDivisions: boolean;
  normalizeDivisions: (value: unknown) => string[];
};

export const canonicalizeTimeSlots = ({
  eventId,
  slots,
  fallbackStartDate,
  fallbackDivisionKeys,
  enforceAllDivisions,
  normalizeDivisions,
}: CanonicalizeSlotsParams): CanonicalTimeSlotInput[] => {
  const seenSlotIds = new Map<string, number>();
  const resolvedFallbackStartDate = parseDateInput(fallbackStartDate) ?? new Date(0);

  return slots.flatMap((rawSlot, index) => {
    const slot = rawSlot ?? {};
    const slotId = ensureUniqueSlotId(normalizeSlotId(slot, eventId, index), seenSlotIds);
    const repeating = typeof slot.repeating === 'boolean' ? slot.repeating : true;

    const startDate = parseDateInput(slot.startDate) ?? resolvedFallbackStartDate;
    const parsedEndDate = slot.endDate === null ? null : parseDateInput(slot.endDate);

    const normalizedDays = normalizeTimeSlotDays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    });

    const normalizedFieldIds = normalizeTimeSlotFieldIds(slot);
    if (normalizedFieldIds.length === 0) {
      return [];
    }

    const slotStartMinutesRaw = normalizeMinuteValue(slot.startTimeMinutes);
    const slotEndMinutesRaw = normalizeMinuteValue(slot.endTimeMinutes);

    const startMinutesFromDate = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutesFromDate = parsedEndDate
      ? parsedEndDate.getHours() * 60 + parsedEndDate.getMinutes()
      : null;

    const startTimeMinutes = repeating
      ? slotStartMinutesRaw
      : (slotStartMinutesRaw ?? startMinutesFromDate);
    const endTimeMinutes = repeating
      ? slotEndMinutesRaw
      : (slotEndMinutesRaw ?? endMinutesFromDate);

    if (startTimeMinutes === null || endTimeMinutes === null || endTimeMinutes <= startTimeMinutes) {
      return [];
    }

    let endDate: Date | null = null;
    let daysOfWeek: number[] = [];
    if (repeating) {
      daysOfWeek = normalizedDays.length > 0
        ? normalizedDays
        : [((startDate.getDay() + 6) % 7)];
      endDate = parsedEndDate ?? null;
    } else {
      const inferredEndDate = parsedEndDate ?? (() => {
        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);
        const candidate = new Date(startOfDay.getTime() + endTimeMinutes * MINUTE_MS);
        if (candidate.getTime() <= startDate.getTime()) {
          candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
      })();
      if (!inferredEndDate || inferredEndDate.getTime() <= startDate.getTime()) {
        return [];
      }
      endDate = inferredEndDate;
      daysOfWeek = normalizedDays.length > 0
        ? [normalizedDays[0]]
        : [((startDate.getDay() + 6) % 7)];
    }

    const normalizedSlotDivisions = normalizeDivisions(slot.divisions);
    const divisions = enforceAllDivisions
      ? fallbackDivisionKeys
      : (normalizedSlotDivisions.length > 0 ? normalizedSlotDivisions : fallbackDivisionKeys);

    return [{
      id: slotId,
      dayOfWeek: daysOfWeek[0] ?? null,
      daysOfWeek,
      startTimeMinutes,
      endTimeMinutes,
      startDate,
      endDate,
      repeating,
      scheduledFieldId: normalizedFieldIds[0] ?? null,
      scheduledFieldIds: normalizedFieldIds,
      price: normalizePrice(slot.price),
      divisions,
      requiredTemplateIds: normalizeRequiredTemplateIds(slot.requiredTemplateIds),
      hostRequiredTemplateIds: normalizeRequiredTemplateIds(slot.hostRequiredTemplateIds),
    } satisfies CanonicalTimeSlotInput];
  });
};
