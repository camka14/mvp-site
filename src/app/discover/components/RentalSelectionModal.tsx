"use client";

import { useCallback, useMemo, useState } from 'react';
import {
  Select,
  Group,
  Button,
  Text,
  Paper,
  RangeSlider,
  Divider,
  Drawer,
  ActionIcon,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  View,
  SlotGroupPropGetter,
} from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, getDay, parse, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addHours } from 'date-fns';

import type { Field, Organization, TimeSlot } from '@/types';
import { formatPrice } from '@/types';
import { buildFieldCalendarEvents, type FieldCalendarEntry } from '@/app/organizations/[id]/fieldCalendar';
import { parseLocalDateTime } from '@/lib/dateUtils';

type RentalListing = {
  organization: Organization;
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

interface RentalSelectionModalProps {
  opened: boolean;
  onClose: () => void;
  organization: Organization | null;
  listings: RentalListing[];
}

type SelectionState = {
  fieldId: string;
  date: Date;
  range: [number, number];
};

type SelectionCalendarEntry = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  resource: { type: 'selection' };
  metaType: 'selection';
  fieldName: string;
};

type CalendarEventData = FieldCalendarEntry | SelectionCalendarEntry;

const MIN_FIELD_CALENDAR_HEIGHT = 800;
const SELECTION_COLOR = '#FED7AA'; // matches Tailwind border-orange-200
const SELECTION_BORDER_COLOR = '#FDBA74';

const formatHourLabel = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return format(date, 'h a');
};

const minutesToDate = (base: Date, minutes: number): Date => {
  const copy = new Date(base.getTime());
  copy.setHours(0, 0, 0, 0);
  copy.setMinutes(minutes);
  return copy;
};

const normalizeDateInput = (value: Date | string | null): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  return null;
};

const compareRanges = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  Math.max(startA.getTime(), startB.getTime()) < Math.min(endA.getTime(), endB.getTime());

const slotMatchesSelection = (slot: TimeSlot, field: Field, selection: SelectionState): boolean => {
  const selectedDate = selection.date;
  const selectedStart = minutesToDate(selectedDate, selection.range[0] * 60);
  const selectedEnd = minutesToDate(selectedDate, selection.range[1] * 60);

  if (!slot.repeating) {
    const slotStartDate = parseLocalDateTime(slot.startDate ?? null);
    if (!slotStartDate) return false;
    const sameDay =
      slotStartDate.getFullYear() === selectedDate.getFullYear() &&
      slotStartDate.getMonth() === selectedDate.getMonth() &&
      slotStartDate.getDate() === selectedDate.getDate();
    if (!sameDay) return false;

    const slotStart = slot.startTimeMinutes !== undefined
      ? minutesToDate(selectedDate, slot.startTimeMinutes)
      : slotStartDate;
    const slotEnd = slot.endTimeMinutes !== undefined
      ? minutesToDate(selectedDate, slot.endTimeMinutes)
      : addHours(slotStart, 1);
    return selectedStart >= slotStart && selectedEnd <= slotEnd;
  }

  const dayIndex = ((selectedDate.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];
  if (slot.dayOfWeek !== undefined && slot.dayOfWeek !== dayIndex) {
    return false;
  }

  const slotStart = slot.startTimeMinutes !== undefined
    ? minutesToDate(selectedDate, slot.startTimeMinutes)
    : minutesToDate(selectedDate, (selection.range[0] ?? 8) * 60);
  const slotEnd = slot.endTimeMinutes !== undefined
    ? minutesToDate(selectedDate, slot.endTimeMinutes)
    : addHours(slotStart, 1);

  if (slot.endDate) {
    const endDate = parseLocalDateTime(slot.endDate);
    if (endDate && selectedStart.getTime() > endDate.getTime()) {
      return false;
    }
  }

  return selectedStart >= slotStart && selectedEnd <= slotEnd;
};

const RentalSelectionModal: React.FC<RentalSelectionModalProps> = ({ opened, onClose, organization, listings }) => {
  const localizer = useMemo(() => dateFnsLocalizer({
    format,
    parse: parse as any,
    startOfWeek,
    getDay,
    locales: {} as any,
  }), []);

  const CalendarEvent: any = ({ event }: any) => {
    const s: Date = event.start instanceof Date ? event.start : new Date(event.start);
    const e: Date = event.end instanceof Date ? event.end : new Date(event.end);
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
        <div className="truncate">{title}</div>
      </div>
    );
  };

  const fields = useMemo<Field[]>(() => organization?.fields ?? [], [organization]);
  const fieldOptions = useMemo(() => fields.map((field) => ({
    value: field.$id,
    label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
  })), [fields]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const firstListing = listings[0];
  const initialFieldId = firstListing?.field.$id ?? fieldOptions[0]?.value ?? '';
  const initialRange: [number, number] = firstListing
    ? [
        (firstListing.nextOccurrence.getHours() + firstListing.nextOccurrence.getMinutes() / 60) || 8,
        ((firstListing.slot.endTimeMinutes ?? ((firstListing.nextOccurrence.getHours() + 1) * 60)) / 60) || 10,
      ]
    : [8, 10];

  const [selection, setSelection] = useState<SelectionState>({
    fieldId: initialFieldId,
    date: today,
    range: initialRange,
  });
  const [calendarView, setCalendarView] = useState<View>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(today);

  const computeCalendarRange = useMemo(() => {
    return (view: View, date: Date) => {
      switch (view) {
        case 'day':
          return { start: startOfDay(date), end: endOfDay(date) };
        case 'month':
          return { start: startOfMonth(date), end: endOfMonth(date) };
        case 'agenda':
        case 'week':
        default:
          return {
            start: startOfWeek(date, { weekStartsOn: 0 }),
            end: endOfWeek(date, { weekStartsOn: 0 }),
          };
      }
    };
  }, []);

  const calendarRange = useMemo(() => computeCalendarRange(calendarView, calendarDate), [computeCalendarRange, calendarView, calendarDate]);

  const handleCalendarRangeChange = useCallback((range: any, view?: View) => {
    if (!range || Array.isArray(range)) {
      return;
    }
    if (range?.start) {
      setCalendarDate(range.start);
    }
  }, []);

  const selectedField = useMemo(() => fields.find((field) => field.$id === selection.fieldId) ?? null, [fields, selection.fieldId]);

  const calendarEvents = useMemo<CalendarEventData[]>(() => {
    if (!selectedField) {
      return [];
    }
    const baseEvents = buildFieldCalendarEvents([selectedField], calendarRange) as FieldCalendarEntry[];

    const [startHour, endHour] = selection.range;
    const selectionStart = minutesToDate(selection.date, startHour * 60);
    const selectionEnd = minutesToDate(selection.date, endHour * 60);

    const selectionEvent: SelectionCalendarEntry = {
      id: `selection-${selectionStart.getTime()}`,
      title: 'Selected Rental',
      start: selectionStart,
      end: selectionEnd,
      resourceId: selection.fieldId,
      resource: { type: 'selection' },
      metaType: 'selection',
      fieldName: selectedField.name ?? `Field ${selectedField.fieldNumber}`,
    };

    return [...baseEvents, selectionEvent];
  }, [selectedField, calendarRange, selection]);
  const defaultTimeRange = useMemo<[number, number]>(() => {
    if (!calendarEvents.length) {
      return [8, 22];
    }

    let earliest = 24;
    let latest = 0;
    calendarEvents.forEach((event) => {
      const startHour = event.start.getHours() + event.start.getMinutes() / 60;
      const endHour = event.end.getHours() + event.end.getMinutes() / 60;
      earliest = Math.min(earliest, startHour);
      latest = Math.max(latest, endHour);
    });

    const floor = Math.max(0, Math.floor(earliest));
    const ceil = Math.min(24, Math.ceil(latest));
    if (floor === ceil) {
      const adjusted = Math.min(24, floor + 1);
      return [Math.max(0, adjusted - 1), adjusted];
    }
    return [floor, ceil];
  }, [calendarEvents]);

  const visibleHourSpan = useMemo(() => Math.max(1, defaultTimeRange[1] - defaultTimeRange[0]), [defaultTimeRange]);

  const slotGroupPropGetter = useCallback<SlotGroupPropGetter>(() => {
    const baseHeight = MIN_FIELD_CALENDAR_HEIGHT / visibleHourSpan;
    return {
      style: {
        height: `${baseHeight}px`,
        minHeight: `${baseHeight}px`,
        flex: '0 0 auto',
      },
    };
  }, [visibleHourSpan]);

  const minTime = useMemo(() => new Date(1970, 0, 1, defaultTimeRange[0], 0, 0), [defaultTimeRange]);
  const maxTime = useMemo(() => {
    const hour = Math.min(24, Math.max(defaultTimeRange[1], defaultTimeRange[0] + 1));
    if (hour >= 24) {
      return new Date(1970, 0, 1, 23, 59, 59, 999);
    }
    return new Date(1970, 0, 1, hour, 0, 0);
  }, [defaultTimeRange]);
  const eventPropGetter = useCallback(
    (event: CalendarEventData) => {
      if (event.metaType === 'selection') {
        return {
          style: {
            backgroundColor: SELECTION_COLOR,
            border: `1px solid ${SELECTION_BORDER_COLOR}`,
            color: '#7C2D12',
          },
        };
      }
      return {};
    },
    [],
  );

  const existingConflicts = useMemo(() => {
    if (!selectedField) return [];
    const [startHour, endHour] = selection.range;
    const selectionStart = minutesToDate(selection.date, startHour * 60);
    const selectionEnd = minutesToDate(selection.date, endHour * 60);
    return calendarEvents.filter((event) => {
      if (event.metaType === 'selection' || event.metaType === 'rental') return false;
      return event.resourceId === selectedField.$id && compareRanges(selectionStart, selectionEnd, event.start, event.end);
    });
  }, [calendarEvents, selection, selectedField]);

  const matchingRentalSlot = useMemo(() => {
    if (!selectedField) return null;
    const [startHour, endHour] = selection.range;
    const selectionStart = minutesToDate(selection.date, startHour * 60);
    const selectionEnd = minutesToDate(selection.date, endHour * 60);

    return (selectedField.rentalSlots || []).find((slot) => slotMatchesSelection(slot, selectedField, selection)) || null;
  }, [selectedField, selection]);

  const isSelectionValid = matchingRentalSlot && existingConflicts.length === 0;

  const summaryText = useMemo(() => {
    if (!selectedField) {
      return 'Select a field to continue.';
    }
    if (existingConflicts.length) {
      return 'Selected time overlaps an existing event or match.';
    }
    if (!matchingRentalSlot) {
      return 'Selected time does not match any available rental slot.';
    }
    const startLabel = minutesToDate(selection.date, selection.range[0] * 60).toLocaleString();
    const endLabel = minutesToDate(selection.date, selection.range[1] * 60).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const priceLabel = typeof matchingRentalSlot.price === 'number' ? formatPrice(matchingRentalSlot.price) : 'N/A';
    return `Selection: ${startLabel} – ${endLabel} · Price ${priceLabel}`;
  }, [matchingRentalSlot, existingConflicts, selectedField, selection]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="100%"
      withCloseButton={false}
      styles={{
        content: {
          padding: '1.5rem',
          paddingBottom: '2rem',
          borderTopLeftRadius: '1rem',
          borderTopRightRadius: '1rem',
          height: 'calc(100vh - 80px)',
          overflow: 'auto',
        },
        inner: {
          alignItems: 'flex-end',
        },
      }}
      overlayProps={{ opacity: 0.45, blur: 3 }}
    >
      <div className="space-y-4">
        <Group justify="space-between" align="center">
          <div>
            <Text fw={700} size="lg">
              {organization?.name ?? 'Rental selection'}
            </Text>
            <Text size="sm" c="dimmed">
              Choose a field, date, and time to reserve a rental slot.
            </Text>
          </div>
          <ActionIcon variant="subtle" radius="xl" aria-label="Close" onClick={onClose}>
            ×
          </ActionIcon>
        </Group>

        <Group gap="md" align="flex-end">
          <Select
            label="Field"
            data={fieldOptions}
            value={selection.fieldId || null}
            onChange={(value) => {
              const nextValue = value ?? '';
              setSelection((prev) => ({ ...prev, fieldId: nextValue }));
            }}
            style={{ flex: 1 }}
            placeholder="Select a field"
            clearable
          />
          <DatePickerInput
            label="Date"
            value={selection.date}
            onChange={(value: Date | string | null) => {
              const nextDate = normalizeDateInput(value);
              if (!nextDate) {
                return;
              }
              setSelection((prev) => ({ ...prev, date: nextDate }));
              setCalendarDate(nextDate);
            }}
            popoverProps={{ withinPortal: true }}
          />
        </Group>

        <div>
          <Text size="sm" fw={600} mb={6}>
            Time Range
          </Text>
          <RangeSlider
            min={0}
            max={24}
            step={0.5}
            minRange={1}
            disabled={!selectedField}
            value={selection.range}
            onChange={(value) => setSelection((prev) => ({ ...prev, range: value as [number, number] }))}
            marks={[
              { value: 0, label: '12 AM' },
              { value: 6, label: '6 AM' },
              { value: 12, label: '12 PM' },
              { value: 18, label: '6 PM' },
              { value: 24, label: '12 AM' },
            ]}
            label={(value) => formatHourLabel(value)}
            size="sm"
          />
        </div>

        <Divider label="Availability" labelPosition="left" my="sm" />

        {selectedField ? (
          <Paper withBorder radius="md" style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT, overflow: 'hidden' }}>
            <BigCalendar
              localizer={localizer}
              events={calendarEvents}
              view={calendarView}
              date={calendarDate}
              onView={(view) => setCalendarView(view)}
              onNavigate={(date) => setCalendarDate(date)}
              onRangeChange={handleCalendarRangeChange}
              views={['week', 'day']}
              popup
              startAccessor="start"
              endAccessor="end"
              style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT }}
              slotGroupPropGetter={slotGroupPropGetter}
              min={minTime}
              max={maxTime}
              eventPropGetter={eventPropGetter}
              components={{ event: CalendarEvent }}
            />
          </Paper>
        ) : (
          <Paper
            withBorder
            radius="md"
            style={{
              minHeight: MIN_FIELD_CALENDAR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text c="dimmed">Select a field to view availability.</Text>
          </Paper>
        )}
        <Text size="sm" c={isSelectionValid ? 'teal' : 'red'}>
          {summaryText}
        </Text>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button disabled={!isSelectionValid} onClick={() => { /* TODO: trigger EventCreationModal and Payment flow */ }}>
            Create Event (TODO)
          </Button>
        </Group>
      </div>
    </Drawer>
  );
};

export default RentalSelectionModal;
