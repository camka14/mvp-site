-- Ensure default sport variants exist without relying on API lazy-seeding.
-- These rows gate league scoring config fields in the UI.

WITH defaults (
  id,
  name,
  "usePointsForWin",
  "usePointsForDraw",
  "usePointsForLoss",
  "usePointsPerSetWin",
  "usePointsPerSetLoss",
  "usePointsPerGameWin",
  "usePointsPerGameLoss",
  "usePointsPerGoalScored",
  "usePointsPerGoalConceded",
  "useOvertimeEnabled",
  "usePointsForOvertimeWin",
  "usePointsForOvertimeLoss",
  "usePointPrecision"
) AS (
  VALUES
    ('Volleyball', 'Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Indoor Volleyball', 'Indoor Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Beach Volleyball', 'Beach Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Grass Volleyball', 'Grass Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Basketball', 'Basketball', TRUE, NULL, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Soccer', 'Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Indoor Soccer', 'Indoor Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Grass Soccer', 'Grass Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Beach Soccer', 'Beach Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Tennis', 'Tennis', TRUE, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Pickleball', 'Pickleball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Football', 'Football', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Hockey', 'Hockey', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('Baseball', 'Baseball', TRUE, NULL, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Other', 'Other', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE)
)
UPDATE "Sports" AS s
SET
  "name" = defaults.name,
  "usePointsForWin" = COALESCE(defaults."usePointsForWin", s."usePointsForWin"),
  "usePointsForDraw" = COALESCE(defaults."usePointsForDraw", s."usePointsForDraw"),
  "usePointsForLoss" = COALESCE(defaults."usePointsForLoss", s."usePointsForLoss"),
  "usePointsPerSetWin" = COALESCE(defaults."usePointsPerSetWin", s."usePointsPerSetWin"),
  "usePointsPerSetLoss" = COALESCE(defaults."usePointsPerSetLoss", s."usePointsPerSetLoss"),
  "usePointsPerGameWin" = COALESCE(defaults."usePointsPerGameWin", s."usePointsPerGameWin"),
  "usePointsPerGameLoss" = COALESCE(defaults."usePointsPerGameLoss", s."usePointsPerGameLoss"),
  "usePointsPerGoalScored" = COALESCE(defaults."usePointsPerGoalScored", s."usePointsPerGoalScored"),
  "usePointsPerGoalConceded" = COALESCE(defaults."usePointsPerGoalConceded", s."usePointsPerGoalConceded"),
  "useOvertimeEnabled" = COALESCE(defaults."useOvertimeEnabled", s."useOvertimeEnabled"),
  "usePointsForOvertimeWin" = COALESCE(defaults."usePointsForOvertimeWin", s."usePointsForOvertimeWin"),
  "usePointsForOvertimeLoss" = COALESCE(defaults."usePointsForOvertimeLoss", s."usePointsForOvertimeLoss"),
  "usePointPrecision" = COALESCE(defaults."usePointPrecision", s."usePointPrecision")
FROM defaults
WHERE s."id" = defaults.id OR LOWER(s."name") = LOWER(defaults.name);

WITH defaults (
  id,
  name,
  "usePointsForWin",
  "usePointsForDraw",
  "usePointsForLoss",
  "usePointsPerSetWin",
  "usePointsPerSetLoss",
  "usePointsPerGameWin",
  "usePointsPerGameLoss",
  "usePointsPerGoalScored",
  "usePointsPerGoalConceded",
  "useOvertimeEnabled",
  "usePointsForOvertimeWin",
  "usePointsForOvertimeLoss",
  "usePointPrecision"
) AS (
  VALUES
    ('Volleyball', 'Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Indoor Volleyball', 'Indoor Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Beach Volleyball', 'Beach Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Grass Volleyball', 'Grass Volleyball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Basketball', 'Basketball', TRUE, NULL, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Soccer', 'Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Indoor Soccer', 'Indoor Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Grass Soccer', 'Grass Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Beach Soccer', 'Beach Soccer', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Tennis', 'Tennis', TRUE, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Pickleball', 'Pickleball', TRUE, NULL, TRUE, TRUE, TRUE, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Football', 'Football', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Hockey', 'Hockey', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('Baseball', 'Baseball', TRUE, NULL, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE),
    ('Other', 'Other', TRUE, TRUE, TRUE, NULL, NULL, NULL, NULL, TRUE, TRUE, NULL, NULL, NULL, TRUE)
)
INSERT INTO "Sports" (
  "id",
  "name",
  "usePointsForWin",
  "usePointsForDraw",
  "usePointsForLoss",
  "usePointsPerSetWin",
  "usePointsPerSetLoss",
  "usePointsPerGameWin",
  "usePointsPerGameLoss",
  "usePointsPerGoalScored",
  "usePointsPerGoalConceded",
  "useOvertimeEnabled",
  "usePointsForOvertimeWin",
  "usePointsForOvertimeLoss",
  "usePointPrecision"
)
SELECT
  defaults.id,
  defaults.name,
  defaults."usePointsForWin",
  defaults."usePointsForDraw",
  defaults."usePointsForLoss",
  defaults."usePointsPerSetWin",
  defaults."usePointsPerSetLoss",
  defaults."usePointsPerGameWin",
  defaults."usePointsPerGameLoss",
  defaults."usePointsPerGoalScored",
  defaults."usePointsPerGoalConceded",
  defaults."useOvertimeEnabled",
  defaults."usePointsForOvertimeWin",
  defaults."usePointsForOvertimeLoss",
  defaults."usePointPrecision"
FROM defaults
WHERE NOT EXISTS (
  SELECT 1
  FROM "Sports" AS s
  WHERE s."id" = defaults.id OR LOWER(s."name") = LOWER(defaults.name)
);
