'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Event, getTeamAvatarUrl, Match } from '@/types';
import { Modal, Button, Group, Paper, Text, Avatar, Badge, ActionIcon } from '@mantine/core';

type ScorePayload = {
  matchId: string;
  team1Points: number[];
  team2Points: number[];
  setResults: number[];
};

interface ScoreUpdateModalProps {
  match: Match;
  tournament: Event;
  canManage: boolean;
  onSubmit?: (matchId: string, team1Points: number[], team2Points: number[], setResults: number[]) => Promise<void>;
  onScoreChange?: (payload: ScorePayload) => Promise<void> | void;
  onSetComplete?: (payload: ScorePayload) => Promise<void>;
  onMatchComplete?: (payload: ScorePayload & { eventId: string }) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export default function ScoreUpdateModal({
  match,
  tournament,
  canManage,
  onSubmit,
  onScoreChange,
  onSetComplete,
  onMatchComplete,
  onClose,
  isOpen,
}: ScoreUpdateModalProps) {
  const [team1Points, setTeam1Points] = useState<number[]>(match.team1Points || []);
  const [team2Points, setTeam2Points] = useState<number[]>(match.team2Points || []);
  const [setResults, setSetResults] = useState<number[]>(match.setResults || []);
  const [currentSet, setCurrentSet] = useState(0);
  const [loading, setLoading] = useState(false);
  const matchCompletionTriggered = useRef(false);
  const sportAllowsDraw = Boolean(tournament?.sport?.usePointsForDraw);

  const isPlayoffMatch =
    tournament.eventType === 'TOURNAMENT' ||
    Boolean(
      match.losersBracket ||
      match.previousLeftId ||
      match.previousRightId ||
      match.winnerNextMatchId ||
      match.loserNextMatchId,
    );

  const targetPointsConfig = isPlayoffMatch
    ? match.losersBracket
      ? tournament.loserBracketPointsToVictory
      : tournament.winnerBracketPointsToVictory
    : tournament.pointsToVictory;

  const derivedSetCount = useMemo(() => {
    const targetLen = Array.isArray(targetPointsConfig) ? targetPointsConfig.length : 0;
    const bracketConfigured = match.losersBracket ? tournament.loserSetCount : tournament.winnerSetCount;
    const leagueConfigured =
      typeof tournament.setsPerMatch === 'number' ? tournament.setsPerMatch : tournament.leagueConfig?.setsPerMatch;
    const knownLengths = Math.max(setResults.length || 0, team1Points.length || 0, team2Points.length || 0);
    const base = Math.max(targetLen, bracketConfigured || 0, leagueConfigured || 0, knownLengths, 1);
    const minSets = sportAllowsDraw ? 1 : 3;
    return Math.max(base, minSets);
  }, [match.losersBracket, sportAllowsDraw, targetPointsConfig, tournament.leagueConfig?.setsPerMatch, tournament.loserSetCount, tournament.setsPerMatch, tournament.winnerSetCount, setResults.length, team1Points.length, team2Points.length]);

  const totalSets = derivedSetCount;

  const getSetTarget = (index: number): number | null => {
    if (!Array.isArray(targetPointsConfig) || targetPointsConfig.length === 0) return null;
    const value = targetPointsConfig[index];
    if (Number.isFinite(value)) return Number(value);
    const fallback = targetPointsConfig[targetPointsConfig.length - 1];
    return Number.isFinite(fallback) ? Number(fallback) : null;
  };

  // Initialize arrays and determine current set
  useEffect(() => {
    matchCompletionTriggered.current = false;
    const length = derivedSetCount;
    if (team1Points.length === 0) setTeam1Points(new Array(length).fill(0));
    if (team2Points.length === 0) setTeam2Points(new Array(length).fill(0));
    if (setResults.length === 0) setSetResults(new Array(length).fill(0));

    const baseline = setResults.length > 0 ? setResults : new Array(length).fill(0);
    const idx = baseline.findIndex((r: number) => r === 0);
    setCurrentSet(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.$id, tournament.$id, derivedSetCount]);

  useEffect(() => {
    const length = derivedSetCount;
    if (team1Points.length < length) {
      setTeam1Points((prev) => [...prev, ...new Array(length - prev.length).fill(0)]);
    }
    if (team2Points.length < length) {
      setTeam2Points((prev) => [...prev, ...new Array(length - prev.length).fill(0)]);
    }
    if (setResults.length < length) {
      setSetResults((prev) => [...prev, ...new Array(length - prev.length).fill(0)]);
    }
  }, [derivedSetCount, setResults.length, team1Points.length, team2Points.length]);

  const getTeamName = (teamData: any) => {
    if (teamData?.name) return teamData.name;
    if (teamData?.players?.length > 0) {
      return teamData.players.map((p: any) => `${p.firstName} ${p.lastName}`).join(' & ');
    }
    return 'TBD';
  };

  const emitScoreChange = (nextTeam1: number[], nextTeam2: number[], nextResults: number[]) => {
    if (typeof onScoreChange === 'function') {
      Promise.resolve(
        onScoreChange({
          matchId: match.$id,
          team1Points: nextTeam1,
          team2Points: nextTeam2,
          setResults: nextResults,
        }),
      ).catch((err) => {
        console.warn('Non-blocking score update failed:', err);
      });
    }
  };

  const updateScore = (team: 1 | 2, increment: boolean) => {
    if (!canManage) return;
    const target = getSetTarget(currentSet);
    const current = team === 1 ? (team1Points[currentSet] || 0) : (team2Points[currentSet] || 0);
    const other = team === 1 ? (team2Points[currentSet] || 0) : (team1Points[currentSet] || 0);
    const canIncrementWithLimit =
      (target ? current < target && other < target : true) ||
      Math.abs(current - other) <= 1;

    if (team === 1) {
      const next = [...team1Points];
      const proposed = (next[currentSet] || 0) + (increment ? 1 : -1);
      if (increment && target && !canIncrementWithLimit && proposed > target) {
        return;
      }
      const nextValue =
        increment && target && Math.abs(current - other) > 1
          ? Math.min(target, proposed)
          : proposed;
      next[currentSet] = Math.max(0, nextValue);
      setTeam1Points(next);
      emitScoreChange(next, team2Points, setResults);
    } else {
      const next = [...team2Points];
      const proposed = (next[currentSet] || 0) + (increment ? 1 : -1);
      if (increment && target && !canIncrementWithLimit && proposed > target) {
        return;
      }
      const nextValue =
        increment && target && Math.abs(current - other) > 1
          ? Math.min(target, proposed)
          : proposed;
      next[currentSet] = Math.max(0, nextValue);
      setTeam2Points(next);
      emitScoreChange(team1Points, next, setResults);
    }
  };

  const isWinConditionMet = (results?: number[]) => {
    const target = getSetTarget(currentSet);
    if (!target) return false;
    const t1 = team1Points[currentSet] || 0;
    const t2 = team2Points[currentSet] || 0;
    const leader = Math.max(t1, t2);
    const diff = Math.abs(t1 - t2);
    const winner = leader === t1 ? 1 : 2;
    const projectedResults = results ?? setResults;
    const withCurrent = [...projectedResults];
    if (withCurrent[currentSet] === 0) {
      withCurrent[currentSet] = winner;
    }
    return leader >= target && diff >= 2;
  };

  const isMatchComplete = (results?: number[]) => {
    const source = results ?? setResults;
    if (!sportAllowsDraw && totalSets <= 1) {
      return isWinConditionMet(source);
    }
    const team1Wins = source.filter((r) => r === 1).length;
    const team2Wins = source.filter((r) => r === 2).length;
    const setsNeeded = Math.ceil((totalSets || 1) / 2);
    return team1Wins >= setsNeeded || team2Wins >= setsNeeded;
  };

  const confirmSet = async () => {
    const t1 = team1Points[currentSet] || 0;
    const t2 = team2Points[currentSet] || 0;
    const target = getSetTarget(currentSet);
    const diff = Math.abs(t1 - t2);
    const leader = Math.max(t1, t2);
    const winConditionMet = Boolean(target && leader >= target && diff >= 2);

    if (!winConditionMet) {
       
      alert('A team must reach the target points and win by 2 to confirm the set.');
      return;
    }
    const nextResults = [...setResults];
    nextResults[currentSet] = t1 > t2 ? 1 : 2;

    const payload: ScorePayload = {
      matchId: match.$id,
      team1Points,
      team2Points,
      setResults: nextResults,
    };

    try {
      if (onSetComplete) {
        await onSetComplete(payload);
      }
    } catch (err) {
      console.error('Failed to persist set result:', err);
       
      alert('Failed to save set result. Please retry.');
      return;
    }

    setSetResults(nextResults);
    if (currentSet + 1 < totalSets) {
      setCurrentSet(currentSet + 1);
    }

    if (onMatchComplete && !matchCompletionTriggered.current && isMatchComplete(nextResults)) {
      try {
        await onMatchComplete({ ...payload, eventId: tournament.$id });
        matchCompletionTriggered.current = true;
      } catch (err) {
        console.error('Failed to finalize match:', err);
         
        alert('Failed to finalize match. Please retry.');
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const submitFn = onSubmit ?? (async () => {});
    try {
      await submitFn(match.$id, team1Points, team2Points, setResults);

      if (onMatchComplete && !matchCompletionTriggered.current && isMatchComplete()) {
        await onMatchComplete({
          matchId: match.$id,
          team1Points,
          team2Points,
          setResults,
          eventId: tournament.$id,
        });
        matchCompletionTriggered.current = true;
      }
    } catch (e) {
      console.error('Failed to update score:', e);
       
      alert('Failed to update score. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canIncrementScore = () => {
    if (!canManage) return false;
    if (isMatchComplete()) return false;
    return setResults[currentSet] === 0;
  };

  const canConfirmCurrentSet =
    canManage &&
    !sportAllowsDraw &&
    totalSets > 1 &&
    setResults[currentSet] === 0 &&
    isWinConditionMet();

  return (
    <Modal opened={isOpen} onClose={onClose} title={<Text fw={600}>Update Match Score</Text>} centered>
      <div className="mb-4">
        <Text c="dimmed" size="sm">
          Match {match.matchId} • Best of {totalSets}
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
          {canConfirmCurrentSet && (
            <Button onClick={confirmSet}>
              Confirm Set {currentSet + 1}
            </Button>
          )}
          {canManage && (
            <Button onClick={handleSubmit} loading={loading} disabled={!sportAllowsDraw && !isMatchComplete()}>
              Save Match
            </Button>
          )}
        </Group>
      </Group>
    </Modal>
  );
}
