"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { Field, TimeSlot, UserData } from '@/types';
import { formatDisplayDateTime, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { createId } from '@/lib/id';
import { fieldService } from '@/lib/fieldService';
import { getFacilityScopedFieldDisplayName } from '@/lib/fieldUtils';
import { buildFieldCalendarEvents } from '../fieldCalendar';
import { normalizeDaysOfWeek, normalizeFieldIds } from './facilityFormUtils';
import type {
  RentalDraftSelection,
  RentalSelectionConflictState,
  RentalSelectionValidation,
} from './facilityCalendarTypes';

export const PUBLIC_RENTAL_MIN_SELECTION_MS = 60 * 60 * 1000;

type RentalListing = {
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
};

type SelectionConflictInput = {
  key: string;
  signature: string | null;
  fieldIds: string[];
  dateRange: { start: Date; end: Date } | null;
};

type UsePublicRentalSelectionsOptions = {
  canManage: boolean;
  currentUser: UserData | null;
  fields: Field[];
  facilityFilteredFields: Field[];
  rentalListings: RentalListing[];
  setCalendarDate: Dispatch<SetStateAction<Date>>;
  compareRanges: (startA: Date, endA: Date, startB: Date, endB: Date) => boolean;
};

const mondayDayOf = (date: Date): number => ((date.getDay() + 6) % 7);

const minutesToDate = (date: Date, minutes: number): Date => {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  next.setMinutes(minutes, 0, 0);
  return next;
};

export const isPastRentalRangeStart = (start: Date, reference: Date = new Date()): boolean => (
  start.getTime() < reference.getTime()
);

export const getNextSelectableRentalStart = (reference: Date = new Date(), slotStepMinutes = 30): Date => {
  const next = new Date(reference.getTime());
  const hasSubMinuteOffset = next.getSeconds() > 0 || next.getMilliseconds() > 0;
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const remainder = minutes % slotStepMinutes;
  if (remainder > 0 || hasSubMinuteOffset) {
    next.setMinutes(minutes + (remainder > 0 ? slotStepMinutes - remainder : slotStepMinutes), 0, 0);
  }
  return next;
};

export const resolveSelectionDateRange = (
  selection: Pick<RentalDraftSelection, 'dayOfWeek' | 'daysOfWeek' | 'startTimeMinutes' | 'endTimeMinutes' | 'startDate' | 'endDate' | 'repeating'>,
): { start: Date; end: Date } | null => {
  const explicitStart = parseLocalDateTime(selection.startDate ?? null);
  const explicitEnd = parseLocalDateTime(selection.endDate ?? null);
  if (selection.repeating === false && explicitStart && explicitEnd && explicitEnd.getTime() > explicitStart.getTime()) {
    return { start: explicitStart, end: explicitEnd };
  }

  const startBoundary = explicitStart;
  const days = normalizeDaysOfWeek(selection.daysOfWeek, selection.dayOfWeek);
  const day = days[0] ?? (startBoundary ? mondayDayOf(startBoundary) : null);
  if (!startBoundary || day === null) {
    return null;
  }
  const startMinutes = typeof selection.startTimeMinutes === 'number' ? selection.startTimeMinutes : null;
  const endMinutes = typeof selection.endTimeMinutes === 'number' ? selection.endTimeMinutes : null;
  if (startMinutes === null || endMinutes === null) {
    return null;
  }
  const baseDay = (() => {
    const start = new Date(startBoundary.getTime());
    start.setHours(0, 0, 0, 0);
    const currentDay = mondayDayOf(start);
    let diff = day - currentDay;
    if (diff < 0) {
      diff += 7;
    }
    start.setDate(start.getDate() + diff);
    return start;
  })();
  const start = minutesToDate(baseDay, startMinutes);
  const endCandidate = minutesToDate(baseDay, endMinutes);
  const end = endCandidate > start ? endCandidate : new Date(start.getTime() + PUBLIC_RENTAL_MIN_SELECTION_MS);
  return { start, end };
};

export const buildSelectionConflictSignature = (
  selection: RentalDraftSelection,
): {
  signature: string | null;
  fieldIds: string[];
  dateRange: { start: Date; end: Date } | null;
} => {
  const fieldIds = normalizeFieldIds(selection.scheduledFieldIds);
  const dateRange = resolveSelectionDateRange(selection);
  if (!fieldIds.length || !dateRange) {
    return { signature: null, fieldIds, dateRange };
  }
  const signature = `${fieldIds.join(',')}|${dateRange.start.toISOString()}|${dateRange.end.toISOString()}`;
  return { signature, fieldIds, dateRange };
};

export const buildSelectionFromCalendarRange = (
  start: Date,
  end: Date,
  fieldId: string,
): RentalDraftSelection => {
  const startDate = new Date(start.getTime());
  const endDate = new Date(end.getTime());
  if (endDate.getTime() - startDate.getTime() < PUBLIC_RENTAL_MIN_SELECTION_MS) {
    endDate.setTime(startDate.getTime() + PUBLIC_RENTAL_MIN_SELECTION_MS);
  }
  const dayOfWeek = mondayDayOf(startDate);
  return {
    key: createId(),
    scheduledFieldIds: [fieldId],
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    startTimeMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
    endTimeMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    startDate: formatLocalDateTime(startDate),
    endDate: formatLocalDateTime(endDate),
    repeating: false,
  };
};

export const updateSelectionWithCalendarRange = (
  selection: RentalDraftSelection,
  start: Date,
  end: Date,
): RentalDraftSelection => {
  const startDate = new Date(start.getTime());
  const endDate = new Date(end.getTime());
  if (endDate.getTime() - startDate.getTime() < PUBLIC_RENTAL_MIN_SELECTION_MS) {
    endDate.setTime(startDate.getTime() + PUBLIC_RENTAL_MIN_SELECTION_MS);
  }
  const dayOfWeek = mondayDayOf(startDate);
  return {
    ...selection,
    scheduledFieldIds: normalizeFieldIds(selection.scheduledFieldIds),
    dayOfWeek,
    daysOfWeek: [dayOfWeek],
    startTimeMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
    endTimeMinutes: endDate.getHours() * 60 + endDate.getMinutes(),
    startDate: formatLocalDateTime(startDate),
    endDate: formatLocalDateTime(endDate),
    repeating: false,
  };
};

const rentalSlotCoversDraftDay = (
  slot: TimeSlot,
  params: {
    selectionStart: Date;
    selectionEnd: Date;
  },
): boolean => {
  if (slot.repeating === false) {
    const slotStart = parseLocalDateTime(slot.startDate ?? null);
    const slotEnd = parseLocalDateTime(slot.endDate ?? null);
    if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
      return false;
    }
    return params.selectionStart.getTime() >= slotStart.getTime() && params.selectionEnd.getTime() <= slotEnd.getTime();
  }

  const dayOfWeek = mondayDayOf(params.selectionStart);
  const startTimeMinutes = params.selectionStart.getHours() * 60 + params.selectionStart.getMinutes();
  const endTimeMinutes = params.selectionEnd.getHours() * 60 + params.selectionEnd.getMinutes();
  const slotDays = normalizeDaysOfWeek(slot.daysOfWeek, slot.dayOfWeek);
  if (!slotDays.includes(dayOfWeek)) {
    return false;
  }
  const slotStartMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : null;
  const slotEndMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : null;
  if (slotStartMinutes === null || slotEndMinutes === null || slotEndMinutes <= slotStartMinutes) {
    return false;
  }
  if (startTimeMinutes < slotStartMinutes || endTimeMinutes > slotEndMinutes) {
    return false;
  }

  const slotStartBoundary = parseLocalDateTime(slot.startDate ?? null);
  const slotEndBoundary = parseLocalDateTime(slot.endDate ?? null);

  const normalizeDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  if (slotStartBoundary && normalizeDay(params.selectionStart) < normalizeDay(slotStartBoundary)) {
    return false;
  }
  if (slotEndBoundary && normalizeDay(params.selectionStart) > normalizeDay(slotEndBoundary)) {
    return false;
  }
  if (slotEndBoundary && normalizeDay(params.selectionEnd) > normalizeDay(slotEndBoundary)) {
    return false;
  }
  return true;
};

export function usePublicRentalSelections({
  canManage,
  currentUser,
  fields,
  facilityFilteredFields,
  rentalListings,
  setCalendarDate,
  compareRanges,
}: UsePublicRentalSelectionsOptions) {
  const [rentalSelections, setRentalSelections] = useState<RentalDraftSelection[]>([]);
  const [selectionConflictStateByKey, setSelectionConflictStateByKey] = useState<Record<string, RentalSelectionConflictState>>({});
  const selectionConflictStateRef = useRef<Record<string, RentalSelectionConflictState>>({});

  useEffect(() => {
    selectionConflictStateRef.current = selectionConflictStateByKey;
  }, [selectionConflictStateByKey]);

  useEffect(() => {
    if (canManage) {
      return;
    }
    if (!fields.length || rentalSelections.length > 0) {
      return;
    }
    const firstField = fields[0];
    if (!firstField?.$id) {
      return;
    }

    const fallbackStart = getNextSelectableRentalStart();
    const fallbackEnd = new Date(fallbackStart.getTime() + PUBLIC_RENTAL_MIN_SELECTION_MS);

    const firstListing = rentalListings[0];
    const firstRentalField = firstListing?.field ?? firstField;
    if (firstListing?.nextOccurrence && firstRentalField?.$id) {
      const start = new Date(firstListing.nextOccurrence.getTime());
      const endMinutes = typeof firstListing.slot.endTimeMinutes === 'number'
        ? firstListing.slot.endTimeMinutes
        : (firstListing.slot.startTimeMinutes ?? (start.getHours() * 60 + start.getMinutes() + 60));
      const end = minutesToDate(start, endMinutes);
      setRentalSelections([
        buildSelectionFromCalendarRange(start, end > start ? end : new Date(start.getTime() + PUBLIC_RENTAL_MIN_SELECTION_MS), firstRentalField.$id),
      ]);
      setCalendarDate(new Date(start));
      return;
    }

    setRentalSelections([
      buildSelectionFromCalendarRange(fallbackStart, fallbackEnd, firstField.$id),
    ]);
    setCalendarDate(new Date(fallbackStart));
  }, [canManage, fields, rentalListings, rentalSelections.length, setCalendarDate]);

  const selectionConflictInputs = useMemo<SelectionConflictInput[]>(
    () => (
      canManage
        ? []
        : rentalSelections.map((selectionItem) => {
          const resolved = buildSelectionConflictSignature(selectionItem);
          return {
            key: selectionItem.key,
            signature: resolved.signature,
            fieldIds: resolved.fieldIds,
            dateRange: resolved.dateRange,
          };
        })
    ),
    [canManage, rentalSelections],
  );
  const selectionConflictInputByKey = useMemo(
    () => new Map(selectionConflictInputs.map((input) => [input.key, input])),
    [selectionConflictInputs],
  );

  useEffect(() => {
    if (canManage) {
      if (Object.keys(selectionConflictStateRef.current).length > 0) {
        setSelectionConflictStateByKey({});
      }
      return;
    }

    const fieldsById = new Map(fields.map((field) => [field.$id, field]));
    const previousState = selectionConflictStateRef.current;
    const toFetch: Array<{
      key: string;
      signature: string;
      fieldIds: string[];
      dateRange: { start: Date; end: Date };
    }> = [];
    const nextState: Record<string, RentalSelectionConflictState> = {};

    selectionConflictInputs.forEach((input) => {
      if (!input.signature || !input.dateRange || !input.fieldIds.length) {
        return;
      }

      const existing = previousState[input.key];
      if (existing && existing.signature === input.signature && !existing.loading) {
        nextState[input.key] = existing;
        return;
      } else {
        nextState[input.key] = {
          signature: input.signature,
          conflictCount: 0,
          loading: true,
          error: null,
        };
        toFetch.push({
          key: input.key,
          signature: input.signature,
          fieldIds: input.fieldIds,
          dateRange: input.dateRange,
        });
      }
    });

    const stateChanged = (() => {
      const previousKeys = Object.keys(previousState);
      const nextKeys = Object.keys(nextState);
      if (previousKeys.length !== nextKeys.length) {
        return true;
      }
      return nextKeys.some((key) => {
        const previous = previousState[key];
        const next = nextState[key];
        return (
          !previous
          || previous.signature !== next.signature
          || previous.conflictCount !== next.conflictCount
          || previous.loading !== next.loading
          || previous.error !== next.error
        );
      });
    })();

    if (stateChanged) {
      setSelectionConflictStateByKey(nextState);
    }

    if (!toFetch.length) {
      return;
    }

    let cancelled = false;
    const fieldRequestCache = new Map<string, Promise<Field | null>>();

    const getFieldInSelectionWindow = (
      fieldId: string,
      range: { start: Date; end: Date },
    ): Promise<Field | null> => {
      const cacheKey = `${fieldId}:${range.start.toISOString()}:${range.end.toISOString()}`;
      if (!fieldRequestCache.has(cacheKey)) {
        fieldRequestCache.set(cacheKey, (async () => {
          const sourceField = fieldsById.get(fieldId);
          if (!sourceField) {
            return null;
          }
          return fieldService.getFieldEventsMatches(sourceField, {
            start: range.start.toISOString(),
            end: range.end.toISOString(),
          }, {
            rentalOverlapOnly: true,
            includeMatches: false,
          });
        })());
      }
      return fieldRequestCache.get(cacheKey)!;
    };

    Promise.all(
      toFetch.map(async (input) => {
        try {
          let conflictCount = 0;
          await Promise.all(
            input.fieldIds.map(async (fieldId) => {
              const hydratedField = await getFieldInSelectionWindow(fieldId, input.dateRange);
              if (!hydratedField) {
                return;
              }
              const blockers = buildFieldCalendarEvents([hydratedField], input.dateRange)
                .filter((entry) => entry.metaType === 'booked');
              const hasConflict = blockers.some((blocker) => (
                compareRanges(
                  input.dateRange.start,
                  input.dateRange.end,
                  blocker.start,
                  blocker.end,
                )
              ));
              if (hasConflict) {
                conflictCount += 1;
              }
            }),
          );

          return {
            key: input.key,
            signature: input.signature,
            conflictCount,
            error: null,
          };
        } catch (error) {
          return {
            key: input.key,
            signature: input.signature,
            conflictCount: 0,
            error: error instanceof Error ? error.message : 'Failed to load conflict data.',
          };
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setSelectionConflictStateByKey((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          const current = next[result.key];
          if (!current || current.signature !== result.signature) {
            return;
          }
          next[result.key] = {
            signature: result.signature,
            conflictCount: result.conflictCount,
            loading: false,
            error: result.error,
          };
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [canManage, compareRanges, fields, selectionConflictInputs]);

  const conflictCountsBySelectionKey = useMemo(() => {
    const counts = new Map<string, number>();
    if (canManage) {
      return counts;
    }
    selectionConflictInputs.forEach((input) => {
      if (!input.signature) {
        return;
      }
      const conflictState = selectionConflictStateByKey[input.key];
      if (!conflictState || conflictState.signature !== input.signature || conflictState.loading) {
        return;
      }
      if (conflictState.conflictCount > 0) {
        counts.set(input.key, conflictState.conflictCount);
      }
    });
    return counts;
  }, [canManage, selectionConflictInputs, selectionConflictStateByKey]);

  const hasPendingConflictChecks = useMemo(() => {
    if (canManage) {
      return false;
    }
    return selectionConflictInputs.some((input) => {
      if (!input.signature) {
        return false;
      }
      const conflictState = selectionConflictStateByKey[input.key];
      return !conflictState
        || conflictState.signature !== input.signature
        || conflictState.loading;
    });
  }, [canManage, selectionConflictInputs, selectionConflictStateByKey]);

  const rentalSelectionValidations = useMemo<RentalSelectionValidation[]>(() => {
    if (canManage) {
      return [];
    }
    const fieldsById = new Map(fields.map((field) => [field.$id, field]));
    return rentalSelections.map((selectionItem) => {
      const normalizedFieldIds = normalizeFieldIds(selectionItem.scheduledFieldIds);
      const dateRange = resolveSelectionDateRange(selectionItem);
      const errors: string[] = [];
      const requiredTemplateIds = new Set<string>();
      const hostRequiredTemplateIds = new Set<string>();
      let totalCents = 0;

      if (!normalizedFieldIds.length) {
        errors.push('Select at least one resource.');
      }
      if (!dateRange) {
        errors.push('Select a valid start and end date/time.');
      }
      if (dateRange && isPastRentalRangeStart(dateRange.start)) {
        errors.push('Rental selections must start in the future.');
      }

      if (!errors.length && dateRange) {
        const durationMinutes = Math.max(
          1,
          Math.round((dateRange.end.getTime() - dateRange.start.getTime()) / (60 * 1000)),
        );
        normalizedFieldIds.forEach((fieldId) => {
          const field = fieldsById.get(fieldId);
          if (!field) {
            errors.push(`Resource ${fieldId} is unavailable.`);
            return;
          }
          const matchedRentalSlot = (field.rentalSlots || []).find((slot) => rentalSlotCoversDraftDay(slot, {
            selectionStart: dateRange.start,
            selectionEnd: dateRange.end,
          }));
          if (!matchedRentalSlot) {
            errors.push(
              `${getFacilityScopedFieldDisplayName(field)} is unavailable for ${formatDisplayDateTime(dateRange.start)} - ${formatDisplayDateTime(dateRange.end)}.`,
            );
            return;
          }
          if (typeof matchedRentalSlot.price === 'number' && matchedRentalSlot.price > 0) {
            totalCents += Math.round((matchedRentalSlot.price * durationMinutes) / 60);
          }
          (matchedRentalSlot.requiredTemplateIds || []).forEach((id) => {
            const normalized = String(id ?? '').trim();
            if (normalized.length > 0) {
              requiredTemplateIds.add(normalized);
            }
          });
          (matchedRentalSlot.hostRequiredTemplateIds || []).forEach((id) => {
            const normalized = String(id ?? '').trim();
            if (normalized.length > 0) {
              hostRequiredTemplateIds.add(normalized);
            }
          });
        });
      }

      const conflictCount = conflictCountsBySelectionKey.get(selectionItem.key) ?? 0;
      const conflictState = selectionConflictStateByKey[selectionItem.key];
      const conflictInput = selectionConflictInputByKey.get(selectionItem.key);
      const isConflictCheckPending = Boolean(
        conflictInput?.signature
        && (
          !conflictState
          || conflictState.signature !== conflictInput.signature
          || conflictState.loading
        ),
      );
      if (conflictCount > 0) {
        errors.push('Selection overlaps an existing event or match on at least one resource.');
      }
      if (conflictState?.error && conflictInput?.signature && conflictState.signature === conflictInput.signature) {
        errors.push('Unable to verify conflicts for this selection right now. Try again.');
      }

      return {
        selection: selectionItem,
        totalCents,
        totalHours: dateRange ? Math.max(0, (dateRange.end.getTime() - dateRange.start.getTime()) / (60 * 60 * 1000)) : 0,
        requiredTemplateIds: Array.from(requiredTemplateIds),
        hostRequiredTemplateIds: Array.from(hostRequiredTemplateIds),
        conflictCount,
        conflictCheckPending: isConflictCheckPending,
        errors,
      };
    });
  }, [canManage, conflictCountsBySelectionKey, fields, rentalSelections, selectionConflictInputByKey, selectionConflictStateByKey]);

  const rentalSelectionValidationByKey = useMemo(
    () => new Map(rentalSelectionValidations.map((validation) => [validation.selection.key, validation])),
    [rentalSelectionValidations],
  );

  const totalRentalCents = useMemo(
    () => rentalSelectionValidations.reduce((sum, validation) => sum + validation.totalCents, 0),
    [rentalSelectionValidations],
  );

  const rentalRequiredTemplateIds = useMemo(
    () => Array.from(new Set(rentalSelectionValidations.flatMap((validation) => validation.requiredTemplateIds))),
    [rentalSelectionValidations],
  );
  const rentalHostRequiredTemplateIds = useMemo(
    () => Array.from(new Set(rentalSelectionValidations.flatMap((validation) => validation.hostRequiredTemplateIds))),
    [rentalSelectionValidations],
  );

  const canReserveRentalResources = useMemo(() => {
    if (canManage || !currentUser) {
      return false;
    }
    if (hasPendingConflictChecks) {
      return false;
    }
    if (!rentalSelections.length || !rentalSelectionValidations.length) {
      return false;
    }
    return rentalSelectionValidations.every((validation) => validation.errors.length === 0);
  }, [canManage, currentUser, hasPendingConflictChecks, rentalSelectionValidations, rentalSelections.length]);

  const updateRentalSelection = useCallback(
    (selectionKey: string, updater: (selectionItem: RentalDraftSelection) => RentalDraftSelection) => {
      setRentalSelections((prev) => prev.map((selectionItem) => (
        selectionItem.key === selectionKey ? updater(selectionItem) : selectionItem
      )));
    },
    [],
  );

  const handleAddRentalSelection = useCallback(() => {
    const seedSelection = rentalSelections[0];
    const fallbackFieldId = seedSelection
      ? normalizeFieldIds(seedSelection.scheduledFieldIds)[0]
      : facilityFilteredFields[0]?.$id ?? fields[0]?.$id;
    if (!fallbackFieldId) {
      notifications.show({ color: 'red', message: 'No resources available for rental selection.' });
      return;
    }

    const seedRange = seedSelection ? resolveSelectionDateRange(seedSelection) : null;
    const defaultStart = getNextSelectableRentalStart();
    const durationMs = seedRange
      ? Math.max(PUBLIC_RENTAL_MIN_SELECTION_MS, seedRange.end.getTime() - seedRange.start.getTime())
      : PUBLIC_RENTAL_MIN_SELECTION_MS;
    const nextStart = seedRange && seedRange.end.getTime() > defaultStart.getTime()
      ? new Date(seedRange.end.getTime())
      : defaultStart;
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    setRentalSelections((prev) => [buildSelectionFromCalendarRange(nextStart, nextEnd, fallbackFieldId), ...prev]);
  }, [facilityFilteredFields, fields, rentalSelections]);

  const handleRemoveRentalSelection = useCallback((selectionKey: string) => {
    setRentalSelections((prev) => prev.filter((selectionItem) => selectionItem.key !== selectionKey));
  }, []);

  return {
    rentalSelections,
    setRentalSelections,
    rentalSelectionValidations,
    rentalSelectionValidationByKey,
    totalRentalCents,
    rentalRequiredTemplateIds,
    rentalHostRequiredTemplateIds,
    canReserveRentalResources,
    hasPendingConflictChecks,
    updateRentalSelection,
    handleAddRentalSelection,
    handleRemoveRentalSelection,
  };
}
