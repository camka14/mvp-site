ALTER TABLE "UserData"
ADD COLUMN IF NOT EXISTS "accountVisibility" TEXT NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX IF NOT EXISTS "UserData_accountVisibility_idx"
ON "UserData"("accountVisibility");
