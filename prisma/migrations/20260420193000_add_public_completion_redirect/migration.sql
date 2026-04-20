ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "publicCompletionRedirectUrl" TEXT;
