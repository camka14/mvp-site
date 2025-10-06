import React, { useMemo } from 'react';
import {
  NumberInput,
  Switch,
  Select as MantineSelect,
  Button,
  Card,
  Group,
  Text,
  Alert,
  Loader,
  Stack,
  Badge,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import type { Field, LeagueConfig, TimeSlot } from '@/types';
import type { WeeklySlotConflict } from '@/lib/leagueService';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

const createFieldStub = (fieldId: string, label?: string): Field => ({
  $id: fieldId,
  name: label ?? '',
  location: '',
  lat: 0,
  long: 0,
  type: '',
  fieldNumber: 0,
});

const minutesToTimeString = (minutes?: number): string => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) {
    return '';
  }

  const normalized = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(normalized / 60) % 24;
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const parseTimeInput = (value: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return undefined;
  }

  return hours * 60 + minutes;
};

export interface LeagueSlotForm {
  key: string;
  $id?: string;
  field?: Field;
  dayOfWeek?: TimeSlot['dayOfWeek'];
  startTime?: number;
  endTime?: number;
  conflicts: WeeklySlotConflict[];
  checking: boolean;
  error?: string;
}

interface LeagueFieldsProps {
  leagueData: LeagueConfig;
  onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
  slots: LeagueSlotForm[];
  onAddSlot: () => void;
  onUpdateSlot: (index: number, updates: Partial<LeagueSlotForm>) => void;
  onRemoveSlot: (index: number) => void;
  fields: Field[];
  fieldsLoading: boolean;
  fieldOptions?: { value: string; label: string }[];
}

const LeagueFields: React.FC<LeagueFieldsProps> = ({
  leagueData,
  onLeagueDataChange,
  slots,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
  fields,
  fieldsLoading,
  fieldOptions,
}) => {
  const fieldLookup = useMemo(
    () => new Map(fields.map((field) => [field.$id, field])),
    [fields],
  );

  const availableFieldOptions = (fieldOptions && fieldOptions.length > 0)
    ? fieldOptions
    : fields.map((field) => ({
        value: field.$id,
        label: field.name || (field.fieldNumber ? `Field ${field.fieldNumber}` : 'Unnamed field'),
      }));

  return (
    <Stack gap="lg">
      <div>
        <h3 className="text-lg font-semibold mb-4">League Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberInput
            label="Games per Opponent"
            min={1}
            value={leagueData.gamesPerOpponent}
            onChange={(value) => onLeagueDataChange({ gamesPerOpponent: Number(value) || 1 })}
          />

          <NumberInput
            label="Match Duration (minutes)"
            min={15}
            step={5}
            value={leagueData.matchDurationMinutes}
            onChange={(value) => onLeagueDataChange({ matchDurationMinutes: Number(value) || 60 })}
            disabled={leagueData.usesSets}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Switch
            label="Include Playoffs"
            checked={leagueData.includePlayoffs}
            onChange={(event) => onLeagueDataChange({ includePlayoffs: event.currentTarget.checked })}
          />

          <Switch
            label="Matches play in sets"
            checked={leagueData.usesSets}
            onChange={(event) => onLeagueDataChange({ usesSets: event.currentTarget.checked })}
          />
        </div>

        {leagueData.includePlayoffs && (
          <NumberInput
            className="mt-4"
            label="Playoff Team Count"
            min={2}
            value={leagueData.playoffTeamCount || undefined}
            onChange={(value) => onLeagueDataChange({ playoffTeamCount: Number(value) || undefined })}
          />
        )}

        {leagueData.usesSets && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <NumberInput
              label="Sets per Match"
              min={1}
              value={leagueData.setsPerMatch || undefined}
              onChange={(value) => onLeagueDataChange({ setsPerMatch: Number(value) || undefined })}
            />
            <NumberInput
              label="Set Duration (minutes)"
              min={5}
              step={5}
              value={leagueData.setDurationMinutes || undefined}
              onChange={(value) => onLeagueDataChange({ setDurationMinutes: Number(value) || undefined })}
            />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Weekly Timeslots</h3>
          <Button variant="light" onClick={onAddSlot}>
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
            const selectedFieldId = slot.field?.$id ?? null;
            const fieldOptionsForSlot = selectedFieldId && !availableFieldOptions.some(option => option.value === selectedFieldId)
              ? [
                  ...availableFieldOptions,
                  {
                    value: selectedFieldId,
                    label: slot.field?.name || (slot.field?.fieldNumber ? `Field ${slot.field.fieldNumber}` : selectedFieldId),
                  },
                ]
              : availableFieldOptions;
            return (
              <Card key={slot.key} shadow="xs" radius="md" padding="lg" withBorder>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <Text fw={600}>Timeslot #{index + 1}</Text>
                    <Group gap="xs">
                      {slot.checking && <Loader size="sm" />}
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={() => onRemoveSlot(index)}
                        disabled={slots.length === 1}
                      >
                        Remove
                      </Button>
                    </Group>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MantineSelect
                      label="Field"
                      placeholder="Select field"
                      data={fieldOptionsForSlot}
                      value={selectedFieldId}
                      onChange={(value) => {
                        if (!value) {
                          onUpdateSlot(index, { field: undefined });
                          return;
                        }
                        const nextField = fieldLookup.get(value)
                          ?? createFieldStub(
                            value,
                            fieldOptionsForSlot.find(option => option.value === value)?.label,
                          );
                        onUpdateSlot(index, { field: nextField });
                      }}
                      searchable
                    />

                    <MantineSelect
                      label="Day of Week"
                      placeholder="Select day"
                      data={DAYS_OF_WEEK}
                      value={typeof slot.dayOfWeek === 'number' ? String(slot.dayOfWeek) : null}
                      onChange={(value) => onUpdateSlot(index, { dayOfWeek: value ? (Number(value) as LeagueSlotForm['dayOfWeek']) : undefined })}
                    />

                    <TimeInput
                      label="Start Time"
                      value={minutesToTimeString(slot.startTime)}
                      onChange={(event) => onUpdateSlot(index, { startTime: parseTimeInput(event.currentTarget.value) })}
                      withSeconds={false}
                    />

                  <TimeInput
                    label="End Time"
                    value={minutesToTimeString(slot.endTime)}
                    onChange={(event) => onUpdateSlot(index, { endTime: parseTimeInput(event.currentTarget.value) })}
                    withSeconds={false}
                  />
                </div>

                {conflictCount > 0 && (
                  <Alert color="red" radius="md">
                      <Stack gap="xs">
                        <Text fw={600}>Conflicts detected</Text>
                        {slot.conflicts.map(({ event, schedule }, conflictIndex) => (
                          <div key={`${schedule.$id}-${conflictIndex}`} className="flex items-start gap-2 text-sm">
                            <Badge color="red" variant="light">{event.name}</Badge>
                            <span>
                              {event.start ? new Date(event.start).toLocaleDateString() : ''} -
                              {event.end ? ` ${new Date(event.end).toLocaleDateString()}` : ''} overlaps this slot.
                            </span>
                          </div>
                        ))}
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
  );
};

export default LeagueFields;
