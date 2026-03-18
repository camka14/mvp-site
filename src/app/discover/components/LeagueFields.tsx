import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NumberInput,
  Switch,
  Select as MantineSelect,
  MultiSelect as MantineMultiSelect,
  Button,
  Card,
  Group,
  Text,
  Alert,
  Loader,
  Stack,
  Badge,
  SimpleGrid,
  Paper,
  Title,
  TextInput,
} from '@mantine/core';
import { DatePickerInput, DateTimePicker, TimeInput } from '@mantine/dates';
import type { Field, LeagueConfig, Sport, TimeSlot } from '@/types';
import type { WeeklySlotConflict } from '@/lib/leagueService';
import { formatDisplayDate, formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';

const DROPDOWN_PROPS = { withinPortal: true, zIndex: 1800 };
const MAX_STANDARD_NUMBER = 99_999;

const DAYS_OF_WEEK = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

const minutesToTimeValue = (minutes: number): string => {
  const normalized = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const parseTimeValue = (value: string): number | undefined => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours)
    || Number.isNaN(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return undefined;
  }

  return hours * 60 + minutes;
};

const formatClockTime = (date: Date): string => new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}).format(date);

const formatMinutesLabel = (minutes: number): string => {
  const normalized = Math.max(0, Math.floor(minutes));
  const date = new Date(2000, 0, 1, 0, 0, 0, 0);
  date.setMinutes(normalized);
  return formatClockTime(date);
};

const formatDateTimeLabel = (date: Date): string => `${formatDisplayDate(date)} ${formatClockTime(date)}`;

const formatConflictTimeRange = ({ schedule, event }: WeeklySlotConflict): string => {
  const scheduleStart = parseLocalDateTime(schedule?.startDate ?? null);
  const scheduleEnd = parseLocalDateTime(schedule?.endDate ?? null);
  const scheduleHasTimeRange = (
    typeof schedule?.startTimeMinutes === 'number'
    && typeof schedule?.endTimeMinutes === 'number'
    && schedule.endTimeMinutes > schedule.startTimeMinutes
  );

  if (schedule?.repeating !== false && scheduleHasTimeRange) {
    const timeRange = `${formatMinutesLabel(schedule.startTimeMinutes!)}-${formatMinutesLabel(schedule.endTimeMinutes!)}`;
    if (scheduleStart && scheduleEnd && scheduleEnd.getTime() > scheduleStart.getTime()) {
      return `${formatDisplayDate(scheduleStart)} - ${formatDisplayDate(scheduleEnd)}, ${timeRange}`;
    }
    if (scheduleStart) {
      return `${formatDisplayDate(scheduleStart)}, ${timeRange}`;
    }
    return timeRange;
  }

  if (scheduleStart && scheduleEnd && scheduleEnd.getTime() > scheduleStart.getTime()) {
    return `${formatDateTimeLabel(scheduleStart)} - ${formatDateTimeLabel(scheduleEnd)}`;
  }

  const eventStart = parseLocalDateTime(event?.start ?? null);
  const eventEnd = parseLocalDateTime(event?.end ?? null);
  if (eventStart && eventEnd && eventEnd.getTime() > eventStart.getTime()) {
    return `${formatDateTimeLabel(eventStart)} - ${formatDateTimeLabel(eventEnd)}`;
  }
  if (eventStart) {
    return formatDateTimeLabel(eventStart);
  }

  return 'Time range unavailable';
};

const normalizeSlotDays = (slot: Pick<LeagueSlotForm, 'dayOfWeek' | 'daysOfWeek'>): number[] => {
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

const normalizeDivisionKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeFieldIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const normalizeSlotFieldIds = (slot: Pick<LeagueSlotForm, 'scheduledFieldId' | 'scheduledFieldIds'>): string[] => {
  const fromList = normalizeFieldIds(slot.scheduledFieldIds);
  if (fromList.length) {
    return fromList;
  }
  return typeof slot.scheduledFieldId === 'string' && slot.scheduledFieldId.length > 0
    ? [slot.scheduledFieldId]
    : [];
};

const createFieldStub = (fieldId: string, label?: string): Field => ({
  $id: fieldId,
  name: label ?? '',
  location: '',
  lat: 0,
  long: 0,
  fieldNumber: 0,
});

export interface LeagueSlotForm {
  key: string;
  $id?: string;
  scheduledFieldId?: string;
  scheduledFieldIds?: string[];
  dayOfWeek?: number;
  daysOfWeek?: number[];
  divisions?: string[];
  startDate?: string;
  endDate?: string;
  startTimeMinutes?: number;
  endTimeMinutes?: number;
  repeating?: boolean;
  conflicts: WeeklySlotConflict[];
  checking: boolean;
  error?: string;
}

interface LeagueFieldsProps {
  leagueData: LeagueConfig;
  sport?: Sport;
  participantCount?: number;
  onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
  slots: LeagueSlotForm[];
  onAddSlot: () => void;
  onUpdateSlot: (index: number, updates: Partial<LeagueSlotForm>) => void;
  onRemoveSlot: (index: number) => void;
  fields: Field[];
  fieldsLoading: boolean;
  fieldOptions?: { value: string; label: string }[];
  divisionOptions?: { value: string; label: string }[];
  eventStartDate?: string;
  lockSlotDivisions?: boolean;
  lockedDivisionKeys?: string[];
  readOnly?: boolean;
  allowDivisionEditsWhenReadOnly?: boolean;
  onAutoResolveSlotConflict?: (index: number) => void;
  showLeagueConfiguration?: boolean;
  showPlayoffSettings?: boolean;
}

const LeagueFields: React.FC<LeagueFieldsProps> = ({
  leagueData,
  sport,
  participantCount,
  onLeagueDataChange,
  slots,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
  fields,
  fieldsLoading,
  fieldOptions,
  divisionOptions = [],
  eventStartDate,
  lockSlotDivisions = false,
  lockedDivisionKeys = [],
  readOnly = false,
  allowDivisionEditsWhenReadOnly = false,
  onAutoResolveSlotConflict,
  showLeagueConfiguration = true,
  showPlayoffSettings = true,
}) => {
  const fieldLookup = useMemo(
    () => new Map(fields.map((field) => [field.$id, field])),
    [fields],
  );
  const requiresSets = Boolean(sport?.usePointsPerSetWin);

  const availableFieldOptions = (fieldOptions && fieldOptions.length > 0)
    ? fieldOptions
    : fields.map((field) => ({
        value: field.$id,
        label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Unnamed field'),
      }));

  const setsPerMatch = leagueData.setsPerMatch ?? 1;
  const pointsToVictory = leagueData.pointsToVictory ?? [];
  const playoffDefaultTeamCount = Math.max(2, Number.isFinite(participantCount) ? Number(participantCount) : 2);
  const normalizedLockedDivisionKeys = useMemo(
    () => normalizeDivisionKeys(lockedDivisionKeys),
    [lockedDivisionKeys],
  );
  const parsedEventStartDate = useMemo(() => {
    const parsed = parseLocalDateTime(eventStartDate);
    if (!parsed) {
      return null;
    }
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  }, [eventStartDate]);
  const [fieldSearchBySlot, setFieldSearchBySlot] = useState<Record<string, string>>({});
  const [fieldAnchorBySlot, setFieldAnchorBySlot] = useState<Record<string, string>>({});
  const fieldItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const syncPoints = (targetLength: number) => {
    const next = pointsToVictory.slice(0, targetLength);
    while (next.length < targetLength) {
      next.push(21);
    }
    return next;
  };

  const handleSetsPerMatchChange = (value: string | null) => {
    const count = parseInt(value || '1', 10);
    const normalized = Number.isNaN(count) ? 1 : count;
    const nextPoints = syncPoints(normalized);
    onLeagueDataChange({
      setsPerMatch: normalized,
      pointsToVictory: nextPoints,
      usesSets: requiresSets,
    });
  };

  const handlePointChange = (index: number, value: number | string) => {
    const numeric = Number(value) || 1;
    const updated = syncPoints(setsPerMatch);
    updated[index] = numeric;
    onLeagueDataChange({
      pointsToVictory: updated,
      usesSets: requiresSets,
    });
  };

  const handleIncludePlayoffsChange = (checked: boolean) => {
    if (!checked) {
      onLeagueDataChange({
        includePlayoffs: false,
        playoffTeamCount: undefined,
      });
      return;
    }
    onLeagueDataChange({
      includePlayoffs: true,
      playoffTeamCount: playoffDefaultTeamCount,
    });
  };

  const setSlotSearch = (slotKey: string, value: string) => {
    setFieldSearchBySlot((prev) => ({ ...prev, [slotKey]: value }));
  };

  const handleFieldToggle = (
    slotIndex: number,
    slot: LeagueSlotForm,
    fieldOptionsForSlot: Array<{ value: string; label: string }>,
    fieldId: string,
    shiftKey: boolean,
  ) => {
    const current = normalizeSlotFieldIds(slot);
    const optionIds = fieldOptionsForSlot.map((option) => option.value);
    const currentSet = new Set(current);
    let next = [...current];

    if (shiftKey) {
      const anchorId = fieldAnchorBySlot[slot.key];
      const anchorIndex = anchorId ? optionIds.indexOf(anchorId) : -1;
      const targetIndex = optionIds.indexOf(fieldId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const range = optionIds.slice(start, end + 1);
        next = Array.from(new Set([...next, ...range]));
      } else if (currentSet.has(fieldId)) {
        next = next.filter((id) => id !== fieldId);
      } else {
        next = [...next, fieldId];
      }
    } else if (currentSet.has(fieldId)) {
      next = next.filter((id) => id !== fieldId);
    } else {
      next = [...next, fieldId];
    }

    setFieldAnchorBySlot((prev) => ({ ...prev, [slot.key]: fieldId }));
    onUpdateSlot(slotIndex, {
      scheduledFieldIds: next,
      scheduledFieldId: next[0],
    });
  };

  useEffect(() => {
    slots.forEach((slot) => {
      const search = (fieldSearchBySlot[slot.key] ?? '').trim().toLowerCase();
      if (!search) {
        return;
      }
      const slotFieldIds = normalizeSlotFieldIds(slot);
      const options = slotFieldIds.length
        ? Array.from(
            new Map(
              [...availableFieldOptions, ...slotFieldIds.map((value) => ({ value, label: value }))]
                .map((option) => [option.value, option]),
            ).values(),
          )
        : availableFieldOptions;
      const firstMatch = options.find((option) => option.label.toLowerCase().includes(search));
      if (!firstMatch) {
        return;
      }
      const refKey = `${slot.key}::${firstMatch.value}`;
      const node = fieldItemRefs.current[refKey];
      if (node) {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, [availableFieldOptions, fieldSearchBySlot, slots]);

  return (
    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
      <Stack gap="lg">
        {showLeagueConfiguration && (
          <div>
            <Title order={4} mb="md">
              League Configuration
            </Title>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
              <div className="md:col-span-4">
                <NumberInput
                  label="Games per Opponent"
                  min={1}
                  max={MAX_STANDARD_NUMBER}
                  value={leagueData.gamesPerOpponent}
                  onChange={(value) => onLeagueDataChange({ gamesPerOpponent: Number(value) || 1 })}
                  clampBehavior="strict"
                  maw={180}
                />
              </div>

              {!requiresSets && (
                <div className="md:col-span-4">
                  <NumberInput
                    label="Match Duration (minutes)"
                    min={15}
                    max={MAX_STANDARD_NUMBER}
                    step={5}
                    value={leagueData.matchDurationMinutes}
                    onChange={(value) => onLeagueDataChange({ matchDurationMinutes: Number(value) || 60 })}
                    clampBehavior="strict"
                    maw={220}
                  />
                </div>
              )}

              <div className="md:col-span-4">
                <NumberInput
                  label="Rest Time Between Matches (minutes)"
                  min={0}
                  max={MAX_STANDARD_NUMBER}
                  step={5}
                  value={leagueData.restTimeMinutes ?? 0}
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onLeagueDataChange({
                      restTimeMinutes: Number.isFinite(numeric) && numeric >= 0 ? numeric : 0,
                    });
                  }}
                  clampBehavior="strict"
                  maw={220}
                />
              </div>
            </div>

          {showPlayoffSettings && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Switch
                  label="Include Playoffs"
                  checked={leagueData.includePlayoffs}
                  onChange={(event) => handleIncludePlayoffsChange(event.currentTarget.checked)}
                />
              </div>

              {leagueData.includePlayoffs && (
                <NumberInput
                  className="mt-4"
                  label="Playoff Team Count"
                  min={2}
                  max={MAX_STANDARD_NUMBER}
                  value={typeof leagueData.playoffTeamCount === 'number' ? leagueData.playoffTeamCount : undefined}
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : Number(value);
                    onLeagueDataChange({
                      playoffTeamCount: Number.isFinite(numeric) ? numeric : undefined,
                    });
                  }}
                  clampBehavior="strict"
                  maw={220}
                  error={
                    leagueData.includePlayoffs &&
                    !(typeof leagueData.playoffTeamCount === 'number' && leagueData.playoffTeamCount >= 2)
                      ? 'Playoff team count is required'
                      : undefined
                  }
                />
              )}
            </>
          )}

          {requiresSets && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4 md:items-end">
              <div className="md:col-span-6">
                <MantineSelect
                  label="Sets per Match"
                  value={String(setsPerMatch)}
                  onChange={handleSetsPerMatchChange}
                  data={[
                    { value: '1', label: 'Best of 1' },
                    { value: '3', label: 'Best of 3' },
                    { value: '5', label: 'Best of 5' },
                  ]}
                  comboboxProps={DROPDOWN_PROPS}
                  maw={220}
                />
              </div>
              <div className="md:col-span-6">
                <NumberInput
                  label="Set Duration (minutes)"
                  min={5}
                  max={MAX_STANDARD_NUMBER}
                  step={5}
                  value={leagueData.setDurationMinutes || undefined}
                  onChange={(value) => onLeagueDataChange({ setDurationMinutes: Number(value) || undefined })}
                  clampBehavior="strict"
                  maw={220}
                />
              </div>
            </div>
          )}

          {requiresSets && (
            <div className="mt-6">
              <Text fw={600} mb="xs">
                Points to Victory
              </Text>
              <Text size="sm" c="dimmed" mb="sm">
                Configure the points required to win each set.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm" className="md:items-end">
                {Array.from({ length: setsPerMatch }).map((_, idx) => (
                  <NumberInput
                    key={`points-set-${idx}`}
                    label={`Set ${idx + 1}`}
                    min={1}
                    max={MAX_STANDARD_NUMBER}
                    value={pointsToVictory[idx] ?? 21}
                    onChange={(value) => handlePointChange(idx, value)}
                    clampBehavior="strict"
                    maw={160}
                  />
                ))}
              </SimpleGrid>
            </div>
          )}
        </div>
      )}

        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <Title order={4} className="m-0">
              Weekly Timeslots
            </Title>
            <Button variant="light" onClick={onAddSlot} disabled={readOnly}>
              Add Timeslot
            </Button>
          </div>

          {fieldsLoading && (
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
              <Loader size="sm" />
              Loading fields...
            </div>
          )}

          {!fieldsLoading && availableFieldOptions.length === 0 && (
            <Alert color="yellow" radius="md" className="mb-4">
              No fields found. Create a field first so you can attach weekly availability.
            </Alert>
          )}

          {slots.length === 0 && (
            <Alert color="blue" radius="md" className="mb-4">
              Add at least one weekly timeslot so we know where to schedule matches.
            </Alert>
          )}

          <Stack gap="md">
            {slots.map((slot, index) => {
              const conflictCount = slot.conflicts.length;
              const slotFieldIds = normalizeSlotFieldIds(slot);
              const fieldOptionsForSlot = slotFieldIds.length
                ? Array.from(
                    new Map(
                      [
                        ...availableFieldOptions,
                        ...slotFieldIds.map((fieldId) => {
                          const field = fieldLookup.get(fieldId) ?? null;
                          return {
                            value: fieldId,
                            label: field?.name || (field?.fieldNumber ? `Field ${field.fieldNumber}` : fieldId),
                          };
                        }),
                      ].map((option) => [option.value, option]),
                    ).values(),
                  )
                : availableFieldOptions;
            const fieldSearch = fieldSearchBySlot[slot.key] ?? '';
            const selectedDays = normalizeSlotDays(slot);
            const slotDivisions = normalizeDivisionKeys(slot.divisions);
            const effectiveSlotDivisions = lockSlotDivisions && normalizedLockedDivisionKeys.length
              ? normalizedLockedDivisionKeys
              : slotDivisions;
            const isRepeating = slot.repeating !== false;
            const slotStartDate = parseLocalDateTime(slot.startDate);
            const slotEndDate = parseLocalDateTime(slot.endDate);
            const divisionOptionsByKey = new Map<string, { value: string; label: string }>();
            divisionOptions.forEach((option) => {
              const value = String(option.value ?? '').trim();
              if (!value) return;
              const key = value.toLowerCase();
              if (!divisionOptionsByKey.has(key)) {
                divisionOptionsByKey.set(key, {
                  value,
                  label: String(option.label ?? value),
                });
              }
            });
            const divisionOptionsForSlot = (() => {
              const byKey = new Map<string, { value: string; label: string }>();
              effectiveSlotDivisions.forEach((value) => {
                const normalized = String(value ?? '').trim();
                if (!normalized) return;
                const key = normalized.toLowerCase();
                const existing = divisionOptionsByKey.get(key);
                byKey.set(key, {
                  value: normalized,
                  label: existing?.label ?? normalized,
                });
              });
              divisionOptions.forEach((option) => {
                const value = String(option.value ?? '').trim();
                if (!value) return;
                const key = value.toLowerCase();
                if (byKey.has(key)) return;
                byKey.set(key, {
                  value,
                  label: String(option.label ?? value),
                });
              });
              return Array.from(byKey.values());
            })();
            const fieldMissing = slotFieldIds.length === 0;
            const dayMissing = selectedDays.length === 0;
            const startMissing = !(typeof slot.startTimeMinutes === 'number' && Number.isFinite(slot.startTimeMinutes));
            const endMissing = !(typeof slot.endTimeMinutes === 'number' && Number.isFinite(slot.endTimeMinutes));
            const explicitStartMissing = !slotStartDate;
            const explicitEndMissing = !slotEndDate;
            const explicitRangeInvalid = Boolean(
              slotStartDate &&
              slotEndDate &&
              slotEndDate.getTime() <= slotStartDate.getTime(),
            );
            const divisionsReadOnly = readOnly && !allowDivisionEditsWhenReadOnly;
            const hasConflicts = conflictCount > 0;
            return (
              <Card
                key={slot.key}
                shadow="xs"
                radius="md"
                padding="lg"
                withBorder
                className={hasConflicts ? 'border-red-500 bg-red-50/30' : undefined}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <Text fw={600}>Timeslot #{index + 1}</Text>
                    <Group gap="xs">
                      {slot.checking && <Loader size="sm" />}
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={() => onRemoveSlot(index)}
                        disabled={slots.length === 1 || readOnly}
                      >
                        Remove
                      </Button>
                    </Group>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                      <Text fw={500} size="sm" mb={6}>Fields</Text>
                      <TextInput
                        placeholder="Search fields..."
                        value={fieldSearch}
                        onChange={(event) => setSlotSearch(slot.key, event.currentTarget.value)}
                        disabled={readOnly}
                        maw={360}
                        mb="xs"
                      />
                      <div
                        className={`max-h-44 overflow-y-auto rounded-md border p-1 ${fieldMissing && !readOnly ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <Stack gap={4}>
                          {fieldOptionsForSlot.map((option) => {
                            const selected = slotFieldIds.includes(option.value);
                            const refKey = `${slot.key}::${option.value}`;
                            const highlighted = fieldSearch.trim().length > 0
                              && option.label.toLowerCase().includes(fieldSearch.trim().toLowerCase());
                            return (
                              <button
                                key={option.value}
                                ref={(node) => {
                                  fieldItemRefs.current[refKey] = node;
                                }}
                                type="button"
                                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'} ${highlighted ? 'ring-1 ring-blue-300' : ''}`}
                                onClick={(event) => {
                                  handleFieldToggle(index, slot, fieldOptionsForSlot, option.value, event.shiftKey);
                                }}
                                disabled={readOnly}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">{option.label}</span>
                                  {selected ? <Badge size="xs" color="blue" variant="light">Selected</Badge> : null}
                                </div>
                              </button>
                            );
                          })}
                        </Stack>
                      </div>
                      {fieldMissing && !readOnly ? (
                        <Text size="xs" c="red" mt={4}>Select at least one field</Text>
                      ) : null}
                      <Text size="xs" c="dimmed" mt={4}>
                        Tip: Hold Shift and click another field to select a range.
                      </Text>
                    </div>

                    <div className="md:col-span-6 space-y-4">
                      <MantineMultiSelect
                        label="Divisions"
                        placeholder="Select one or more divisions"
                        description={lockSlotDivisions
                          ? 'Single division is enabled, so every timeslot uses all selected event divisions.'
                          : undefined}
                        data={divisionOptionsForSlot}
                        value={effectiveSlotDivisions}
                        comboboxProps={DROPDOWN_PROPS}
                        onChange={(values) => {
                          onUpdateSlot(index, {
                            divisions: normalizeDivisionKeys(values),
                          });
                        }}
                        searchable
                        clearable={!lockSlotDivisions && !divisionsReadOnly}
                        disabled={divisionsReadOnly || lockSlotDivisions}
                        maw={360}
                      />

                      {isRepeating ? (
                        <>
                          <MantineMultiSelect
                            label="Days of Week"
                            withAsterisk
                            placeholder="Select one or more days"
                            data={DAYS_OF_WEEK}
                            value={selectedDays.map((day) => String(day))}
                            comboboxProps={DROPDOWN_PROPS}
                            onChange={(values) => {
                              const days = Array.from(
                                new Set(
                                  values
                                    .map((value) => Number(value))
                                    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
                                ),
                              ).sort((a, b) => a - b);
                              onUpdateSlot(index, {
                                dayOfWeek: days[0],
                                daysOfWeek: days,
                              });
                            }}
                            disabled={readOnly}
                            error={dayMissing && !readOnly ? 'Select at least one day' : undefined}
                            maw={320}
                          />

                          <DatePickerInput
                            label="Start Date Override"
                            placeholder="Use event start date"
                            description="Optional. Leave blank to use event start date."
                            value={slotStartDate}
                            onChange={(value) => onUpdateSlot(index, {
                              startDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            valueFormat="MM/DD/YYYY"
                            minDate={parsedEventStartDate ?? undefined}
                            clearable
                            disabled={readOnly}
                            maw={320}
                          />

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-end">
                            <TimeInput
                              label="Start Time"
                              withAsterisk
                              withSeconds={false}
                              value={typeof slot.startTimeMinutes === 'number' ? minutesToTimeValue(slot.startTimeMinutes) : ''}
                              onChange={(value) => onUpdateSlot(index, {
                                startTimeMinutes: parseTimeValue(value.currentTarget.value),
                              })}
                              disabled={readOnly}
                              error={startMissing && !readOnly ? 'Select a start time' : undefined}
                              maw={220}
                            />

                            <TimeInput
                              label="End Time"
                              withAsterisk
                              withSeconds={false}
                              value={typeof slot.endTimeMinutes === 'number' ? minutesToTimeValue(slot.endTimeMinutes) : ''}
                              onChange={(value) => onUpdateSlot(index, {
                                endTimeMinutes: parseTimeValue(value.currentTarget.value),
                              })}
                              disabled={readOnly}
                              error={endMissing && !readOnly ? 'Select an end time' : undefined}
                              maw={220}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:items-end">
                          <DateTimePicker
                            label="Start Date & Time"
                            withAsterisk
                            placeholder="Select start"
                            value={slotStartDate}
                            onChange={(value) => onUpdateSlot(index, {
                              startDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            minDate={parsedEventStartDate ?? undefined}
                            valueFormat="MM/DD/YYYY hh:mm A"
                            clearable
                            disabled={readOnly}
                            error={explicitStartMissing && !readOnly ? 'Select a start date/time' : undefined}
                            maw={260}
                          />
                          <DateTimePicker
                            label="End Date & Time"
                            withAsterisk
                            placeholder="Select end"
                            value={slotEndDate}
                            onChange={(value) => onUpdateSlot(index, {
                              endDate: value ? formatLocalDateTime(value) : undefined,
                            })}
                            minDate={slotStartDate ?? parsedEventStartDate ?? undefined}
                            valueFormat="MM/DD/YYYY hh:mm A"
                            clearable
                            disabled={readOnly}
                            error={
                              explicitEndMissing && !readOnly
                                ? 'Select an end date/time'
                                : (explicitRangeInvalid && !readOnly ? 'End date/time must be after start date/time' : undefined)
                            }
                            maw={260}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <Switch
                    label="Repeats weekly"
                    checked={slot.repeating !== false}
                    onChange={(event) => onUpdateSlot(index, { repeating: event.currentTarget.checked })}
                    disabled={readOnly}
                  />

                {conflictCount > 0 && (
                  <Alert color="red" radius="md">
                      <Stack gap="xs">
                        <Text fw={600}>There is a conflict on this field.</Text>
                        <Text size="sm">
                          Resolve it manually, or auto resolve it to lock the conflicting event and reschedule this timeslot.
                        </Text>
                        {slot.conflicts.map(({ event, schedule }, conflictIndex) => (
                          <div key={`${schedule.$id}-${conflictIndex}`} className="flex items-start gap-2 text-sm">
                            <Badge color="red" variant="light">{event.name}</Badge>
                            <span>
                              {formatConflictTimeRange({ event, schedule })} overlaps this slot.
                            </span>
                          </div>
                        ))}
                        {onAutoResolveSlotConflict ? (
                          <Group justify="flex-end">
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              onClick={() => onAutoResolveSlotConflict(index)}
                              disabled={readOnly}
                            >
                              Auto Resolve
                            </Button>
                          </Group>
                        ) : null}
                      </Stack>
                    </Alert>
                  )}

                  {slot.error && (
                    <Alert color="red" radius="md">
                      {slot.error}
                    </Alert>
                  )}
                </div>
              </Card>
            );
          })}
          </Stack>
        </div>
      </Stack>
    </Paper>
  );
};

export default LeagueFields;
