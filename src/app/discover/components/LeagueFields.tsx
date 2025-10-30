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
  SimpleGrid,
  Paper,
  Title,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import type { Field, LeagueConfig, Sport, TimeSlot } from '@/types';
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
  scheduledFieldId?: string;
  dayOfWeek?: TimeSlot['dayOfWeek'];
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
  onLeagueDataChange: (updates: Partial<LeagueConfig>) => void;
  slots: LeagueSlotForm[];
  onAddSlot: () => void;
  onUpdateSlot: (index: number, updates: Partial<LeagueSlotForm>) => void;
  onRemoveSlot: (index: number) => void;
  fields: Field[];
  fieldsLoading: boolean;
  fieldOptions?: { value: string; label: string }[];
  readOnly?: boolean;
}

const LeagueFields: React.FC<LeagueFieldsProps> = ({
  leagueData,
  sport,
  onLeagueDataChange,
  slots,
  onAddSlot,
  onUpdateSlot,
  onRemoveSlot,
  fields,
  fieldsLoading,
  fieldOptions,
  readOnly = false,
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

  return (
    <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
      <Stack gap="lg">
        <div>
          <Title order={4} mb="md">
            League Configuration
          </Title>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberInput
            label="Games per Opponent"
            min={1}
            value={leagueData.gamesPerOpponent}
            onChange={(value) => onLeagueDataChange({ gamesPerOpponent: Number(value) || 1 })}
          />

          {!requiresSets && (
            <NumberInput
              label="Match Duration (minutes)"
              min={15}
              step={5}
              value={leagueData.matchDurationMinutes}
              onChange={(value) => onLeagueDataChange({ matchDurationMinutes: Number(value) || 60 })}
            />
          )}

          <NumberInput
            label="Rest Time Between Matches (minutes)"
            min={0}
            step={5}
            value={leagueData.restTimeMinutes ?? 0}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value);
              onLeagueDataChange({
                restTimeMinutes: Number.isFinite(numeric) && numeric >= 0 ? numeric : 0,
              });
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Switch
            label="Include Playoffs"
            checked={leagueData.includePlayoffs}
            onChange={(event) => onLeagueDataChange({ includePlayoffs: event.currentTarget.checked })}
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

        {requiresSets && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <MantineSelect
              label="Sets per Match"
              value={String(setsPerMatch)}
              onChange={handleSetsPerMatchChange}
              data={[
                { value: '1', label: 'Best of 1' },
                { value: '3', label: 'Best of 3' },
                { value: '5', label: 'Best of 5' },
              ]}
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

        {requiresSets && (
          <div className="mt-6">
            <Text fw={600} mb="xs">
              Points to Victory
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Configure the points required to win each set.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              {Array.from({ length: setsPerMatch }).map((_, idx) => (
                <NumberInput
                  key={`points-set-${idx}`}
                  label={`Set ${idx + 1}`}
                  min={1}
                  value={pointsToVictory[idx] ?? 21}
                  onChange={(value) => handlePointChange(idx, value)}
                />
              ))}
            </SimpleGrid>
          </div>
        )}
      </div>

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
              const field = fields.find(field => field.$id === slot.scheduledFieldId) ?? null;
              const fieldOptionsForSlot = slot.scheduledFieldId && !availableFieldOptions.some(option => option.value === slot.scheduledFieldId)
                ? [
                  ...availableFieldOptions,
                  {
                    value: slot.scheduledFieldId,
                    label: field?.name || (field?.fieldNumber ? `Field ${field.fieldNumber}` : slot.scheduledFieldId),
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
                        disabled={slots.length === 1 || readOnly}
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
                      value={slot.scheduledFieldId}
                      onChange={(value) => {
                        if (!value) {
                          onUpdateSlot(index, { scheduledFieldId: undefined });
                          return;
                        }
                        const nextField = fieldLookup.get(value)
                          ?? createFieldStub(
                            value,
                            fieldOptionsForSlot.find(option => option.value === value)?.label,
                          );
                        onUpdateSlot(index, { scheduledFieldId: nextField.$id });
                      }}
                      searchable
                      disabled={readOnly}
                    />

                    <MantineSelect
                      label="Day of Week"
                      placeholder="Select day"
                      data={DAYS_OF_WEEK}
                      value={typeof slot.dayOfWeek === 'number' ? String(slot.dayOfWeek) : null}
                      onChange={(value) => onUpdateSlot(index, { dayOfWeek: value ? (Number(value) as LeagueSlotForm['dayOfWeek']) : undefined })}
                      disabled={readOnly}
                    />

                    <TimeInput
                      label="Start Time"
                      value={minutesToTimeString(slot.startTimeMinutes)}
                      onChange={(event) => onUpdateSlot(index, { startTimeMinutes: parseTimeInput(event.currentTarget.value) })}
                      withSeconds={false}
                      disabled={readOnly}
                    />

                    <TimeInput
                      label="End Time"
                      value={minutesToTimeString(slot.endTimeMinutes)}
                      onChange={(event) => onUpdateSlot(index, { endTimeMinutes: parseTimeInput(event.currentTarget.value) })}
                      withSeconds={false}
                      disabled={readOnly}
                    />
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
    </Paper>
  );
};

export default LeagueFields;
