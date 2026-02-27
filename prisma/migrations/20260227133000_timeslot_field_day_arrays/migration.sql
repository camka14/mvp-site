-- Canonical timeslot storage: persist multi-field and multi-day values directly.
ALTER TABLE "TimeSlots"
  ADD COLUMN IF NOT EXISTS "scheduledFieldIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "daysOfWeek" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

WITH normalized AS (
  SELECT
    "id",
    COALESCE(
      (
        SELECT ARRAY_AGG(DISTINCT trimmed)
        FROM (
          SELECT BTRIM(value) AS trimmed
          FROM UNNEST(
            COALESCE("scheduledFieldIds", ARRAY[]::TEXT[])
            || CASE
              WHEN "scheduledFieldId" IS NULL OR BTRIM("scheduledFieldId") = '' THEN ARRAY[]::TEXT[]
              ELSE ARRAY["scheduledFieldId"]
            END
          ) AS values(value)
        ) AS normalized_values
        WHERE trimmed <> ''
      ),
      ARRAY[]::TEXT[]
    ) AS "nextScheduledFieldIds",
    COALESCE(
      (
        SELECT ARRAY_AGG(DISTINCT day ORDER BY day)
        FROM UNNEST(
          COALESCE("daysOfWeek", ARRAY[]::INTEGER[])
          || CASE
            WHEN "dayOfWeek" BETWEEN 0 AND 6 THEN ARRAY["dayOfWeek"]
            ELSE ARRAY[]::INTEGER[]
          END
        ) AS days(day)
        WHERE day BETWEEN 0 AND 6
      ),
      ARRAY[]::INTEGER[]
    ) AS "nextDaysOfWeek"
  FROM "TimeSlots"
)
UPDATE "TimeSlots" AS slot
SET
  "scheduledFieldIds" = normalized."nextScheduledFieldIds",
  "daysOfWeek" = normalized."nextDaysOfWeek",
  "scheduledFieldId" = CASE
    WHEN COALESCE(ARRAY_LENGTH(normalized."nextScheduledFieldIds", 1), 0) > 0
      THEN normalized."nextScheduledFieldIds"[1]
    ELSE NULL
  END,
  "dayOfWeek" = CASE
    WHEN COALESCE(ARRAY_LENGTH(normalized."nextDaysOfWeek", 1), 0) > 0
      THEN normalized."nextDaysOfWeek"[1]
    ELSE NULL
  END
FROM normalized
WHERE slot."id" = normalized."id";

CREATE INDEX IF NOT EXISTS "TimeSlots_scheduledFieldIds_gin_idx"
  ON "TimeSlots" USING GIN ("scheduledFieldIds");

CREATE INDEX IF NOT EXISTS "TimeSlots_daysOfWeek_gin_idx"
  ON "TimeSlots" USING GIN ("daysOfWeek");
