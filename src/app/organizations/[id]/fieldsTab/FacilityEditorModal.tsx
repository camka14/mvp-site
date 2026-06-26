"use client";

import { type Dispatch, type SetStateAction } from 'react';
import { Alert, Button, Checkbox, Collapse, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import FieldCalendarFilter, { type FieldCalendarFilterItem } from '@/components/calendar/FieldCalendarFilter';
import LocationSelector, { type LocationSelectionMeta } from '@/components/location/LocationSelector';
import type { EntityColorReferenceValue } from '@/lib/entityColors';
import type { Facility } from '@/types';

type FacilityWeeklyHoursFormRow = {
  dayOfWeek: number;
  closed: boolean;
  openTime: string;
  closeTime: string;
};

type FacilityDayOption = {
  dayOfWeek: number;
  longLabel: string;
};

type FacilityEditorModalProps = {
  opened: boolean;
  editingFacility: Facility | null;
  submitting: boolean;
  formError: string | null;
  name: string;
  location: string;
  affiliateUrl: string;
  coordinates: { lat: number; lng: number };
  locationSelected: boolean;
  locationRequiredError: string;
  locationSelectionError: string;
  resourceIds: string[];
  resourceAssignmentItems: FieldCalendarFilterItem[];
  resourcesOpen: boolean;
  allResourcesDisabled: boolean;
  colorReferenceList: EntityColorReferenceValue[];
  weeklyHours: FacilityWeeklyHoursFormRow[];
  dayOptions: FacilityDayOption[];
  defaultOpenTime: string;
  defaultCloseTime: string;
  onClose: () => void;
  onSave: () => void;
  onNameChange: (value: string) => void;
  onAffiliateUrlChange: (value: string) => void;
  onLocationChange: (location: string, lat: number, lng: number, address: string | undefined, meta?: LocationSelectionMeta) => void;
  onResourceIdsChange: (resourceIds: string[]) => void;
  onResourcesOpenChange: Dispatch<SetStateAction<boolean>>;
  onWeeklyHoursChange: Dispatch<SetStateAction<FacilityWeeklyHoursFormRow[]>>;
};

export default function FacilityEditorModal({
  opened,
  editingFacility,
  submitting,
  formError,
  name,
  location,
  affiliateUrl,
  coordinates,
  locationSelected,
  locationRequiredError,
  locationSelectionError,
  resourceIds,
  resourceAssignmentItems,
  resourcesOpen,
  allResourcesDisabled,
  colorReferenceList,
  weeklyHours,
  dayOptions,
  defaultOpenTime,
  defaultCloseTime,
  onClose,
  onSave,
  onNameChange,
  onAffiliateUrlChange,
  onLocationChange,
  onResourceIdsChange,
  onResourcesOpenChange,
  onWeeklyHoursChange,
}: FacilityEditorModalProps) {
  const locationErrorMessage = formError === locationRequiredError || formError === locationSelectionError
    ? formError
    : undefined;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title={editingFacility ? 'Edit Facility' : 'Create Facility'}
      size="lg"
      centered
    >
      <Stack gap="md">
        {formError ? (
          <Alert color="red">{formError}</Alert>
        ) : null}
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          placeholder="Downtown Sports Center"
          required
        />
        <TextInput
          label="Affiliate rental link"
          value={affiliateUrl}
          onChange={(event) => onAffiliateUrlChange(event.currentTarget.value)}
          placeholder="https://example.com/rentals"
        />
        <LocationSelector
          label="Location"
          value={location}
          coordinates={coordinates}
          onChange={onLocationChange}
          isValid={!locationErrorMessage}
          errorMessage={locationErrorMessage}
          required
          requireSelection
          selected={locationSelected}
          selectionErrorMessage={locationSelectionError}
        />
        <Stack gap={6}>
          <Group justify="space-between" align="center" gap="sm">
            <div>
              <Text fw={700} size="sm">Resources in this facility</Text>
              <Text c="dimmed" size="xs">
                {resourceIds.length} of {resourceAssignmentItems.length} assigned
              </Text>
            </div>
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => onResourcesOpenChange((open) => !open)}
              aria-expanded={resourcesOpen}
            >
              {resourcesOpen ? 'Hide resources' : 'Show resources'}
            </Button>
          </Group>
          <Collapse in={resourcesOpen}>
            <Stack gap={6} mt="sm">
              <FieldCalendarFilter
                items={resourceAssignmentItems}
                selectedIds={resourceIds}
                onSelectedIdsChange={onResourceIdsChange}
                ariaLabel="Facility resource assignment"
                searchPlaceholder="Search resources"
                searchAriaLabel="Search facility assignment resources"
                emptyText="No resources match your search."
                allowEmptySelection
                colorReferenceList={colorReferenceList}
                disabled={allResourcesDisabled}
                showHeader={false}
                inlineControls
                unframed
                maxVisibleItems={5}
              />
            </Stack>
          </Collapse>
        </Stack>
        <Stack gap="xs">
          <Text fw={600} size="sm">Operating hours</Text>
          <Stack gap={6}>
            {weeklyHours.map((row) => {
              const day = dayOptions.find((option) => option.dayOfWeek === row.dayOfWeek);
              const label = day?.longLabel ?? `Day ${row.dayOfWeek + 1}`;
              return (
                <div
                  key={row.dayOfWeek}
                  className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 px-2 py-1.5 sm:grid-cols-[minmax(9.5rem,1fr)_minmax(7rem,8rem)_minmax(7rem,8rem)]"
                >
                  <Checkbox
                    className="col-span-2 self-center sm:col-span-1"
                    label={label}
                    checked={!row.closed}
                    onChange={(event) => {
                      const isOpen = event.currentTarget.checked;
                      onWeeklyHoursChange((current) => current.map((entry) => (
                        entry.dayOfWeek === row.dayOfWeek
                          ? {
                              ...entry,
                              closed: !isOpen,
                              openTime: isOpen ? entry.openTime || defaultOpenTime : entry.openTime,
                              closeTime: isOpen ? entry.closeTime || defaultCloseTime : entry.closeTime,
                            }
                          : entry
                      )));
                    }}
                  />
                  <TextInput
                    aria-label={`${label} opens`}
                    type="time"
                    value={row.openTime}
                    disabled={row.closed}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onWeeklyHoursChange((current) => current.map((entry) => (
                        entry.dayOfWeek === row.dayOfWeek ? { ...entry, openTime: value } : entry
                      )));
                    }}
                    size="xs"
                    style={{ minWidth: 0 }}
                  />
                  <TextInput
                    aria-label={`${label} closes`}
                    type="time"
                    value={row.closeTime}
                    disabled={row.closed}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onWeeklyHoursChange((current) => current.map((entry) => (
                        entry.dayOfWeek === row.dayOfWeek ? { ...entry, closeTime: value } : entry
                      )));
                    }}
                    size="xs"
                    style={{ minWidth: 0 }}
                  />
                </div>
              );
            })}
          </Stack>
        </Stack>
        <Group
          justify="flex-end"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 1,
            marginLeft: 'calc(var(--mantine-spacing-md) * -1)',
            marginRight: 'calc(var(--mantine-spacing-md) * -1)',
            marginBottom: 'calc(var(--mantine-spacing-md) * -1)',
            padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md) var(--mantine-spacing-md)',
            background: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={submitting}>
            {editingFacility ? 'Save Facility' : 'Create Facility'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
