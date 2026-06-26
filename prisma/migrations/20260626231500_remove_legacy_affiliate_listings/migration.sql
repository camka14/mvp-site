DROP TABLE IF EXISTS "AffiliateListings";

ALTER TABLE "AffiliateImportCandidates"
  DROP COLUMN IF EXISTS "publishedListingId";
