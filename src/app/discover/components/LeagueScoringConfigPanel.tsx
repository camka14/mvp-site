import { Badge, Card, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, Title } from '@mantine/core';
import type { LeagueScoringConfig, Sport } from '@/types';

type LeagueScoringConfigKey = keyof LeagueScoringConfig;

const NUMERIC_FIELDS: Array<{ key: LeagueScoringConfigKey; label: string }> = [
  { key: 'pointsForWin', label: 'Points for Win' },
  { key: 'pointsForDraw', label: 'Points for Draw' },
  { key: 'pointsForLoss', label: 'Points for Loss' },
  { key: 'pointsForForfeitWin', label: 'Points for Forfeit Win' },
  { key: 'pointsForForfeitLoss', label: 'Points for Forfeit Loss' },
  { key: 'pointsPerSetWin', label: 'Points per Set Win' },
  { key: 'pointsPerSetLoss', label: 'Points per Set Loss' },
  { key: 'pointsPerGameWin', label: 'Points per Game Win' },
  { key: 'pointsPerGameLoss', label: 'Points per Game Loss' },
  { key: 'pointsPerGoalScored', label: 'Points per Goal Scored' },
  { key: 'pointsPerGoalConceded', label: 'Points per Goal Conceded' },
  { key: 'maxGoalBonusPoints', label: 'Max Goal Bonus Points' },
  { key: 'minGoalBonusThreshold', label: 'Min Goal Bonus Threshold' },
  { key: 'pointsPerGoalDifference', label: 'Points per Goal Difference' },
  { key: 'maxGoalDifferencePoints', label: 'Max Goal Difference Points' },
  { key: 'pointsPenaltyPerGoalDifference', label: 'Points Penalty per Goal Difference' },
  { key: 'pointsForParticipation', label: 'Points for Participation' },
  { key: 'pointsForNoShow', label: 'Points for No Show' },
  { key: 'pointsForWinStreakBonus', label: 'Points for Win Streak Bonus' },
  { key: 'winStreakThreshold', label: 'Win Streak Threshold' },
  { key: 'pointsForOvertimeWin', label: 'Points for Overtime Win' },
  { key: 'pointsForOvertimeLoss', label: 'Points for Overtime Loss' },
  { key: 'pointsPerRedCard', label: 'Points per Red Card' },
  { key: 'pointsPerYellowCard', label: 'Points per Yellow Card' },
  { key: 'pointsPerPenalty', label: 'Points per Penalty' },
  { key: 'maxPenaltyDeductions', label: 'Max Penalty Deductions' },
  { key: 'maxPointsPerMatch', label: 'Max Points per Match' },
  { key: 'minPointsPerMatch', label: 'Min Points per Match' },
  { key: 'bonusPointsForComebackWin', label: 'Bonus Points for Comeback Win' },
  { key: 'highScoringThreshold', label: 'High Scoring Threshold' },
  { key: 'bonusPointsForHighScoringMatch', label: 'Bonus Points for High Scoring Match' },
  { key: 'penaltyPointsForUnsportingBehavior', label: 'Penalty Points for Unsporting Behavior' },
  { key: 'pointPrecision', label: 'Point Precision' },
];

const BOOLEAN_FIELDS: Array<{ key: LeagueScoringConfigKey; label: string }> = [
  { key: 'applyShutoutOnlyIfWin', label: 'Apply Shutout Only If Win' },
  { key: 'overtimeEnabled', label: 'Overtime Enabled' },
  { key: 'goalDifferenceTiebreaker', label: 'Goal Difference Tiebreaker' },
  { key: 'headToHeadTiebreaker', label: 'Head-to-Head Tiebreaker' },
  { key: 'totalGoalsTiebreaker', label: 'Total Goals Tiebreaker' },
  { key: 'enableBonusForComebackWin', label: 'Enable Bonus for Comeback Win' },
  { key: 'enableBonusForHighScoringMatch', label: 'Enable Bonus for High Scoring Match' },
  { key: 'enablePenaltyForUnsportingBehavior', label: 'Enable Penalty for Unsporting Behavior' },
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
  pointsForForfeitWin: 'usePointsForForfeitWin',
  pointsForForfeitLoss: 'usePointsForForfeitLoss',
  pointsPerSetWin: 'usePointsPerSetWin',
  pointsPerSetLoss: 'usePointsPerSetLoss',
  pointsPerGameWin: 'usePointsPerGameWin',
  pointsPerGameLoss: 'usePointsPerGameLoss',
  pointsPerGoalScored: 'usePointsPerGoalScored',
  pointsPerGoalConceded: 'usePointsPerGoalConceded',
  maxGoalBonusPoints: 'useMaxGoalBonusPoints',
  minGoalBonusThreshold: 'useMinGoalBonusThreshold',
  pointsForShutout: 'usePointsForShutout',
  pointsForCleanSheet: 'usePointsForCleanSheet',
  applyShutoutOnlyIfWin: 'useApplyShutoutOnlyIfWin',
  pointsPerGoalDifference: 'usePointsPerGoalDifference',
  maxGoalDifferencePoints: 'useMaxGoalDifferencePoints',
  pointsPenaltyPerGoalDifference: 'usePointsPenaltyPerGoalDifference',
  pointsForParticipation: 'usePointsForParticipation',
  pointsForNoShow: 'usePointsForNoShow',
  pointsForWinStreakBonus: 'usePointsForWinStreakBonus',
  winStreakThreshold: 'useWinStreakThreshold',
  pointsForOvertimeWin: 'usePointsForOvertimeWin',
  pointsForOvertimeLoss: 'usePointsForOvertimeLoss',
  overtimeEnabled: 'useOvertimeEnabled',
  pointsPerRedCard: 'usePointsPerRedCard',
  pointsPerYellowCard: 'usePointsPerYellowCard',
  pointsPerPenalty: 'usePointsPerPenalty',
  maxPenaltyDeductions: 'useMaxPenaltyDeductions',
  maxPointsPerMatch: 'useMaxPointsPerMatch',
  minPointsPerMatch: 'useMinPointsPerMatch',
  goalDifferenceTiebreaker: 'useGoalDifferenceTiebreaker',
  headToHeadTiebreaker: 'useHeadToHeadTiebreaker',
  totalGoalsTiebreaker: 'useTotalGoalsTiebreaker',
  enableBonusForComebackWin: 'useEnableBonusForComebackWin',
  bonusPointsForComebackWin: 'useBonusPointsForComebackWin',
  enableBonusForHighScoringMatch: 'useEnableBonusForHighScoringMatch',
  highScoringThreshold: 'useHighScoringThreshold',
  bonusPointsForHighScoringMatch: 'useBonusPointsForHighScoringMatch',
  enablePenaltyForUnsportingBehavior: 'useEnablePenaltyUnsporting',
  penaltyPointsForUnsportingBehavior: 'usePenaltyPointsUnsporting',
  pointPrecision: 'usePointPrecision',
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
      Configure how points are awarded and deducted for this league.
    </Text>

    <Stack mt="md" gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {NUMERIC_FIELDS.map(({ key, label }) => (
          shouldShowField(sport, key) && (
            editable && onChange ? (
              <NumberInput
                key={key}
                label={label}
                value={value[key] as number}
                onChange={(val) => onChange(key, Number(val) || 0)}
                clampBehavior="strict"
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

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        {BOOLEAN_FIELDS.map(({ key, label }) => (
          shouldShowField(sport, key) && (
            editable && onChange ? (
              <Switch
                key={key}
                label={label}
                checked={Boolean(value[key])}
                onChange={(event) => onChange(key, event.currentTarget.checked as LeagueScoringConfig[typeof key])}
              />
            ) : (
              <Badge
                key={key}
                color={value[key] ? 'green' : 'gray'}
                variant={value[key] ? 'filled' : 'outline'}
              >
                {label}
              </Badge>
            )
          )
        ))}
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Config ID: {value.$id || 'Not set'} • Last updated: {value.$updatedAt || 'n/a'}
      </Text>
    </Stack>
  </Paper>
);

export default LeagueScoringConfigPanel;
