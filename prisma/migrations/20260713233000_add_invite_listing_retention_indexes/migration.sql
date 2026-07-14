CREATE INDEX IF NOT EXISTS "Invites_status_updatedAt_idx"
  ON "Invites"("status", "updatedAt");

-- Canonicalize rows created by the legacy /api/users/invite writer before the
-- pending-only read contract and its indexes become authoritative.
UPDATE "Invites"
SET "status" = CASE
  WHEN UPPER(COALESCE("status", 'PENDING')) IN ('PENDING', 'SENT') THEN 'PENDING'
  WHEN UPPER("status") IN ('DECLINED', 'REJECTED') THEN 'DECLINED'
  WHEN UPPER("status") = 'FAILED' THEN 'FAILED'
  ELSE "status"
END;

UPDATE "Invites"
SET "type" = CASE
  WHEN UPPER("type") IN ('PLAYER', 'TEAM_MANAGER', 'TEAM_HEAD_COACH', 'TEAM_ASSISTANT_COACH') THEN 'TEAM'
  WHEN UPPER("type") IN ('HOST', 'OFFICIAL') THEN 'STAFF'
  ELSE UPPER("type")
END;

-- Apply the 90-day terminal-history policy to the existing backlog. Team
-- invites with unfinished event propagation are retained for reconciliation.
DELETE FROM "Invites" AS invite
WHERE invite."status" IN ('DECLINED', 'REJECTED', 'FAILED')
  AND COALESCE(invite."updatedAt", invite."createdAt") < CURRENT_TIMESTAMP - INTERVAL '90 days'
  AND NOT EXISTS (
    SELECT 1
    FROM "TeamInviteEventSyncs" AS sync
    WHERE sync."inviteId" = invite."id"
      AND sync."status" = 'PENDING'
  );

CREATE INDEX IF NOT EXISTS "Invites_userId_status_createdAt_id_idx"
  ON "Invites"("userId", "status", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "Invites_teamId_status_createdAt_id_idx"
  ON "Invites"("teamId", "status", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "TeamInviteEventSyncs_status_inviteId_idx"
  ON "TeamInviteEventSyncs"("status", "inviteId");
