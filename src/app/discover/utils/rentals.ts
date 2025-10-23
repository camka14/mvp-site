import type { TimeSlot } from '@/types';
import { parseLocalDateTime } from '@/lib/dateUtils';

export function getNextRentalOccurrence(slot: TimeSlot, reference: Date = new Date()): Date | null {
  const start = parseLocalDateTime(slot.startDate ?? null);
  if (!start) {
    return null;
  }

  const referenceDate = new Date(reference.getTime());

  if (!slot.repeating) {
    const startDateTime = new Date(start.getTime());
    if (typeof slot.startTimeMinutes === 'number') {
      startDateTime.setHours(0, 0, 0, 0);
      startDateTime.setMinutes(slot.startTimeMinutes);
    }
    if (startDateTime.getTime() < referenceDate.getTime()) {
      return null;
    }
    return startDateTime;
  }

  const slotDay =
    typeof slot.dayOfWeek === 'number'
      ? ((slot.dayOfWeek % 7) + 7) % 7
      : ((start.getDay() + 6) % 7);

  const base = new Date(start.getTime());
  base.setHours(0, 0, 0, 0);

  if (referenceDate.getTime() < base.getTime()) {
    referenceDate.setTime(base.getTime());
  }

  if (slot.endDate) {
    const endDate = parseLocalDateTime(slot.endDate);
    if (endDate && referenceDate.getTime() > endDate.getTime()) {
      return null;
    }
  }

  const aligned = alignDateToDay(referenceDate, slotDay);
  if (aligned.getTime() < base.getTime()) {
    aligned.setDate(aligned.getDate() + 7);
  }

  const occurrence = new Date(aligned.getTime());
  if (typeof slot.startTimeMinutes === 'number') {
    occurrence.setHours(0, 0, 0, 0);
    occurrence.setMinutes(slot.startTimeMinutes);
  } else {
    occurrence.setHours(
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    );
  }

  if (slot.endDate) {
    const endDate = parseLocalDateTime(slot.endDate);
    if (endDate && occurrence.getTime() > endDate.getTime()) {
      return null;
    }
  }

  if (occurrence.getTime() < reference.getTime()) {
    occurrence.setDate(occurrence.getDate() + 7);
    if (slot.endDate) {
      const endDate = parseLocalDateTime(slot.endDate);
      if (endDate && occurrence.getTime() > endDate.getTime()) {
        return null;
      }
    }
  }

  return occurrence;
}

export function alignDateToDay(seed: Date, dayOfWeek: number): Date {
  const aligned = new Date(seed.getTime());
  aligned.setHours(0, 0, 0, 0);
  const current = (aligned.getDay() + 6) % 7;
  let diff = dayOfWeek - current;
  if (diff < 0) {
    diff += 7;
  }
  aligned.setDate(aligned.getDate() + diff);
  return aligned;
}

export function weekdayLabel(day: number): string {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const index = ((day % 7) + 7) % 7;
  return labels[index] ?? 'Mon';
}
