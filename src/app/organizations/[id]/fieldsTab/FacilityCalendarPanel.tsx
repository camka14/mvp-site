"use client";

import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useContext,
} from 'react';
import { Loader, Paper, Text } from '@mantine/core';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type SlotGroupPropGetter,
  type View,
} from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import type { EntityColorReferenceValue } from '@/lib/entityColors';
import { formatDisplayDate, formatDisplayTime } from '@/lib/dateUtils';
import type { FacilityCalendarFeedItem } from '../fieldCalendar';
import type {
  CalendarEventData,
  ManagerCalendarDraft,
  ManagerCalendarSelectionMode,
  SelectionCalendarEntry,
} from './facilityCalendarTypes';

const DnDCalendar: any = withDragAndDrop(BigCalendar);

const localizer = dateFnsLocalizer({
  format,
  parse: parse as any,
  startOfWeek,
  getDay,
  locales: {} as any,
});

const FIELD_CALENDAR_FORMATS = {
  dayFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayHeaderFormat: (value: Date) => formatDisplayDate(value, { year: '2-digit' }),
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayDate(start, { year: '2-digit' })} - ${formatDisplayDate(end, { year: '2-digit' })}`,
  timeGutterFormat: (value: Date) => formatDisplayTime(value),
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`,
};

const CALENDAR_VIEW_LABELS: Record<string, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
  work_week: 'Work week',
};

const formatFacilityFeedStatus = (item: FacilityCalendarFeedItem): string | null => {
  if (item.unresolved) {
    return 'Unresolved';
  }
  if (!item.status) {
    return null;
  }
  return item.status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
};

type FacilityCalendarPanelContextValue = {
  canManage: boolean;
  managerCalendarEditMode: boolean;
  fieldEventsLoading: boolean;
  fieldColorReferenceList: EntityColorReferenceValue[];
  managerDraftDragId: string | null;
  managerSelectionTitles: Record<ManagerCalendarSelectionMode, string>;
  getCalendarEventVariant: (event: CalendarEventData | null | undefined) => SharedCalendarEventVariant;
  onManagerDraftClick: (draftId: string, fallbackDraft: ManagerCalendarDraft | null) => void;
  onManagerDraftPointerDown: (entry: SelectionCalendarEntry, event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onManagerDraftPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isStaffAssignmentActivationSuppressed: () => boolean;
  onOpenStaffAssignmentEdit: (item: FacilityCalendarFeedItem, start: Date, end: Date) => void;
};

const FacilityCalendarPanelContext = createContext<FacilityCalendarPanelContextValue | null>(null);

const useFacilityCalendarPanelContext = () => {
  const value = useContext(FacilityCalendarPanelContext);
  if (!value) {
    throw new Error('FacilityCalendarPanel context is missing.');
  }
  return value;
};

function FacilityCalendarEvent({ event }: { event: CalendarEventData }) {
  const {
    canManage,
    managerCalendarEditMode,
    fieldColorReferenceList,
    managerDraftDragId,
    managerSelectionTitles,
    getCalendarEventVariant,
    onManagerDraftClick,
    onManagerDraftPointerDown,
    onManagerDraftPointerMove,
    onManagerDraftPointerUp,
    onManagerDraftPointerCancel,
    isStaffAssignmentActivationSuppressed,
    onOpenStaffAssignmentEdit,
  } = useFacilityCalendarPanelContext();

  const normalizedFieldName = typeof event?.fieldName === 'string' ? event.fieldName.trim() : '';
  const resource = event?.resource as any;
  const resourceName = typeof resource?.name === 'string' ? resource.name.trim() : '';
  const matchLabel = typeof resource?.matchId === 'number' ? `Match #${resource.matchId}` : '';
  const timeLabel = event?.start && event?.end
    ? `${formatDisplayTime(event.start)} - ${formatDisplayTime(event.end)}`
    : null;

  const variant = getCalendarEventVariant(event);
  let title = event.title;
  let meta = timeLabel;
  if (event?.metaType === 'facility-feed') {
    const feedItem = event.resource as FacilityCalendarFeedItem;
    const status = formatFacilityFeedStatus(feedItem);
    title = feedItem.title || event.title;
    meta = status ?? timeLabel;
  } else if (event?.metaType === 'booked') {
    const isRentalBooking = variant === 'reservation';
    const isUnavailable = variant === 'unavailable';
    title = isUnavailable ? 'Unavailable' : isRentalBooking ? 'Rental reservation' : resourceName || matchLabel || 'Booked slot';
    meta = isUnavailable ? timeLabel : isRentalBooking ? 'Reserved' : 'Booked';
  } else if (event?.metaType === 'rental') {
    const isUnavailable = variant === 'unavailable';
    title = isUnavailable ? 'Past rental slot' : 'Open rental slot';
    meta = isUnavailable ? 'Unavailable' : timeLabel;
  } else if (event?.metaType === 'selection' && canManage) {
    const mode = event.selectionMode ?? resource?.mode;
    const isAssignedStaffDraft = (
      (mode === 'staff_assignment' || mode === 'official_assignment')
      && Boolean(resource?.userId)
    );
    title = isAssignedStaffDraft
      ? event.title
      : managerSelectionTitles[mode as ManagerCalendarSelectionMode] ?? event.title;
    meta = 'Unsaved';
  }
  const isManagerDraft = Boolean(
    canManage
    && managerCalendarEditMode
    && event?.metaType === 'selection'
    && typeof resource?.slotKey === 'string'
    && resource.slotKey.length > 0
    && (event.selectionMode || resource?.mode),
  );
  const isStaffAssignmentFeedEvent = Boolean(
    canManage
    && event?.metaType === 'facility-feed'
    && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment')
    && event.start
    && event.end
    && event.resource,
  );
  const isEditableStaffAssignmentFeedEvent = Boolean(isStaffAssignmentFeedEvent && managerCalendarEditMode);

  return (
    <SharedCalendarEvent
      title={title}
      subtitle={normalizedFieldName || undefined}
      meta={meta}
      colorReferenceList={fieldColorReferenceList}
      colorMatchKey={event?.resourceId}
      resourceColorMatchKeys={event?.resourceId ? [event.resourceId] : undefined}
      dataAttributes={{
        ...(isStaffAssignmentFeedEvent ? {
          'data-staff-assignment-calendar-event-id': String(event.id),
        } : {}),
        ...(isManagerDraft && typeof resource?.slotKey === 'string' ? {
          'data-manager-draft-id': resource.slotKey,
        } : {}),
      }}
      compact
      draggable={
        isManagerDraft
        || isEditableStaffAssignmentFeedEvent
        || (canManage && managerCalendarEditMode && event?.metaType === 'rental')
      }
      selected={isManagerDraft && managerDraftDragId === resource?.slotKey}
      conflict={variant === 'conflict'}
      variant={variant}
      onClick={isManagerDraft
        ? () => {
            const draftId = typeof resource?.slotKey === 'string' ? resource.slotKey : '';
            if (draftId) {
              const selectionEvent = event as SelectionCalendarEntry;
              const mode = selectionEvent.selectionMode ?? selectionEvent.resource?.mode;
              const fallbackDraft = mode
                ? {
                    id: draftId,
                    mode,
                    fieldIds: selectionEvent.resourceId ? [selectionEvent.resourceId] : [],
                    start: new Date(selectionEvent.start),
                    end: new Date(selectionEvent.end),
                    ...(mode === 'rental'
                      ? { rental: {} }
                      : {
                          staff: {
                            userId: resource?.userId ?? null,
                            userName: typeof event.title === 'string' ? event.title : null,
                          },
                        }),
                  } satisfies ManagerCalendarDraft
                : null;
              onManagerDraftClick(draftId, fallbackDraft);
            }
          }
        : isStaffAssignmentFeedEvent
          ? () => {
            if (isStaffAssignmentActivationSuppressed()) {
              return;
            }
            onOpenStaffAssignmentEdit(event.resource as FacilityCalendarFeedItem, event.start, event.end);
          }
        : undefined}
      onMouseDown={undefined}
      onPointerDown={isManagerDraft ? (pointerEvent) => onManagerDraftPointerDown(event as SelectionCalendarEntry, pointerEvent) : undefined}
      onPointerMove={isManagerDraft ? onManagerDraftPointerMove : undefined}
      onPointerUp={isManagerDraft
        ? onManagerDraftPointerUp
        : isStaffAssignmentFeedEvent && !managerCalendarEditMode
          ? (pointerEvent) => {
              if (isStaffAssignmentActivationSuppressed()) {
                pointerEvent.preventDefault();
                pointerEvent.stopPropagation();
                return;
              }
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
              onOpenStaffAssignmentEdit(event.resource as FacilityCalendarFeedItem, event.start, event.end);
            }
          : undefined}
      onPointerCancel={isManagerDraft ? onManagerDraftPointerCancel : undefined}
    />
  );
}

function FacilityCalendarToolbar(toolbar: any) {
  const { fieldEventsLoading } = useFacilityCalendarPanelContext();
  const views = Array.isArray(toolbar.views)
    ? toolbar.views
    : Object.keys(toolbar.views || {}).filter((viewKey) => Boolean(toolbar.views?.[viewKey]));

  return (
    <div className="rbc-toolbar">
      <span className="rbc-btn-group flex items-center gap-1">
        <button type="button" onClick={() => toolbar.onNavigate('PREV')}>Back</button>
        <button type="button" onClick={() => toolbar.onNavigate('TODAY')}>Today</button>
        <button type="button" onClick={() => toolbar.onNavigate('NEXT')}>Next</button>
        {fieldEventsLoading ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader size={14} />
            <span>Loading resource...</span>
          </span>
        ) : null}
      </span>
      <span className="rbc-toolbar-label">{toolbar.label}</span>
      <span className="rbc-btn-group">
        {views.map((viewName: string) => (
          <button
            key={viewName}
            type="button"
            className={toolbar.view === viewName ? 'rbc-active' : ''}
            onClick={() => toolbar.onView(viewName)}
          >
            {CALENDAR_VIEW_LABELS[viewName] ?? `${viewName.charAt(0).toUpperCase()}${viewName.slice(1)}`}
          </button>
        ))}
      </span>
    </div>
  );
}

type FacilityCalendarPanelProps = FacilityCalendarPanelContextValue & {
  canRenderCalendar: boolean;
  emptyText: string;
  minHeight: number;
  events: CalendarEventData[];
  calendarView: View;
  calendarDate: Date;
  onViewChange: (view: View) => void;
  onNavigateDate: (date: Date) => void;
  onRangeChange: (range: any, view?: View) => void;
  slotGroupPropGetter: SlotGroupPropGetter;
  minTime: Date;
  maxTime: Date;
  scrollToTime: Date;
  eventPropGetter: (event: CalendarEventData) => Record<string, unknown>;
  slotPropGetter: (date: Date) => Record<string, unknown>;
  onEventDrop: (event: any) => void;
  onEventResize: (event: any) => void;
  onSelecting: (slotInfo: any) => boolean;
  onSelectSlot: (slotInfo: any) => void;
  onSelectEvent: (event: CalendarEventData) => void;
  onShellPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onShellPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onShellClickCapture: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
};

export default function FacilityCalendarPanel({
  canRenderCalendar,
  emptyText,
  minHeight,
  events,
  calendarView,
  calendarDate,
  onViewChange,
  onNavigateDate,
  onRangeChange,
  slotGroupPropGetter,
  minTime,
  maxTime,
  scrollToTime,
  eventPropGetter,
  slotPropGetter,
  onEventDrop,
  onEventResize,
  onSelecting,
  onSelectSlot,
  onSelectEvent,
  onShellPointerDownCapture,
  onShellPointerUpCapture,
  onShellClickCapture,
  ...contextValue
}: FacilityCalendarPanelProps) {
  if (!canRenderCalendar) {
    return (
      <Paper
        withBorder
        radius="md"
        style={{
          minHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text c="dimmed">{emptyText}</Text>
      </Paper>
    );
  }

  return (
    <FacilityCalendarPanelContext.Provider value={contextValue}>
      <div
        className="shared-calendar-shell shared-calendar-shell--fields"
        style={{ minHeight, overflow: 'hidden' }}
        onPointerDownCapture={onShellPointerDownCapture}
        onPointerUpCapture={onShellPointerUpCapture}
        onClickCapture={onShellClickCapture}
      >
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={calendarView}
          date={calendarDate}
          onView={onViewChange}
          onNavigate={onNavigateDate}
          onRangeChange={onRangeChange}
          views={['week', 'day']}
          popup
          selectable
          resizable
          startAccessor="start"
          endAccessor="end"
          style={{ minHeight }}
          slotGroupPropGetter={slotGroupPropGetter}
          min={minTime}
          max={maxTime}
          scrollToTime={scrollToTime}
          formats={FIELD_CALENDAR_FORMATS}
          eventPropGetter={eventPropGetter}
          slotPropGetter={slotPropGetter}
          draggableAccessor={(event: CalendarEventData) => {
            const isEditableStaffEvent = event.metaType === 'facility-feed'
              && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
            return (
              contextValue.canManage
              && contextValue.managerCalendarEditMode
              && (event.metaType === 'selection' || event.metaType === 'rental' || isEditableStaffEvent)
            );
          }}
          resizableAccessor={(event: CalendarEventData) => {
            const isEditableStaffEvent = event.metaType === 'facility-feed'
              && (event.feedType === 'staff_assignment' || event.feedType === 'official_assignment');
            return (
              contextValue.canManage
              && contextValue.managerCalendarEditMode
              && (event.metaType === 'selection' || event.metaType === 'rental' || isEditableStaffEvent)
            );
          }}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          onSelecting={onSelecting}
          onSelectSlot={onSelectSlot}
          onSelectEvent={onSelectEvent}
          components={{ event: FacilityCalendarEvent, toolbar: FacilityCalendarToolbar }}
        />
      </div>
    </FacilityCalendarPanelContext.Provider>
  );
}
