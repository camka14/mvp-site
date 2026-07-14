-- One mobile release identity is platform + version name + build number.
-- Keep the most recently updated row as the deterministic canonical record,
-- merge safety-sensitive/user-visible data, and remove the duplicate rows
-- before adding the database constraints.
BEGIN;

CREATE TEMP TABLE "_AppReleaseIdentityMembers" ON COMMIT DROP AS
SELECT
    "id" AS "memberId",
    FIRST_VALUE("id") OVER (
        PARTITION BY "platform", "versionName", "buildNumber"
        ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS "winnerId"
FROM "AppReleases";

CREATE INDEX "_AppReleaseIdentityMembers_winnerId_idx"
    ON "_AppReleaseIdentityMembers" ("winnerId");

WITH "merged" AS (
    SELECT
        members."winnerId",
        BOOL_OR(releases."hasBreakingChanges") AS "hasBreakingChanges",
        BOOL_OR(releases."isActive") AS "isActive",
        MIN(releases."createdAt") AS "createdAt",
        MAX(releases."updatedAt") AS "updatedAt",
        (
            ARRAY_AGG(
                NULLIF(BTRIM(releases."updateUrl"), '')
                ORDER BY releases."updatedAt" DESC, releases."createdAt" DESC, releases."id" ASC
            ) FILTER (WHERE NULLIF(BTRIM(releases."updateUrl"), '') IS NOT NULL)
        )[1] AS "updateUrl"
    FROM "_AppReleaseIdentityMembers" AS members
    INNER JOIN "AppReleases" AS releases
        ON releases."id" = members."memberId"
    GROUP BY members."winnerId"
),
"mergedChanges" AS (
    SELECT
        normalized."winnerId",
        ARRAY_AGG(
            normalized."change"
            ORDER BY
                normalized."firstCreatedAt",
                normalized."firstMemberId",
                normalized."firstOrdinality",
                normalized."change"
        ) AS "changes"
    FROM (
        SELECT DISTINCT ON (members."winnerId", BTRIM(change."value"))
            members."winnerId",
            BTRIM(change."value") AS "change",
            releases."createdAt" AS "firstCreatedAt",
            releases."id" AS "firstMemberId",
            change."ordinality" AS "firstOrdinality"
        FROM "_AppReleaseIdentityMembers" AS members
        INNER JOIN "AppReleases" AS releases
            ON releases."id" = members."memberId"
        CROSS JOIN LATERAL UNNEST(releases."changes") WITH ORDINALITY AS change("value", "ordinality")
        WHERE BTRIM(change."value") <> ''
        ORDER BY
            members."winnerId",
            BTRIM(change."value"),
            releases."createdAt",
            releases."id",
            change."ordinality"
    ) AS normalized
    GROUP BY normalized."winnerId"
)
UPDATE "AppReleases" AS winner
SET
    "changes" = COALESCE("mergedChanges"."changes", ARRAY[]::TEXT[]),
    "hasBreakingChanges" = merged."hasBreakingChanges",
    "isActive" = merged."isActive",
    "updateUrl" = merged."updateUrl",
    "createdAt" = merged."createdAt",
    "updatedAt" = merged."updatedAt"
FROM "merged"
LEFT JOIN "mergedChanges"
    ON "mergedChanges"."winnerId" = merged."winnerId"
WHERE winner."id" = merged."winnerId";

DELETE FROM "AppReleases" AS duplicate
USING "_AppReleaseIdentityMembers" AS members
WHERE duplicate."id" = members."memberId"
  AND members."memberId" <> members."winnerId";

-- Prisma models the non-null identity through @@unique. PostgreSQL considers
-- NULL values distinct in an ordinary unique index, so a second partial index
-- explicitly makes (platform, versionName, NULL) a single release identity.
CREATE UNIQUE INDEX "AppReleases_platform_versionName_buildNumber_key"
    ON "AppReleases" ("platform", "versionName", "buildNumber");

CREATE UNIQUE INDEX "AppReleases_platform_versionName_null_build_key"
    ON "AppReleases" ("platform", "versionName")
    WHERE "buildNumber" IS NULL;

COMMIT;
