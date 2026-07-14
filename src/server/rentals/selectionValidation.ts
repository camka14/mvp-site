import { z } from 'zod';
import {
  localDatePartsInTimeZone,
  mondayDayInTimeZone,
  minutesInTimeZone,
  parseDateInputInTimeZone,
  resolveTimeZone,
  resolveTimeZoneFromFieldOrOrganization,
} from '@/server/timeZones';

export const rentalSelectionSchema = z.object({
  key: z.string().optional(),
  scheduledFieldIds: z.array(z.string().min(1)).min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  endTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  timeZone: z.string().optional(),
  repeating: z.boolean().optional(),
}).passthrough();

export const rentalSelectionsSchema = z.array(rentalSelectionSchema).min(1);

export type RentalSelectionInput = z.infer<typeof rentalSelectionSchema>;

export type RentalSelectionField = Record<string, unknown> & {
  id: string;
  name?: string | null;
  organizationId?: string | null;
  facilityId?: string | null;
  rentalSlotIds?: unknown;
};

export type RentalAvailabilitySlot = Record<string, unknown> & {
  id: string;
  archivedAt?: Date | string | null;
  dayOfWeek?: number | null;
  daysOfWeek?: unknown;
  startTimeMinutes?: number | null;
  endTimeMinutes?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  timeZone?: string | null;
  repeating?: boolean | null;
  price?: number | null;
  requiredTemplateIds?: unknown;
  hostRequiredTemplateIds?: unknown;
};

export type ValidatedRentalSelectionItem = {
  fieldId: string;
  facilityId: string | null;
  availabilitySlotId: string;
  priceCents: number;
};

export type ValidatedRentalSelection = {
  selection: RentalSelectionInput;
  start: Date;
  end: Date;
  timeZone: string;
  fieldIds: string[];
  items: ValidatedRentalSelectionItem[];
  totalCents: number;
  requiredTemplateIds: string[];
  hostRequiredTemplateIds: string[];
};

export type RentalSelectionValidationResult =
  | {
    ok: true;
    selections: ValidatedRentalSelection[];
    distinctFieldWindowCount: number;
  }
  | { ok: false; error: string };

export const normalizeRentalStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const dateOnlyValueInTimeZone = (date: Date, timeZone: string): number => {
  const parts = localDatePartsInTimeZone(date, timeZone);
  if (!parts) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day);
};

const MINUTES_PER_DAY = 24 * 60;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const recurringSelectionEndMinutes = (
  start: Date,
  end: Date,
  timeZone: string,
): number | null => {
  const startDateValue = dateOnlyValueInTimeZone(start, timeZone);
  const endDateValue = dateOnlyValueInTimeZone(end, timeZone);
  const daySpan = (endDateValue - startDateValue) / MILLISECONDS_PER_DAY;
  if (!Number.isInteger(daySpan) || daySpan < 0 || daySpan > 1) {
    return null;
  }
  return minutesInTimeZone(end, timeZone) + (daySpan * MINUTES_PER_DAY);
};

type RentalSlotMinuteBounds = {
  startMinutes: number;
  normalizedEndMinutes: number;
  durationMinutes: number;
  isOvernight: boolean;
};

const resolveRentalSlotMinuteBounds = (
  slot: RentalAvailabilitySlot,
  slotStart: Date | null,
  slotEnd: Date | null,
  slotTimeZone: string,
): RentalSlotMinuteBounds | null => {
  const startMinutes = typeof slot.startTimeMinutes === 'number'
    ? slot.startTimeMinutes
    : slotStart
      ? minutesInTimeZone(slotStart, slotTimeZone)
      : null;
  const endMinutes = typeof slot.endTimeMinutes === 'number'
    ? slot.endTimeMinutes
    : slotEnd
      ? minutesInTimeZone(slotEnd, slotTimeZone)
      : null;
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return null;
  }

  const isOvernight = endMinutes < startMinutes;
  const normalizedEndMinutes = isOvernight ? endMinutes + MINUTES_PER_DAY : endMinutes;
  const durationMinutes = normalizedEndMinutes - startMinutes;
  if (durationMinutes <= 0) {
    return null;
  }
  return { startMinutes, normalizedEndMinutes, durationMinutes, isOvernight };
};

const normalizedRentalSlotDurationMinutes = (
  slot: RentalAvailabilitySlot,
  fallbackTimeZone: string,
): number => {
  const slotTimeZone = resolveTimeZone(slot.timeZone, fallbackTimeZone);
  const slotStart = parseDateInputInTimeZone(slot.startDate, slotTimeZone);
  const slotEnd = parseDateInputInTimeZone(slot.endDate, slotTimeZone);
  if (slot.repeating === false) {
    if (!slotStart || !slotEnd) {
      return Number.POSITIVE_INFINITY;
    }
    const elapsedMinutes = Math.trunc((slotEnd.getTime() - slotStart.getTime()) / (60 * 1000));
    return elapsedMinutes > 0 ? elapsedMinutes : Number.POSITIVE_INFINITY;
  }
  return resolveRentalSlotMinuteBounds(slot, slotStart, slotEnd, slotTimeZone)?.durationMinutes
    ?? Number.POSITIVE_INFINITY;
};

const compareCoveringRentalSlots = (
  left: RentalAvailabilitySlot,
  right: RentalAvailabilitySlot,
  fallbackTimeZone: string,
): number => {
  const leftDuration = normalizedRentalSlotDurationMinutes(left, fallbackTimeZone);
  const rightDuration = normalizedRentalSlotDurationMinutes(right, fallbackTimeZone);
  if (leftDuration !== rightDuration) {
    return leftDuration < rightDuration ? -1 : 1;
  }

  const leftPrice = typeof left.price === 'number' && Number.isFinite(left.price)
    ? left.price
    : Number.POSITIVE_INFINITY;
  const rightPrice = typeof right.price === 'number' && Number.isFinite(right.price)
    ? right.price
    : Number.POSITIVE_INFINITY;
  if (leftPrice !== rightPrice) {
    return leftPrice < rightPrice ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
};

const rentalSlotCoversSelection = (
  slot: RentalAvailabilitySlot,
  selectionStart: Date,
  selectionEnd: Date,
  selectionTimeZone: string,
): boolean => {
  if (slot.archivedAt) return false;
  const slotTimeZone = resolveTimeZone(slot.timeZone, selectionTimeZone);
  const slotStart = parseDateInputInTimeZone(slot.startDate, slotTimeZone);
  const slotEnd = parseDateInputInTimeZone(slot.endDate, slotTimeZone);
  if (slot.repeating === false) {
    return Boolean(
      slotStart
      && slotEnd
      && selectionStart.getTime() >= slotStart.getTime()
      && selectionEnd.getTime() <= slotEnd.getTime(),
    );
  }

  const selectionDay = mondayDayInTimeZone(selectionStart, slotTimeZone);
  const slotDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry))
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  if (slotDays.length && !slotDays.includes(selectionDay)) {
    return false;
  }

  const selectionStartMinutes = minutesInTimeZone(selectionStart, slotTimeZone);
  const selectionEndMinutes = recurringSelectionEndMinutes(selectionStart, selectionEnd, slotTimeZone);
  if (selectionEndMinutes === null) {
    return false;
  }
  const slotMinuteBounds = resolveRentalSlotMinuteBounds(slot, slotStart, slotEnd, slotTimeZone);
  if (!slotMinuteBounds) {
    return false;
  }
  if (
    selectionStartMinutes < slotMinuteBounds.startMinutes
    || selectionEndMinutes > slotMinuteBounds.normalizedEndMinutes
  ) {
    return false;
  }

  const selectionAnchorDateValue = dateOnlyValueInTimeZone(selectionStart, slotTimeZone);
  if (slotStart && selectionAnchorDateValue < dateOnlyValueInTimeZone(slotStart, slotTimeZone)) {
    return false;
  }
  if (slotEnd && selectionAnchorDateValue > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)) {
    return false;
  }
  if (
    slotEnd
    && !slotMinuteBounds.isOvernight
    && dateOnlyValueInTimeZone(selectionEnd, slotTimeZone) > dateOnlyValueInTimeZone(slotEnd, slotTimeZone)
  ) {
    return false;
  }
  return true;
};

export const validateRentalSelections = ({
  selections,
  fields,
  slots,
  organization,
  now = new Date(),
  requireAvailability = true,
}: {
  selections: RentalSelectionInput[];
  fields: RentalSelectionField[];
  slots: RentalAvailabilitySlot[];
  organization: Record<string, unknown>;
  now?: Date | null;
  requireAvailability?: boolean;
}): RentalSelectionValidationResult => {
  const fieldById = new Map(fields.map((field) => [String(field.id), field]));
  const slotById = new Map(slots.map((slot) => [String(slot.id), slot]));
  const seenFieldWindows = new Set<string>();
  const validatedSelections: ValidatedRentalSelection[] = [];

  for (const selection of selections) {
    const requestedFieldIds = normalizeRentalStringArray(selection.scheduledFieldIds);
    if (!requestedFieldIds.length) {
      return { ok: false, error: 'Rental selections must include at least one field.' };
    }
    const primaryField = fieldById.get(requestedFieldIds[0]) ?? null;
    const selectionTimeZone = resolveTimeZone(
      selection.timeZone,
      resolveTimeZoneFromFieldOrOrganization(primaryField, organization),
    );
    const start = parseDateInputInTimeZone(selection.startDate, selectionTimeZone);
    const end = parseDateInputInTimeZone(selection.endDate, selectionTimeZone);
    if (!start || !end || end.getTime() <= start.getTime()) {
      return { ok: false, error: 'Rental selections must include valid start and end times.' };
    }
    if (now && start.getTime() < now.getTime()) {
      return { ok: false, error: 'Rental selections must start in the future.' };
    }

    const fieldIds = requestedFieldIds.filter((fieldId) => {
      const key = `${fieldId}\u0000${start.toISOString()}\u0000${end.toISOString()}`;
      if (seenFieldWindows.has(key)) return false;
      seenFieldWindows.add(key);
      return true;
    });
    if (!fieldIds.length) {
      continue;
    }

    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
    const requiredTemplateIds = new Set<string>();
    const hostRequiredTemplateIds = new Set<string>();
    const items: ValidatedRentalSelectionItem[] = [];
    let totalCents = 0;

    for (const fieldId of fieldIds) {
      const field = fieldById.get(fieldId);
      if (!field) {
        return { ok: false, error: 'One or more selected fields are unavailable.' };
      }
      const matchedSlot = normalizeRentalStringArray(field.rentalSlotIds)
        .map((slotId) => slotById.get(slotId))
        .filter((slot): slot is RentalAvailabilitySlot => Boolean(
          slot && rentalSlotCoversSelection(slot, start, end, selectionTimeZone),
        ))
        .sort((left, right) => compareCoveringRentalSlots(left, right, selectionTimeZone))[0];
      if (!matchedSlot) {
        if (requireAvailability) {
          return { ok: false, error: `${field.name || 'Selected field'} is not available for the selected time.` };
        }
        continue;
      }

      const priceCents = typeof matchedSlot.price === 'number' && matchedSlot.price > 0
        ? Math.round((matchedSlot.price * durationMinutes) / 60)
        : 0;
      totalCents += priceCents;
      items.push({
        fieldId,
        facilityId: typeof field.facilityId === 'string' && field.facilityId.trim()
          ? field.facilityId.trim()
          : null,
        availabilitySlotId: String(matchedSlot.id),
        priceCents,
      });
      normalizeRentalStringArray(matchedSlot.requiredTemplateIds).forEach((id) => requiredTemplateIds.add(id));
      normalizeRentalStringArray(matchedSlot.hostRequiredTemplateIds).forEach((id) => hostRequiredTemplateIds.add(id));
    }

    validatedSelections.push({
      selection,
      start,
      end,
      timeZone: selectionTimeZone,
      fieldIds,
      items,
      totalCents,
      requiredTemplateIds: Array.from(requiredTemplateIds),
      hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
    });
  }

  if (!validatedSelections.length) {
    return { ok: false, error: 'Rental selections must include at least one distinct field and time window.' };
  }
  return {
    ok: true,
    selections: validatedSelections,
    distinctFieldWindowCount: seenFieldWindows.size,
  };
};
