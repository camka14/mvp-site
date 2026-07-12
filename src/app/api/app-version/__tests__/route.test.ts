/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  appReleases: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('@/lib/mobileAppLinks', () => ({
  getMobileAppLinks: () => ({
    iosStoreUrl: 'https://apps.apple.com/us/app/bracketiq/id6746649739',
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.razumly.mvp',
    iosDeepLink: 'mvp://discover',
    androidDeepLink: 'razumly://mvp',
  }),
}));

import { GET } from '@/app/api/app-version/route';

const androidRelease = {
  id: 'app_release_android_1_5_6_40',
  platform: 'ANDROID',
  versionName: '1.5.6',
  buildNumber: 40,
  changes: ['Improves event detail division controls.'],
  hasBreakingChanges: false,
  isActive: true,
  updateUrl: null,
  createdAt: new Date('2026-05-17T19:23:27.000Z'),
};

const releaseBoundary = [
  {
    platform: 'ANDROID' as const,
    olderBuild: 66,
    latest: {
      id: 'app_release_android_1_6_14_67',
      platform: 'ANDROID' as const,
      versionName: '1.6.14',
      buildNumber: 67,
      changes: [
        'Adds organization reviews on organization profiles.',
        'Improves Discover map searches and database-backed event tag filters.',
        'Makes registration, discount-code, and bill pricing details clearer and more reliable.',
        'Tags push tokens by platform for more reliable notifications.',
      ],
      hasBreakingChanges: false,
      isActive: true,
      updateUrl: 'https://play.google.com/store/apps/details?id=com.razumly.mvp',
      createdAt: new Date('2026-07-11T14:52:11.475Z'),
    },
  },
  {
    platform: 'IOS' as const,
    olderBuild: 77,
    latest: {
      id: 'app_release_ios_1_6_14_78',
      platform: 'IOS' as const,
      versionName: '1.6.14',
      buildNumber: 78,
      changes: [
        'Adds organization reviews on organization profiles.',
        'Improves Discover map searches and database-backed event tag filters.',
        'Makes registration, discount-code, and bill pricing details clearer and more reliable.',
        'Tags push tokens by platform for more reliable notifications.',
      ],
      hasBreakingChanges: false,
      isActive: true,
      updateUrl: 'https://apps.apple.com/us/app/bracketiq/id6746649739',
      createdAt: new Date('2026-07-11T14:52:11.475Z'),
    },
  },
];

describe('GET /api/app-version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an unknown platform', async () => {
    const response = await GET(new NextRequest('http://localhost/api/app-version?platform=desktop'));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('platform');
    expect(prismaMock.appReleases.findMany).not.toHaveBeenCalled();
  });

  it('returns a dismissible update when the current build is older than the latest release', async () => {
    prismaMock.appReleases.findMany.mockResolvedValue([androidRelease]);

    const response = await GET(new NextRequest(
      'http://localhost/api/app-version?platform=android&versionName=1.5.5&buildNumber=39',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.appReleases.findMany).toHaveBeenCalledWith({
      where: {
        platform: 'ANDROID',
        isActive: true,
      },
    });
    expect(payload.updateAvailable).toBe(true);
    expect(payload.updateRequired).toBe(false);
    expect(payload.latestVersion).toEqual(expect.objectContaining({
      platform: 'ANDROID',
      versionName: '1.5.6',
      buildNumber: 40,
      hasBreakingChanges: false,
      updateUrl: 'https://play.google.com/store/apps/details?id=com.razumly.mvp',
    }));
    expect(payload.latestVersion.changes).toEqual(['Improves event detail division controls.']);
    expect(payload.releases).toEqual([
      expect.objectContaining({
        versionName: '1.5.6',
        buildNumber: 40,
        changes: ['Improves event detail division controls.'],
      }),
    ]);
  });

  it('does not mark the current build as needing an update', async () => {
    prismaMock.appReleases.findMany.mockResolvedValue([androidRelease]);

    const response = await GET(new NextRequest(
      'http://localhost/api/app-version?platform=ANDROID&versionName=1.5.6&buildNumber=40',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.updateAvailable).toBe(false);
    expect(payload.updateRequired).toBe(false);
    expect(payload.latestVersion.versionName).toBe('1.5.6');
    expect(payload.releases).toEqual([]);
  });

  it.each(releaseBoundary)(
    'reproduces the current $platform 1.6.14 release policy for a 1.6.13 client',
    async ({ platform, olderBuild, latest }) => {
      prismaMock.appReleases.findMany.mockResolvedValue([latest]);

      const olderResponse = await GET(new NextRequest(
        `http://localhost/api/app-version?platform=${platform}&versionName=1.6.13&buildNumber=${olderBuild}`,
      ));
      const olderPayload = await olderResponse.json();

      expect(olderResponse.status).toBe(200);
      expect(olderPayload).toEqual(expect.objectContaining({
        updateAvailable: true,
        updateRequired: false,
        latestVersion: expect.objectContaining({
          versionName: '1.6.14',
          buildNumber: latest.buildNumber,
          changes: latest.changes,
          updateUrl: latest.updateUrl,
        }),
      }));

      const currentResponse = await GET(new NextRequest(
        `http://localhost/api/app-version?platform=${platform}&versionName=1.6.14&buildNumber=${latest.buildNumber}`,
      ));
      const currentPayload = await currentResponse.json();

      expect(currentResponse.status).toBe(200);
      expect(currentPayload.updateAvailable).toBe(false);
      expect(currentPayload.releases).toEqual([]);
    },
  );

  it('requires the update when any newer active release is breaking', async () => {
    prismaMock.appReleases.findMany.mockResolvedValue([
      {
        ...androidRelease,
        id: 'app_release_android_1_5_7_41',
        versionName: '1.5.7',
        buildNumber: 41,
        changes: ['Updates the mobile data contract.'],
        hasBreakingChanges: true,
        createdAt: new Date('2026-05-18T12:00:00.000Z'),
      },
      androidRelease,
    ]);

    const response = await GET(new NextRequest(
      'http://localhost/api/app-version?platform=ANDROID&versionName=1.5.6&buildNumber=40',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.updateAvailable).toBe(true);
    expect(payload.updateRequired).toBe(true);
    expect(payload.latestVersion).toEqual(expect.objectContaining({
      versionName: '1.5.7',
      buildNumber: 41,
      hasBreakingChanges: true,
    }));
    expect(payload.releases.map((release: { buildNumber: number }) => release.buildNumber)).toEqual([41]);
  });

  it('returns every active release newer than the current build oldest first', async () => {
    prismaMock.appReleases.findMany.mockResolvedValue([
      {
        ...androidRelease,
        id: 'app_release_android_1_5_8_42',
        versionName: '1.5.8',
        buildNumber: 42,
        changes: ['Adds richer update history.'],
        createdAt: new Date('2026-05-19T12:00:00.000Z'),
      },
      {
        ...androidRelease,
        id: 'app_release_android_1_5_7_41',
        versionName: '1.5.7',
        buildNumber: 41,
        changes: ['Improves update prompts.'],
        createdAt: new Date('2026-05-18T12:00:00.000Z'),
      },
      androidRelease,
    ]);

    const response = await GET(new NextRequest(
      'http://localhost/api/app-version?platform=ANDROID&versionName=1.5.5&buildNumber=39',
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.updateAvailable).toBe(true);
    expect(payload.latestVersion).toEqual(expect.objectContaining({
      versionName: '1.5.8',
      buildNumber: 42,
    }));
    expect(payload.releases.map((release: { versionName: string }) => release.versionName)).toEqual([
      '1.5.6',
      '1.5.7',
      '1.5.8',
    ]);
    expect(payload.releases.map((release: { changes: string[] }) => release.changes[0])).toEqual([
      'Improves event detail division controls.',
      'Improves update prompts.',
      'Adds richer update history.',
    ]);
  });
});
