ALTER TYPE "EventsEventTypeEnum" ADD VALUE IF NOT EXISTS 'AFFILIATE';

ALTER TABLE "Events" ADD COLUMN IF NOT EXISTS "affiliateUrl" TEXT;

INSERT INTO "EventTags" ("id", "name", "slug")
VALUES
  ('default_tag_league', 'League', 'league'),
  ('default_tag_tournament', 'Tournament', 'tournament'),
  ('default_tag_pickup_game', 'Pickup Game', 'pickup-game'),
  ('default_tag_open_play', 'Open Play', 'open-play'),
  ('default_tag_rental', 'Rental', 'rental'),
  ('default_tag_clinic', 'Clinic', 'clinic'),
  ('default_tag_camp', 'Camp', 'camp')
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "updatedAt" = CURRENT_TIMESTAMP;
