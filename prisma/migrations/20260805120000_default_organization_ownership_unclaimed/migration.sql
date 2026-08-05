-- Use fail-closed defaults for creation paths that omit ownership fields.
ALTER TABLE "Organizations"
  ALTER COLUMN "originType" SET DEFAULT 'AFFILIATE_IMPORTED',
  ALTER COLUMN "ownershipStatus" SET DEFAULT 'UNCLAIMED';

-- New and updated affiliate claims must include durable acceptance evidence.
-- NOT VALID preserves deployment compatibility with historical rows. A later
-- migration can validate the constraint after the guarded repair is complete.
ALTER TABLE "Organizations"
  ADD CONSTRAINT "Organizations_affiliate_claimed_requires_evidence"
  CHECK (
    "originType" <> 'AFFILIATE_IMPORTED'
    OR "ownershipStatus" <> 'CLAIMED'
    OR ("claimedAt" IS NOT NULL AND "claimedByUserId" IS NOT NULL)
  ) NOT VALID;
