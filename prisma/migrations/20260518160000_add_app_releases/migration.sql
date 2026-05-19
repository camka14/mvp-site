CREATE TYPE "AppReleasePlatformEnum" AS ENUM ('IOS', 'ANDROID');

CREATE TABLE "AppReleases" (
    "id" TEXT NOT NULL,
    "platform" "AppReleasePlatformEnum" NOT NULL,
    "versionName" TEXT NOT NULL,
    "buildNumber" INTEGER,
    "changes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "hasBreakingChanges" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppReleases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppReleases_platform_isActive_idx" ON "AppReleases"("platform", "isActive");
CREATE INDEX "AppReleases_platform_buildNumber_idx" ON "AppReleases"("platform", "buildNumber");
CREATE INDEX "AppReleases_platform_versionName_idx" ON "AppReleases"("platform", "versionName");

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
    'app_release_android_1_5_6_40',
    'ANDROID',
    '1.5.6',
    40,
    ARRAY[
        'Improves mobile event detail division controls and participant filtering.',
        'Handles pending payments and duplicate divisions more clearly.',
        'Polishes team, participant, and event list labels for division-aware events.'
    ]::TEXT[],
    false,
    true
),
(
    'app_release_ios_1_5_6_52',
    'IOS',
    '1.5.6',
    52,
    ARRAY[
        'Improves mobile event detail division controls and participant filtering.',
        'Handles pending payments and duplicate divisions more clearly.',
        'Polishes team, participant, and event list labels for division-aware events.'
    ]::TEXT[],
    false,
    true
);
