ALTER TABLE "AffiliateScrapeSources"
  ADD COLUMN "autoScrapeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scrapeIntervalMinutes" INTEGER NOT NULL DEFAULT 1440;

CREATE INDEX IF NOT EXISTS "AffiliateScrapeSources_autoScrapeEnabled_status_idx"
  ON "AffiliateScrapeSources"("autoScrapeEnabled", "status");

UPDATE "AffiliateScrapeSources"
SET
  "autoScrapeEnabled" = true,
  "scrapeIntervalMinutes" = CASE "sourceKey"
    WHEN 'portland-basketball-pick-to-play' THEN 1440
    WHEN 'portland-ultimate-events' THEN 1440
    WHEN 'rose-city-volleyball-signups' THEN 1440

    WHEN 'eastside-opf-community-programs' THEN 10080
    WHEN 'eastside-opf-indoor-camps' THEN 10080
    WHEN 'eastside-opf-programs' THEN 10080
    WHEN 'eastside-timbers-edge' THEN 10080
    WHEN 'eastside-timbers-recreation' THEN 10080
    WHEN 'eastside-timbers-summer-camps' THEN 10080
    WHEN 'lake-oswego-adult-basketball' THEN 10080
    WHEN 'nuws-fall-2026-registration' THEN 10080
    WHEN 'nwibl-adult-baseball-registration' THEN 10080
    WHEN 'oregon-youth-soccer-sanctioned-tournaments' THEN 10080
    WHEN 'portland-softball-current-programs' THEN 10080
    WHEN 'portland-youth-soccer-association-programs' THEN 10080
    WHEN 'rose-city-futsal-adult-leagues' THEN 10080
    WHEN 'rose-city-futsal-community-teams' THEN 10080
    WHEN 'sfva-volleyball-tournaments' THEN 10080

    WHEN 'cascade-athletic-clubs-gresham-sports-programs' THEN 43200
    WHEN 'city-gresham-sports-field-rentals' THEN 43200
    WHEN 'eastside-timbers-field-rentals' THEN 43200
    WHEN 'gpsd-adult-soccer-seasons' THEN 43200
    WHEN 'lake-oswego-adult-slow-pitch-softball' THEN 43200
    WHEN 'rose-city-futsal-court-rentals' THEN 43200
    WHEN 'troutdale-indoor-sports-programs' THEN 43200
    ELSE "scrapeIntervalMinutes"
  END
WHERE "sourceKey" IN (
  'portland-basketball-pick-to-play',
  'portland-ultimate-events',
  'rose-city-volleyball-signups',
  'eastside-opf-community-programs',
  'eastside-opf-indoor-camps',
  'eastside-opf-programs',
  'eastside-timbers-edge',
  'eastside-timbers-recreation',
  'eastside-timbers-summer-camps',
  'lake-oswego-adult-basketball',
  'nuws-fall-2026-registration',
  'nwibl-adult-baseball-registration',
  'oregon-youth-soccer-sanctioned-tournaments',
  'portland-softball-current-programs',
  'portland-youth-soccer-association-programs',
  'rose-city-futsal-adult-leagues',
  'rose-city-futsal-community-teams',
  'sfva-volleyball-tournaments',
  'cascade-athletic-clubs-gresham-sports-programs',
  'city-gresham-sports-field-rentals',
  'eastside-timbers-field-rentals',
  'gpsd-adult-soccer-seasons',
  'lake-oswego-adult-slow-pitch-softball',
  'rose-city-futsal-court-rentals',
  'troutdale-indoor-sports-programs'
);
