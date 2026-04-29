DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TeamInviteEventSyncStatusEnum'
  ) THEN
    CREATE TYPE "TeamInviteEventSyncStatusEnum" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TeamInviteEventSyncs" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3),
  "inviteId" TEXT NOT NULL,
  "canonicalTeamId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventTeamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "previousRegistrationSnapshot" JSONB,
  "eventTeamHadUser" BOOLEAN NOT NULL DEFAULT false,
  "eventTeamHadPendingUser" BOOLEAN NOT NULL DEFAULT false,
  "sourceTeamRegistrationId" TEXT,
  "status" "TeamInviteEventSyncStatusEnum" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "TeamInviteEventSyncs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamInviteEventSyncs_inviteId_eventTeamId_userId_key"
  ON "TeamInviteEventSyncs"("inviteId", "eventTeamId", "userId");
CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_inviteId_idx"
  ON "TeamInviteEventSyncs"("inviteId");
CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_canonicalTeamId_idx"
  ON "TeamInviteEventSyncs"("canonicalTeamId");
CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_eventId_idx"
  ON "TeamInviteEventSyncs"("eventId");
CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_eventTeamId_idx"
  ON "TeamInviteEventSyncs"("eventTeamId");
CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_userId_idx"
  ON "TeamInviteEventSyncs"("userId");
