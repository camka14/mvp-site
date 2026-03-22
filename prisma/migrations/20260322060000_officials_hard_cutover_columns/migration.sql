-- Rename legacy referee/ref columns to official terminology for existing databases.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'doTeamsRef'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'doTeamsOfficiate'
  ) THEN
    EXECUTE 'ALTER TABLE "Events" RENAME COLUMN "doTeamsRef" TO "doTeamsOfficiate"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'refereeIds'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'officialIds'
  ) THEN
    EXECUTE 'ALTER TABLE "Events" RENAME COLUMN "refereeIds" TO "officialIds"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'teamRefsMaySwap'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'teamOfficialsMaySwap'
  ) THEN
    EXECUTE 'ALTER TABLE "Events" RENAME COLUMN "teamRefsMaySwap" TO "teamOfficialsMaySwap"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'refereeCheckedIn'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'officialCheckedIn'
  ) THEN
    EXECUTE 'ALTER TABLE "Matches" RENAME COLUMN "refereeCheckedIn" TO "officialCheckedIn"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'refereeId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'officialId'
  ) THEN
    EXECUTE 'ALTER TABLE "Matches" RENAME COLUMN "refereeId" TO "officialId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'teamRefereeId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Matches' AND column_name = 'teamOfficialId'
  ) THEN
    EXECUTE 'ALTER TABLE "Matches" RENAME COLUMN "teamRefereeId" TO "teamOfficialId"';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Organizations' AND column_name = 'refIds'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Organizations' AND column_name = 'officialIds'
  ) THEN
    EXECUTE 'ALTER TABLE "Organizations" RENAME COLUMN "refIds" TO "officialIds"';
  END IF;
END $$;

-- Normalize persisted role/invite tokens.
UPDATE "Invites"
SET
  "type" = 'OFFICIAL',
  "updatedAt" = NOW()
WHERE UPPER(COALESCE("type", '')) = 'REFEREE';

UPDATE "Invites"
SET
  "staffTypes" = ARRAY(
    SELECT CASE WHEN UPPER(item) = 'REFEREE' THEN 'OFFICIAL' ELSE item END
    FROM UNNEST(COALESCE("staffTypes", ARRAY[]::TEXT[])) AS item
  ),
  "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM UNNEST(COALESCE("staffTypes", ARRAY[]::TEXT[])) AS item
  WHERE UPPER(item) = 'REFEREE'
);

UPDATE "StaffMembers"
SET
  "types" = ARRAY(
    SELECT CASE WHEN UPPER(item) = 'REFEREE' THEN 'OFFICIAL' ELSE item END
    FROM UNNEST(COALESCE("types", ARRAY[]::TEXT[])) AS item
  ),
  "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM UNNEST(COALESCE("types", ARRAY[]::TEXT[])) AS item
  WHERE UPPER(item) = 'REFEREE'
);