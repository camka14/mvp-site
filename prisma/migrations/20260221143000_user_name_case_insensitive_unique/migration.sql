-- Normalize blank usernames to a deterministic unique fallback.
UPDATE "UserData"
SET "userName" = CONCAT('user_', REPLACE("id", '-', ''))
WHERE BTRIM("userName") = '';

-- Resolve case-insensitive duplicates by giving later rows deterministic unique usernames.
WITH ranked AS (
  SELECT
    "id",
    "userName",
    ROW_NUMBER() OVER (
      PARTITION BY LOWER("userName")
      ORDER BY COALESCE("createdAt", NOW()) ASC, "id" ASC
    ) AS row_num
  FROM "UserData"
),
duplicates AS (
  SELECT
    "id",
    CONCAT('user_', REPLACE("id", '-', '')) AS next_user_name
  FROM ranked
  WHERE row_num > 1
)
UPDATE "UserData" user_data
SET "userName" = duplicates.next_user_name
FROM duplicates
WHERE user_data."id" = duplicates."id";

-- Enforce one username globally, case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS "UserData_userName_ci_unique"
ON "UserData"(LOWER("userName"));
