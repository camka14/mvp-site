ALTER TABLE "VolleyBallTeams"
  ADD COLUMN IF NOT EXISTS "headCoachId" TEXT;

CREATE INDEX IF NOT EXISTS "VolleyBallTeams_headCoachId_idx"
  ON "VolleyBallTeams"("headCoachId");
