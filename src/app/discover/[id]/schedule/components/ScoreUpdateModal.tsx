'use client';

import { useState, useEffect } from 'react';
import { Event, getTeamAvatarUrl, Match } from '@/types';
import { Modal, Button, Group, Paper, Text, Avatar, Badge, Title, ActionIcon } from '@mantine/core';

interface ScoreUpdateModalProps {
  match: Match
  tournament: Event;
  canManage: boolean;
  onSubmit: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export default function ScoreUpdateModal({
  match,
  tournament,
  canManage,
  onSubmit,
  onClose,
  isOpen,
}: ScoreUpdateModalProps) {
  const [team1Points, setTeam1Points] = useState<number[]>(match.team1Points || []);
  const [team2Points, setTeam2Points] = useState<number[]>(match.team2Points || []);
  const [setResults, setSetResults] = useState<number[]>(match.setResults || []);
  const [currentSet, setCurrentSet] = useState(0);
  const [loading, setLoading] = useState(false);

  // Initialize arrays and determine current set
  useEffect(() => {
    const maxSets = match.losersBracket ? tournament.loserSetCount || 1 : tournament.winnerSetCount || 1;
    if (team1Points.length === 0) setTeam1Points(new Array(maxSets).fill(0));
    if (team2Points.length === 0) setTeam2Points(new Array(maxSets).fill(0));
    if (setResults.length === 0) setSetResults(new Array(maxSets).fill(0));

    const baseline = setResults.length > 0 ? setResults : new Array(maxSets).fill(0);
    const idx = baseline.findIndex((r: number) => r === 0);
    setCurrentSet(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.$id, tournament.$id]);

  const getTeamName = (teamData: any) => {
    if (teamData?.name) return teamData.name;
    if (teamData?.players?.length > 0) {
      return teamData.players.map((p: any) => `${p.firstName} ${p.lastName}`).join(' & ');
    }
    return 'TBD';
  };

  const updateScore = (team: 1 | 2, increment: boolean) => {
    if (!canManage) return;
    if (team === 1) {
      const next = [...team1Points];
      next[currentSet] = Math.max(0, (next[currentSet] || 0) + (increment ? 1 : -1));
      setTeam1Points(next);
    } else {
      const next = [...team2Points];
      next[currentSet] = Math.max(0, (next[currentSet] || 0) + (increment ? 1 : -1));
      setTeam2Points(next);
    }
  };

  const confirmSet = () => {
    const t1 = team1Points[currentSet] || 0;
    const t2 = team2Points[currentSet] || 0;
    if (t1 === t2) {
      // eslint-disable-next-line no-alert
      alert('Set cannot end in a tie');
      return;
    }
    const next = [...setResults];
    next[currentSet] = t1 > t2 ? 1 : 2;
    setSetResults(next);
    if (currentSet + 1 < next.length) setCurrentSet(currentSet + 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(match.$id, team1Points, team2Points, setResults);
    } catch (e) {
      console.error('Failed to update score:', e);
      // eslint-disable-next-line no-alert
      alert('Failed to update score. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isMatchComplete = () => {
    const team1Wins = setResults.filter((r) => r === 1).length;
    const team2Wins = setResults.filter((r) => r === 2).length;
    const totalSets = match.losersBracket ? (tournament.loserSetCount || 1) : (tournament.winnerSetCount || 1);
    const setsNeeded = Math.ceil((totalSets || 1) / 2);
    return team1Wins >= setsNeeded || team2Wins >= setsNeeded;
  };

  const canIncrementScore = () => {
    if (!canManage) return false;
    if (isMatchComplete()) return false;
    return setResults[currentSet] === 0;
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title={<Title order={4}>Update Match Score</Title>} centered>
      <div className="mb-4">
        <Text c="dimmed" size="sm">
          Match {match.matchId} • Best of {setResults.length}
        </Text>
        {match.losersBracket && (
          <Badge mt={6} color="orange">Loser Bracket</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8">
        {/* Team 1 */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group>
              {match.team1 && (
                <Avatar src={getTeamAvatarUrl(match.team1, 40)} radius="xl" size={40} alt={getTeamName(match.team1)} />
              )}
              <Text fw={600}>{getTeamName(match.team1)}</Text>
            </Group>
            {canIncrementScore() && (
              <Group gap="xs">
                <ActionIcon variant="light" color="red" onClick={() => updateScore(1, false)} disabled={(team1Points[currentSet] || 0) === 0}>−</ActionIcon>
                <ActionIcon variant="light" color="green" onClick={() => updateScore(1, true)}>+</ActionIcon>
              </Group>
            )}
          </Group>
          <div style={{ textAlign: 'center' }}>
            <Text fw={700} size="xl">{team1Points[currentSet] || 0}</Text>
            <Group justify="center" gap="xs" mt={6}>
              {team1Points.map((points, index) => (
                <Text
                  key={`t1-${index}`}
                  size="sm"
                  className={`${index === currentSet ? 'bg-blue-100 text-blue-800' : setResults[index] === 1 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} px-2 py-1 rounded`}
                >
                  {points}
                </Text>
              ))}
            </Group>
          </div>
        </Paper>

        {/* Team 2 */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Group>
              {match.team2 && (
                <Avatar src={getTeamAvatarUrl(match.team2, 40)} radius="xl" size={40} alt={getTeamName(match.team2)} />
              )}
              <Text fw={600}>{getTeamName(match.team2)}</Text>
            </Group>
            {canIncrementScore() && (
              <Group gap="xs">
                <ActionIcon variant="light" color="red" onClick={() => updateScore(2, false)} disabled={(team2Points[currentSet] || 0) === 0}>−</ActionIcon>
                <ActionIcon variant="light" color="green" onClick={() => updateScore(2, true)}>+</ActionIcon>
              </Group>
            )}
          </Group>
          <div style={{ textAlign: 'center' }}>
            <Text fw={700} size="xl">{team2Points[currentSet] || 0}</Text>
            <Group justify="center" gap="xs" mt={6}>
              {team2Points.map((points, index) => (
                <Text
                  key={`t2-${index}`}
                  size="sm"
                  className={`${index === currentSet ? 'bg-blue-100 text-blue-800' : setResults[index] === 2 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'} px-2 py-1 rounded`}
                >
                  {points}
                </Text>
              ))}
            </Group>
          </div>
        </Paper>
      </div>

      <Group justify="space-between">
        <Button variant="default" onClick={onClose}>Close</Button>
        <Group>
          {canManage && setResults[currentSet] === 0 && (
            <Button onClick={confirmSet} disabled={(team1Points[currentSet] || 0) === (team2Points[currentSet] || 0)}>
              Confirm Set {currentSet + 1}
            </Button>
          )}
          {canManage && (
            <Button onClick={handleSubmit} loading={loading}>Save Match</Button>
          )}
        </Group>
      </Group>
    </Modal>
  );
}
