ALTER TABLE "Invites"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "linkVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "linkExpiresAt" TIMESTAMP(3),
  ADD COLUMN "claimedBy" TEXT;

CREATE INDEX "Invites_linkExpiresAt_status_idx"
  ON "Invites"("linkExpiresAt", "status");
