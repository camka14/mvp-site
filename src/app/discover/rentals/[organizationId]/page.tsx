"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Select,
  Group,
  Button,
  Text,
  Paper,
  Loader,
  Container,
  Title,
  Alert,
} from '@mantine/core';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  View,
  SlotGroupPropGetter,
} from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { format, getDay, parse, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addHours } from 'date-fns';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import type { Field, Organization, TimeSlot } from '@/types';
import { formatPrice } from '@/types';
import { buildFieldCalendarEvents, type FieldCalendarEntry } from '@/app/organizations/[id]/fieldCalendar';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { notifications } from '@mantine/notifications';
import { useApp } from '@/app/providers';
import { organizationService } from '@/lib/organizationService';
import { ID } from '@/app/appwrite';
import { getNextRentalOccurrence } from '@/app/discover/utils/rentals';

type RentalListing = {
  organization: Organization;
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
  distanceKm?: number;
};

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
const SELECTION_COLOR = '#FED7AA'; // matches Tailwind border-orange-200
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

export default function RentalSelectionPage() {
  const { user } = useApp();
  const router = useRouter();
  const params = useParams<{ organizationId?: string }>();
  const organizationId = params?.organizationId ?? '';
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setOrgLoading(true);
    setOrgError(null);
    if (!organizationId) {
      setOrgError('No organization selected.');
      setOrganization(null);
      setOrgLoading(false);
      return;
    }

    (async () => {
      try {
        const org = await organizationService.getOrganizationById(organizationId);
        if (cancelled) return;
        if (!org) {
          setOrgError('Organization not found.');
          setOrganization(null);
        } else {
          setOrganization(org);
        }
      } catch (error) {
        console.error('Failed to load organization:', error);
        if (!cancelled) {
          setOrgError('Failed to load organization. Please try again.');
          setOrganization(null);
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
  }, [organizationId]);

  const fields = useMemo<Field[]>(() => organization?.fields ?? [], [organization]);
  const fieldOptions = useMemo(() => fields.map((field) => ({
    value: field.$id,
    label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Field'),
  })), [fields]);

  const rentalListings = useMemo<RentalListing[]>(() => {
    if (!organization) return [];
    const referenceDate = new Date();
    const listings: RentalListing[] = [];
    (organization.fields || []).forEach((field) => {
      (field.rentalSlots || []).forEach((slot) => {
        const nextOccurrence = getNextRentalOccurrence(slot, referenceDate);
        if (!nextOccurrence) return;
        listings.push({ organization, field, slot, nextOccurrence });
      });
    });
    listings.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
    return listings;
  }, [organization]);

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

  const selectedField = useMemo(() => {
    if (!selection) return null;
    return fields.find((field) => field.$id === selection.fieldId) ?? null;
  }, [fields, selection]);

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
  }, [setCalendarDate]);

  const calendarEvents = useMemo<CalendarEventData[]>(() => {
    if (!selectedField || !selection) {
      return [];
    }
    const baseEvents = buildFieldCalendarEvents([selectedField], calendarRange) as FieldCalendarEntry[];

    const selectionStart = selection.start;
    const selectionEnd = selection.end;

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

  const matchingRentalSlot = useMemo(() => {
    if (!selectedField || !selection) return null;

    return (selectedField.rentalSlots || []).find((slot) => slotMatchesSelection(slot, selectedField, selection)) || null;
  }, [selectedField, selection]);

  const isSelectionValid = Boolean(selection && matchingRentalSlot && existingConflicts.length === 0);
  const summaryColor = !selectedField || !selection || !user ? 'dimmed' : (isSelectionValid ? 'teal' : 'red');

  const summaryText = useMemo(() => {
    if (!selectedField || !selection) {
      return 'Select a field to continue.';
    }
    if (!user) {
      return 'Sign in to create a rental event.';
    }
    if (existingConflicts.length) {
      return 'Selected time overlaps an existing event or match.';
    }
    if (!matchingRentalSlot) {
      return 'Selected time does not match any available rental slot.';
    }
    const startLabel = selection.start.toLocaleString();
    const endLabel = selection.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const priceLabel = typeof matchingRentalSlot.price === 'number' ? formatPrice(matchingRentalSlot.price) : 'N/A';
    return `Selection: ${startLabel} – ${endLabel} · Price ${priceLabel} per hour`;
  }, [matchingRentalSlot, existingConflicts, selectedField, selection, user]);

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
    if (!user) {
      setHostOrganizations([]);
      setHostSelection('self');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setHostOptionsLoading(true);
        const orgs = await organizationService.getOrganizationsByOwner(user.$id);
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
  }, [user]);

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
    if (!user) {
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
    const newId = ID.unique();
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
    if (typeof rentalPriceCents === 'number' && Number.isFinite(rentalPriceCents)) {
      params.set('rentalPriceCents', String(Math.round(rentalPriceCents)));
    }
    if (organization?.$id) {
      params.set('orgId', organization.$id);
    }
    router.push(`/events/${newId}/schedule?${params.toString()}`);
  }, [isSelectionValid, matchingRentalSlot?.price, organization?.$id, router, selectedField, selection, user]);

  const CalendarEvent: any = ({ event }: any) => {
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
        <div className="truncate">{title}</div>
      </div>
    );
  };

  if (orgLoading) {
    return <Loading fullScreen text="Loading rental selection..." />;
  }

  return (
    <>
      <Navigation />
      <Container size="lg" py="xl">
        <Group justify="space-between" align="flex-start" mb="lg">
          <div>
            <Title order={2} mb={4}>
              Rental Selection
            </Title>
            <Text c="dimmed">
              {organization ? `Choose a field at ${organization.name} and drag the calendar to set your rental time.` : 'Select a rental slot.'}
            </Text>
          </div>
          <Group gap="xs">
            <Button variant="subtle" onClick={() => router.push('/discover')}>Back to Discover</Button>
          </Group>
        </Group>

        {orgError && (
          <Alert color="red" mb="md">
            {orgError}
          </Alert>
        )}

        {!organization ? (
          <Paper withBorder radius="md" p="lg">
            <Text c="dimmed">No organization data available.</Text>
          </Paper>
        ) : (
          <div className="space-y-4">
            <Select
              label="Field"
              data={fieldOptions}
              value={selection?.fieldId || null}
              onChange={(value) => {
                const nextValue = value ?? '';
                setSelection((prev) => {
                  if (!prev) return null;
                  return { ...prev, fieldId: nextValue };
                });
              }}
              placeholder="Select a field"
              clearable
            />

            {user && (
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
              Scroll the calendar to the hours you want, click a time slot to move the rental, or drag the bottom edge of the highlighted block to adjust the end time.
            </Text>

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
              <Button variant="default" onClick={() => router.push('/discover')}>Cancel</Button>
              <Button disabled={!isSelectionValid || !user} onClick={handleCreateEventClick}>
                Create Event
              </Button>
            </Group>
          </div>
        )}
      </Container>
    </>
  );
}
