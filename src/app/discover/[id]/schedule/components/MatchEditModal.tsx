'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Stack, Group, Text, Button, Alert, Select, NumberInput, Divider } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';

import { formatLocalDateTime, parseLocalDateTime } from '@/lib/dateUtils';

import type { Field, Match, Team } from '@/types';

interface MatchEditModalProps {
  opened: boolean;
  match: Match | null;
  fields?: Field[];
  teams?: Team[];
  onClose: () => void;
  onSave: (updated: Match) => void;
}

const coerceDate = (value?: string | Date | null): Date | null => parseLocalDateTime(value ?? null);

const resolveTeamName = (team: Match['team1'], fallbackTeams: Team[]): string => {
  if (team && typeof team === 'object') {
    if ('name' in team && team?.name) {
      return team.name as string;
    }
    if ('players' in team && Array.isArray((team as any).players) && (team as any).players.length > 0) {
      const compact = (team as any).players.map((player: any) => {
        const piece = [player.firstName, player.lastName].filter(Boolean).join(' ');
        return piece || 'Player';
      });
      if (compact.length > 0) {
        return compact.join(' & ');
      }
    }
  }

  const rawId = typeof team === 'string' ? team : (team as any)?.$id;
  if (rawId) {
    const matchTeam = fallbackTeams.find((candidate) => candidate.$id === rawId);
    if (matchTeam?.name) {
      return matchTeam.name;
    }
  }

  return 'TBD';
};

const getTeamId = (team?: Match['team1']): string | null => {
  if (!team) return null;
  if (typeof team === 'string') return team;
  if (typeof team === 'object' && '$id' in team && typeof (team as Team).$id === 'string') {
    return (team as Team).$id;
  }
  return null;
};

const findTeamById = (id: string | null, allTeams: Team[], fallback?: Match['team1']): Team | undefined => {
  if (!id) return undefined;
  const fromList = allTeams.find((team) => team.$id === id);
  if (fromList) return fromList;
  if (fallback && typeof fallback === 'object' && '$id' in fallback && (fallback as Team).$id === id) {
    return fallback as Team;
  }
  return undefined;
};

const normalizePointsValue = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return 0;
  }
  if (numeric <= 0) {
    return 0;
  }
  return Math.round(numeric);
};

const extractSetData = (match?: Match | null) => {
  const rawTeam1 = match && Array.isArray(match.team1Points) ? match.team1Points : [];
  const rawTeam2 = match && Array.isArray(match.team2Points) ? match.team2Points : [];
  const rawResults = match && Array.isArray(match.setResults) ? match.setResults : [];
  const length = Math.max(rawTeam1.length, rawTeam2.length, rawResults.length, 1);

  const team1 = Array.from({ length }, (_, index) => normalizePointsValue(rawTeam1[index]));
  const team2 = Array.from({ length }, (_, index) => normalizePointsValue(rawTeam2[index]));
  const results = Array.from({ length }, (_, index) => {
    const candidate = Number(rawResults[index]);
    return candidate === 1 || candidate === 2 ? candidate : 0;
  });

  return { team1, team2, results };
};

export default function MatchEditModal({
  opened,
  match,
  fields = [],
  teams = [],
  onClose,
  onSave,
}: MatchEditModalProps) {
  const [startValue, setStartValue] = useState<Date | null>(null);
  const [endValue, setEndValue] = useState<Date | null>(null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [team1Id, setTeam1Id] = useState<string | null>(null);
  const [team2Id, setTeam2Id] = useState<string | null>(null);
  const [refereeId, setRefereeId] = useState<string | null>(null);
  const [team1Points, setTeam1Points] = useState<number[]>([0]);
  const [team2Points, setTeam2Points] = useState<number[]>([0]);
  const [setResults, setSetResults] = useState<number[]>([0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match || !opened) {
      setStartValue(null);
      setEndValue(null);
      setFieldId(null);
      setTeam1Id(null);
      setTeam2Id(null);
      setRefereeId(null);
      setTeam1Points([0]);
      setTeam2Points([0]);
      setSetResults([0]);
      setError(null);
      return;
    }

    setStartValue(coerceDate(match.start));
    setEndValue(coerceDate(match.end));
    setFieldId(match.field && typeof match.field === 'object' ? match.field.$id : null);
    setTeam1Id(getTeamId(match.team1));
    setTeam2Id(getTeamId(match.team2));
    setRefereeId(getTeamId(match.referee));

    const aligned = extractSetData(match);
    setTeam1Points(aligned.team1);
    setTeam2Points(aligned.team2);
    setSetResults(aligned.results);
    setError(null);
  }, [match?.$id, opened]);

  const matchTeam1Id = useMemo(() => getTeamId(match?.team1), [match?.team1]);
  const matchTeam2Id = useMemo(() => getTeamId(match?.team2), [match?.team2]);
  const matchRefereeId = useMemo(() => getTeamId(match?.referee), [match?.referee]);

  const teamOptions = useMemo(() => {
    const options = teams.map((team) => ({
      value: team.$id,
      label: resolveTeamName(team, teams),
    }));

    const ensureOption = (id: string | null, label: string) => {
      if (!id || !label) return;
      if (!options.some((option) => option.value === id)) {
        options.push({ value: id, label });
      }
    };

    ensureOption(matchTeam1Id, resolveTeamName(match?.team1, teams));
    ensureOption(matchTeam2Id, resolveTeamName(match?.team2, teams));
    ensureOption(matchRefereeId, resolveTeamName(match?.referee, teams));

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [teams, matchTeam1Id, matchTeam2Id, matchRefereeId, match?.team1, match?.team2, match?.referee]);

  const team1Options = useMemo(
    () => teamOptions.filter((option) => !team2Id || option.value === team1Id || option.value !== team2Id),
    [teamOptions, team1Id, team2Id],
  );

  const team2Options = useMemo(
    () => teamOptions.filter((option) => !team1Id || option.value === team2Id || option.value !== team1Id),
    [teamOptions, team1Id, team2Id],
  );

  const fieldOptions = useMemo(
    () => fields.map((field) => ({
      value: field.$id,
      label: field.name || `Field ${field.fieldNumber ?? ''}`.trim(),
    })),
    [fields],
  );

  const selectedTeam1 = useMemo(
    () => findTeamById(team1Id, teams, match?.team1),
    [team1Id, teams, match?.team1],
  );
  const selectedTeam2 = useMemo(
    () => findTeamById(team2Id, teams, match?.team2),
    [team2Id, teams, match?.team2],
  );
  const selectedReferee = useMemo(
    () => findTeamById(refereeId, teams, match?.referee),
    [refereeId, teams, match?.referee],
  );

  const team1DisplayName = selectedTeam1 ? resolveTeamName(selectedTeam1, teams) : 'TBD';
  const team2DisplayName = selectedTeam2 ? resolveTeamName(selectedTeam2, teams) : 'TBD';

  const resultOptions = useMemo(
    () => [
      { value: '0', label: 'Not decided' },
      { value: '1', label: team1DisplayName === 'TBD' ? 'Team 1' : team1DisplayName },
      { value: '2', label: team2DisplayName === 'TBD' ? 'Team 2' : team2DisplayName },
    ],
    [team1DisplayName, team2DisplayName],
  );

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleStartDateChange = (value: Date | string | null) => {
    setStartValue(parseLocalDateTime(value));
  };

  const handleEndDateChange = (value: Date | string | null) => {
    setEndValue(parseLocalDateTime(value));
  };

  const handlePointsChange = (team: 'team1' | 'team2', index: number, value: string | number | null) => {
    const sanitized = normalizePointsValue(value ?? 0);
    if (team === 'team1') {
      setTeam1Points((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
    } else {
      setTeam2Points((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });
    }
  };

  const handleResultChange = (index: number, value: string | null) => {
    const numeric = value ? Number(value) : 0;
    setSetResults((prev) => {
      const next = [...prev];
      next[index] = numeric === 1 || numeric === 2 ? numeric : 0;
      return next;
    });
  };

  const handleAddSet = () => {
    setTeam1Points((prev) => [...prev, 0]);
    setTeam2Points((prev) => [...prev, 0]);
    setSetResults((prev) => [...prev, 0]);
  };

  const handleRemoveSet = () => {
    setTeam1Points((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setTeam2Points((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setSetResults((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const sanitizeResults = (values: number[]): number[] => values.map((value) => (value === 1 || value === 2 ? value : 0));

  const sanitizePoints = (values: number[]): number[] => values.map((value) => normalizePointsValue(value));

  const findFieldById = (id: string | null): Field | undefined => {
    if (!id) return undefined;
    const fromList = fields.find((field) => field.$id === id);
    if (fromList) return fromList;
    if (match?.field && typeof match.field === 'object' && match.field.$id === id) {
      return match.field;
    }
    return undefined;
  };

  const handleSave = () => {
    if (!match) {
      handleClose();
      return;
    }

    if (!startValue || !endValue) {
      setError('Start and end times are required.');
      return;
    }

    if (endValue.getTime() <= startValue.getTime()) {
      setError('End time must be after the start time.');
      return;
    }

    if (team1Id && team2Id && team1Id === team2Id) {
      setError('Team 1 and Team 2 must be different.');
      return;
    }

    const updated: Match = {
      ...match,
      start: formatLocalDateTime(startValue),
      end: formatLocalDateTime(endValue),
      team1Points: sanitizePoints(team1Points),
      team2Points: sanitizePoints(team2Points),
      setResults: sanitizeResults(setResults),
    };

    const nextField = findFieldById(fieldId);
    if (nextField) {
      updated.field = { ...nextField };
    } else {
      delete (updated as any).field;
    }

    const nextTeam1 = selectedTeam1;
    if (nextTeam1) {
      updated.team1 = { ...nextTeam1 };
    } else {
      delete (updated as any).team1;
    }

    const nextTeam2 = selectedTeam2;
    if (nextTeam2) {
      updated.team2 = { ...nextTeam2 };
    } else {
      delete (updated as any).team2;
    }

    const nextRef = selectedReferee;
    if (nextRef) {
      updated.referee = { ...nextRef };
    } else {
      delete (updated as any).referee;
    }

    setError(null);
    onSave(updated);
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Edit Match" centered size="lg">
      <Stack gap="md">
        {error && (
          <Alert color="red" radius="md" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="dimmed">Match</Text>
            <Text fw={600}>{match?.matchId ?? match?.$id}</Text>
          </div>
          <div className="text-right">
            <Text size="sm" c="dimmed">Bracket</Text>
            <Text fw={600}>
              {match?.losersBracket ? 'Losers Bracket' : 'Main Schedule'}
            </Text>
          </div>
        </Group>

        <Select
          label="Team 1"
          data={team1Options}
          value={team1Id}
          onChange={setTeam1Id}
          placeholder="Select team"
          clearable
        />
        <Select
          label="Team 2"
          data={team2Options}
          value={team2Id}
          onChange={setTeam2Id}
          placeholder="Select team"
          clearable
        />
        <Select
          label="Referee"
          data={teamOptions}
          value={refereeId}
          onChange={setRefereeId}
          placeholder="Select referee team"
          clearable
        />

        {fieldOptions.length > 0 && (
          <Select
            label="Field"
            data={fieldOptions}
            value={fieldId}
            onChange={setFieldId}
            placeholder="Select field"
            clearable
          />
        )}

        <DateTimePicker
          label="Start time"
          value={startValue}
          onChange={handleStartDateChange}
          withSeconds
          required
        />
        <DateTimePicker
          label="End time"
          value={endValue}
          onChange={handleEndDateChange}
          withSeconds
          required
          minDate={startValue ?? undefined}
        />

        <Divider label="Sets" />

        {setResults.map((result, index) => (
          <Group key={`set-${index}`} align="flex-end" gap="md" grow>
            <NumberInput
              label={`${team1DisplayName === 'TBD' ? 'Team 1' : team1DisplayName} – Set ${index + 1}`}
              value={team1Points[index]}
              min={0}
              step={1}
              onChange={(value) => handlePointsChange('team1', index, value)}
            />
            <NumberInput
              label={`${team2DisplayName === 'TBD' ? 'Team 2' : team2DisplayName} – Set ${index + 1}`}
              value={team2Points[index]}
              min={0}
              step={1}
              onChange={(value) => handlePointsChange('team2', index, value)}
            />
            <Select
              label="Set winner"
              data={resultOptions}
              value={String(result ?? 0)}
              onChange={(value) => handleResultChange(index, value)}
            />
          </Group>
        ))}

        <Group justify="space-between">
          <Group gap="xs">
            <Button variant="light" onClick={handleAddSet}>
              Add set
            </Button>
            {setResults.length > 1 && (
              <Button variant="light" color="red" onClick={handleRemoveSet}>
                Remove last set
              </Button>
            )}
          </Group>
        </Group>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!startValue || !endValue}>Save changes</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
