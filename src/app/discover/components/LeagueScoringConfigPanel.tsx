import { Card, NumberInput, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { LeagueScoringConfig, Sport } from '@/types';

type LeagueScoringConfigKey = keyof LeagueScoringConfig;
const MAX_STANDARD_NUMBER = 99_999;

const NUMERIC_FIELDS: Array<{ key: LeagueScoringConfigKey; label: string }> = [
  { key: 'pointsForWin', label: 'Points for Win' },
  { key: 'pointsForDraw', label: 'Points for Draw' },
  { key: 'pointsForLoss', label: 'Points for Loss' },
  { key: 'pointsPerGoalScored', label: 'Points per Goal Scored' },
  { key: 'pointsPerGoalConceded', label: 'Points per Goal Conceded' },
];

interface LeagueScoringConfigPanelProps {
  value: LeagueScoringConfig;
  sport?: Sport;
  editable?: boolean;
  onChange?: <K extends LeagueScoringConfigKey>(key: K, next: LeagueScoringConfig[K]) => void;
}

const FLAG_MAP: Partial<Record<LeagueScoringConfigKey, keyof Sport>> = {
  pointsForWin: 'usePointsForWin',
  pointsForDraw: 'usePointsForDraw',
  pointsForLoss: 'usePointsForLoss',
  pointsPerGoalScored: 'usePointsPerGoalScored',
  pointsPerGoalConceded: 'usePointsPerGoalConceded',
};

const shouldShowField = (sport: Sport | undefined, key: LeagueScoringConfigKey) => {
  if (!sport) return true;
  const flag = FLAG_MAP[key];
  if (!flag) return true;
  return Boolean(sport[flag]);
};

const LeagueScoringConfigPanel: React.FC<LeagueScoringConfigPanelProps> = ({ value, sport, editable = false, onChange }) => (
  <Paper shadow="xs" radius="md" withBorder p="lg" className="bg-gray-50">
    <Title order={4}>League Scoring Configuration</Title>
    <Text size="sm" c="dimmed" mt="xs">
      Configure only the scoring rules this app applies automatically to standings.
    </Text>

    <Stack mt="md" gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing="sm">
        {NUMERIC_FIELDS.map(({ key, label }) => (
          shouldShowField(sport, key) && (
            editable && onChange ? (
              <NumberInput
                key={key}
                label={label}
                value={value[key] as number}
                onChange={(val) => onChange(key, Number(val) || 0)}
                max={MAX_STANDARD_NUMBER}
                min={-MAX_STANDARD_NUMBER}
                clampBehavior="strict"
                maw={170}
              />
            ) : (
              <Card key={key} padding="sm" radius="md" withBorder>
                <Text size="sm" c="dimmed">{label}</Text>
                <Text fw={600}>{value[key]}</Text>
              </Card>
            )
          )
        ))}
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Last updated: {value.$updatedAt || 'n/a'}
      </Text>
    </Stack>
  </Paper>
);

export default LeagueScoringConfigPanel;
