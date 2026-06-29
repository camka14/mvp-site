import { normalizeRentalTaxHandling, type RentalTaxHandling } from '@/lib/taxPolicy';
import { isTemplateRentalResourceSourceType } from '@/lib/templateRentalResources';
import {
  DEFAULT_EVENT_TIME_ZONE,
  mondayDayInTimeZone,
  minutesInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
} from '@/server/timeZones';

export type CanonicalTimeSlotInput = {
  id: string;
  dayOfWeek: number | null;
  daysOfWeek: number[];
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  startDate: Date;
  endDate: Date | null;
  timeZone: string;
  repeating: boolean;
  scheduledFieldId: string | null;
  scheduledFieldIds: string[];
  price: number | null;
  taxHandling: RentalTaxHandling;
  divisions: string[];
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
  sourceType: string | null;
  rentalBookingId: string | null;
  rentalBookingItemId: string | null;
  rentalLocked: boolean;
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

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
  timeZone?: string | null;
  fallbackDivisionKeys: string[];
  enforceAllDivisions: boolean;
  normalizeDivisions: (value: unknown) => string[];
  allowTemplateRentalResourceReferences?: boolean;
};

export const canonicalizeTimeSlots = ({
  eventId,
  slots,
  fallbackStartDate,
  timeZone,
  fallbackDivisionKeys,
  enforceAllDivisions,
  normalizeDivisions,
  allowTemplateRentalResourceReferences = false,
}: CanonicalizeSlotsParams): CanonicalTimeSlotInput[] => {
  const seenSlotIds = new Map<string, number>();
  const fallbackTimeZone = resolveTimeZone(timeZone, DEFAULT_EVENT_TIME_ZONE);
  const resolvedFallbackStartDate = parseDateInputInTimeZone(fallbackStartDate, fallbackTimeZone) ?? new Date(0);

  return slots.flatMap((rawSlot, index) => {
    const slot = rawSlot ?? {};
    const slotId = ensureUniqueSlotId(normalizeSlotId(slot, eventId, index), seenSlotIds);
    const repeating = typeof slot.repeating === 'boolean' ? slot.repeating : true;
    const slotTimeZone = resolveTimeZone(slot.timeZone, fallbackTimeZone);

    const startDate = parseDateInputInTimeZone(slot.startDate, slotTimeZone) ?? resolvedFallbackStartDate;
    const parsedEndDate = slot.endDate === null ? null : parseDateInputInTimeZone(slot.endDate, slotTimeZone);

    const normalizedDays = normalizeTimeSlotDays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek,
    });

    const normalizedFieldIds = normalizeTimeSlotFieldIds(slot);
    const allowFieldlessSlot = allowTemplateRentalResourceReferences
      && isTemplateRentalResourceSourceType(slot.sourceType);
    if (normalizedFieldIds.length === 0 && !allowFieldlessSlot) {
      return [];
    }

    const slotStartMinutesRaw = normalizeMinuteValue(slot.startTimeMinutes);
    const slotEndMinutesRaw = normalizeMinuteValue(slot.endTimeMinutes);

    const startMinutesFromDate = minutesInTimeZone(startDate, slotTimeZone);
    const endMinutesFromDate = parsedEndDate
      ? minutesInTimeZone(parsedEndDate, slotTimeZone)
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
        : [mondayDayInTimeZone(startDate, slotTimeZone)];
      endDate = parsedEndDate ?? null;
    } else {
      const inferredEndDate = parsedEndDate ?? (() => {
        const candidate = new Date(startDate.getTime() + (endTimeMinutes - startTimeMinutes) * MINUTE_MS);
        if (candidate.getTime() <= startDate.getTime()) {
          candidate.setTime(candidate.getTime() + 24 * 60 * MINUTE_MS);
        }
        return candidate;
      })();
      if (!inferredEndDate || inferredEndDate.getTime() <= startDate.getTime()) {
        return [];
      }
      endDate = inferredEndDate;
      daysOfWeek = normalizedDays.length > 0
        ? [normalizedDays[0]]
        : [mondayDayInTimeZone(startDate, slotTimeZone)];
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
      timeZone: slotTimeZone,
      repeating,
      scheduledFieldId: normalizedFieldIds[0] ?? null,
      scheduledFieldIds: normalizedFieldIds,
      price: normalizePrice(slot.price),
      taxHandling: normalizeRentalTaxHandling(slot.taxHandling),
      divisions,
      requiredTemplateIds: normalizeRequiredTemplateIds(slot.requiredTemplateIds),
      hostRequiredTemplateIds: normalizeRequiredTemplateIds(slot.hostRequiredTemplateIds),
      sourceType: normalizeOptionalString(slot.sourceType),
      rentalBookingId: normalizeOptionalString(slot.rentalBookingId),
      rentalBookingItemId: normalizeOptionalString(slot.rentalBookingItemId),
      rentalLocked: Boolean(slot.rentalLocked),
    } satisfies CanonicalTimeSlotInput];
  });
};
