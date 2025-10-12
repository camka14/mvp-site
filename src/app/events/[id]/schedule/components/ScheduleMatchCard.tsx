'use client';

import { Paper, Group, Text } from '@mantine/core';
import { Match } from '@/types';

interface ScheduleMatchCardProps {
  match: Match;
  onClick?: () => void;
  className?: string;
  canManage?: boolean; // compatibility
}

const getTeamName = (team: Match['team1']) => {
  if (team && typeof team === 'object' && 'name' in team && team?.name) {
    return team.name as string;
  }
  return 'TBD';
};

const getFieldLabel = (field: Match['field']) => {
  if (!field) {
    return null;
  }

  if (typeof field === 'string') {
    return field;
  }

  if (typeof field === 'object') {
    const fieldNumber = 'fieldNumber' in field ? field.fieldNumber : undefined;
    const fieldName = 'name' in field ? field.name : undefined;

    if (typeof fieldNumber === 'number' && Number.isFinite(fieldNumber)) {
      return fieldName ? `Field ${fieldNumber} · ${fieldName}` : `Field ${fieldNumber}`;
    }

    if (fieldName) {
      return fieldName;
    }
  }

  return null;
};

export default function ScheduleMatchCard({ match, onClick, className = '', canManage }: ScheduleMatchCardProps) {
  const clickable = typeof onClick === 'function';

  const borderColor = match.losersBracket
    ? 'var(--mantine-color-orange-4)'
    : 'var(--mantine-color-blue-4)';

  const fieldLabel = getFieldLabel(match.field);

  return (
    <Paper
      withBorder
      radius="md"
      px="xs"
      className={`flex h-full flex-col justify-center gap-1 border-2 bg-white transition-shadow duration-200 ${
        clickable ? 'cursor-pointer hover:shadow-md' : ''
      } ${className}`}
      style={{ borderColor }}
      onClick={clickable ? onClick : undefined}
      title={canManage ? 'Click to edit match' : undefined}
    >
      <Group gap="xs" wrap="nowrap" justify="space-between" className="w-full">
        <Text size="sm" fw={600} truncate c="gray.8">
          {getTeamName(match.team1)}
        </Text>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          vs
        </Text>
        <Text size="sm" fw={600} truncate c="gray.8">
          {getTeamName(match.team2)}
        </Text>
      </Group>
      {fieldLabel && (
        <Text size="xs" c="dimmed" className="w-full text-right">
          {fieldLabel}
        </Text>
      )}
    </Paper>
  );
}
