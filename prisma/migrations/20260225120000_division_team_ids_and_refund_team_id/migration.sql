-- Add division-owned team memberships and team-scoped refund request context.

ALTER TABLE "Divisions"
  ADD COLUMN IF NOT EXISTS "teamIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "RefundRequests"
  ADD COLUMN IF NOT EXISTS "teamId" TEXT;

