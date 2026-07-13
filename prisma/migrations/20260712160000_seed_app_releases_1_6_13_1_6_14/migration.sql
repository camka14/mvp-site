-- Keep the source-controlled release history aligned with the 1.6.13/1.6.14
-- phone builds. Existing production rows may have manually assigned IDs, so
-- reconcile by platform/version/build before inserting a missing record.
WITH release_seed (
    "id",
    "platform",
    "versionName",
    "buildNumber",
    "changes",
    "hasBreakingChanges",
    "isActive",
    "updateUrl",
    "releasedAt"
) AS (
    VALUES
    (
        'app_release_android_1_6_13_66',
        'ANDROID'::"AppReleasePlatformEnum",
        '1.6.13',
        66,
        ARRAY[
            'Adds event tags and more focused Discover filters.',
            'Improves paginated Discover browsing and map marker stability.',
            'Makes affiliate, rental, and paid-bill pricing clearer across the app.'
        ]::TEXT[],
        false,
        true,
        'https://play.google.com/store/apps/details?id=com.razumly.mvp',
        TIMESTAMP '2026-07-08 17:35:15.880'
    ),
    (
        'app_release_ios_1_6_13_77',
        'IOS'::"AppReleasePlatformEnum",
        '1.6.13',
        77,
        ARRAY[
            'Adds event tags and more focused Discover filters.',
            'Improves paginated Discover browsing and map marker stability.',
            'Makes affiliate, rental, and paid-bill pricing clearer across the app.'
        ]::TEXT[],
        false,
        true,
        'https://apps.apple.com/us/app/bracketiq/id6746649739',
        TIMESTAMP '2026-07-08 17:35:15.880'
    ),
    (
        'app_release_android_1_6_14_67',
        'ANDROID'::"AppReleasePlatformEnum",
        '1.6.14',
        67,
        ARRAY[
            'Adds organization reviews on organization profiles.',
            'Improves Discover map searches and database-backed event tag filters.',
            'Makes registration, discount-code, and bill pricing details clearer and more reliable.',
            'Tags push tokens by platform for more reliable notifications.'
        ]::TEXT[],
        false,
        true,
        'https://play.google.com/store/apps/details?id=com.razumly.mvp',
        TIMESTAMP '2026-07-11 14:52:11.475'
    ),
    (
        'app_release_ios_1_6_14_78',
        'IOS'::"AppReleasePlatformEnum",
        '1.6.14',
        78,
        ARRAY[
            'Adds organization reviews on organization profiles.',
            'Improves Discover map searches and database-backed event tag filters.',
            'Makes registration, discount-code, and bill pricing details clearer and more reliable.',
            'Tags push tokens by platform for more reliable notifications.'
        ]::TEXT[],
        false,
        true,
        'https://apps.apple.com/us/app/bracketiq/id6746649739',
        TIMESTAMP '2026-07-11 14:52:11.475'
    )
),
updated AS (
    UPDATE "AppReleases" AS target
    SET
        "changes" = source."changes",
        "hasBreakingChanges" = source."hasBreakingChanges",
        "isActive" = source."isActive",
        "updateUrl" = source."updateUrl",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM release_seed AS source
    WHERE target."platform" = source."platform"
      AND target."versionName" = source."versionName"
      AND target."buildNumber" = source."buildNumber"
    RETURNING target."id"
)
INSERT INTO "AppReleases" (
    "id",
    "platform",
    "versionName",
    "buildNumber",
    "changes",
    "hasBreakingChanges",
    "isActive",
    "updateUrl",
    "createdAt",
    "updatedAt"
)
SELECT
    source."id",
    source."platform",
    source."versionName",
    source."buildNumber",
    source."changes",
    source."hasBreakingChanges",
    source."isActive",
    source."updateUrl",
    source."releasedAt",
    source."releasedAt"
FROM release_seed AS source
WHERE NOT EXISTS (
    SELECT 1
    FROM "AppReleases" AS existing
    WHERE existing."platform" = source."platform"
      AND existing."versionName" = source."versionName"
      AND existing."buildNumber" = source."buildNumber"
)
ON CONFLICT ("id") DO UPDATE SET
    "platform" = EXCLUDED."platform",
    "versionName" = EXCLUDED."versionName",
    "buildNumber" = EXCLUDED."buildNumber",
    "changes" = EXCLUDED."changes",
    "hasBreakingChanges" = EXCLUDED."hasBreakingChanges",
    "isActive" = EXCLUDED."isActive",
    "updateUrl" = EXCLUDED."updateUrl",
    "updatedAt" = CURRENT_TIMESTAMP;
