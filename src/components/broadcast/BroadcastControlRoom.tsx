'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { BROADCAST_STINGER_KINDS, type MatchPresentationStateV1 } from '@/server/broadcast/types';

type BroadcastControlRoomState = {
  revision: number;
  scoringMode: 'AUTOMATIC' | 'MANUAL_OVERRIDE' | string;
  presentationState: MatchPresentationStateV1;
};

type BroadcastCommand = Record<string, unknown>;

type ObsStudioBridge = {
  saveReplayBuffer?: () => unknown | Promise<unknown>;
};

declare global {
  interface Window {
    obsstudio?: ObsStudioBridge;
  }
}

type BroadcastControlRoomProps = {
  state: BroadcastControlRoomState;
  disabled?: boolean;
  lastActionId?: string | null;
  onCommand: (command: BroadcastCommand) => Promise<string | null>;
};

const asNonNegativeInteger = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const normalizeManualScore = (
  score: MatchPresentationStateV1['score'],
  competition: MatchPresentationStateV1['competition'],
): MatchPresentationStateV1['score'] => {
  const setsBySequence = new Map(score.sets.map((set) => [set.sequence, set]));
  const setCount = Math.max(
    1,
    competition.bestOf,
    score.currentSet,
    ...score.sets.map((set) => set.sequence),
  );
  const fallbackTarget = competition.setTargets[competition.setTargets.length - 1] ?? 21;

  return {
    ...score,
    sets: Array.from({ length: setCount }, (_, index) => {
      const sequence = index + 1;
      return setsBySequence.get(sequence) ?? {
        sequence,
        team1Points: sequence === score.currentSet ? score.points[0] : 0,
        team2Points: sequence === score.currentSet ? score.points[1] : 0,
        target: competition.setTargets[index] ?? fallbackTarget,
        complete: false,
        winnerTeamId: null,
      };
    }),
  };
};

export default function BroadcastControlRoom({
  state,
  disabled = false,
  lastActionId,
  onCommand,
}: BroadcastControlRoomProps) {
  const presentation = state.presentationState;
  const [manualScore, setManualScore] = useState(() => normalizeManualScore(presentation.score, presentation.competition));
  const [obsBridgeAvailable, setObsBridgeAvailable] = useState(false);
  const [obsNotice, setObsNotice] = useState<string | null>(null);
  // Parent refreshes replace presentation objects on a polling interval. A
  // stable value signature prevents that background refresh from discarding
  // an on-air producer edit that has not been applied yet.
  const persistedScoreSignature = `${state.revision}:${JSON.stringify(presentation.score)}`;

  useEffect(() => {
    setManualScore(normalizeManualScore(presentation.score, presentation.competition));
  }, [persistedScoreSignature]);

  useEffect(() => {
    setObsBridgeAvailable(typeof window.obsstudio?.saveReplayBuffer === 'function');
  }, []);

  const manualOverrideActive = state.scoringMode === 'MANUAL_OVERRIDE';
  const timeouts = presentation.score.timeoutsRemaining;
  const updateTimeout = (teamId: string, value: string | number) => {
    void onCommand({
      type: 'SET_TIMEOUT_STATE',
      timeoutsRemaining: { ...timeouts, [teamId]: asNonNegativeInteger(value) },
    });
  };

  const saveReplayBuffer = async () => {
    const save = window.obsstudio?.saveReplayBuffer;
    if (typeof save !== 'function') {
      setObsNotice('OBS replay controls are unavailable outside a permitted OBS Browser Dock.');
      return;
    }
    setObsNotice(null);
    try {
      await Promise.resolve(save());
      await onCommand({ type: 'SET_REPLAY_STATE', replayState: 'SAVED' });
      setObsNotice('OBS accepted the replay-buffer save request.');
    } catch {
      setObsNotice('OBS could not save the replay buffer. Check that Replay Buffer is running and this dock has BASIC permission.');
    }
  };

  const applyManualPoints = async () => {
    await onCommand({
      type: 'APPLY_MANUAL_PRESENTATION_CHANGE',
      change: { score: manualScore },
    });
  };

  const setManualCurrentSet = (value: string | number) => {
    const nextCurrentSet = Math.max(1, Math.min(presentation.competition.bestOf, asNonNegativeInteger(value)));
    setManualScore((current) => {
      const normalized = normalizeManualScore(current, presentation.competition);
      const selectedSet = normalized.sets.find((set) => set.sequence === nextCurrentSet);
      return {
        ...normalized,
        currentSet: nextCurrentSet,
        points: selectedSet ? [selectedSet.team1Points, selectedSet.team2Points] : [0, 0],
      };
    });
  };

  const updateManualSetScore = (sequence: number, teamIndex: 0 | 1, value: string | number) => {
    const points = asNonNegativeInteger(value);
    setManualScore((current) => {
      const normalized = normalizeManualScore(current, presentation.competition);
      const sets = normalized.sets.map((set) => {
        if (set.sequence !== sequence) return set;
        return teamIndex === 0 ? { ...set, team1Points: points } : { ...set, team2Points: points };
      });
      const selectedSet = sets.find((set) => set.sequence === normalized.currentSet);
      return {
        ...normalized,
        sets,
        points: selectedSet ? [selectedSet.team1Points, selectedSet.team2Points] : normalized.points,
      };
    });
  };

  const updateManualCurrentPoints = (teamIndex: 0 | 1, value: string | number) => {
    const points = asNonNegativeInteger(value);
    setManualScore((current) => {
      const normalized = normalizeManualScore(current, presentation.competition);
      const nextPoints: [number, number] = teamIndex === 0
        ? [points, normalized.points[1]]
        : [normalized.points[0], points];
      return {
        ...normalized,
        points: nextPoints,
        sets: normalized.sets.map((set) => {
          if (set.sequence !== normalized.currentSet) return set;
          return teamIndex === 0
            ? { ...set, team1Points: points }
            : { ...set, team2Points: points };
        }),
      };
    });
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Control Room</Text>
        <Group gap="xs">
          <Badge color={manualOverrideActive ? 'orange' : 'blue'}>{state.scoringMode}</Badge>
          <Badge color={obsBridgeAvailable ? 'green' : 'gray'} variant="light">
            {obsBridgeAvailable ? 'OBS dock ready' : 'OBS dock unavailable'}
          </Badge>
        </Group>
      </Group>

      <Stack gap="sm">
        <Group grow>
          <Button
            size="md"
            disabled={disabled}
            variant={presentation.presentation.scoreboardVisible ? 'filled' : 'default'}
            onClick={() => void onCommand({ type: 'SET_VISIBILITY', visible: !presentation.presentation.scoreboardVisible })}
          >
            {presentation.presentation.scoreboardVisible ? 'Hide scorebug' : 'Show scorebug'}
          </Button>
          <Button
            size="md"
            disabled={disabled}
            variant="default"
            onClick={() => void onCommand({ type: presentation.presentation.activeStinger ? 'HIDE_STINGER' : 'SHOW_STINGER', ...(presentation.presentation.activeStinger ? {} : { stinger: 'MATCH_INTRO' }) })}
          >
            {presentation.presentation.activeStinger ? 'Hide stinger' : 'Show intro'}
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {BROADCAST_STINGER_KINDS.map((stinger) => (
            <Button
              key={stinger}
              size="xs"
              disabled={disabled}
              variant={presentation.presentation.activeStinger === stinger ? 'filled' : 'light'}
              onClick={() => void onCommand({ type: 'SHOW_STINGER', stinger })}
            >
              {stinger.replace('_', ' ')}
            </Button>
          ))}
        </SimpleGrid>

        <Divider label="Presentation indicators" labelPosition="center" />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {presentation.teams.map((team) => (
            <NumberInput
              key={team.id}
              label={`${team.displayName} timeouts`}
              min={0}
              max={9}
              value={timeouts[team.id] ?? 0}
              disabled={disabled || !team.id}
              onChange={(value) => updateTimeout(team.id, value)}
            />
          ))}
        </SimpleGrid>

        <Group grow>
          <Button
            variant="default"
            disabled={disabled || !obsBridgeAvailable}
            onClick={() => void saveReplayBuffer()}
          >
            Save Replay Buffer
          </Button>
          <Button
            variant="default"
            disabled={disabled || !lastActionId}
            onClick={() => lastActionId && void onCommand({ type: 'UNDO_BROADCAST_ACTION', targetActionId: lastActionId })}
          >
            Undo last broadcast action
          </Button>
        </Group>
        {obsNotice ? <Alert color={obsNotice.startsWith('OBS accepted') ? 'green' : 'gray'}>{obsNotice}</Alert> : null}

        <Divider label="Manual presentation only" labelPosition="center" />
        {!manualOverrideActive ? (
          <Button
            color="orange"
            variant="light"
            disabled={disabled}
            onClick={() => {
              if (window.confirm('Enter manual presentation override? This never changes official Match or MatchSegment records.')) {
                void onCommand({ type: 'ENTER_MANUAL_OVERRIDE', reason: 'Producer correction' });
              }
            }}
          >
            Enter manual override
          </Button>
        ) : (
          <Stack gap="xs">
            <Alert color="orange">
              Manual override is on-air only. Official scoring remains in the established match score workflow.
            </Alert>
            <SimpleGrid cols={2}>
              <NumberInput
                label={`${presentation.teams[0].displayName} points`}
                min={0}
                value={manualScore.points[0]}
                disabled={disabled}
                onChange={(value) => updateManualCurrentPoints(0, value)}
              />
              <NumberInput
                label={`${presentation.teams[1].displayName} points`}
                min={0}
                value={manualScore.points[1]}
                disabled={disabled}
                onChange={(value) => updateManualCurrentPoints(1, value)}
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <NumberInput
                label="Current set"
                min={1}
                max={presentation.competition.bestOf}
                value={manualScore.currentSet}
                disabled={disabled}
                onChange={setManualCurrentSet}
              />
              <NumberInput
                label={`${presentation.teams[0].displayName} sets won`}
                min={0}
                max={presentation.competition.bestOf}
                value={manualScore.setsWon[0]}
                disabled={disabled}
                onChange={(value) => setManualScore((current) => ({ ...current, setsWon: [asNonNegativeInteger(value), current.setsWon[1]] }))}
              />
              <NumberInput
                label={`${presentation.teams[1].displayName} sets won`}
                min={0}
                max={presentation.competition.bestOf}
                value={manualScore.setsWon[1]}
                disabled={disabled}
                onChange={(value) => setManualScore((current) => ({ ...current, setsWon: [current.setsWon[0], asNonNegativeInteger(value)] }))}
              />
            </SimpleGrid>
            {manualScore.sets.length ? (
              <Stack gap="xs">
                <Text size="sm" fw={600}>Set scores</Text>
                {manualScore.sets.map((set) => (
                  <SimpleGrid key={set.sequence} cols={{ base: 1, sm: 3 }}>
                    <Text size="sm" pt="sm">Set {set.sequence}</Text>
                    <NumberInput
                      label={`Set ${set.sequence} ${presentation.teams[0].displayName}`}
                      min={0}
                      value={set.team1Points}
                      disabled={disabled}
                      onChange={(value) => updateManualSetScore(set.sequence, 0, value)}
                    />
                    <NumberInput
                      label={`Set ${set.sequence} ${presentation.teams[1].displayName}`}
                      min={0}
                      value={set.team2Points}
                      disabled={disabled}
                      onChange={(value) => updateManualSetScore(set.sequence, 1, value)}
                    />
                  </SimpleGrid>
                ))}
              </Stack>
            ) : null}
            <Group grow>
              <Button color="orange" disabled={disabled} onClick={() => void applyManualPoints()}>
                Apply presentation scores
              </Button>
              <Button
                color="green"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm('Resume automatic presentation from the latest official score?')) {
                    void onCommand({ type: 'RESUME_AUTOMATIC' });
                  }
                }}
              >
                Resume automatic
              </Button>
            </Group>
          </Stack>
        )}

        <Text size="xs" c="dimmed">
          These controls write presentation state only. They never modify official Match or MatchSegment scores.
        </Text>
      </Stack>
    </Paper>
  );
}
