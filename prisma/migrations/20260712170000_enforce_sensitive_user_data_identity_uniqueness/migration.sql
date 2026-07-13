-- SensitiveUserData is the canonical private identity companion for exactly
-- one AuthUser. Normalize the legacy values before enforcing that one-to-one
-- invariant so all current lookup paths can rely on deterministic keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SensitiveUserData"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce SensitiveUserData userId uniqueness while duplicate rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "SensitiveUserData"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce SensitiveUserData email uniqueness while duplicate rows exist.';
  END IF;
END $$;

UPDATE "SensitiveUserData"
SET "email" = LOWER(BTRIM("email"))
WHERE "email" <> LOWER(BTRIM("email"));

CREATE UNIQUE INDEX "SensitiveUserData_userId_key" ON "SensitiveUserData"("userId");
CREATE UNIQUE INDEX "SensitiveUserData_email_key" ON "SensitiveUserData"("email");
