-- Older affiliate candidates used the generic Volleyball label. The canonical
-- catalog represents that label as Indoor Volleyball.
UPDATE "Events" AS event
SET
  "sportId" = 'Indoor Volleyball',
  "updatedAt" = NOW()
FROM "AffiliateImportCandidates" AS candidate
WHERE candidate."publishedEventId" = event."id"
  AND event."sportId" IS NULL
  AND event."sourceType" = 'AFFILIATE_IMPORT'
  AND LOWER(BTRIM(candidate."sportName")) = 'volleyball';
