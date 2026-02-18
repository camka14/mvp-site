'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Modal, MultiSelect, NumberInput, Stack, Switch, Text } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import type { Field, TimeSlot } from '@/types';
import { fieldService, type ManageRentalSlotResult } from '@/lib/fieldService';
import { apiRequest } from '@/lib/apiClient';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';

interface CreateRentalSlotModalProps {
  opened: boolean;
  onClose: () => void;
  field: Field | null;
  slot?: TimeSlot | null;
  /**
   * Optional calendar range to seed the form when creating a new slot.
   * Only used when `slot` is not provided.
   */
  initialRange?: { start: Date; end: Date } | null;
  onSaved?: (field: Field) => void;
  organizationHasStripeAccount?: boolean;
  organizationId?: string | null;
}

const toTimeValue = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseTimeValue = (value: string): number | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

type RentalSlotUpsertInput = Partial<TimeSlot> & {
  dayOfWeek: NonNullable<TimeSlot['dayOfWeek']>;
};

type RentalSlotUpdateInput = RentalSlotUpsertInput & {
  $id: string;
};

const toMondayBasedDay = (date: Date): NonNullable<TimeSlot['dayOfWeek']> => {
  const jsDay = date.getDay(); // 0 => Sunday
  const mondayBased = (jsDay + 6) % 7;
  return mondayBased as NonNullable<TimeSlot['dayOfWeek']>;
};

const coerceDateValue = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  return parseLocalDateTime(value as string | Date | null);
};

const minutesToTimeValue = (minutes: number): string => {
  const normalized = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const cloneWithMinutes = (dateInput: Date | null, minutes: number): Date => {
  const date = coerceDateValue(dateInput);
  if (!date) {
    throw new Error('Invalid date value');
  }

  const cloned = new Date(date.getTime());
  cloned.setHours(0, 0, 0, 0);
  cloned.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return cloned;
};

export default function CreateRentalSlotModal({
  opened,
  onClose,
  field,
  slot,
  initialRange = null,
  onSaved,
  organizationHasStripeAccount = false,
  organizationId = null,
}: CreateRentalSlotModalProps) {
  const now = useMemo(() => {
    const current = new Date();
    current.setMinutes(0, 0, 0);
    return current;
  }, []);

  const defaultEnd = useMemo(() => {
    const base = new Date(now.getTime());
    base.setHours(base.getHours() + 1);
    return base;
  }, [now]);

  const [startDate, setStartDate] = useState<Date | null>(now);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<string>(toTimeValue(now));
  const [endTime, setEndTime] = useState<string>(toTimeValue(defaultEnd));
  const [repeating, setRepeating] = useState<boolean>(false);
  const [price, setPrice] = useState<number | null>(null);
  const [requiredTemplateIds, setRequiredTemplateIds] = useState<string[]>([]);
  const [templateOptions, setTemplateOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }

    setSubmitting(false);
    setError(null);

    if (slot) {
      const parsedStartRaw = parseLocalDateTime(slot.startDate ?? null) ?? new Date();
      parsedStartRaw.setHours(0, 0, 0, 0);
      const parsedStart = new Date(parsedStartRaw.getTime());
      setStartDate(parsedStart);

      if (slot.repeating) {
        const startMinutes = typeof slot.startTimeMinutes === 'number' ? slot.startTimeMinutes : 8 * 60;
        const endMinutes = typeof slot.endTimeMinutes === 'number' ? slot.endTimeMinutes : startMinutes + 60;
        setStartTime(minutesToTimeValue(startMinutes));
        setEndTime(minutesToTimeValue(endMinutes));
        const parsedEnd = slot.endDate ? parseLocalDateTime(slot.endDate) : null;
        setEndDate(parsedEnd ? new Date(parsedEnd.getTime()) : null);
      } else {
        const parsedEndRaw = parseLocalDateTime(slot.endDate ?? slot.startDate ?? null);
        const parsedEnd = parsedEndRaw ? new Date(parsedEndRaw.getTime()) : null;
        setEndDate(parsedEnd);
        setStartTime(toTimeValue(parsedStart));
        setEndTime(toTimeValue(parsedEnd ?? parsedStart));
      }

      setRepeating(Boolean(slot.repeating));
      setPrice(
        organizationHasStripeAccount && typeof slot.price === 'number'
          ? slot.price / 100
          : null,
      );
      setRequiredTemplateIds(
        Array.isArray(slot.requiredTemplateIds)
          ? slot.requiredTemplateIds.map((id) => String(id)).filter((id) => id.length > 0)
          : [],
      );
      return;
    }

    if (initialRange?.start instanceof Date && initialRange?.end instanceof Date) {
      const rangeStart = new Date(initialRange.start.getTime());
      rangeStart.setSeconds(0, 0);
      const rangeEnd = new Date(initialRange.end.getTime());
      rangeEnd.setSeconds(0, 0);

      const startDay = new Date(rangeStart.getTime());
      startDay.setHours(0, 0, 0, 0);

      setStartDate(startDay);
      setEndDate(null);
      setStartTime(toTimeValue(rangeStart));
      setEndTime(toTimeValue(rangeEnd));
      setRepeating(true);
      setPrice(null);
      setRequiredTemplateIds([]);
      return;
    }

    const baseDate = new Date();
    baseDate.setMinutes(0, 0, 0);
    const baseEnd = new Date(baseDate.getTime());
    baseEnd.setHours(baseEnd.getHours() + 1);
    setStartDate(baseDate);
    setEndDate(null);
    setStartTime(toTimeValue(baseDate));
    setEndTime(toTimeValue(baseEnd));
    setRepeating(false);
    setPrice(null);
    setRequiredTemplateIds([]);
  }, [opened, slot, initialRange, organizationHasStripeAccount]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    if (!organizationId) {
      setTemplateOptions([]);
      setTemplatesLoading(false);
      return;
    }

    let cancelled = false;
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const response = await apiRequest<{ templates?: any[] }>(
          `/api/organizations/${organizationId}/templates`,
        );
        if (cancelled) {
          return;
        }
        const rows = Array.isArray(response.templates) ? response.templates : [];
        const options = rows
          .map((row) => ({
            value: String(row.$id ?? row.id ?? '').trim(),
            label: String(row.title ?? 'Untitled template'),
            status: String(row.status ?? '').toUpperCase(),
          }))
          .filter((row) => row.value.length > 0)
          .filter((row) => row.status !== 'ARCHIVED')
          .map(({ value, label }) => ({ value, label }));
        setTemplateOptions(options);
      } catch (loadError) {
        console.warn('Failed to load organization templates for rental slot:', loadError);
        if (!cancelled) {
          setTemplateOptions([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    };

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [opened, organizationId]);

  useEffect(() => {
    if (!organizationHasStripeAccount) {
      setPrice(null);
    }
  }, [organizationHasStripeAccount]);

  useEffect(() => {
    if (!repeating && startDate && !endDate) {
      setEndDate(new Date(startDate.getTime()));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDate(new Date(startDate.getTime()));
    }
  }, [startDate, endDate, repeating]);

  const handleClose = () => {
    if (submitting) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!field) {
      setError('A field is required to create a rental slot.');
      return;
    }
    if (!startDate) {
      setError('Select a start date for this rental.');
      return;
    }
    const startDateValue = coerceDateValue(startDate);

    if (!startDateValue) {
      setError('Select a valid start date for this rental.');
      return;
    }

    const endDateValue = coerceDateValue(endDate);

    if (!repeating && !endDateValue) {
      setError('End date is required when the slot does not repeat weekly.');
      return;
    }

    const startMinutes = parseTimeValue(startTime);
    const endMinutes = parseTimeValue(endTime);

    if (repeating && startMinutes === null) {
      setError('Enter a valid start time.');
      return;
    }

    if (repeating && endMinutes === null) {
      setError('Enter a valid end time.');
      return;
    }

    const startDateTime = repeating && startMinutes !== null
      ? cloneWithMinutes(startDateValue, startMinutes)
      : new Date(startDateValue.getTime());
    if (!repeating) {
      startDateTime.setHours(0, 0, 0, 0);
    }

    const effectiveEndDate = endDateValue ?? startDateValue;
    const endDateTime = repeating && endMinutes !== null
      ? cloneWithMinutes(effectiveEndDate, endMinutes)
      : new Date(effectiveEndDate.getTime());
    if (!repeating) {
      endDateTime.setHours(0, 0, 0, 0);
    }

    if (
      repeating &&
      !endDateValue &&
      endMinutes !== null &&
      startMinutes !== null &&
      endMinutes <= startMinutes
    ) {
      setError('When the slot repeats weekly without an end date, the end time must be after the start time.');
      return;
    }

    const compare = endDateTime.getTime() - startDateTime.getTime();
    const isInvalidRange = repeating ? compare <= 0 : compare < 0;
    if (isInvalidRange) {
      setError('End date/time must be after the start date/time.');
      return;
    }

    const dayOfWeek = toMondayBasedDay(startDateTime);

    setSubmitting(true);
    setError(null);
    try {
      const payload: RentalSlotUpsertInput = {
        dayOfWeek,
        repeating,
        startDate: formatLocalDateTime(startDateTime),
        endDate: endDateValue ? formatLocalDateTime(endDateTime) : null,
        startTimeMinutes: repeating && startMinutes !== null ? startMinutes : undefined,
        endTimeMinutes: repeating && endMinutes !== null ? endMinutes : undefined,
        requiredTemplateIds,
        price:
          organizationHasStripeAccount && price !== null
            ? Math.round(price * 100)
            : undefined,
      };

      let result: ManageRentalSlotResult;
      if (slot) {
        const updatePayload: RentalSlotUpdateInput = {
          $id: slot.$id,
          dayOfWeek: payload.dayOfWeek,
          repeating: payload.repeating ?? false,
          startDate: payload.startDate,
          endDate: payload.endDate ?? null,
          startTimeMinutes: payload.startTimeMinutes,
          endTimeMinutes: payload.endTimeMinutes,
          requiredTemplateIds: payload.requiredTemplateIds,
          price: organizationHasStripeAccount ? payload.price : undefined,
        };
        result = await fieldService.updateRentalSlot(field, updatePayload);
      } else {
        result = await fieldService.createRentalSlot(field, payload);
      }

      onSaved?.(result.field);
      onClose();
    } catch (err) {
      console.error('Failed to save rental slot:', err);
      setError('Failed to save rental slot. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title={slot ? 'Edit Rental Slot' : 'Add Rental Slot'} size="lg" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <div>
            <Text fw={500}>Field</Text>
            <Text size="sm" c="dimmed">
              {field ? field.name || `Field ${field.fieldNumber ?? ''}` : 'Select a field to continue'}
            </Text>
          </div>

          <DatePickerInput
            label="Start date"
            placeholder="Pick a date"
            valueFormat="MM/DD/YYYY"
            value={startDate}
            onChange={(value) => {
              const next = coerceDateValue(value);
              setStartDate(next);
              if (!repeating && next && !endDate) {
                setEndDate(new Date(next.getTime()));
              }
            }}
            required
            disabled={!field}
            popoverProps={{ withinPortal: true }}
          />

          <DatePickerInput
            label={repeating ? 'End date (optional)' : 'End date'}
            placeholder="Pick an end date"
            valueFormat="MM/DD/YYYY"
            value={endDate}
            onChange={(value) => setEndDate(coerceDateValue(value))}
            clearable={repeating}
            clearButtonProps={{ 'aria-label': 'Clear end date' }}
            disabled={!field}
            required={!repeating}
            popoverProps={{ withinPortal: true }}
            minDate={startDate ?? undefined}
          />

          {repeating && (
            <Group grow>
              <TimeInput
                label="Start time"
                withSeconds={false}
                value={startTime}
                onChange={(value) => setStartTime(value.currentTarget.value)}
                disabled={!field}
                required
              />
              <TimeInput
                label="End time"
                withSeconds={false}
                value={endTime}
                onChange={(value) => setEndTime(value.currentTarget.value)}
                disabled={!field}
                required
              />
            </Group>
          )}

          <div>
            <NumberInput
              label="Price (optional, USD)"
              value={organizationHasStripeAccount ? price ?? undefined : undefined}
              onChange={(val) => {
                if (!organizationHasStripeAccount) {
                  setPrice(null);
                  return;
                }
                if (typeof val === 'number') {
                  setPrice(val);
                  return;
                }
                if (val === '' || val === null || val === undefined) {
                  setPrice(null);
                  return;
                }
                const numeric = Number(val);
                setPrice(Number.isFinite(numeric) ? numeric : null);
              }}
              min={0}
              step={1}
              disabled={!field || !organizationHasStripeAccount}
            />
            {!organizationHasStripeAccount && (
              <Text size="xs" c="dimmed" mt={4}>
                Connect a Stripe account to charge for rentals.
              </Text>
            )}
          </div>

          <div>
            <MultiSelect
              label="Required templates (optional)"
              data={templateOptions}
              value={requiredTemplateIds}
              onChange={setRequiredTemplateIds}
              placeholder={templatesLoading ? 'Loading templates...' : 'Select templates'}
              searchable
              clearable
              disabled={!field || !organizationId || templatesLoading}
              nothingFoundMessage="No templates found"
            />
            {!templatesLoading && organizationId && templateOptions.length === 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                No templates available for this organization yet.
              </Text>
            )}
          </div>

          <Switch
            label="Repeats weekly"
            checked={repeating}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              setRepeating(next);
              setError(null);
              if (next) {
                setEndDate(null);
              } else if (startDate) {
                setEndDate((prev) => prev ?? new Date(startDate.getTime()));
              }
            }}
            disabled={!field}
          />

          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!field || submitting}>
              {submitting ? 'Saving…' : slot ? 'Save Rental Slot' : 'Create Rental Slot'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
