BEGIN;

ALTER TABLE "ChatGroup"
ADD COLUMN "directUserIdA" TEXT,
ADD COLUMN "directUserIdB" TEXT;

-- Legacy clients treated the newest ordinary two-person chat as the direct
-- conversation for that pair. Preserve that behavior without destructively
-- merging histories: key only one deterministic winner and leave any older
-- duplicates untouched. Notification topics share this table, so their known
-- reserved prefixes must never become direct-message candidates.
CREATE TEMP TABLE "_DirectMessageWinner" AS
WITH "Candidates" AS (
  SELECT
    "id",
    LEAST("userIds"[1], "userIds"[2]) AS "directUserIdA",
    GREATEST("userIds"[1], "userIds"[2]) AS "directUserIdB",
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("userIds"[1], "userIds"[2]), GREATEST("userIds"[1], "userIds"[2])
      ORDER BY COALESCE("updatedAt", "createdAt", TIMESTAMP '1970-01-01 00:00:00') DESC, "id" ASC
    ) AS "candidateRank"
  FROM "ChatGroup"
  WHERE "teamId" IS NULL
    AND "archivedAt" IS NULL
    AND LOWER("id") NOT LIKE 'team:%'
    AND LOWER("id") !~ '^(user_|team_|event_|tournament_|match_)'
    AND CARDINALITY("userIds") = 2
    AND "userIds"[1] <> "userIds"[2]
)
SELECT "id", "directUserIdA", "directUserIdB"
FROM "Candidates"
WHERE "candidateRank" = 1;

UPDATE "ChatGroup" AS winner
SET "directUserIdA" = candidate."directUserIdA",
    "directUserIdB" = candidate."directUserIdB"
FROM "_DirectMessageWinner" AS candidate
WHERE winner."id" = candidate."id";

CREATE UNIQUE INDEX "ChatGroup_directUserIdA_directUserIdB_key"
ON "ChatGroup"("directUserIdA", "directUserIdB");

DROP TABLE "_DirectMessageWinner";

COMMIT;
