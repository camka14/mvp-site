import { Team, UserData, getUserAvatarUrl, getTeamAvatarUrl } from '@/types';
import { Paper, Group, Avatar, Text, Badge, SimpleGrid } from '@mantine/core';

interface TeamCardProps {
  team: Team;
  showStats?: boolean;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function TeamCard({
  team,
  showStats = true,
  actions,
  onClick,
  className = ''
}: TeamCardProps) {

  return (
    <Paper withBorder radius="md" p="md" className={className} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <Group align="flex-start" justify="space-between" mb="sm" wrap="nowrap">
        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Avatar src={getTeamAvatarUrl(team, 56)} alt={team.name || 'Team'} size={56} radius="xl" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} size="lg" truncate>{team.name || 'Unnamed Team'}</Text>
            <Group gap={6} mt={4}>
              <Text size="sm" c="dimmed">{team.division} Division</Text>
              {team.sport && <Badge variant="light" color="blue" size="xs">{team.sport}</Badge>}
              {team.isFull && <Badge variant="light" color="red" size="xs">Full</Badge>}
            </Group>
            <Group gap={6} mt={6}>
              {team.wins > 0 || team.losses > 0 ? (
                <Badge size="xs" variant="light" color={team.winRate >= 75 ? 'green' : team.winRate >= 50 ? 'yellow' : 'red'}>
                  {team.winRate}% win rate
                </Badge>
              ) : (
                <Badge size="xs" variant="light" color="gray">New Team</Badge>
              )}
            </Group>
          </div>
        </Group>
        {actions}
      </Group>

      {showStats && (
        <SimpleGrid cols={3} spacing="sm" mb="sm">
          <div style={{ textAlign: 'center' }}>
            <Text fw={600}>{team.wins}</Text>
            <Text size="xs" c="dimmed">Wins</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text fw={600}>{team.losses}</Text>
            <Text size="xs" c="dimmed">Losses</Text>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text fw={600}>{team.currentSize}/{team.teamSize}</Text>
            <Text size="xs" c="dimmed">Players</Text>
          </div>
        </SimpleGrid>
      )}

      <Group justify="space-between" mb="xs">
        <Group gap={6}>
          <Text size="sm" c="dimmed">Members:</Text>
          <Group gap={-8}>
            {team.players?.slice(0, 5).map((player, index) => (
              <Avatar key={player.$id} src={getUserAvatarUrl(player, 32)} alt={player.fullName} size={32} radius="xl" />
            ))}
            {team.currentSize > 5 && (
              <Avatar size={32} radius="xl" color="gray">+{team.currentSize - 5}</Avatar>
            )}
          </Group>
        </Group>
      </Group>

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
