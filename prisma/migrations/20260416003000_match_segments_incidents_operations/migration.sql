-- Add JSON-backed match rules, lifecycle state, segment score projection, and incident history.
-- Legacy score arrays remain in place for migration/backfill safety, but new runtime contracts use MatchSegments.

ALTER TABLE "Sports"
  ADD COLUMN IF NOT EXISTS "matchRulesTemplate" JSONB;

ALTER TABLE "Events"
  ADD COLUMN IF NOT EXISTS "matchRulesOverride" JSONB,
  ADD COLUMN IF NOT EXISTS "autoCreatePointMatchIncidents" BOOLEAN DEFAULT false;

ALTER TABLE "Matches"
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "resultStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "resultType" TEXT,
  ADD COLUMN IF NOT EXISTS "actualStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusReason" TEXT,
  ADD COLUMN IF NOT EXISTS "winnerEventTeamId" TEXT,
  ADD COLUMN IF NOT EXISTS "matchRulesSnapshot" JSONB;

CREATE TABLE IF NOT EXISTS "MatchSegments" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "eventId" TEXT,
  "matchId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "scores" JSONB NOT NULL,
  "winnerEventTeamId" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "resultType" TEXT,
  "statusReason" TEXT,
  "metadata" JSONB,
  CONSTRAINT "MatchSegments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MatchIncidents" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "eventId" TEXT,
  "matchId" TEXT NOT NULL,
  "segmentId" TEXT,
  "eventTeamId" TEXT,
  "eventRegistrationId" TEXT,
  "participantUserId" TEXT,
  "officialUserId" TEXT,
  "incidentType" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "minute" INTEGER,
  "clock" TEXT,
  "clockSeconds" INTEGER,
  "linkedPointDelta" INTEGER,
  "note" TEXT,
  "metadata" JSONB,
  CONSTRAINT "MatchIncidents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchSegments_matchId_sequence_key"
  ON "MatchSegments"("matchId", "sequence");
CREATE INDEX IF NOT EXISTS "MatchSegments_eventId_idx" ON "MatchSegments"("eventId");
CREATE INDEX IF NOT EXISTS "MatchSegments_matchId_idx" ON "MatchSegments"("matchId");
CREATE INDEX IF NOT EXISTS "MatchSegments_winnerEventTeamId_idx" ON "MatchSegments"("winnerEventTeamId");

CREATE INDEX IF NOT EXISTS "MatchIncidents_eventId_idx" ON "MatchIncidents"("eventId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_matchId_idx" ON "MatchIncidents"("matchId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_segmentId_idx" ON "MatchIncidents"("segmentId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_eventTeamId_idx" ON "MatchIncidents"("eventTeamId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_eventRegistrationId_idx" ON "MatchIncidents"("eventRegistrationId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_participantUserId_idx" ON "MatchIncidents"("participantUserId");
CREATE INDEX IF NOT EXISTS "MatchIncidents_officialUserId_idx" ON "MatchIncidents"("officialUserId");

CREATE INDEX IF NOT EXISTS "Matches_winnerEventTeamId_idx" ON "Matches"("winnerEventTeamId");

INSERT INTO "MatchSegments" (
  "id",
  "createdAt",
  "updatedAt",
  "eventId",
  "matchId",
  "sequence",
  "status",
  "scores",
  "winnerEventTeamId",
  "startedAt",
  "endedAt"
)
SELECT
  "Matches"."id" || '_segment_' || series.index,
  COALESCE("Matches"."createdAt", NOW()),
  COALESCE("Matches"."updatedAt", NOW()),
  "Matches"."eventId",
  "Matches"."id",
  series.index,
  CASE
    WHEN COALESCE("Matches"."setResults"[series.index], 0) IN (1, 2) THEN 'COMPLETE'
    WHEN COALESCE("Matches"."team1Points"[series.index], 0) > 0
      OR COALESCE("Matches"."team2Points"[series.index], 0) > 0 THEN 'IN_PROGRESS'
    ELSE 'NOT_STARTED'
  END,
  jsonb_build_object(
    COALESCE("Matches"."team1Id", 'team1'),
    COALESCE("Matches"."team1Points"[series.index], 0),
    COALESCE("Matches"."team2Id", 'team2'),
    COALESCE("Matches"."team2Points"[series.index], 0)
  ),
  CASE COALESCE("Matches"."setResults"[series.index], 0)
    WHEN 1 THEN "Matches"."team1Id"
    WHEN 2 THEN "Matches"."team2Id"
    ELSE NULL
  END,
  CASE
    WHEN COALESCE("Matches"."team1Points"[series.index], 0) > 0
      OR COALESCE("Matches"."team2Points"[series.index], 0) > 0 THEN "Matches"."start"
    ELSE NULL
  END,
  CASE
    WHEN COALESCE("Matches"."setResults"[series.index], 0) IN (1, 2) THEN "Matches"."end"
    ELSE NULL
  END
FROM "Matches"
CROSS JOIN LATERAL generate_series(
  1,
  GREATEST(
    COALESCE(cardinality("Matches"."team1Points"), 0),
    COALESCE(cardinality("Matches"."team2Points"), 0),
    COALESCE(cardinality("Matches"."setResults"), 0)
  )
) AS series(index)
ON CONFLICT ("matchId", "sequence") DO NOTHING;

UPDATE "Matches"
SET "winnerEventTeamId" = CASE
  WHEN "setResults" @> ARRAY[1]::INTEGER[]
    AND COALESCE(array_length(array_positions("setResults", 1), 1), 0) >= COALESCE(array_length(array_positions("setResults", 2), 1), 0)
    THEN "team1Id"
  WHEN "setResults" @> ARRAY[2]::INTEGER[]
    THEN "team2Id"
  ELSE "winnerEventTeamId"
END
WHERE "winnerEventTeamId" IS NULL;
