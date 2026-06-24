"use client";

import { type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import SharedCalendarEvent, { type SharedCalendarEventVariant } from '@/components/calendar/SharedCalendarEvent';
import type { EntityColorReferenceValue } from '@/lib/entityColors';
import type { FacilityCalendarFeedItemType } from '../fieldCalendar';

export type ManagerCalendarSelectionMode = 'rental' | 'staff_assignment' | 'official_assignment';

export type CalendarLayerType =
  | FacilityCalendarFeedItemType
  | 'reservation';

export type ManagerCreateTemplate = {
  mode: ManagerCalendarSelectionMode;
  title: string;
  subtitle: string;
  meta: string;
  variant: SharedCalendarEventVariant;
  colorSeed: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type ManagerFacilityCalendarSidebarProps = {
  facilityFilterOptions: SelectOption[];
  selectedFacilityFilterValue: string;
  onFacilityFilterChange: (value: string | null) => void;
  calendarLayerOrder: CalendarLayerType[];
  calendarLayerLabels: Record<CalendarLayerType, string>;
  calendarLayerColors: Record<CalendarLayerType, string>;
  calendarLayerCounts: Map<CalendarLayerType, number>;
  activeCalendarLayerSet: Set<CalendarLayerType>;
  allCalendarLayersSelected: boolean;
  onSelectAllCalendarLayers: () => void;
  onToggleCalendarLayer: (type: CalendarLayerType) => void;
  editMode: boolean;
  createTemplates: ManagerCreateTemplate[];
  selectedFieldIds: string[];
  facilityFilteredFieldIds: string[];
  fieldFilterItems: FieldCalendarFilterItem[];
  fieldColorReferenceList: EntityColorReferenceValue[];
  createDragMode: ManagerCalendarSelectionMode | null;
  onCreatePointerDown: (mode: ManagerCalendarSelectionMode, event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreatePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreatePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCreatePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectedFieldIdsChange: (fieldIds: string[]) => void;
};

export default function ManagerFacilityCalendarSidebar({
  facilityFilterOptions,
  selectedFacilityFilterValue,
  onFacilityFilterChange,
  calendarLayerOrder,
  calendarLayerLabels,
  calendarLayerColors,
  calendarLayerCounts,
  activeCalendarLayerSet,
  allCalendarLayersSelected,
  onSelectAllCalendarLayers,
  onToggleCalendarLayer,
  editMode,
  createTemplates,
  selectedFieldIds,
  facilityFilteredFieldIds,
  fieldFilterItems,
  fieldColorReferenceList,
  createDragMode,
  onCreatePointerDown,
  onCreatePointerMove,
  onCreatePointerUp,
  onCreatePointerCancel,
  onSelectedFieldIdsChange,
}: ManagerFacilityCalendarSidebarProps) {
  const selectedFacilityFieldIds = selectedFieldIds.filter((fieldId) => facilityFilteredFieldIds.includes(fieldId));

  return (
    <Stack gap="sm">
      <Select
        label="Facility"
        data={facilityFilterOptions}
        value={selectedFacilityFilterValue}
        onChange={onFacilityFilterChange}
        allowDeselect={false}
        size="sm"
      />
      <Stack gap={6}>
        <Group justify="space-between" align="center">
          <Text fw={700} size="sm">Calendar layers</Text>
          <Button
            size="compact-xs"
            variant={allCalendarLayersSelected ? 'light' : 'subtle'}
            color="gray"
            onClick={onSelectAllCalendarLayers}
          >
            All
          </Button>
        </Group>
        <Group gap={6}>
          {calendarLayerOrder.map((type) => {
            const count = calendarLayerCounts.get(type) ?? 0;
            const selected = activeCalendarLayerSet.has(type);
            return (
              <Button
                key={type}
                size="compact-xs"
                variant={selected ? 'filled' : 'light'}
                color={calendarLayerColors[type]}
                onClick={() => onToggleCalendarLayer(type)}
              >
                {calendarLayerLabels[type]} {count}
              </Button>
            );
          })}
        </Group>
      </Stack>
      {editMode ? (
        <Stack gap={6}>
          <Text fw={700} size="sm">Create</Text>
          <div className="facility-calendar-create-grid">
            {createTemplates.map((template) => {
              const canDragTemplate = selectedFieldIds.length > 0;
              const isDragging = createDragMode === template.mode;
              return (
                <div
                  key={template.mode}
                  className={[
                    'facility-calendar-create-card',
                    isDragging ? 'facility-calendar-create-card--active' : '',
                    !canDragTemplate ? 'facility-calendar-create-card--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  draggable={false}
                  aria-grabbed={isDragging}
                  aria-disabled={!canDragTemplate}
                  onPointerDown={(event) => onCreatePointerDown(template.mode, event)}
                  onPointerMove={onCreatePointerMove}
                  onPointerUp={onCreatePointerUp}
                  onPointerCancel={onCreatePointerCancel}
                >
                  <SharedCalendarEvent
                    title={template.title}
                    subtitle={template.subtitle}
                    meta={template.meta}
                    colorSeed={template.colorSeed}
                    colorReferenceList={fieldColorReferenceList}
                    colorMatchKey={selectedFieldIds[0] ?? undefined}
                    resourceColorMatchKeys={selectedFieldIds}
                    variant={template.variant}
                    draggable={canDragTemplate}
                    selected={isDragging}
                  />
                </div>
              );
            })}
          </div>
        </Stack>
      ) : null}
      <FieldCalendarFilter
        items={fieldFilterItems}
        selectedIds={selectedFacilityFieldIds}
        onSelectedIdsChange={onSelectedFieldIdsChange}
        colorReferenceList={fieldColorReferenceList}
        title="Resources"
        ariaLabel="Facility resources"
        searchPlaceholder="Search resources"
        searchAriaLabel="Search resources"
        emptyText="No resources match this facility."
      />
    </Stack>
  );
}
