-- Align Sports scoring-flag visibility with the simplified league-scoring UI.
-- We keep only the core scoring controls enabled per sport and disable the
-- advanced/optional feature toggles globally.
UPDATE "Sports"
SET
  "useMaxGoalBonusPoints" = FALSE,
  "useMinGoalBonusThreshold" = FALSE,
  "usePointsForShutout" = FALSE,
  "usePointsForCleanSheet" = FALSE,
  "useApplyShutoutOnlyIfWin" = FALSE,
  "usePointsPerGoalDifference" = FALSE,
  "useMaxGoalDifferencePoints" = FALSE,
  "usePointsPenaltyPerGoalDifference" = FALSE,
  "usePointsForParticipation" = FALSE,
  "usePointsForNoShow" = FALSE,
  "usePointsForWinStreakBonus" = FALSE,
  "useWinStreakThreshold" = FALSE,
  "usePointsForOvertimeWin" = FALSE,
  "usePointsForOvertimeLoss" = FALSE,
  "useOvertimeEnabled" = FALSE,
  "usePointsPerRedCard" = FALSE,
  "usePointsPerYellowCard" = FALSE,
  "usePointsPerPenalty" = FALSE,
  "useMaxPenaltyDeductions" = FALSE,
  "useMaxPointsPerMatch" = FALSE,
  "useMinPointsPerMatch" = FALSE,
  "useGoalDifferenceTiebreaker" = FALSE,
  "useHeadToHeadTiebreaker" = FALSE,
  "useTotalGoalsTiebreaker" = FALSE,
  "useEnableBonusForComebackWin" = FALSE,
  "useBonusPointsForComebackWin" = FALSE,
  "useEnableBonusForHighScoringMatch" = FALSE,
  "useHighScoringThreshold" = FALSE,
  "useBonusPointsForHighScoringMatch" = FALSE,
  "useEnablePenaltyUnsporting" = FALSE,
  "usePenaltyPointsUnsporting" = FALSE,
  "usePointPrecision" = FALSE,
  "updatedAt" = NOW()
WHERE
  "useMaxGoalBonusPoints" IS DISTINCT FROM FALSE
  OR "useMinGoalBonusThreshold" IS DISTINCT FROM FALSE
  OR "usePointsForShutout" IS DISTINCT FROM FALSE
  OR "usePointsForCleanSheet" IS DISTINCT FROM FALSE
  OR "useApplyShutoutOnlyIfWin" IS DISTINCT FROM FALSE
  OR "usePointsPerGoalDifference" IS DISTINCT FROM FALSE
  OR "useMaxGoalDifferencePoints" IS DISTINCT FROM FALSE
  OR "usePointsPenaltyPerGoalDifference" IS DISTINCT FROM FALSE
  OR "usePointsForParticipation" IS DISTINCT FROM FALSE
  OR "usePointsForNoShow" IS DISTINCT FROM FALSE
  OR "usePointsForWinStreakBonus" IS DISTINCT FROM FALSE
  OR "useWinStreakThreshold" IS DISTINCT FROM FALSE
  OR "usePointsForOvertimeWin" IS DISTINCT FROM FALSE
  OR "usePointsForOvertimeLoss" IS DISTINCT FROM FALSE
  OR "useOvertimeEnabled" IS DISTINCT FROM FALSE
  OR "usePointsPerRedCard" IS DISTINCT FROM FALSE
  OR "usePointsPerYellowCard" IS DISTINCT FROM FALSE
  OR "usePointsPerPenalty" IS DISTINCT FROM FALSE
  OR "useMaxPenaltyDeductions" IS DISTINCT FROM FALSE
  OR "useMaxPointsPerMatch" IS DISTINCT FROM FALSE
  OR "useMinPointsPerMatch" IS DISTINCT FROM FALSE
  OR "useGoalDifferenceTiebreaker" IS DISTINCT FROM FALSE
  OR "useHeadToHeadTiebreaker" IS DISTINCT FROM FALSE
  OR "useTotalGoalsTiebreaker" IS DISTINCT FROM FALSE
  OR "useEnableBonusForComebackWin" IS DISTINCT FROM FALSE
  OR "useBonusPointsForComebackWin" IS DISTINCT FROM FALSE
  OR "useEnableBonusForHighScoringMatch" IS DISTINCT FROM FALSE
  OR "useHighScoringThreshold" IS DISTINCT FROM FALSE
  OR "useBonusPointsForHighScoringMatch" IS DISTINCT FROM FALSE
  OR "useEnablePenaltyUnsporting" IS DISTINCT FROM FALSE
  OR "usePenaltyPointsUnsporting" IS DISTINCT FROM FALSE
  OR "usePointPrecision" IS DISTINCT FROM FALSE;
