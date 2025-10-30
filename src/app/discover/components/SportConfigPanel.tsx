import { Badge, Card, SimpleGrid, Text, Title } from '@mantine/core';
import type { Sport } from '@/types';

const SPORT_FLAG_FIELDS: Array<keyof Sport> = [
  'usePointsForWin',
  'usePointsForDraw',
  'usePointsForLoss',
  'usePointsForForfeitWin',
  'usePointsForForfeitLoss',
  'usePointsPerSetWin',
  'usePointsPerSetLoss',
  'usePointsPerGameWin',
  'usePointsPerGameLoss',
  'usePointsPerGoalScored',
  'usePointsPerGoalConceded',
  'useMaxGoalBonusPoints',
  'useMinGoalBonusThreshold',
  'usePointsForShutout',
  'usePointsForCleanSheet',
  'useApplyShutoutOnlyIfWin',
  'usePointsPerGoalDifference',
  'useMaxGoalDifferencePoints',
  'usePointsPenaltyPerGoalDifference',
  'usePointsForParticipation',
  'usePointsForNoShow',
  'usePointsForWinStreakBonus',
  'useWinStreakThreshold',
  'usePointsForOvertimeWin',
  'usePointsForOvertimeLoss',
  'useOvertimeEnabled',
  'usePointsPerRedCard',
  'usePointsPerYellowCard',
  'usePointsPerPenalty',
  'useMaxPenaltyDeductions',
  'useMaxPointsPerMatch',
  'useMinPointsPerMatch',
  'useGoalDifferenceTiebreaker',
  'useHeadToHeadTiebreaker',
  'useTotalGoalsTiebreaker',
  'useEnableBonusForComebackWin',
  'useBonusPointsForComebackWin',
  'useEnableBonusForHighScoringMatch',
  'useHighScoringThreshold',
  'useBonusPointsForHighScoringMatch',
  'useEnablePenaltyUnsporting',
  'usePenaltyPointsUnsporting',
  'usePointPrecision',
];

const formatLabel = (key: keyof Sport): string => {
  const base = key
    .replace(/^use/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\bId\b/, 'ID')
    .trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
};

interface SportConfigPanelProps {
  sport: Sport;
}

const SportConfigPanel: React.FC<SportConfigPanelProps> = ({ sport }) => (
  <Card shadow="xs" radius="md" padding="lg">
    <Title order={4}>Sport Configuration</Title>
    <Text size="sm" c="dimmed" mt="xs">
      Scoring rules enabled for {sport.name || 'this sport'}.
    </Text>
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs" mt="md">
      {SPORT_FLAG_FIELDS.map((field) => (
        <Badge
          key={field}
          color={sport[field] ? 'green' : 'gray'}
          variant={sport[field] ? 'filled' : 'outline'}
        >
          {formatLabel(field)}
        </Badge>
      ))}
    </SimpleGrid>
  </Card>
);

export default SportConfigPanel;
