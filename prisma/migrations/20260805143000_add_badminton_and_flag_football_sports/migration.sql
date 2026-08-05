BEGIN;

-- These sports are present in reviewed affiliate source data. Keep them as
-- first-class catalog rows so event creation and event hydration have a
-- complete relationship, rules template, divisions, and official roles.
INSERT INTO "Sports" (
  "id",
  "name",
  "usePointsForWin",
  "usePointsForDraw",
  "usePointsForLoss",
  "usePointsPerSetWin",
  "usePointsPerSetLoss",
  "usePointsPerGoalScored",
  "usePointsPerGoalConceded",
  "skillDivisionTypes",
  "officialPositionTemplates",
  "matchRulesTemplate"
)
VALUES
(
  'Badminton',
  'Badminton',
  TRUE,
  FALSE,
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
  '[{"name":"Umpire","count":1}]'::jsonb,
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
),
(
  'Flag Football',
  'Flag Football',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[
    {"id":"rec","name":"Recreational"},
    {"id":"competitive","name":"Competitive"},
    {"id":"open","name":"Open"}
  ]'::jsonb,
  '[{"name":"Referee","count":1},{"name":"Field Judge","count":1}]'::jsonb,
  '{
    "scoringModel":"PERIODS",
    "segmentCount":2,
    "segmentLabel":"Half",
    "supportsDraw":true,
    "supportsOvertime":true,
    "supportsShootout":false,
    "canUseOvertime":true,
    "canUseShootout":false,
    "officialRoles":[],
    "supportedIncidentTypes":["POINT","PERSONAL_FOUL","UNSPORTSMANLIKE_CONDUCT","DELAY_OF_GAME","TARGETING","EJECTION","NOTE","ADMIN"],
    "incidentTypeDefinitions":[
      {"code":"POINT","label":"Point","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},
      {"code":"PERSONAL_FOUL","label":"Personal foul","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"UNSPORTSMANLIKE_CONDUCT","label":"Unsportsmanlike conduct","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"DELAY_OF_GAME","label":"Delay of game","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},
      {"code":"TARGETING","label":"Targeting","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},
      {"code":"EJECTION","label":"Ejection","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"cardColor":"red"},
      {"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},
      {"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}
    ],
    "autoCreatePointIncidentType":"POINT",
    "timekeeping":{
      "timerMode":"COUNT_UP",
      "segmentDurationMinutes":25,
      "segmentDurationMinutesBySequence":[],
      "segmentBreakDurationMinutes":10,
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
  "usePointsForDraw" = COALESCE("Sports"."usePointsForDraw", EXCLUDED."usePointsForDraw"),
  "usePointsForLoss" = COALESCE("Sports"."usePointsForLoss", EXCLUDED."usePointsForLoss"),
  "usePointsPerSetWin" = COALESCE("Sports"."usePointsPerSetWin", EXCLUDED."usePointsPerSetWin"),
  "usePointsPerSetLoss" = COALESCE("Sports"."usePointsPerSetLoss", EXCLUDED."usePointsPerSetLoss"),
  "usePointsPerGoalScored" = COALESCE("Sports"."usePointsPerGoalScored", EXCLUDED."usePointsPerGoalScored"),
  "usePointsPerGoalConceded" = COALESCE("Sports"."usePointsPerGoalConceded", EXCLUDED."usePointsPerGoalConceded"),
  "skillDivisionTypes" = COALESCE("Sports"."skillDivisionTypes", EXCLUDED."skillDivisionTypes"),
  "officialPositionTemplates" = COALESCE("Sports"."officialPositionTemplates", EXCLUDED."officialPositionTemplates"),
  "matchRulesTemplate" = COALESCE("Sports"."matchRulesTemplate", EXCLUDED."matchRulesTemplate");

-- Repair deterministic missing relationships. Generic or composite labels are
-- deliberately excluded because they do not identify a catalog surface.
UPDATE "Events" AS event
SET
  "sportId" = candidate."sportName",
  "updatedAt" = NOW()
FROM "AffiliateImportCandidates" AS candidate
WHERE candidate."publishedEventId" = event."id"
  AND event."sourceType" = 'AFFILIATE_IMPORT'
  AND event."sportId" IS NULL
  AND candidate."sportName" IN ('Badminton', 'Flag Football');

CREATE TEMP TABLE "_InvalidAffiliateSportCandidates" ON COMMIT DROP AS
SELECT
  candidate."id",
  candidate."listingKind",
  candidate."publishedEventId",
  candidate."publishedFacilityId",
  candidate."publishedOrganizationId"
FROM "AffiliateImportCandidates" AS candidate
WHERE candidate."status" IN ('DISCOVERED', 'PUBLISHED')
  AND (
    candidate."sportName" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "Sports" AS sport
      WHERE sport."name" = candidate."sportName"
    )
  );

-- Keep the source value for human review, but stop it from being treated as a
-- public, approved mapping. This also covers generic Soccer/Volleyball,
-- composite multi-sport labels, and source labels absent from the catalog.
UPDATE "AffiliateImportCandidates" AS candidate
SET
  "status" = 'NEEDS_REVIEW',
  "warnings" = CASE
    WHEN 'Sport mapping is not a canonical Sports.name; human review is required.' = ANY(COALESCE(candidate."warnings", ARRAY[]::text[]))
      THEN COALESCE(candidate."warnings", ARRAY[]::text[])
    ELSE array_append(
      COALESCE(candidate."warnings", ARRAY[]::text[]),
      'Sport mapping is not a canonical Sports.name; human review is required.'
    )
  END,
  "updatedAt" = NOW()
WHERE candidate."id" IN (SELECT "id" FROM "_InvalidAffiliateSportCandidates");

UPDATE "Events" AS event
SET
  "state" = 'UNPUBLISHED',
  "updatedAt" = NOW()
FROM "_InvalidAffiliateSportCandidates" AS invalid
WHERE invalid."publishedEventId" = event."id"
  AND event."state" = 'PUBLISHED';

UPDATE "Facilities" AS facility
SET
  "status" = 'DRAFT',
  "updatedAt" = NOW()
FROM "_InvalidAffiliateSportCandidates" AS invalid
WHERE invalid."publishedFacilityId" = facility."id"
  AND facility."status" = 'ACTIVE';

UPDATE "Organizations" AS organization
SET
  "status" = 'UNLISTED',
  "publicPageEnabled" = FALSE,
  "updatedAt" = NOW()
FROM "_InvalidAffiliateSportCandidates" AS invalid
WHERE invalid."publishedOrganizationId" = organization."id"
  AND organization."status" = 'LISTED'
  AND organization."publicPageEnabled" = TRUE
  AND organization."ownershipStatus" = 'UNCLAIMED';

COMMIT;
