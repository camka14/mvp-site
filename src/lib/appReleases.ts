import { getMobileAppLinks } from '@/lib/mobileAppLinks';

export type AppReleasePlatform = 'IOS' | 'ANDROID';

export type AppReleaseRow = {
  id: string;
  platform: AppReleasePlatform;
  versionName: string;
  buildNumber: number | null;
  changes: string[];
  hasBreakingChanges: boolean;
  isActive: boolean;
  updateUrl: string | null;
  createdAt: Date | string | null;
};

export type CurrentAppVersion = {
  versionName: string | null;
  buildNumber: number | null;
};

export function normalizeAppReleasePlatform(value: unknown): AppReleasePlatform | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'IOS') return 'IOS';
  if (normalized === 'ANDROID') return 'ANDROID';
  return null;
}

export function parseBuildNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function compareVersionNames(left: string | null | undefined, right: string | null | undefined): number {
  const leftParts = parseVersionName(left);
  const rightParts = parseVersionName(right);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < max; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export function isReleaseNewerThanCurrent(
  release: Pick<AppReleaseRow, 'versionName' | 'buildNumber'>,
  current: CurrentAppVersion,
): boolean {
  if (!current.versionName && current.buildNumber === null) return true;

  if (release.buildNumber !== null && current.buildNumber !== null) {
    if (release.buildNumber !== current.buildNumber) {
      return release.buildNumber > current.buildNumber;
    }
  }

  return compareVersionNames(release.versionName, current.versionName) > 0;
}

export function latestAppRelease(releases: AppReleaseRow[]): AppReleaseRow | null {
  return [...releases].sort(compareReleaseRowsDesc)[0] ?? null;
}

export function buildAppVersionResponse(
  releases: AppReleaseRow[],
  current: CurrentAppVersion,
): {
  updateAvailable: boolean;
  updateRequired: boolean;
  latestVersion: ReturnType<typeof serializeRelease> | null;
} {
  const active = releases.filter((release) => release.isActive);
  const latest = latestAppRelease(active);
  if (!latest) {
    return {
      updateAvailable: false,
      updateRequired: false,
      latestVersion: null,
    };
  }

  const newerReleases = active.filter((release) => isReleaseNewerThanCurrent(release, current));
  const updateAvailable = newerReleases.length > 0 && isReleaseNewerThanCurrent(latest, current);
  const updateRequired = updateAvailable && newerReleases.some((release) => release.hasBreakingChanges);

  return {
    updateAvailable,
    updateRequired,
    latestVersion: serializeRelease(latest),
  };
}

function serializeRelease(release: AppReleaseRow) {
  return {
    platform: release.platform,
    versionName: release.versionName,
    buildNumber: release.buildNumber,
    changes: release.changes.map((change) => change.trim()).filter(Boolean),
    hasBreakingChanges: release.hasBreakingChanges,
    updateUrl: release.updateUrl?.trim() || defaultUpdateUrl(release.platform),
    releasedAt: toIsoString(release.createdAt),
  };
}

function defaultUpdateUrl(platform: AppReleasePlatform): string {
  const links = getMobileAppLinks();
  return platform === 'IOS' ? links.iosStoreUrl : links.androidStoreUrl;
}

function compareReleaseRowsDesc(left: AppReleaseRow, right: AppReleaseRow): number {
  const leftBuild = left.buildNumber;
  const rightBuild = right.buildNumber;
  if (leftBuild !== null && rightBuild !== null && leftBuild !== rightBuild) {
    return rightBuild - leftBuild;
  }

  const versionComparison = compareVersionNames(left.versionName, right.versionName);
  if (versionComparison !== 0) return -versionComparison;

  return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
}

function parseVersionName(value: string | null | undefined): number[] {
  return String(value ?? '')
    .trim()
    .split(/[.-]/)
    .map((part) => {
      const match = /^\d+/.exec(part);
      return match ? Number(match[0]) : 0;
    });
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTimestamp(value: Date | string | null): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
