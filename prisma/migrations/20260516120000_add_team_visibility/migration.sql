CREATE TYPE "TeamsVisibilityEnum" AS ENUM ('PUBLIC', 'ADMIN_ONLY');

ALTER TABLE "Teams"
  ADD COLUMN "visibility" "TeamsVisibilityEnum" NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX "Teams_visibility_idx" ON "Teams"("visibility");
