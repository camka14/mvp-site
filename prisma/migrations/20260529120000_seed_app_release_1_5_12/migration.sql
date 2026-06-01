INSERT INTO "AppReleases" (
    "id",
    "platform",
    "versionName",
    "buildNumber",
    "changes",
    "hasBreakingChanges",
    "isActive"
) VALUES
(
    'app_release_android_1_5_12_46',
    'ANDROID',
    '1.5.12',
    46,
    ARRAY[
        'Adds guardian team invite flows for parent-managed player accounts.',
        'Adds Firebase Analytics support for mobile release monitoring.',
        'Keeps mobile update prompts aligned with the current BracketIQ app release.'
    ]::TEXT[],
    false,
    true
),
(
    'app_release_ios_1_5_12_58',
    'IOS',
    '1.5.12',
    58,
    ARRAY[
        'Adds guardian team invite flows for parent-managed player accounts.',
        'Adds Firebase Analytics support for mobile release monitoring.',
        'Keeps mobile update prompts aligned with the current BracketIQ app release.'
    ]::TEXT[],
    false,
    true
)
ON CONFLICT ("id") DO UPDATE SET
    "platform" = EXCLUDED."platform",
    "versionName" = EXCLUDED."versionName",
    "buildNumber" = EXCLUDED."buildNumber",
    "changes" = EXCLUDED."changes",
    "hasBreakingChanges" = EXCLUDED."hasBreakingChanges",
    "isActive" = EXCLUDED."isActive",
    "updatedAt" = CURRENT_TIMESTAMP;
