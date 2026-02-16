"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  SlotGroupPropGetter,
  View,
} from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { addHours, endOfDay, endOfMonth, endOfWeek, format, getDay, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import Loading from '@/components/ui/Loading';
import type { Field, Organization, TimeSlot, UserData } from '@/types';
import { formatPrice } from '@/types';
import { buildFieldCalendarEvents, type FieldCalendarEntry } from './fieldCalendar';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { notifications } from '@mantine/notifications';
import { organizationService } from '@/lib/organizationService';
import { createId } from '@/lib/id';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';
import { fieldService } from '@/lib/fieldService';
import CreateFieldModal from '@/components/ui/CreateFieldModal';
import CreateRentalSlotModal from '@/components/ui/CreateRentalSlotModal';

type SelectionState = {
  fieldId: string;
  start: Date;
  end: Date;
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
const MIN_SELECTION_MS = 60 * 60 * 1000;
const SELECTION_COLOR = '#FED7AA';
const SELECTION_BORDER_COLOR = '#FDBA74';

const minutesToDate = (base: Date, minutes: number): Date => {
  const copy = new Date(base.getTime());
  copy.setHours(0, 0, 0, 0);
  copy.setMinutes(minutes);
  return copy;
};

const compareRanges = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  Math.max(startA.getTime(), startB.getTime()) < Math.min(endA.getTime(), endB.getTime());

const slotMatchesSelection = (slot: TimeSlot, field: Field, selection: SelectionState): boolean => {
  const selectedStart = selection.start;
  const selectedEnd = selection.end;

  if (!slot.repeating) {
    const slotStartDate = parseLocalDateTime(slot.startDate ?? null);
    if (!slotStartDate) return false;
    const sameDay =
      slotStartDate.getFullYear() === selectedStart.getFullYear() &&
      slotStartDate.getMonth() === selectedStart.getMonth() &&
      slotStartDate.getDate() === selectedStart.getDate();
    if (!sameDay) return false;

    const slotStart = slot.startTimeMinutes !== undefined
      ? minutesToDate(selectedStart, slot.startTimeMinutes)
      : slotStartDate;
    const slotEnd = slot.endTimeMinutes !== undefined
      ? minutesToDate(selectedStart, slot.endTimeMinutes)
      : addHours(slotStart, 1);
    return selectedStart >= slotStart && selectedEnd <= slotEnd;
  }

  const dayIndex = ((selectedStart.getDay() + 6) % 7) as TimeSlot['dayOfWeek'];
  if (slot.dayOfWeek !== undefined && slot.dayOfWeek !== dayIndex) {
    return false;
  }

  const slotStart = slot.startTimeMinutes !== undefined
    ? minutesToDate(selectedStart, slot.startTimeMinutes)
    : minutesToDate(selectedStart, selectedStart.getHours() * 60 + selectedStart.getMinutes());
  const slotEnd = slot.endTimeMinutes !== undefined
    ? minutesToDate(selectedStart, slot.endTimeMinutes)
    : addHours(slotStart, 1);

  if (slot.endDate) {
    const endDate = parseLocalDateTime(slot.endDate);
    if (endDate && selectedStart.getTime() > endDate.getTime()) {
      return false;
    }
  }

  return selectedStart >= slotStart && selectedEnd <= slotEnd;
};

type FieldsTabContentProps = {
  organization: Organization;
  organizationId: string;
  currentUser: UserData | null;
};

export default function FieldsTabContent({ organization, organizationId, currentUser }: FieldsTabContentProps) {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(organization ?? null);
  const [orgLoading, setOrgLoading] = useState(!organization);
  const [orgError, setOrgError] = useState<string | null>(null);
  const organizationHasStripeAccount = Boolean(org?.hasStripeAccount);
  const canManage = Boolean(currentUser && org && currentUser.$id === org.ownerId);

  const localizer = useMemo(() => dateFnsLocalizer({
    format,
    parse: parse as any,
    startOfWeek,
    getDay,
    locales: {} as any,
  }), []);
  const DnDCalendar: any = useMemo(() => withDragAndDrop(BigCalendar), []);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [calendarView, setCalendarView] = useState<View>('week');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [hostOrganizations, setHostOrganizations] = useState<Organization[]>([]);
  const [hostOptionsLoading, setHostOptionsLoading] = useState(false);
  const [hostSelection, setHostSelection] = useState<string>('self');
  const [fieldEventsLoading, setFieldEventsLoading] = useState(false);
  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [editField, setEditField] = useState<Field | null>(null);
  const [createRentalOpen, setCreateRentalOpen] = useState(false);
  const [editingRentalSlot, setEditingRentalSlot] = useState<TimeSlot | null>(null);
  const [rentalDraftRange, setRentalDraftRange] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    setOrg(organization ?? null);
  }, [organization?.$id, organization]);

  useEffect(() => {
    if (organization) return;
    if (!organizationId) {
      setOrgError('No organization selected.');
      setOrg(null);
      setOrgLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setOrgLoading(true);
        setOrgError(null);
        const result = await organizationService.getOrganizationById(organizationId);
        if (cancelled) return;
        if (!result) {
          setOrgError('Organization not found.');
          setOrg(null);
        } else {
          setOrg(result);
        }
      } catch (error) {
        console.error('Failed to load organization:', error);
        if (!cancelled) {
          setOrgError('Failed to load organization. Please try again.');
          setOrg(null);
        }
      } finally {
        if (!cancelled) {
          setOrgLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organization, organizationId]);

  const fields = useMemo<Field[]>(() => org?.fields ?? [], [org?.fields]);
  const fieldOptions = useMemo(() => fields.map((field) => ({
    value: field.$id,
    label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
  })), [fields]);

  const rentalListings = useMemo(() => {
    if (!org) return [];
    const referenceDate = new Date();
    const listings: { field: Field; slot: TimeSlot; nextOccurrence: Date }[] = [];
    (org.fields || []).forEach((field) => {
      (field.rentalSlots || []).forEach((slot) => {
        const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
        if (!nextOccurrence) return;
        listings.push({ field, slot, nextOccurrence });
      });
    });
    listings.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
    return listings;
  }, [org]);

  useEffect(() => {
    if (!rentalListings.length) return;
    setSelection((prev) => {
      if (prev?.fieldId) return prev;
      const firstListing = rentalListings[0];
      const baseDate = new Date(firstListing.nextOccurrence);
      const startMinutes = baseDate.getHours() * 60 + baseDate.getMinutes();
      const endMinutes = typeof firstListing.slot.endTimeMinutes === 'number'
        ? firstListing.slot.endTimeMinutes
        : (firstListing.slot.startTimeMinutes ?? startMinutes + 60);
      const initialStart = minutesToDate(baseDate, startMinutes);
      const initialEndCandidate = minutesToDate(baseDate, endMinutes);
      const initialEnd = initialEndCandidate > initialStart ? initialEndCandidate : addHours(initialStart, 1);
      return {
        fieldId: firstListing.field.$id,
        start: initialStart,
        end: initialEnd,
      };
    });
    setCalendarDate((prev) => (prev ? prev : new Date(rentalListings[0].nextOccurrence)));
  }, [rentalListings]);

  useEffect(() => {
    if (selection?.fieldId) return;
    if (!fields.length) return;
    if (rentalListings.length) return;

    setSelection(() => {
      const start = new Date();
      start.setMinutes(0, 0, 0);
      const end = new Date(start.getTime() + MIN_SELECTION_MS);
      return { fieldId: fields[0].$id, start, end };
    });
  }, [fields, rentalListings.length, selection?.fieldId]);

  const selectedField = useMemo(() => {
    if (!selection) return null;
    return fields.find((field) => field.$id === selection.fieldId) ?? null;
  }, [fields, selection]);

  const refreshOrganization = useCallback(async () => {
    if (!organizationId) return;
    try {
      const updated = await organizationService.getOrganizationById(organizationId, true);
      if (updated) setOrg(updated);
    } catch (error) {
      console.warn('Failed to refresh organization:', error);
    }
  }, [organizationId]);

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

  const handleCalendarRangeChange = useCallback((range: any, _view?: View) => {
    if (!range || Array.isArray(range)) {
      return;
    }
    if (range?.start) {
      setCalendarDate(range.start);
    }
  }, []);

  const calendarEvents = useMemo<CalendarEventData[]>(() => {
    if (!selectedField || !selection) {
      return [];
    }
    const baseEvents = buildFieldCalendarEvents([selectedField], calendarRange) as FieldCalendarEntry[];

    const selectionStart = selection.start;
    const selectionEnd = selection.end;

    const selectionEvent: SelectionCalendarEntry = {
      id: `selection-${selectionStart.getTime()}`,
      title: canManage ? 'New Rental Slot' : 'Selected Rental',
      start: selectionStart,
      end: selectionEnd,
      resourceId: selection.fieldId,
      resource: { type: 'selection' },
      metaType: 'selection',
      fieldName: selectedField.name ?? `Field ${selectedField.fieldNumber}`,
    };

    return [...baseEvents, selectionEvent];
  }, [canManage, selectedField, calendarRange, selection]);

  const defaultTimeRange = useMemo<[number, number]>(() => [0, 24], []);
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
  const scrollToTime = useMemo(
    () => {
      const base = selection?.start ?? new Date();
      return new Date(1970, 0, 1, base.getHours() || 0, base.getMinutes() || 0, 0);
    },
    [selection?.start],
  );

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
      if (event.metaType === 'rental') {
        return {
          style: {
            backgroundColor: '#15803d',
            border: '1px solid #166534',
            color: '#ECFDF3',
          },
        };
      }
      return {};
    },
    [],
  );

  const existingConflicts = useMemo(() => {
    if (!selectedField || !selection) return [];
    const selectionStart = selection.start;
    const selectionEnd = selection.end;
    return calendarEvents.filter((event) => {
      if (event.metaType === 'selection' || event.metaType === 'rental') return false;
      return event.resourceId === selectedField.$id && compareRanges(selectionStart, selectionEnd, event.start, event.end);
    });
  }, [calendarEvents, selection, selectedField]);

  useEffect(() => {
    if (!selectedField || !calendarRange) return;
    let cancelled = false;

    (async () => {
      try {
        setFieldEventsLoading(true);
        const hydrated = await fieldService.getFieldEventsMatches(selectedField, {
          start: calendarRange.start.toISOString(),
          end: calendarRange.end ? calendarRange.end.toISOString() : undefined,
        });
        if (cancelled) return;

        setOrg((prev) => {
          if (!prev || !prev.fields) return prev;

          const existing = prev.fields.find((field) => field.$id === hydrated.$id);
          if (!existing) return prev;

          const eventsUnchanged =
            (existing.events?.length ?? 0) === (hydrated.events?.length ?? 0) &&
            (existing.events || []).every((event, idx) => event?.$id === hydrated.events?.[idx]?.$id);
          const matchesUnchanged =
            (existing.matches?.length ?? 0) === (hydrated.matches?.length ?? 0) &&
            (existing.matches || []).every((match, idx) => match?.$id === hydrated.matches?.[idx]?.$id);

          if (eventsUnchanged && matchesUnchanged) return prev;

          const nextFields = prev.fields.map((field) =>
            field.$id === hydrated.$id
              ? { ...field, events: hydrated.events, matches: hydrated.matches }
              : field,
          );
          return { ...prev, fields: nextFields };
        });
      } catch (error) {
        console.error('Failed to load events/matches for field', error);
      } finally {
        if (!cancelled) {
          setFieldEventsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedField, calendarRange]);

  const matchingRentalSlot = useMemo(() => {
    if (!selectedField || !selection) return null;

    return (selectedField.rentalSlots || []).find((slot) => slotMatchesSelection(slot, selectedField, selection)) || null;
  }, [selectedField, selection]);

  const isSelectionValid = Boolean(!canManage && selection && matchingRentalSlot && existingConflicts.length === 0);
  const summaryColor = useMemo(() => {
    if (!selectedField || !selection) return 'dimmed';
    if (canManage) {
      return existingConflicts.length ? 'yellow' : 'teal';
    }
    if (!currentUser) return 'dimmed';
    return isSelectionValid ? 'teal' : 'red';
  }, [canManage, existingConflicts.length, isSelectionValid, currentUser, selectedField, selection]);

  const summaryText = useMemo(() => {
    if (!selectedField || !selection) {
      return 'Select a field to continue.';
    }
    const startLabel = selection.start.toLocaleString();
    const endLabel = selection.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (canManage) {
      const conflictSuffix = existingConflicts.length ? ' (overlaps an event or match on this date)' : '';
      return `Draft slot: ${startLabel} – ${endLabel}${conflictSuffix}. Click \"Add Rental Slot\" to set price, or click an existing rental slot to edit.`;
    }

    if (!currentUser) {
      return 'Sign in to create an event.';
    }
    if (existingConflicts.length) {
      return 'Selected time overlaps an existing event or match.';
    }
    if (!matchingRentalSlot) {
      return 'Selected time does not match any available rental slot.';
    }
    const priceLabel = typeof matchingRentalSlot.price === 'number' ? formatPrice(matchingRentalSlot.price) : 'N/A';
    return `Selection: ${startLabel} – ${endLabel} · Price ${priceLabel} per hour`;
  }, [canManage, matchingRentalSlot, existingConflicts.length, selectedField, selection, currentUser]);

  const applySelectionWindow = useCallback(
    (start: Date, end: Date) => {
      setSelection((prev) => {
        if (!prev?.fieldId) return prev;
        const nextStart = new Date(start);
        const nextEnd = new Date(end);
        if (nextEnd.getTime() - nextStart.getTime() < MIN_SELECTION_MS) {
          nextEnd.setTime(nextStart.getTime() + MIN_SELECTION_MS);
        }
        return { ...prev, start: nextStart, end: nextEnd };
      });
      setCalendarDate(new Date(start));
    },
    [],
  );

  const handleSlotSelect = useCallback(
    (slotInfo: any) => {
      if (!slotInfo?.start) return;
      const slotStart = new Date(slotInfo.start);
      setSelection((prev) => {
        if (!prev?.fieldId) return prev;
        const duration = Math.max(MIN_SELECTION_MS, prev.end.getTime() - prev.start.getTime());
        const nextEnd = new Date(slotStart.getTime() + duration);
        return { ...prev, start: slotStart, end: nextEnd };
      });
      setCalendarDate(slotStart);
    },
    [],
  );

  const handleEventDrop = useCallback(
    ({ event, start, end }: any) => {
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      applySelectionWindow(new Date(start), new Date(end));
    },
    [applySelectionWindow],
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: any) => {
      if (!event || event.metaType !== 'selection' || !start || !end) return;
      applySelectionWindow(new Date(start), new Date(end));
    },
    [applySelectionWindow],
  );

  useEffect(() => {
    if (!currentUser) {
      setHostOrganizations([]);
      setHostSelection('self');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setHostOptionsLoading(true);
        const orgs = await organizationService.getOrganizationsByOwner(currentUser.$id);
        if (cancelled) return;
        setHostOrganizations(orgs);
        setHostSelection((prev) => {
          if (prev !== 'self' && !orgs.some((org) => org.$id === prev)) {
            return 'self';
          }
          return prev;
        });
      } catch (error) {
        console.warn('Failed to load organizations for user:', error);
        if (!cancelled) {
          setHostOrganizations([]);
          setHostSelection('self');
        }
      } finally {
        if (!cancelled) {
          setHostOptionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const hostSelectOptions = useMemo(() => {
    const base = [{ value: 'self', label: 'Host as Myself' }];
    if (!hostOrganizations.length) {
      return base;
    }
    return [
      ...base,
      ...hostOrganizations.map((org) => ({
        value: org.$id,
        label: org.name || 'Untitled Organization',
      })),
    ];
  }, [hostOrganizations]);

  const handleCreateEventClick = useCallback(() => {
    if (!currentUser) {
      notifications.show({ color: 'yellow', message: 'Sign in to create an event.' });
      return;
    }
    if (!selectedField || !isSelectionValid || !selection) {
      notifications.show({ color: 'red', message: 'Select a valid field and time before creating an event.' });
      return;
    }
    const selectionStart = selection.start;
    const selectionEnd = selection.end;
    const rentalPriceCents = matchingRentalSlot?.price;
    const rentalRequiredTemplateIds = Array.isArray(matchingRentalSlot?.requiredTemplateIds)
      ? matchingRentalSlot.requiredTemplateIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    const newId = createId();
    const params = new URLSearchParams();
    params.set('create', '1');
    params.set('rentalStart', formatLocalDateTime(selectionStart));
    params.set('rentalEnd', formatLocalDateTime(selectionEnd));
    params.set('rentalFieldId', selectedField.$id);
    params.set(
      'rentalFieldName',
      selectedField.name?.trim() || (selectedField.fieldNumber ? `Field ${selectedField.fieldNumber}` : 'Field'),
    );
    if (selectedField.fieldNumber !== undefined) {
      params.set('rentalFieldNumber', String(selectedField.fieldNumber));
    }
    if (selectedField.type) {
      params.set('rentalFieldType', selectedField.type);
    }
    if (selectedField.location) {
      params.set('rentalLocation', selectedField.location);
    }
    if (typeof selectedField.lat === 'number' && Number.isFinite(selectedField.lat)) {
      params.set('rentalLat', String(selectedField.lat));
    }
    if (typeof selectedField.long === 'number' && Number.isFinite(selectedField.long)) {
      params.set('rentalLng', String(selectedField.long));
    }
    if (typeof rentalPriceCents === 'number' && Number.isFinite(rentalPriceCents) && rentalPriceCents > 0) {
      params.set('rentalPriceCents', String(Math.round(rentalPriceCents)));
    }
    if (rentalRequiredTemplateIds.length > 0) {
      params.set('rentalRequiredTemplateIds', rentalRequiredTemplateIds.join(','));
    }
    if (org?.$id) {
      params.set('rentalOrgId', org.$id);
    }
    if (hostSelection && hostSelection !== 'self') {
      params.set('hostOrgId', hostSelection);
    }
    router.push(`/events/${newId}/schedule?${params.toString()}`);
  }, [
    currentUser,
    hostSelection,
    isSelectionValid,
    matchingRentalSlot?.price,
    matchingRentalSlot?.requiredTemplateIds,
    org?.$id,
    router,
    selectedField,
    selection,
  ]);

  const handleAddRentalSlotClick = useCallback(() => {
    if (!canManage) return;
    if (!selectedField || !selection) {
      notifications.show({ color: 'red', message: 'Select a field and time range first.' });
      return;
    }
    if (selection.start.toDateString() !== selection.end.toDateString()) {
      notifications.show({ color: 'red', message: 'Rental slots must stay within a single day. Adjust the selection.' });
      return;
    }

    setEditingRentalSlot(null);
    setRentalDraftRange({ start: selection.start, end: selection.end });
    setCreateRentalOpen(true);
  }, [canManage, selectedField, selection]);

  const handleSelectCalendarEvent = useCallback((event: any) => {
    if (!canManage) return;
    if (!event || event.metaType !== 'rental') return;
    if (!selectedField) return;

    const slot = event.resource as TimeSlot | undefined;
    if (!slot?.$id) return;
    setEditingRentalSlot(slot);
    setRentalDraftRange(null);
    setCreateRentalOpen(true);
  }, [canManage, selectedField]);

  const CalendarEvent: any = ({ event }: any) => {
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
        <div className="truncate">{title}</div>
      </div>
    );
  };

  if (orgLoading) {
    return <Loading fullScreen={false} text="Loading fields..." />;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Title order={5} mb={4}>
            {canManage ? 'Rental slots & pricing' : 'Field availability'}
          </Title>
          <Text c="dimmed">
            {canManage
              ? 'Select a range on the calendar to add rental slots (and prices). Click an existing slot to edit.'
              : 'Choose a field and drag the calendar to set your rental time.'}
          </Text>
        </div>

        {canManage && (
          <Group gap="xs" className="md:justify-end">
            <Button
              size="xs"
              onClick={() => {
                setEditField(null);
                setCreateFieldOpen(true);
              }}
            >
              + Field
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={!selectedField}
              onClick={() => {
                setEditingRentalSlot(null);
                setRentalDraftRange(selection ? { start: selection.start, end: selection.end } : null);
                setCreateRentalOpen(true);
              }}
            >
              + Rental Slot
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={!selectedField}
              onClick={() => {
                if (!selectedField) return;
                setEditField(selectedField);
                setCreateFieldOpen(true);
              }}
            >
              Edit field
            </Button>
          </Group>
        )}
      </div>

      {orgError && (
        <Alert color="red" mb="md">
          {orgError}
        </Alert>
      )}

      {!org || !(org.fields && org.fields.length) ? (
        <Paper withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Text c="dimmed">No fields available.</Text>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditField(null);
                  setCreateFieldOpen(true);
                }}
                style={{ alignSelf: 'flex-start' }}
              >
                Create your first field
              </Button>
            ) : (
              <Text size="sm" c="dimmed">
                Sign in as the organization owner to add fields and rental slots.
              </Text>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          <Select
            label="Field"
            data={fieldOptions}
            value={selection?.fieldId || null}
            onChange={(value) => {
              const nextValue = value ?? '';
              setSelection((prev) => {
                if (!nextValue) return null;
                if (!prev) {
                  const start = new Date();
                  const end = new Date(start.getTime() + MIN_SELECTION_MS);
                  return { fieldId: nextValue, start, end };
                }
                return { ...prev, fieldId: nextValue };
              });
            }}
            placeholder="Select a field"
            clearable
          />

          {!canManage && currentUser && (
            <Select
              label="Host Event As"
              data={hostSelectOptions}
              value={hostSelection}
              onChange={(value) => setHostSelection(value ?? 'self')}
              rightSection={hostOptionsLoading ? <Loader size="xs" /> : undefined}
              rightSectionWidth={hostOptionsLoading ? 36 : undefined}
              disabled={hostOptionsLoading && hostSelectOptions.length === 1}
            />
          )}

          <Text size="sm" c="dimmed">
            {canManage
              ? 'Click a time slot to move the draft block, drag it to adjust, then add a rental slot. Rental slots are shown in green.'
              : 'Scroll the calendar to the hours you want, click a time slot to move the rental, or drag the bottom edge of the highlighted block to adjust the end time.'}
          </Text>
          {fieldEventsLoading && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">Loading events and matches for this field…</Text>
            </Group>
          )}

          {selectedField && selection ? (
            <Paper withBorder radius="md" style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT, overflow: 'hidden' }}>
              <DnDCalendar
                localizer={localizer}
                events={calendarEvents}
                view={calendarView}
                date={calendarDate}
                onView={(view: any) => setCalendarView(view)}
                onNavigate={(date: any) => setCalendarDate(date)}
                onRangeChange={handleCalendarRangeChange}
                views={['week', 'day']}
                popup
                selectable
                resizable
                startAccessor="start"
                endAccessor="end"
                style={{ minHeight: MIN_FIELD_CALENDAR_HEIGHT }}
                slotGroupPropGetter={slotGroupPropGetter}
                min={minTime}
                max={maxTime}
                scrollToTime={scrollToTime}
                eventPropGetter={eventPropGetter}
                draggableAccessor={(event: CalendarEventData) => event.metaType === 'selection'}
                resizableAccessor={(event: CalendarEventData) => event.metaType === 'selection'}
                onEventDrop={handleEventDrop}
                onEventResize={handleEventResize}
                onSelectSlot={handleSlotSelect}
                onSelectEvent={handleSelectCalendarEvent}
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
          <Text size="sm" c={summaryColor}>
            {summaryText}
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => router.push('/discover')}>
              Back to Discover
            </Button>
            {canManage ? (
              <Button disabled={!selectedField || !selection} onClick={handleAddRentalSlotClick}>
                Add Rental Slot
              </Button>
            ) : (
              <Button disabled={!isSelectionValid || !currentUser} onClick={handleCreateEventClick}>
                Create Event
              </Button>
            )}
          </Group>
        </Stack>
      )}

      <CreateFieldModal
        isOpen={createFieldOpen}
        onClose={() => setCreateFieldOpen(false)}
        organization={org ?? undefined}
        field={editField}
        onFieldSaved={async (savedField) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const nextFields = prevFields.some((field) => field.$id === savedField.$id)
              ? prevFields.map((field) => (field.$id === savedField.$id ? savedField : field))
              : [...prevFields, savedField].sort((a, b) => (a.fieldNumber ?? 0) - (b.fieldNumber ?? 0));

            const prevIds = Array.isArray(prev.fieldIds) ? prev.fieldIds : [];
            const nextIds = Array.from(new Set([...prevIds, savedField.$id]));
            return { ...prev, fieldIds: nextIds, fields: nextFields };
          });

          setSelection(() => {
            const start = new Date();
            start.setMinutes(0, 0, 0);
            const end = new Date(start.getTime() + MIN_SELECTION_MS);
            return { fieldId: savedField.$id, start, end };
          });
          setCalendarDate(new Date());
          await refreshOrganization();
        }}
      />

      <CreateRentalSlotModal
        opened={createRentalOpen}
        onClose={() => {
          setCreateRentalOpen(false);
          setEditingRentalSlot(null);
          setRentalDraftRange(null);
        }}
        field={selectedField}
        slot={editingRentalSlot}
        initialRange={editingRentalSlot ? null : rentalDraftRange}
        onSaved={async (updatedField) => {
          setOrg((prev) => {
            if (!prev) return prev;
            const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
            const nextFields = prevFields.map((field) => (field.$id === updatedField.$id ? updatedField : field));
            return { ...prev, fields: nextFields };
          });
          await refreshOrganization();
        }}
        organizationHasStripeAccount={organizationHasStripeAccount}
        organizationId={organizationId}
      />
    </Paper>
  );
}
