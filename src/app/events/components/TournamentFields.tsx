import React, { useEffect } from 'react';
import { Paper, Title, Grid, Select, NumberInput, TextInput, Stack, Divider, Flex, Box } from '@mantine/core';

interface TournamentData {
    doubleElimination: boolean;
    winnerSetCount: number;
    loserSetCount: number;
    winnerBracketPointsToVictory: number[];
    loserBracketPointsToVictory: number[];
    prize: string;
    fieldCount: number;
}

interface TournamentFieldsProps {
    tournamentData: TournamentData;
    setTournamentData: React.Dispatch<React.SetStateAction<TournamentData>>;
    showFieldCountSelector?: boolean;
    fieldCountOverride?: number;
}

const TournamentFields: React.FC<TournamentFieldsProps> = ({
    tournamentData,
    setTournamentData,
    showFieldCountSelector = true,
    fieldCountOverride,
}) => {
    const syncArrayLength = (arr: number[], len: number, fill = 21) => {
        const next = arr.slice(0, len);
        while (next.length < len) next.push(fill);
        return next;
    };

    useEffect(() => {
        if (typeof fieldCountOverride === 'number' && tournamentData.fieldCount !== fieldCountOverride) {
            setTournamentData((prev) => ({
                ...prev,
                fieldCount: fieldCountOverride,
            }));
        }
    }, [fieldCountOverride, setTournamentData, tournamentData.fieldCount]);

    return (
        <Paper withBorder radius="md" p="md">
            <Title order={4} mb="sm">Tournament Settings</Title>

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
                    />
                </Grid.Col>

                {showFieldCountSelector && (
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Select
                            label="Field Count"
                            value={String(fieldCountOverride ?? tournamentData.fieldCount)}
                            onChange={(value) =>
                                setTournamentData((prev) => ({
                                    ...prev,
                                    fieldCount: parseInt(value || '1', 10),
                                }))
                            }
                            data={[1, 2, 3, 4, 5, 6, 7, 8].map((count) => ({
                                value: String(count),
                                label: `${count} ${count === 1 ? 'Field' : 'Fields'}`,
                            }))}
                        />
                    </Grid.Col>
                )}

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
                        data={[
                            { value: '1', label: 'Best of 1' },
                            { value: '3', label: 'Best of 3' },
                            { value: '5', label: 'Best of 5' },
                        ]}
                    />
                </Grid.Col>

                {tournamentData.doubleElimination && (
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
                            data={[
                                { value: '1', label: 'Best of 1' },
                                { value: '3', label: 'Best of 3' },
                                { value: '5', label: 'Best of 5' },
                            ]}
                        />
                    </Grid.Col>
                )}
            </Grid>

            <Flex mt="md" gap="lg" align="start">
                <Box style={{ flex: 1 }}>
                    <Title order={6} mb="xs">Winner Bracket Points to Victory</Title>
                    <Grid gutter="xs">
                        {Array.from({ length: tournamentData.winnerSetCount }).map((_, idx) => (
                            <Grid.Col span={{ base: 12, sm: 6 }} key={`win-set-${idx}`}>
                                <NumberInput
                                    label={`Set ${idx + 1}`}
                                    min={1}
                                    value={
                                        tournamentData.winnerBracketPointsToVictory[idx] ?? 21
                                    }
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
                            <Title order={6} mb="xs">Loser Bracket Points to Victory</Title>
                            <Grid gutter="xs">
                                {Array.from({ length: tournamentData.loserSetCount }).map((_, idx) => (
                                    <Grid.Col span={{ base: 12, sm: 6 }} key={`lose-set-${idx}`}>
                                        <NumberInput
                                            label={`Set ${idx + 1}`}
                                            min={1}
                                            value={
                                                tournamentData.loserBracketPointsToVictory[idx] ?? 21
                                            }
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
