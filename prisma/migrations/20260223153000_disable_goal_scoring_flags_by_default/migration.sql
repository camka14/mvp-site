-- Goal-based league-point flags should not be enabled by default.
-- Normalize existing records so /api/sports doesn't surface goal-scoring controls by mistake.
UPDATE "Sports"
SET
  "usePointsPerGoalScored" = FALSE,
  "usePointsPerGoalConceded" = FALSE,
  "updatedAt" = NOW()
WHERE "usePointsPerGoalScored" IS DISTINCT FROM FALSE
   OR "usePointsPerGoalConceded" IS DISTINCT FROM FALSE;
