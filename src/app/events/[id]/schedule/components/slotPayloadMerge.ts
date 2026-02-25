import { createClientId } from '@/lib/clientId';
import { TimeSlot } from '@/types';

const normalizeWeekdays = (slot: { dayOfWeek?: number; daysOfWeek?: number[] }): number[] => {
  const source = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : typeof slot.dayOfWeek === 'number'
      ? [slot.dayOfWeek]
      : [];
  return Array.from(
    new Set(
      source
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  ).sort((a, b) => a - b);
};

const normalizeDivisionKeys = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  );
};

const normalizeFieldIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0),
    ),
  );
};

const normalizeSlotFieldIds = (slot: { scheduledFieldId?: string; scheduledFieldIds?: string[] }): string[] => {
  const fromList = normalizeFieldIds(slot.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0
    ? [slot.scheduledFieldId]
    : [];
};

const normalizeSlotMergeBaseId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized.length) {
    return null;
  }
  return normalized
    .replace(/__d[0-6]__f.+$/, '')
    .replace(/__f.+$/, '')
    .replace(/__d[0-6](?:_\d+)?$/, '');
};

export const mergeSlotPayloadsForForm = (
  slots: TimeSlot[],
  fallbackFieldId?: string,
): Array<Partial<TimeSlot>> => {
  const groups = new Map<string, {
    slot: Partial<TimeSlot>;
    days: Set<number>;
    divisions: Set<string>;
    fieldIds: Set<string>;
    ids: string[];
    baseId: string | null;
  }>();

  for (const slot of slots) {
    const resolvedFieldIds = normalizeSlotFieldIds({
      scheduledFieldId: slot.scheduledFieldId,
      scheduledFieldIds: slot.scheduledFieldIds,
    });
    if (!resolvedFieldIds.length && fallbackFieldId) {
      resolvedFieldIds.push(fallbackFieldId);
    }
    const normalizedDays = normalizeWeekdays({
      dayOfWeek: slot.dayOfWeek,
      daysOfWeek: slot.daysOfWeek as number[] | undefined,
    });
    const scheduleKey = [
      slot.startTimeMinutes ?? '',
      slot.endTimeMinutes ?? '',
      slot.repeating ?? true,
      slot.startDate ?? '',
      slot.endDate ?? '',
    ].join('|');
    const baseId = normalizeSlotMergeBaseId(slot.$id);
    const key = baseId ?? scheduleKey;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        slot: {
          $id: slot.$id,
          scheduledFieldId: resolvedFieldIds[0],
          scheduledFieldIds: resolvedFieldIds,
          startTimeMinutes: slot.startTimeMinutes,
          endTimeMinutes: slot.endTimeMinutes,
          repeating: slot.repeating,
          startDate: slot.startDate,
          endDate: slot.endDate,
        },
        days: new Set(normalizedDays),
        divisions: new Set(normalizeDivisionKeys(slot.divisions)),
        fieldIds: new Set(resolvedFieldIds),
        ids: [slot.$id],
        baseId,
      });
      continue;
    }
    normalizedDays.forEach((day) => existing.days.add(day));
    normalizeDivisionKeys(slot.divisions).forEach((divisionKey) => existing.divisions.add(divisionKey));
    resolvedFieldIds.forEach((fieldId) => existing.fieldIds.add(fieldId));
    if (slot.$id) {
      existing.ids.push(slot.$id);
    }
  }

  return Array.from(groups.values()).map(({ slot, days, divisions, fieldIds, ids, baseId }) => {
    const mergedDays = Array.from(days).sort((a, b) => a - b);
    const mergedDivisions = Array.from(divisions).sort();
    const mergedFieldIds = Array.from(fieldIds);
    const mergedId = baseId ?? (ids.length === 1 ? ids[0] : createClientId());
    return {
      ...slot,
      $id: mergedId,
      scheduledFieldId: mergedFieldIds[0],
      scheduledFieldIds: mergedFieldIds,
      dayOfWeek: (mergedDays[0] ?? 0) as TimeSlot['dayOfWeek'],
      daysOfWeek: mergedDays as TimeSlot['daysOfWeek'],
      divisions: mergedDivisions,
    };
  });
};
