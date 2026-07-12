ALTER TABLE "EventTags"
  ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "EventTags"
SET "isSystem" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN (
  'league',
  'tournament',
  'pickup-game',
  'open-play',
  'rental',
  'clinic',
  'camp',
  'tryouts'
);

CREATE INDEX IF NOT EXISTS "EventTags_isSystem_idx" ON "EventTags"("isSystem");
