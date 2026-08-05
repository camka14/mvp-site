-- Add Racquetball to the canonical sport catalog so it can be selected when
-- creating events and so existing affiliate Racquetball events can hydrate
-- their sport relationship.
INSERT INTO "Sports" (
  "id",
  "name",
  "usePointsForWin",
  "usePointsForLoss",
  "usePointsPerSetWin",
  "usePointsPerSetLoss",
  "usePointsPerGoalScored",
  "usePointsPerGoalConceded",
  "skillDivisionTypes",
  "officialPositionTemplates",
  "matchRulesTemplate"
)
VALUES (
  'Racquetball',
  'Racquetball',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  '[
    {"id":"beginner","name":"Beginner"},
    {"id":"intermediate","name":"Intermediate"},
    {"id":"advanced","name":"Advanced"},
    {"id":"open","name":"Open"}
  ]'::jsonb,
  '[{"name":"Referee","count":1}]'::jsonb,
  '{
    "scoringModel":"SETS",
    "segmentLabel":"Game",
    "supportsDraw":false,
    "supportsOvertime":false,
    "supportsShootout":false,
    "canUseOvertime":false,
    "canUseShootout":false,
    "officialRoles":[],
    "supportedIncidentTypes":["POINT","WARNING","POINT_PENALTY","GAME_PENALTY","DEFAULT","NOTE","ADMIN"],
    "incidentTypeDefinitions":[
      {"code":"POINT","label":"Point","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},
      {"code":"WARNING","label":"Warning","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"POINT_PENALTY","label":"Point penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"GAME_PENALTY","label":"Game penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"DEFAULT","label":"Default","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"cardColor":"red"},
      {"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},
      {"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}
    ],
    "autoCreatePointIncidentType":"POINT",
    "timekeeping":{
      "timerMode":"NONE",
      "segmentDurationMinutes":null,
      "segmentDurationMinutesBySequence":[],
      "segmentBreakDurationMinutes":0,
      "canUseAddedTime":false,
      "addedTimeEnabled":false,
      "stopAtRegulationEnd":true
    }
  }'::jsonb
)
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "usePointsForWin" = COALESCE("Sports"."usePointsForWin", EXCLUDED."usePointsForWin"),
  "usePointsForLoss" = COALESCE("Sports"."usePointsForLoss", EXCLUDED."usePointsForLoss"),
  "usePointsPerSetWin" = COALESCE("Sports"."usePointsPerSetWin", EXCLUDED."usePointsPerSetWin"),
  "usePointsPerSetLoss" = COALESCE("Sports"."usePointsPerSetLoss", EXCLUDED."usePointsPerSetLoss"),
  "usePointsPerGoalScored" = COALESCE("Sports"."usePointsPerGoalScored", EXCLUDED."usePointsPerGoalScored"),
  "usePointsPerGoalConceded" = COALESCE("Sports"."usePointsPerGoalConceded", EXCLUDED."usePointsPerGoalConceded"),
  "skillDivisionTypes" = COALESCE("Sports"."skillDivisionTypes", EXCLUDED."skillDivisionTypes"),
  "officialPositionTemplates" = COALESCE("Sports"."officialPositionTemplates", EXCLUDED."officialPositionTemplates"),
  "matchRulesTemplate" = COALESCE("Sports"."matchRulesTemplate", EXCLUDED."matchRulesTemplate");

-- Repair existing published affiliate events only when their source candidate
-- explicitly identifies them as Racquetball.
UPDATE "Events" AS event
SET
  "sportId" = 'Racquetball',
  "updatedAt" = NOW()
FROM "AffiliateImportCandidates" AS candidate
WHERE candidate."publishedEventId" = event."id"
  AND event."sportId" IS NULL
  AND event."sourceType" = 'AFFILIATE_IMPORT'
  AND LOWER(BTRIM(candidate."sportName")) = 'racquetball';
