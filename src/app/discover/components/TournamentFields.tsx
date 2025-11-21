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
} from '@mantine/core';
import type { Sport, TournamentConfig } from '@/types';

interface TournamentFieldsProps {
  tournamentData: TournamentConfig;
  setTournamentData: React.Dispatch<React.SetStateAction<TournamentConfig>>;
  title?: string;
  sport?: Sport;
}

const BEST_OF_OPTIONS = [
  { value: '1', label: 'Best of 1' },
  { value: '3', label: 'Best of 3' },
  { value: '5', label: 'Best of 5' },
];

const syncArrayLength = (arr: number[], len: number, fill = 21) => {
  const next = arr.slice(0, len);
  while (next.length < len) next.push(fill);
  return next;
};

const TournamentFields: React.FC<TournamentFieldsProps> = ({
  tournamentData,
  setTournamentData,
  title = 'Tournament Settings',
  sport,
}) => {
  const comboboxProps = { withinPortal: true, zIndex: 1800 };
  const requiresSets = Boolean(sport?.usePointsPerSetWin);

  useEffect(() => {
    if (requiresSets) {
      setTournamentData((prev) => {
        let changed = false;
        const next: TournamentConfig = { ...prev };

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

  return (
    <Paper withBorder radius="md" shadow="xs" p="lg" className="bg-gray-50">
      <Title order={4} mb="sm">
        {title}
      </Title>

      <Grid gutter="md">
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
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <NumberInput
            label="Rest Time Between Matches (minutes)"
            min={0}
            step={5}
            value={tournamentData.restTimeMinutes}
            onChange={(value) =>
              setTournamentData((prev) => ({
                ...prev,
                restTimeMinutes: Number(value) >= 0 ? Number(value) : 0,
              }))
            }
          />
        </Grid.Col>

        {requiresSets && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Select
              label="Winner Set Count"
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
            />
          </Grid.Col>
        )}

        {requiresSets && tournamentData.doubleElimination && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Select
              label="Loser Set Count"
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
            />
          </Grid.Col>
        )}
      </Grid>

      {requiresSets && (
        <Flex mt="md" gap="lg" align="start">
          <Box style={{ flex: 1 }}>
            <Title order={6} mb="xs">
              Winner Bracket Points to Victory
            </Title>
            <Grid gutter="xs">
              {Array.from({ length: tournamentData.winnerSetCount }).map((_, idx) => (
                <Grid.Col span={{ base: 12, sm: 6 }} key={`win-set-${idx}`}>
                  <NumberInput
                    label={`Set ${idx + 1}`}
                    min={1}
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
                  />
                </Grid.Col>
              ))}
            </Grid>
          </Box>

          {tournamentData.doubleElimination && (
            <>
              <Divider orientation="vertical" visibleFrom="md" />
              <Divider hiddenFrom="md" my="md" />
              <Box style={{ flex: 1 }}>
                <Title order={6} mb="xs">
                  Loser Bracket Points to Victory
                </Title>
                <Grid gutter="xs">
                  {Array.from({ length: tournamentData.loserSetCount }).map((_, idx) => (
                    <Grid.Col span={{ base: 12, sm: 6 }} key={`lose-set-${idx}`}>
                      <NumberInput
                        label={`Set ${idx + 1}`}
                        min={1}
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
                      />
                    </Grid.Col>
                  ))}
                </Grid>
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
        />
      </Stack>
    </Paper>
  );
};

export default TournamentFields;
