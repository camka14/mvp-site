BEGIN;

-- These are the remaining scoreable team sports requested for tournament and
-- league event creation. Keep the stable IDs equal to the canonical names.
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
  'Field Hockey',
  'Field Hockey',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[{"id":"recreational","name":"Recreational"},{"id":"competitive","name":"Competitive"},{"id":"premier","name":"Premier"},{"id":"elite","name":"Elite"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Umpire","count":2},{"name":"Technical Official","count":1}]'::jsonb,
  '{"scoringModel":"PERIODS","segmentCount":4,"segmentLabel":"Quarter","supportsDraw":true,"supportsOvertime":true,"supportsShootout":true,"canUseOvertime":true,"canUseShootout":true,"officialRoles":[],"supportedIncidentTypes":["GOAL","MINOR_PENALTY","MAJOR_PENALTY","MISCONDUCT","GAME_MISCONDUCT","MATCH_PENALTY","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"GOAL","label":"Goal","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"MINOR_PENALTY","label":"Minor penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"MAJOR_PENALTY","label":"Major penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"MISCONDUCT","label":"Misconduct","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"GAME_MISCONDUCT","label":"Game misconduct","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"MATCH_PENALTY","label":"Match penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"GOAL","timekeeping":{"timerMode":"COUNT_UP","segmentDurationMinutes":15,"segmentDurationMinutesBySequence":[],"canUseAddedTime":false,"addedTimeEnabled":false,"stopAtRegulationEnd":true}}'::jsonb
),
(
  'Lacrosse',
  'Lacrosse',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[{"id":"recreational","name":"Recreational"},{"id":"competitive","name":"Competitive"},{"id":"club","name":"Club"},{"id":"elite","name":"Elite"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Referee","count":2},{"name":"Table Official","count":1}]'::jsonb,
  '{"scoringModel":"PERIODS","segmentCount":4,"segmentLabel":"Quarter","supportsDraw":true,"supportsOvertime":true,"supportsShootout":false,"canUseOvertime":true,"canUseShootout":false,"officialRoles":[],"supportedIncidentTypes":["GOAL","PERSONAL_FOUL","TECHNICAL_FOUL","YELLOW_CARD","RED_CARD","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"GOAL","label":"Goal","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"PERSONAL_FOUL","label":"Personal foul","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"TECHNICAL_FOUL","label":"Technical foul","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"YELLOW_CARD","label":"Yellow card","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"yellow"},{"code":"RED_CARD","label":"Red card","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"GOAL","timekeeping":{"timerMode":"COUNT_UP","segmentDurationMinutes":15,"segmentDurationMinutesBySequence":[],"canUseAddedTime":false,"addedTimeEnabled":false,"stopAtRegulationEnd":true}}'::jsonb
),
(
  'Australian Football',
  'Australian Football',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[{"id":"recreational","name":"Recreational"},{"id":"competitive","name":"Competitive"},{"id":"premier","name":"Premier"},{"id":"elite","name":"Elite"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Field Umpire","count":3},{"name":"Boundary Umpire","count":2},{"name":"Goal Umpire","count":2}]'::jsonb,
  '{"scoringModel":"PERIODS","segmentCount":4,"segmentLabel":"Quarter","supportsDraw":true,"supportsOvertime":true,"supportsShootout":false,"canUseOvertime":true,"canUseShootout":false,"officialRoles":[],"supportedIncidentTypes":["GOAL","BEHIND","FREE_KICK","REPORTABLE_OFFENCE","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"GOAL","label":"Goal (6 points)","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":6},{"code":"BEHIND","label":"Behind (1 point)","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"FREE_KICK","label":"Free kick","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},{"code":"REPORTABLE_OFFENCE","label":"Reportable offence","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"GOAL","timekeeping":{"timerMode":"COUNT_UP","segmentDurationMinutes":20,"segmentDurationMinutesBySequence":[],"canUseAddedTime":false,"addedTimeEnabled":false,"stopAtRegulationEnd":true}}'::jsonb
),
(
  'Ball Hockey',
  'Ball Hockey',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[{"id":"recreational","name":"Recreational"},{"id":"b","name":"B"},{"id":"a","name":"A"},{"id":"aa","name":"AA"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Referee","count":2},{"name":"Linesperson","count":2}]'::jsonb,
  '{"scoringModel":"PERIODS","segmentCount":3,"segmentLabel":"Period","supportsDraw":true,"supportsOvertime":true,"supportsShootout":true,"canUseOvertime":true,"canUseShootout":true,"officialRoles":[],"supportedIncidentTypes":["GOAL","MINOR_PENALTY","MAJOR_PENALTY","MISCONDUCT","GAME_MISCONDUCT","MATCH_PENALTY","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"GOAL","label":"Goal","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"MINOR_PENALTY","label":"Minor penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"MAJOR_PENALTY","label":"Major penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"MISCONDUCT","label":"Misconduct","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true},{"code":"GAME_MISCONDUCT","label":"Game misconduct","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"MATCH_PENALTY","label":"Match penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"GOAL","timekeeping":{"timerMode":"COUNT_UP","segmentDurationMinutes":15,"segmentDurationMinutesBySequence":[],"canUseAddedTime":false,"addedTimeEnabled":false,"stopAtRegulationEnd":true}}'::jsonb
),
(
  'Futsal',
  'Futsal',
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  FALSE,
  '[{"id":"recreational","name":"Recreational"},{"id":"competitive","name":"Competitive"},{"id":"premier","name":"Premier"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Referee","count":2},{"name":"Timekeeper","count":1}]'::jsonb,
  '{"scoringModel":"PERIODS","segmentCount":2,"segmentLabel":"Half","supportsDraw":true,"supportsOvertime":false,"supportsShootout":false,"canUseOvertime":true,"canUseShootout":true,"officialRoles":[],"supportedIncidentTypes":["GOAL","YELLOW_CARD","RED_CARD","SECOND_YELLOW_CARD","FOUL","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"GOAL","label":"Goal","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"YELLOW_CARD","label":"Yellow card","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"yellow"},{"code":"RED_CARD","label":"Red card","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"red"},{"code":"SECOND_YELLOW_CARD","label":"Second yellow card","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":true,"defaultEnabled":true,"cardColor":"yellow"},{"code":"FOUL","label":"Foul","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"GOAL","timekeeping":{"timerMode":"COUNT_UP","segmentDurationMinutes":20,"segmentDurationMinutesBySequence":[],"canUseAddedTime":true,"addedTimeEnabled":true,"stopAtRegulationEnd":false}}'::jsonb
),
(
  'Table Tennis',
  'Table Tennis',
  TRUE,
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  '[{"id":"beginner","name":"Beginner"},{"id":"intermediate","name":"Intermediate"},{"id":"advanced","name":"Advanced"},{"id":"open","name":"Open"}]'::jsonb,
  '[{"name":"Umpire","count":1},{"name":"Assistant Umpire","count":1}]'::jsonb,
  '{"scoringModel":"SETS","segmentLabel":"Game","supportsDraw":false,"supportsOvertime":false,"supportsShootout":false,"canUseOvertime":false,"canUseShootout":false,"officialRoles":[],"supportedIncidentTypes":["POINT","WARNING","POINT_PENALTY","GAME_PENALTY","DEFAULT","NOTE","ADMIN"],"incidentTypeDefinitions":[{"code":"POINT","label":"Point","kind":"SCORING","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"linkedPointDelta":1},{"code":"WARNING","label":"Warning","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},{"code":"POINT_PENALTY","label":"Point penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},{"code":"GAME_PENALTY","label":"Game penalty","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true},{"code":"DEFAULT","label":"Default","kind":"DISCIPLINE","requiresTeam":true,"requiresParticipant":false,"defaultEnabled":true,"cardColor":"red"},{"code":"NOTE","label":"Match note","kind":"NOTE","defaultEnabled":true},{"code":"ADMIN","label":"Admin note","kind":"ADMIN","defaultEnabled":true}],"autoCreatePointIncidentType":"POINT","timekeeping":{"timerMode":"NONE","segmentDurationMinutes":null,"segmentDurationMinutesBySequence":[],"canUseAddedTime":false,"addedTimeEnabled":false,"stopAtRegulationEnd":true},"segmentCount":5,"setPointTargets":[11,11,11,11,11]}'::jsonb
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
  "matchRulesTemplate" = COALESCE("Sports"."matchRulesTemplate", EXCLUDED."matchRulesTemplate"),
  "updatedAt" = NOW();

CREATE TEMP TABLE "_BlacklistedAffiliateSports" ("name" TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO "_BlacklistedAffiliateSports" ("name") VALUES
  ('Cheerleading'),
  ('Dance'),
  ('Running'),
  ('Swimming'),
  ('Track and Field'),
  ('Golf');

-- Remove excluded catalog values from all current multi-sport arrays before
-- deleting a legacy row. This keeps hydration from following a removed ID.
UPDATE "Fields" AS field
SET "sportIds" = ARRAY(
  SELECT value
  FROM unnest(field."sportIds") AS sport_id(value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "_BlacklistedAffiliateSports" AS blocked
    WHERE LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
  )
), "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM unnest(field."sportIds") AS sport_id(value)
  JOIN "_BlacklistedAffiliateSports" AS blocked
    ON LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
);

UPDATE "Events" AS event
SET "sportIds" = ARRAY(
  SELECT value
  FROM unnest(event."sportIds") AS sport_id(value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "_BlacklistedAffiliateSports" AS blocked
    WHERE LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
  )
), "state" = CASE WHEN NOT EXISTS (
  SELECT 1
  FROM unnest(event."sportIds") AS remaining_id(value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "_BlacklistedAffiliateSports" AS blocked
    WHERE LOWER(BTRIM(remaining_id.value)) = LOWER(blocked."name")
  )
) THEN 'UNPUBLISHED'::"EventsStateEnum" ELSE event."state" END, "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM unnest(event."sportIds") AS sport_id(value)
  JOIN "_BlacklistedAffiliateSports" AS blocked
    ON LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
);

UPDATE "Organizations" AS organization
SET "sports" = ARRAY(
  SELECT value
  FROM unnest(organization."sports") AS sport_id(value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM "_BlacklistedAffiliateSports" AS blocked
    WHERE LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
  )
), "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM unnest(organization."sports") AS sport_id(value)
  JOIN "_BlacklistedAffiliateSports" AS blocked
    ON LOWER(BTRIM(sport_id.value)) = LOWER(blocked."name")
);

UPDATE "Divisions" AS division
SET "sportId" = NULL, "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM "_BlacklistedAffiliateSports" AS blocked
  WHERE LOWER(BTRIM(division."sportId")) = LOWER(blocked."name")
);

DELETE FROM "Sports" AS sport
WHERE EXISTS (
  SELECT 1
  FROM "_BlacklistedAffiliateSports" AS blocked
  WHERE LOWER(BTRIM(sport."name")) = LOWER(blocked."name")
);

CREATE TEMP TABLE "_BlacklistedAffiliateCandidates" ON COMMIT DROP AS
SELECT
  candidate."id",
  candidate."publishedEventId",
  candidate."publishedFacilityId",
  candidate."publishedOrganizationId"
FROM "AffiliateImportCandidates" AS candidate
WHERE EXISTS (
  SELECT 1
  FROM "_BlacklistedAffiliateSports" AS blocked
  WHERE LOWER(BTRIM(candidate."sportName")) = LOWER(blocked."name")
);

UPDATE "AffiliateImportCandidates" AS candidate
SET
  "status" = 'NEEDS_REVIEW',
  "warnings" = CASE
    WHEN 'Sport is blacklisted for BracketIQ tournament and league scoring; human review is required.' = ANY(COALESCE(candidate."warnings", ARRAY[]::text[]))
      THEN COALESCE(candidate."warnings", ARRAY[]::text[])
    ELSE array_append(
      COALESCE(candidate."warnings", ARRAY[]::text[]),
      'Sport is blacklisted for BracketIQ tournament and league scoring; human review is required.'
    )
  END,
  "updatedAt" = NOW()
WHERE candidate."id" IN (SELECT "id" FROM "_BlacklistedAffiliateCandidates");

UPDATE "Events" AS event
SET "state" = 'UNPUBLISHED', "updatedAt" = NOW()
FROM "_BlacklistedAffiliateCandidates" AS blocked
WHERE blocked."publishedEventId" = event."id"
  AND event."state" = 'PUBLISHED';

UPDATE "Facilities" AS facility
SET "status" = 'DRAFT', "updatedAt" = NOW()
FROM "_BlacklistedAffiliateCandidates" AS blocked
WHERE blocked."publishedFacilityId" = facility."id"
  AND facility."status" = 'ACTIVE';

UPDATE "Organizations" AS organization
SET "status" = 'UNLISTED', "publicPageEnabled" = FALSE, "updatedAt" = NOW()
FROM "_BlacklistedAffiliateCandidates" AS blocked
WHERE blocked."publishedOrganizationId" = organization."id"
  AND organization."status" = 'LISTED'
  AND organization."publicPageEnabled" = TRUE
  AND organization."ownershipStatus" = 'UNCLAIMED';

COMMIT;
