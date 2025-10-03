import { useMemo } from 'react';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';

import type { Match } from '@/types';

interface PlayoffBracketProps {
  matches: Match[];
  fieldLookup: Map<string, string>;
  getTeamLabel: (match: Match, key: 'team1' | 'team2') => string;
  formatDateTime: (value: string, timeZone?: string) => string;
}

interface BracketNode {
  match: Match;
  children: BracketNode[];
}

const buildBracketTree = (playoffMatches: Match[]): BracketNode | null => {
  if (!playoffMatches.length) {
    return null;
  }

  const sortedByStart = playoffMatches
    .slice()
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const finalMatch = sortedByStart[sortedByStart.length - 1];
  const visited = new Set<string>();

  const buildNode = (current: Match): BracketNode => {
    visited.add(current.$id);

    const seeds = [current.team1Seed, current.team2Seed].filter(
      (seed): seed is number => typeof seed === 'number' && Number.isFinite(seed),
    );

    const children: BracketNode[] = [];
    const usedChildIds = new Set<string>();

    seeds.forEach((seed) => {
      const candidates = sortedByStart
        .filter((match) => match.$id !== current.$id)
        .filter((match) => new Date(match.start).getTime() < new Date(current.start).getTime())
        .filter((match) => match.team1Seed === seed || match.team2Seed === seed)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

      const child = candidates.find((match) => !usedChildIds.has(match.$id));
      if (child && !visited.has(child.$id)) {
        usedChildIds.add(child.$id);
        children.push(buildNode(child));
      }
    });

    return { match: current, children };
  };

  return buildNode(finalMatch);
};

const collectRounds = (root: BracketNode | null) => {
  if (!root) return [] as { depth: number; matches: Match[] }[];

  const byDepth = new Map<number, Match[]>();

  const traverse = (node: BracketNode, depth: number) => {
    if (!byDepth.has(depth)) {
      byDepth.set(depth, []);
    }
    byDepth.get(depth)!.push(node.match);
    node.children.forEach((child) => traverse(child, depth + 1));
  };

  traverse(root, 0);

  return Array.from(byDepth.entries())
    .map(([depth, matches]) => ({ depth, matches }))
    .sort((a, b) => b.depth - a.depth);
};

const getRoundLabel = (roundMatches: Match[], roundIndex: number, totalRounds: number) => {
  if (roundIndex === totalRounds - 1) return 'Final';
  if (roundIndex === totalRounds - 2 && totalRounds > 1) return 'Semifinals';

  const teamCount = roundMatches.length * 2;
  if (teamCount === 8) return 'Quarterfinals';
  if (teamCount === 16) return 'Round of 16';
  if (teamCount === 32) return 'Round of 32';

  return `Round ${roundIndex + 1}`;
};

export function PlayoffBracket({ matches, fieldLookup, getTeamLabel, formatDateTime }: PlayoffBracketProps) {
  const playoffMatches = useMemo(
    () => matches.filter((match) => match.matchType === 'playoff'),
    [matches],
  );

  const bracketRoot = useMemo(() => buildBracketTree(playoffMatches), [playoffMatches]);
  const rounds = useMemo(() => collectRounds(bracketRoot), [bracketRoot]);

  if (!playoffMatches.length) {
    return (
      <Paper withBorder radius="md" p="xl" ta="center">
        <Text c="dimmed">No playoff bracket available for this league yet.</Text>
      </Paper>
    );
  }

  if (!bracketRoot || rounds.length === 0) {
    return (
      <Paper withBorder radius="md" p="xl" ta="center">
        <Text c="dimmed">Playoff matches have not been seeded into a bracket yet.</Text>
      </Paper>
    );
  }

  const totalRounds = rounds.length;

  return (
    <Group align="flex-start" justify="center" gap="lg" wrap="nowrap" className="overflow-x-auto pb-4">
      {rounds.map((round, index) => (
        <Stack key={round.depth} gap="md" className="min-w-[220px]">
          <Text fw={600} ta="center">
            {getRoundLabel(round.matches, index, totalRounds)}
          </Text>
          {round.matches.map((match) => (
            <Paper key={match.$id} withBorder radius="md" p="md" shadow="xs">
              <Stack gap={4}>
                <Group justify="space-between" wrap="wrap">
                  <Text fw={600} size="sm">
                    {formatDateTime(match.start, match.timezone)}
                  </Text>
                  <Badge color="grape" variant="light" size="sm">
                    Playoff
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {(
                    match.fieldId ? fieldLookup.get(match.fieldId) : undefined
                  ) || `Field ${match.fieldId || 'TBD'}`}
                </Text>
                <Group gap="sm" align="center">
                  <Text fw={600}>{getTeamLabel(match, 'team1')}</Text>
                  <Text c="dimmed">vs</Text>
                  <Text fw={600}>{getTeamLabel(match, 'team2')}</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Ends {formatDateTime(match.end, match.timezone)}
                </Text>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ))}
    </Group>
  );
}

export default PlayoffBracket;
