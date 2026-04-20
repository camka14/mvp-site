import { extractDivisionTokenFromId, inferDivisionDetails, parseDivisionToken } from '@/lib/divisionTypes';
import { Team, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';
import type { TeamPlayerRegistration } from '@/types';
import { Paper, Group, Avatar, Text, Badge, SimpleGrid } from '@mantine/core';

interface TeamCardProps {
  team: Team;
  showStats?: boolean;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const ACTIVE_PLAYER_REGISTRATION_STATUSES = new Set(['ACTIVE', 'STARTED']);

const isActivePlayerRegistration = (registration: TeamPlayerRegistration): boolean => (
  ACTIVE_PLAYER_REGISTRATION_STATUSES.has(String(registration.status ?? '').trim().toUpperCase())
);

export default function TeamCard({
  team,
  showStats = true,
  actions,
  onClick,
  className = ''
}: TeamCardProps) {
  const visibleMembers = (team.players ?? []).filter((player) => {
    if (player.isIdentityHidden) {
      return false;
    }

    const normalizedHandle = player.userName?.trim().toLowerCase();
    return normalizedHandle !== 'hidden';
  });
  const visibleMembersPreview = visibleMembers.slice(0, 5);
  const hiddenVisibleMemberCount = Math.max(visibleMembers.length - visibleMembersPreview.length, 0);
  const jerseyNumberByUserId = new Map(
    (team.playerRegistrations ?? [])
      .filter((registration) => registration.userId && isActivePlayerRegistration(registration))
      .map((registration) => [registration.userId, registration.jerseyNumber ?? null] as const),
  );

  const resolveLabel = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };
  const looksLikeLegacyDivisionMetadataLabel = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    const hasWordSkill = /\bskill\b/.test(normalized);
    const hasWordAge = /\bage\b/.test(normalized);
    const hasTokenPattern = normalized.includes('skill_') && normalized.includes('_age_');
    return (hasWordSkill && hasWordAge) || hasTokenPattern;
  };
  const toDisplayDivisionLabel = (value: string | null): string | null => {
    if (!value) return null;
    return looksLikeLegacyDivisionMetadataLabel(value) ? null : value;
  };
  const looksLikeDivisionId = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('__division__')) return true;
    if (normalized.startsWith('division_') || normalized.startsWith('div_')) return true;
    return false;
  };

  const divisionObject = typeof team.division === 'object' && team.division !== null
    ? team.division
    : null;

  const divisionLabelFromObjectName = toDisplayDivisionLabel(resolveLabel(divisionObject?.name));
  const divisionLabelFromObjectTypeName = toDisplayDivisionLabel(resolveLabel(divisionObject?.divisionTypeName));
  const divisionLabelFromObjectSkillLevel = toDisplayDivisionLabel(resolveLabel(divisionObject?.skillLevel));
  const divisionLabelFromObjectId = (() => {
    const divisionId = resolveLabel(divisionObject?.id);
    if (!divisionId) return null;
    const inferred = inferDivisionDetails({
      identifier: divisionId,
      sportInput: team.sport,
    });
    return toDisplayDivisionLabel(resolveLabel(inferred.divisionTypeName) ?? inferred.defaultName);
  })();

  const divisionLabelFromTypeName = toDisplayDivisionLabel(resolveLabel(team.divisionTypeName));

  const divisionLabelFromString = (() => {
    const rawDivision = resolveLabel(typeof team.division === 'string' ? team.division : null);
    if (!rawDivision) return null;

    if (!looksLikeDivisionId(rawDivision)) {
      return toDisplayDivisionLabel(rawDivision);
    }

    const divisionToken = extractDivisionTokenFromId(rawDivision);
    const parsedToken = divisionToken ? parseDivisionToken(divisionToken) : null;
    if (!parsedToken) {
      return null;
    }

    return toDisplayDivisionLabel(inferDivisionDetails({
      identifier: rawDivision,
      sportInput: team.sport,
    }).defaultName);
  })();

  const divisionLabel = divisionLabelFromObjectName
    ?? divisionLabelFromTypeName
    ?? divisionLabelFromObjectTypeName
    ?? divisionLabelFromObjectSkillLevel
    ?? divisionLabelFromObjectId
    ?? divisionLabelFromString
    ?? 'Division';

  return (
    <Paper withBorder radius="md" p="md" className={className} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <Group align="flex-start" justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Avatar src={getTeamAvatarUrl(team, 56)} alt={team.name || 'Team'} size={56} radius="xl" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="lg" truncate>{team.name || 'Unnamed Team'}</Text>
            <Group gap={6} mt={4}>
              <Text size="sm" c="dimmed">{divisionLabel}</Text>
              {team.sport && <Badge variant="light" color="blue" size="xs">{team.sport}</Badge>}
            </Group>
            <Group gap={6} mt={6}>
              <Badge size="xs" variant="light" color="gray">Team</Badge>
            </Group>
          </div>
        </Group>
        {actions}
      </Group>

      {showStats && (
        <SimpleGrid cols={1} spacing="sm" mb="sm">
          <div style={{ textAlign: 'center' }}>
            <Text fw={600}>{team.currentSize}/{team.teamSize}</Text>
            <Text size="xs" c="dimmed">Players</Text>
          </div>
        </SimpleGrid>
      )}

      {visibleMembers.length > 0 && (
        <Group justify="space-between" mb="xs">
          <Group gap={6}>
            <Text size="sm" c="dimmed">Members:</Text>
            <Group gap={-8}>
              {visibleMembersPreview.map((player) => (
                <Avatar
                  key={player.$id}
                  src={getUserAvatarUrl(player, 32, jerseyNumberByUserId.get(player.$id))}
                  alt={player.fullName}
                  size={32}
                  radius="xl"
                />
              ))}
              {hiddenVisibleMemberCount > 0 && (
                <Avatar size={32} radius="xl" color="gray">+{hiddenVisibleMemberCount}</Avatar>
              )}
            </Group>
          </Group>
        </Group>
      )}

      <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={8}>
          {team.pending && team.pending.length > 0 && (
            <Text size="xs" c="orange" fw={600}>{team.pending.length} pending</Text>
          )}
        </Group>
        <Text size="xs" c={team.isFull ? 'red' : 'green'} fw={600}>
          {team.isFull ? 'Team Full' : `${team.teamSize - team.currentSize} spots left`}
        </Text>
      </Group>
    </Paper>
  );
}
