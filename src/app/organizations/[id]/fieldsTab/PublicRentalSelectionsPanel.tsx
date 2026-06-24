"use client";

import { Badge, Button, Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { formatPrice, type Field } from '@/types';
import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';
import { getFacilityScopedFieldDisplayName } from '@/lib/fieldUtils';

const MIN_RENTAL_SELECTION_MS = 60 * 60 * 1000;

type PublicRentalSelection = {
  key: string;
  scheduledFieldIds: string[];
  dayOfWeek?: number;
  daysOfWeek: number[];
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  startDate?: string;
  endDate?: string;
  repeating: boolean;
};

type PublicRentalSelectionValidation = {
  totalCents: number;
  conflictCount: number;
  conflictCheckPending: boolean;
  errors: string[];
};

type DateRange = {
  start: Date;
  end: Date;
};

type SelectOption = {
  value: string;
  label: string;
};

type PublicRentalSelectionsPanelProps = {
  selections: PublicRentalSelection[];
  validationByKey: Map<string, PublicRentalSelectionValidation>;
  fields: Field[];
  facilityFieldsByFilterValue: Map<string, Field[]>;
  publicFacilityFilterOptions: SelectOption[];
  allFacilitiesFilterValue: string;
  resolveSelectionDateRange: (selection: PublicRentalSelection) => DateRange | null;
  getSelectionFacilityFilterValue: (fieldIds: string[]) => string;
  onAddSelection: () => void;
  onRemoveSelection: (selectionKey: string) => void;
  onSelectionFacilityChange: (selectionKey: string, facilityValue: string) => void;
  onSelectionFieldIdsChange: (selectionKey: string, fieldIds: string[]) => void;
  onSelectionRangeChange: (selectionKey: string, start: Date, end: Date) => void;
};

export default function PublicRentalSelectionsPanel({
  selections,
  validationByKey,
  fields,
  facilityFieldsByFilterValue,
  publicFacilityFilterOptions,
  allFacilitiesFilterValue,
  resolveSelectionDateRange,
  getSelectionFacilityFilterValue,
  onAddSelection,
  onRemoveSelection,
  onSelectionFacilityChange,
  onSelectionFieldIdsChange,
  onSelectionRangeChange,
}: PublicRentalSelectionsPanelProps) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={600} size="sm">Rental Selections</Text>
          <Button size="xs" variant="light" onClick={onAddSelection}>
            + Add Selection
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
          {selections.map((selectionItem, index) => {
            const validation = validationByKey.get(selectionItem.key);
            const selectionRange = resolveSelectionDateRange(selectionItem);
            const selectionFieldIds = Array.from(new Set(selectionItem.scheduledFieldIds.filter(Boolean)));
            const selectionFacilityValue = getSelectionFacilityFilterValue(selectionFieldIds);
            const selectionFacilityFields = selectionFacilityValue === allFacilitiesFilterValue
              ? fields
              : facilityFieldsByFilterValue.get(selectionFacilityValue) ?? [];
            const selectionFieldOptions = selectionFacilityFields.map((field) => ({
              value: field.$id,
              label: getFacilityScopedFieldDisplayName(field),
            }));
            const hasConflict = (validation?.conflictCount ?? 0) > 0;
            return (
              <Paper
                key={selectionItem.key}
                withBorder
                radius="md"
                p="sm"
                shadow="xs"
                style={{
                  alignSelf: 'start',
                  borderColor: hasConflict ? 'var(--mantine-color-red-5)' : undefined,
                  backgroundColor: hasConflict ? 'var(--mantine-color-red-0)' : undefined,
                }}
              >
                <div className="space-y-2 overflow-y-auto pr-1">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Badge color={validation?.errors.length ? 'red' : 'teal'} variant="light">
                        Selection {index + 1}
                      </Badge>
                      <Badge variant="dot">
                        {formatPrice(validation?.totalCents ?? 0)}
                      </Badge>
                      {hasConflict ? (
                        <Badge color="red" variant="filled">Conflict</Badge>
                      ) : null}
                      {validation?.conflictCheckPending ? (
                        <Badge color="yellow" variant="light">Checking</Badge>
                      ) : null}
                    </Group>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveSelection(selectionItem.key)}
                    >
                      Remove
                    </Button>
                  </Group>
                  <Select
                    label="Facility"
                    data={publicFacilityFilterOptions}
                    value={selectionFacilityValue}
                    onChange={(nextValue) => {
                      const normalizedValue = nextValue ?? publicFacilityFilterOptions[0]?.value ?? allFacilitiesFilterValue;
                      onSelectionFacilityChange(selectionItem.key, normalizedValue);
                    }}
                    allowDeselect={false}
                    size="sm"
                  />
                  <MultiSelect
                    label="Resources"
                    data={selectionFieldOptions}
                    value={selectionFieldIds.filter((fieldId) => selectionFacilityFields.some((field) => field.$id === fieldId))}
                    onChange={(nextValues) => onSelectionFieldIdsChange(selectionItem.key, nextValues)}
                    searchable
                    placeholder="Select one or more resources"
                    size="sm"
                  />
                  <Group grow>
                    <DateTimePicker
                      label="Start"
                      value={formatLocalDateTime(selectionRange?.start ?? null) ?? null}
                      minDate={new Date()}
                      size="sm"
                      onChange={(value) => {
                        const nextStart = parseLocalDateTime(value ?? null);
                        if (!nextStart) return;
                        onSelectionRangeChange(
                          selectionItem.key,
                          nextStart,
                          selectionRange?.end && selectionRange.end.getTime() > nextStart.getTime()
                            ? selectionRange.end
                            : new Date(nextStart.getTime() + MIN_RENTAL_SELECTION_MS),
                        );
                      }}
                    />
                    <DateTimePicker
                      label="End"
                      value={formatLocalDateTime(selectionRange?.end ?? null) ?? null}
                      minDate={new Date()}
                      size="sm"
                      onChange={(value) => {
                        const nextEnd = parseLocalDateTime(value ?? null);
                        if (!nextEnd) return;
                        onSelectionRangeChange(
                          selectionItem.key,
                          selectionRange?.start && selectionRange.start.getTime() < nextEnd.getTime()
                            ? selectionRange.start
                            : new Date(nextEnd.getTime() - MIN_RENTAL_SELECTION_MS),
                          nextEnd,
                        );
                      }}
                    />
                  </Group>
                  {validation?.errors.map((errorMessage, errorIndex) => (
                    <Text key={`${selectionItem.key}-${errorIndex}`} size="xs" c="red">
                      {errorMessage}
                    </Text>
                  ))}
                </div>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
