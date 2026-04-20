DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TeamMembershipStatusEnum'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TeamMembershipStatusEnum'
      AND e.enumlabel = 'STARTED'
  ) THEN
    ALTER TYPE "TeamMembershipStatusEnum" ADD VALUE 'STARTED';
  END IF;
END $$;

ALTER TABLE "Teams"
  ADD COLUMN IF NOT EXISTS "openRegistration" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "registrationPriceCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "Teams"
SET
  "openRegistration" = COALESCE("openRegistration", false),
  "registrationPriceCents" = GREATEST(COALESCE("registrationPriceCents", 0), 0)
WHERE "openRegistration" IS NULL
   OR "registrationPriceCents" IS NULL
   OR "registrationPriceCents" < 0;
