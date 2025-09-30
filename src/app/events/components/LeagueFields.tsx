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
import TimezoneSelect from 'react-timezone-select';
import type { Field, LeagueConfig } from '@/types';
import type { WeeklySlotConflict, WeeklySlotInput } from '@/lib/leagueService';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

export interface LeagueSlotForm extends Omit<WeeklySlotInput, 'dayOfWeek'> {
  dayOfWeek?: WeeklySlotInput['dayOfWeek'];
  key: string;
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
  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; // best effort
    } catch {
      return '';
    }
  }, []);

  const fallbackTimezone = detectedTimezone || 'UTC';

  const timezoneSelectStyles = useMemo(
    () => ({
      menu: (provided: any) => ({
        ...provided,
        zIndex: 20,
      }),
      menuPortal: (provided: any) => ({
        ...provided,
        zIndex: 9999,
      }),
    }),
    [],
  );

  const timezoneMenuPortalTarget = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return document.body;
  }, []);

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
            const fieldOptionsForSlot = !slot.fieldId || availableFieldOptions.some(option => option.value === slot.fieldId)
              ? availableFieldOptions
              : [...availableFieldOptions, { value: slot.fieldId, label: slot.fieldId }];
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
                      value={slot.fieldId || null}
                      onChange={(value) => onUpdateSlot(index, { fieldId: value || '' })}
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
                      value={slot.startTime || ''}
                      onChange={(event) => onUpdateSlot(index, { startTime: event.currentTarget.value || undefined })}
                      withSeconds={false}
                    />

                    <TimeInput
                      label="End Time"
                      value={slot.endTime || ''}
                      onChange={(event) => onUpdateSlot(index, { endTime: event.currentTarget.value || undefined })}
                      withSeconds={false}
                    />
                  </div>

                  <TimezoneSelect
                    value={slot.timezone || fallbackTimezone}
                    onChange={(value) => {
                      const next = typeof value === 'string' ? value : value?.value;
                      onUpdateSlot(index, { timezone: next || undefined });
                    }}
                    styles={timezoneSelectStyles}
                    menuPortalTarget={timezoneMenuPortalTarget}
                    className="w-full"
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
  );
};

export default LeagueFields;
