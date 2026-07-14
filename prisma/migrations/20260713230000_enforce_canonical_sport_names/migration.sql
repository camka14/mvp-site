BEGIN;

-- Keep the canonical mapping stable while every denormalized reference is
-- rewritten. These tables contain no foreign keys to Sports, so allowing a
-- concurrent legacy write during the rewrite could otherwise leave a dangling
-- duplicate ID or name after the duplicate row is deleted.
LOCK TABLE
  "Sports",
  "Events",
  "Divisions",
  "EventTemplates",
  "Fields",
  "EventTeams",
  "Teams",
  "Organizations"
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Sports" WHERE btrim("name") = '') THEN
    RAISE EXCEPTION 'Sports contains a blank name; repair it before enforcing canonical sport identity.'
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE TEMP TABLE "_SportCanonicalGroups" ON COMMIT DROP AS
WITH scored AS (
  SELECT
    s."id",
    s."name",
    s."createdAt",
    lower(btrim(s."name")) AS normalized_name,
    (
      SELECT count(*)::integer
      FROM jsonb_each(to_jsonb(s) - 'id' - 'name' - 'createdAt' - 'updatedAt') AS configuration
      WHERE configuration.value <> 'null'::jsonb
    ) AS populated_configuration_count
  FROM "Sports" AS s
), ranked AS (
  SELECT
    scored.*,
    row_number() OVER (
      PARTITION BY scored.normalized_name
      ORDER BY
        CASE
          WHEN lower(btrim(scored."id")) = scored.normalized_name THEN 0
          ELSE 1
        END,
        scored.populated_configuration_count DESC,
        scored."createdAt" ASC NULLS LAST,
        scored."id" ASC
    ) AS canonical_rank
  FROM scored
)
SELECT
  ranked.normalized_name,
  ranked."id" AS canonical_id,
  btrim(ranked."name") AS canonical_name
FROM ranked
WHERE ranked.canonical_rank = 1;

ALTER TABLE "_SportCanonicalGroups"
  ADD CONSTRAINT "_SportCanonicalGroups_pkey" PRIMARY KEY (normalized_name);

CREATE TEMP TABLE "_SportConfigurationValues" ON COMMIT DROP AS
SELECT
  canonical.normalized_name,
  configuration.key AS field_name,
  configuration.value AS field_value
FROM "Sports" AS sport
JOIN "_SportCanonicalGroups" AS canonical
  ON canonical.normalized_name = lower(btrim(sport."name"))
CROSS JOIN LATERAL jsonb_each(
  to_jsonb(sport) - 'id' - 'name' - 'createdAt' - 'updatedAt'
) AS configuration
WHERE configuration.value <> 'null'::jsonb;

DO $$
DECLARE
  conflicting_name text;
  conflicting_field text;
  conflicting_values jsonb;
BEGIN
  SELECT
    conflict.normalized_name,
    conflict.field_name,
    conflict.field_values
  INTO conflicting_name, conflicting_field, conflicting_values
  FROM (
    SELECT
      distinct_value.normalized_name,
      distinct_value.field_name,
      jsonb_agg(
        distinct_value.field_value
        ORDER BY distinct_value.field_value::text
      ) AS field_values
    FROM (
      SELECT DISTINCT
        configuration.normalized_name,
        configuration.field_name,
        configuration.field_value
      FROM "_SportConfigurationValues" AS configuration
    ) AS distinct_value
    GROUP BY distinct_value.normalized_name, distinct_value.field_name
    HAVING count(*) > 1
    ORDER BY distinct_value.normalized_name, distinct_value.field_name
    LIMIT 1
  ) AS conflict;

  IF FOUND THEN
    RAISE EXCEPTION
      'Conflicting non-null Sports configuration for canonical name "%" in field "%".',
      conflicting_name,
      conflicting_field
      USING
        ERRCODE = '23514',
        DETAIL = format('Distinct values: %s', conflicting_values::text),
        HINT = 'Resolve the duplicate Sports configuration conflict before retrying this migration.';
  END IF;
END
$$;

CREATE TEMP TABLE "_SportMergedConfiguration" ON COMMIT DROP AS
SELECT
  configuration.normalized_name,
  jsonb_object_agg(configuration.field_name, configuration.field_value) AS configuration
FROM (
  SELECT
    value.normalized_name,
    value.field_name,
    (jsonb_agg(value.field_value ORDER BY value.field_value::text) -> 0) AS field_value
  FROM "_SportConfigurationValues" AS value
  GROUP BY value.normalized_name, value.field_name
) AS configuration
GROUP BY configuration.normalized_name;

DO $$
DECLARE
  configuration_assignments text;
BEGIN
  SELECT string_agg(
    format(
      '%1$I = (jsonb_populate_record(NULL::"Sports", to_jsonb(sport) || merged.configuration)).%1$I',
      attribute.attname
    ),
    ', ' ORDER BY attribute.attnum
  )
  INTO configuration_assignments
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = '"Sports"'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attname NOT IN ('id', 'name', 'createdAt', 'updatedAt');

  IF configuration_assignments IS NULL THEN
    RAISE EXCEPTION 'Sports has no configuration columns to merge.';
  END IF;

  EXECUTE format(
    'UPDATE "Sports" AS sport
     SET %s
     FROM "_SportCanonicalGroups" AS canonical
     JOIN "_SportMergedConfiguration" AS merged
       ON merged.normalized_name = canonical.normalized_name
     WHERE sport."id" = canonical.canonical_id',
    configuration_assignments
  );
END
$$;

CREATE TEMP TABLE "_SportIdReferenceMap" ON COMMIT DROP AS
SELECT
  sport."id" AS source_id,
  canonical.canonical_id,
  canonical.canonical_name,
  canonical.normalized_name
FROM "Sports" AS sport
JOIN "_SportCanonicalGroups" AS canonical
  ON canonical.normalized_name = lower(btrim(sport."name"));

ALTER TABLE "_SportIdReferenceMap"
  ADD CONSTRAINT "_SportIdReferenceMap_pkey" PRIMARY KEY (source_id);

CREATE TEMP TABLE "_SportDuplicateMap" ON COMMIT DROP AS
SELECT
  reference.source_id AS duplicate_id,
  reference.canonical_id,
  reference.canonical_name,
  reference.normalized_name
FROM "_SportIdReferenceMap" AS reference
WHERE reference.source_id <> reference.canonical_id;

ALTER TABLE "_SportDuplicateMap"
  ADD CONSTRAINT "_SportDuplicateMap_pkey" PRIMARY KEY (duplicate_id);

WITH resolved_events AS (
  SELECT
    event."id",
    coalesce(by_id.canonical_id, by_name.canonical_id) AS canonical_id
  FROM "Events" AS event
  LEFT JOIN "_SportIdReferenceMap" AS by_id
    ON by_id.source_id = event."sportId"
  LEFT JOIN "_SportCanonicalGroups" AS by_name
    ON by_id.source_id IS NULL
   AND by_name.normalized_name = lower(btrim(event."sportId"))
)
UPDATE "Events" AS event
SET "sportId" = resolved.canonical_id
FROM resolved_events AS resolved
WHERE event."id" = resolved."id"
  AND resolved.canonical_id IS NOT NULL
  AND event."sportId" IS DISTINCT FROM resolved.canonical_id;

WITH resolved_divisions AS (
  SELECT
    division."id",
    coalesce(by_id.canonical_id, by_name.canonical_id) AS canonical_id
  FROM "Divisions" AS division
  LEFT JOIN "_SportIdReferenceMap" AS by_id
    ON by_id.source_id = division."sportId"
  LEFT JOIN "_SportCanonicalGroups" AS by_name
    ON by_id.source_id IS NULL
   AND by_name.normalized_name = lower(btrim(division."sportId"))
)
UPDATE "Divisions" AS division
SET "sportId" = resolved.canonical_id
FROM resolved_divisions AS resolved
WHERE division."id" = resolved."id"
  AND resolved.canonical_id IS NOT NULL
  AND division."sportId" IS DISTINCT FROM resolved.canonical_id;

WITH resolved_templates AS (
  SELECT
    template."id",
    coalesce(by_id.canonical_id, by_name.canonical_id) AS canonical_id
  FROM "EventTemplates" AS template
  LEFT JOIN "_SportIdReferenceMap" AS by_id
    ON by_id.source_id = template."sportId"
  LEFT JOIN "_SportCanonicalGroups" AS by_name
    ON by_id.source_id IS NULL
   AND by_name.normalized_name = lower(btrim(template."sportId"))
)
UPDATE "EventTemplates" AS template
SET "sportId" = resolved.canonical_id
FROM resolved_templates AS resolved
WHERE template."id" = resolved."id"
  AND resolved.canonical_id IS NOT NULL
  AND template."sportId" IS DISTINCT FROM resolved.canonical_id;

WITH rewritten_fields AS (
  SELECT
    field."id",
    ARRAY(
      SELECT mapped.sport_id
      FROM (
        SELECT
          coalesce(by_id.canonical_id, by_name.canonical_id, source.sport_id) AS sport_id,
          min(source.ordinality) AS first_ordinality
        FROM unnest(field."sportIds") WITH ORDINALITY AS source(sport_id, ordinality)
        LEFT JOIN "_SportIdReferenceMap" AS by_id
          ON by_id.source_id = source.sport_id
        LEFT JOIN "_SportCanonicalGroups" AS by_name
          ON by_id.source_id IS NULL
         AND by_name.normalized_name = lower(btrim(source.sport_id))
        GROUP BY coalesce(by_id.canonical_id, by_name.canonical_id, source.sport_id)
      ) AS mapped
      ORDER BY mapped.first_ordinality
    ) AS sport_ids
  FROM "Fields" AS field
)
UPDATE "Fields" AS field
SET "sportIds" = rewritten.sport_ids
FROM rewritten_fields AS rewritten
WHERE field."id" = rewritten."id"
  AND field."sportIds" IS DISTINCT FROM rewritten.sport_ids;

WITH resolved_event_teams AS (
  SELECT
    team."id",
    coalesce(by_id.canonical_name, by_name.canonical_name) AS canonical_name
  FROM "EventTeams" AS team
  LEFT JOIN "_SportIdReferenceMap" AS by_id
    ON by_id.source_id = team."sport"
  LEFT JOIN "_SportCanonicalGroups" AS by_name
    ON by_id.source_id IS NULL
   AND by_name.normalized_name = lower(btrim(team."sport"))
)
UPDATE "EventTeams" AS team
SET "sport" = resolved.canonical_name
FROM resolved_event_teams AS resolved
WHERE team."id" = resolved."id"
  AND resolved.canonical_name IS NOT NULL
  AND team."sport" IS DISTINCT FROM resolved.canonical_name;

WITH resolved_teams AS (
  SELECT
    team."id",
    coalesce(by_id.canonical_name, by_name.canonical_name) AS canonical_name
  FROM "Teams" AS team
  LEFT JOIN "_SportIdReferenceMap" AS by_id
    ON by_id.source_id = team."sport"
  LEFT JOIN "_SportCanonicalGroups" AS by_name
    ON by_id.source_id IS NULL
   AND by_name.normalized_name = lower(btrim(team."sport"))
)
UPDATE "Teams" AS team
SET "sport" = resolved.canonical_name
FROM resolved_teams AS resolved
WHERE team."id" = resolved."id"
  AND resolved.canonical_name IS NOT NULL
  AND team."sport" IS DISTINCT FROM resolved.canonical_name;

WITH rewritten_organizations AS (
  SELECT
    organization."id",
    ARRAY(
      SELECT mapped.sport_name
      FROM (
        SELECT
          source.mapped_name AS sport_name,
          min(source.ordinality) AS first_ordinality
        FROM (
          SELECT
            source_value.ordinality,
            coalesce(canonical.canonical_name, source_value.sport_name) AS mapped_name,
            CASE
              WHEN canonical.normalized_name IS NOT NULL
                THEN 'canonical:' || canonical.normalized_name
              ELSE 'unmapped:' || source_value.ordinality::text
            END AS mapped_identity
          FROM unnest(organization."sports") WITH ORDINALITY AS source_value(sport_name, ordinality)
          LEFT JOIN "_SportCanonicalGroups" AS canonical
            ON canonical.normalized_name = lower(btrim(source_value.sport_name))
        ) AS source
        GROUP BY source.mapped_identity, source.mapped_name
      ) AS mapped
      ORDER BY mapped.first_ordinality
    ) AS sports
  FROM "Organizations" AS organization
)
UPDATE "Organizations" AS organization
SET "sports" = rewritten.sports
FROM rewritten_organizations AS rewritten
WHERE organization."id" = rewritten."id"
  AND organization."sports" IS DISTINCT FROM rewritten.sports;

DELETE FROM "Sports" AS sport
USING "_SportDuplicateMap" AS duplicate
WHERE sport."id" = duplicate.duplicate_id;

UPDATE "Sports"
SET "name" = btrim("name")
WHERE "name" IS DISTINCT FROM btrim("name");

ALTER TABLE "Sports"
  ADD CONSTRAINT "Sports_name_nonblank_check"
  CHECK ("name" = btrim("name") AND "name" <> '');

CREATE UNIQUE INDEX "Sports_name_ci_key"
  ON "Sports" (lower("name"));

COMMENT ON INDEX "Sports_name_ci_key" IS
  'Enforces one canonical Sports row per trimmed case-insensitive display name.';

COMMIT;
