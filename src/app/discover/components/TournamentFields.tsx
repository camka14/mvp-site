import React, { useEffect } from 'react';
import {
  Paper,
  Title,
  Grid,
  Select,
  NumberInput,
  TextInput,
  Stack,
  Divider,
  Flex,
  Box,
  Text,
} from '@mantine/core';
import type { Sport, TournamentConfig } from '@/types';

interface TournamentFieldsProps {
  tournamentData: TournamentConfig;
  setTournamentData: React.Dispatch<React.SetStateAction<TournamentConfig>>;
  title?: string;
  sport?: Sport;
  showDurationControls?: boolean;
  unstyled?: boolean;
}

const BEST_OF_OPTIONS = [
  { value: '1', label: 'Best of 1' },
  { value: '3', label: 'Best of 3' },
  { value: '5', label: 'Best of 5' },
];
const MAX_STANDARD_NUMBER = 99_999;
type ScoringModel = 'SETS' | 'PERIODS' | 'INNINGS' | 'POINTS_ONLY';

const syncArrayLength = (arr: number[], len: number, fill = 21) => {
  const next = arr.slice(0, len);
  while (next.length < len) next.push(fill);
  return next;
};

const bracketPointsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 10rem))',
  columnGap: '1rem',
  rowGap: '0.75rem',
  alignItems: 'end',
  justifyContent: 'start',
  maxWidth: '21rem',
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalDurationMinutes = (value: string | number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
  }
  return undefined;
};

const durationNeedsWarning = (value: number | null | undefined): boolean => (
  typeof value !== 'number' || !Number.isFinite(value) || value <= 0
);

const normalizeScoringModel = (value: unknown, fallback: ScoringModel): ScoringModel => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'SETS' || normalized === 'PERIODS' || normalized === 'INNINGS' || normalized === 'POINTS_ONLY') {
    return normalized;
  }
  return fallback;
};

const defaultSegmentLabel = (model: ScoringModel): string => {
  switch (model) {
    case 'SETS':
      return 'Set';
    case 'INNINGS':
      return 'Inning';
    case 'PERIODS':
      return 'Period';
    case 'POINTS_ONLY':
    default:
      return 'Total';
  }
};

const titleCase = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
);

const pluralizeSegmentLabel = (label: string, count: number): string => {
  const normalized = titleCase(label);
  if (count === 1) {
    return normalized;
  }
  return normalized === 'Half' ? 'Halves' : `${normalized}s`;
};

const resolveSportSegmentRules = (
  sport: Sport | undefined,
  fallbackModel: ScoringModel,
): { scoringModel: ScoringModel; segmentLabel: string; segmentCount: number } => {
  const template = sport?.matchRulesTemplate ?? null;
  const scoringModel = normalizeScoringModel(template?.scoringModel, fallbackModel);
  const rawLabel = typeof template?.segmentLabel === 'string' ? template.segmentLabel.trim() : '';
  const rawSegmentCount = toFiniteNumber(template?.segmentCount);
  return {
    scoringModel,
    segmentLabel: rawLabel.length > 0 ? titleCase(rawLabel) : defaultSegmentLabel(scoringModel),
    segmentCount: rawSegmentCount !== null && rawSegmentCount > 0
      ? Math.max(1, Math.trunc(rawSegmentCount))
      : 1,
  };
};

const hasSetBasedSignals = (config?: Partial<TournamentConfig> | null): boolean => {
  if (!config || typeof config !== 'object') {
    return false;
  }

  if (config.usesSets === true) {
    return true;
  }

  const winnerSetCount = toFiniteNumber(config.winnerSetCount);
  if (winnerSetCount !== null && winnerSetCount > 1) {
    return true;
  }

  const loserSetCount = toFiniteNumber(config.loserSetCount);
  if (loserSetCount !== null && loserSetCount > 1) {
    return true;
  }

  if (
    (Array.isArray(config.winnerBracketPointsToVictory) && config.winnerBracketPointsToVictory.length > 1)
    || (Array.isArray(config.loserBracketPointsToVictory) && config.loserBracketPointsToVictory.length > 1)
  ) {
    return true;
  }

  const setDuration = toFiniteNumber(config.setDurationMinutes);
  return setDuration !== null && setDuration > 0;
};

const TournamentFields: React.FC<TournamentFieldsProps> = ({
  tournamentData,
  setTournamentData,
  title = 'Tournament Settings',
  sport,
  showDurationControls = true,
  unstyled = false,
}) => {
  const comboboxProps = { withinPortal: true, zIndex: 1800 };
  const sportScoringModel = normalizeScoringModel(
    sport?.matchRulesTemplate?.scoringModel,
    sport?.usePointsPerSetWin ? 'SETS' : 'POINTS_ONLY',
  );
  const hasSportScoringRules = Boolean(
    sport && (
      sport.matchRulesTemplate?.scoringModel
      || typeof sport.usePointsPerSetWin === 'boolean'
    ),
  );
  const sportRequiresSets = sportScoringModel === 'SETS' || Boolean(sport?.usePointsPerSetWin);
  const requiresSets = hasSportScoringRules ? sportRequiresSets : hasSetBasedSignals(tournamentData);
  const sportSegmentRules = resolveSportSegmentRules(sport, requiresSets ? 'SETS' : sportScoringModel);
  const setSegmentLabel = sportSegmentRules.scoringModel === 'SETS' ? sportSegmentRules.segmentLabel : 'Set';
  const periodSegmentSummary = !requiresSets && (
    sportSegmentRules.scoringModel === 'PERIODS' || sportSegmentRules.scoringModel === 'INNINGS'
  )
    ? sportSegmentRules
    : null;

  useEffect(() => {
    if (requiresSets) {
      setTournamentData((prev) => {
        let changed = false;
        const next: TournamentConfig = { ...prev };

        if (next.usesSets !== true) {
          next.usesSets = true;
          changed = true;
        }

        const winnerCount = prev.winnerSetCount || 1;
        if (next.winnerSetCount !== winnerCount) {
          next.winnerSetCount = winnerCount;
          changed = true;
        }

        const winnerPoints = syncArrayLength(prev.winnerBracketPointsToVictory, winnerCount);
        if (
          winnerPoints.length !== prev.winnerBracketPointsToVictory.length ||
          winnerPoints.some((value, index) => value !== prev.winnerBracketPointsToVictory[index])
        ) {
          next.winnerBracketPointsToVictory = winnerPoints;
          changed = true;
        }

        if (prev.doubleElimination) {
          const loserCount = prev.loserSetCount || 1;
          if (next.loserSetCount !== loserCount) {
            next.loserSetCount = loserCount;
            changed = true;
          }
          const loserPoints = syncArrayLength(prev.loserBracketPointsToVictory, loserCount);
          if (
            loserPoints.length !== prev.loserBracketPointsToVictory.length ||
            loserPoints.some((value, index) => value !== prev.loserBracketPointsToVictory[index])
          ) {
            next.loserBracketPointsToVictory = loserPoints;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    } else {
      setTournamentData((prev) => {
        let changed = false;
        const next: TournamentConfig = { ...prev };

        if (next.usesSets !== false) {
          next.usesSets = false;
          changed = true;
        }

        if (next.setDurationMinutes !== undefined) {
          next.setDurationMinutes = undefined;
          changed = true;
        }

        if (next.winnerSetCount !== 1) {
          next.winnerSetCount = 1;
          changed = true;
        }

        const winnerPoints = syncArrayLength(prev.winnerBracketPointsToVictory, 1);
        if (
          winnerPoints.length !== prev.winnerBracketPointsToVictory.length ||
          winnerPoints.some((value, index) => value !== prev.winnerBracketPointsToVictory[index])
        ) {
          next.winnerBracketPointsToVictory = winnerPoints;
          changed = true;
        }

        if (prev.doubleElimination && next.loserSetCount !== 1) {
          next.loserSetCount = 1;
          changed = true;
        }

        const loserPoints = syncArrayLength(prev.loserBracketPointsToVictory, prev.doubleElimination ? 1 : prev.loserSetCount);
        if (
          loserPoints.length !== prev.loserBracketPointsToVictory.length ||
          loserPoints.some((value, index) => value !== prev.loserBracketPointsToVictory[index])
        ) {
          next.loserBracketPointsToVictory = loserPoints;
          changed = true;
        }

        return changed ? next : prev;
      });
    }
  }, [requiresSets, setTournamentData]);

  const content = (
    <>
      {title ? (
        <Title order={4} mb="md">
          {title}
        </Title>
      ) : null}
      <Grid gutter="md" align="flex-end">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Select
            label="Tournament Format"
            value={tournamentData.doubleElimination ? 'double' : 'single'}
            onChange={(value) =>
              setTournamentData((prev) => ({
                ...prev,
                doubleElimination: value === 'double',
              }))
            }
            data={[
              { value: 'single', label: 'Single Elimination' },
              { value: 'double', label: 'Double Elimination' },
            ]}
            comboboxProps={comboboxProps}
            maw={320}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <NumberInput
            label="Rest Time Between Matches (minutes)"
            min={0}
            max={MAX_STANDARD_NUMBER}
            step={5}
            value={tournamentData.restTimeMinutes}
            onChange={(value) =>
              setTournamentData((prev) => ({
                ...prev,
                restTimeMinutes: Number(value) >= 0 ? Number(value) : 0,
              }))
            }
            clampBehavior="strict"
            maw={220}
          />
        </Grid.Col>

        {showDurationControls && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <NumberInput
              label={requiresSets ? `${setSegmentLabel} Duration (minutes)` : 'Match Duration (minutes)'}
              min={0}
              max={MAX_STANDARD_NUMBER}
              step={5}
              value={(requiresSets ? tournamentData.setDurationMinutes : tournamentData.matchDurationMinutes) ?? ''}
              onChange={(value) =>
                setTournamentData((prev) => {
                  const duration = parseOptionalDurationMinutes(value);
                  if (requiresSets) {
                    return {
                      ...prev,
                      setDurationMinutes: duration,
                    };
                  }
                  return {
                    ...prev,
                    matchDurationMinutes: duration,
                  };
                })
              }
              clampBehavior="none"
              maw={220}
            />
            {durationNeedsWarning(requiresSets ? tournamentData.setDurationMinutes : tournamentData.matchDurationMinutes) ? (
              <Text size="xs" c="orange" mt={4}>
                {requiresSets ? `${setSegmentLabel} duration` : 'Match duration'} should be greater than 0 before scheduling.
              </Text>
            ) : null}
          </Grid.Col>
        )}

        {periodSegmentSummary && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box
              className="rounded-md border border-gray-200 bg-white px-3 py-2"
              style={{ maxWidth: 260 }}
            >
              <Text size="sm" fw={500}>{`${periodSegmentSummary.segmentLabel} Count`}</Text>
              <Text size="sm" c="dimmed">
                {`${periodSegmentSummary.segmentCount} ${pluralizeSegmentLabel(
                  periodSegmentSummary.segmentLabel,
                  periodSegmentSummary.segmentCount,
                )} from sport rules`}
              </Text>
            </Box>
          </Grid.Col>
        )}

        {requiresSets && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Select
              label={`Winner ${setSegmentLabel} Count`}
              value={String(tournamentData.winnerSetCount)}
              onChange={(value) =>
                setTournamentData((prev) => {
                  const count = parseInt(value || '1', 10);
                  return {
                    ...prev,
                    winnerSetCount: count,
                    winnerBracketPointsToVictory: syncArrayLength(
                      prev.winnerBracketPointsToVictory,
                      count
                    ),
                  };
                })
              }
              data={BEST_OF_OPTIONS}
              comboboxProps={comboboxProps}
              maw={220}
            />
          </Grid.Col>
        )}

        {requiresSets && tournamentData.doubleElimination && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Select
              label={`Loser ${setSegmentLabel} Count`}
              value={String(tournamentData.loserSetCount)}
              onChange={(value) =>
                setTournamentData((prev) => {
                  const count = parseInt(value || '1', 10);
                  return {
                    ...prev,
                    loserSetCount: count,
                    loserBracketPointsToVictory: syncArrayLength(
                      prev.loserBracketPointsToVictory,
                      count
                    ),
                  };
                })
              }
              data={BEST_OF_OPTIONS}
              comboboxProps={comboboxProps}
              maw={220}
            />
          </Grid.Col>
        )}
      </Grid>

      {requiresSets && (
        <Flex mt="md" gap="lg" align="start" direction={{ base: 'column', md: 'row' }}>
          <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Text size="lg" fw={700} mb="sm">
              Winner Bracket Points to Victory
            </Text>
            <Box data-testid="winner-bracket-points-grid" style={bracketPointsGridStyle}>
              {Array.from({ length: tournamentData.winnerSetCount }).map((_, idx) => (
                <Box key={`win-set-${idx}`}>
                  <NumberInput
                    label={`${setSegmentLabel} ${idx + 1}`}
                    min={1}
                    max={MAX_STANDARD_NUMBER}
                    value={tournamentData.winnerBracketPointsToVictory[idx] ?? 21}
                    onChange={(value) =>
                      setTournamentData((prev) => {
                        const arr = syncArrayLength(
                          prev.winnerBracketPointsToVictory,
                          prev.winnerSetCount
                        );
                        arr[idx] = Number(value) || 21;
                        return {
                          ...prev,
                          winnerBracketPointsToVictory: arr,
                        };
                      })
                    }
                    clampBehavior="strict"
                    w="100%"
                  />
                </Box>
              ))}
            </Box>
          </Box>

          {tournamentData.doubleElimination && (
            <>
              <Divider orientation="vertical" visibleFrom="md" />
              <Divider hiddenFrom="md" my="md" />
              <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
                <Text size="lg" fw={700} mb="sm">
                  Loser Bracket Points to Victory
                </Text>
                <Box data-testid="loser-bracket-points-grid" style={bracketPointsGridStyle}>
                  {Array.from({ length: tournamentData.loserSetCount }).map((_, idx) => (
                    <Box key={`lose-set-${idx}`}>
                      <NumberInput
                        label={`${setSegmentLabel} ${idx + 1}`}
                        min={1}
                        max={MAX_STANDARD_NUMBER}
                        value={tournamentData.loserBracketPointsToVictory[idx] ?? 21}
                        onChange={(value) =>
                          setTournamentData((prev) => {
                            const arr = syncArrayLength(
                              prev.loserBracketPointsToVictory,
                              prev.loserSetCount
                            );
                            arr[idx] = Number(value) || 21;
                            return {
                              ...prev,
                              loserBracketPointsToVictory: arr,
                            };
                          })
                        }
                        clampBehavior="strict"
                        w="100%"
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            </>
          )}
        </Flex>
      )}

      <Stack gap="xs" mt="md">
        <TextInput
          label="Prize (Optional)"
          value={tournamentData.prize}
          onChange={(e) =>
            setTournamentData((prev) => ({
              ...prev,
              prize: e.currentTarget.value,
            }))
          }
          placeholder="Enter tournament prize"
          maw={420}
        />
      </Stack>
    </>
  );

  if (unstyled) {
    return <div className={title ? 'border-t border-gray-200 pt-5' : undefined}>{content}</div>;
  }

  return (
    <Paper withBorder radius="md" shadow="xs" p="lg" className="bg-gray-50">
      {content}
    </Paper>
  );
};

export default TournamentFields;
