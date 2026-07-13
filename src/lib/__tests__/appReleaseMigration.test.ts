/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260712160000_seed_app_releases_1_6_13_1_6_14',
  'migration.sql',
);

describe('1.6.13/1.6.14 AppReleases seed migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('seeds the shipped Android and iOS build boundary with canonical store URLs', () => {
    expect(sql).toContain("'app_release_android_1_6_13_66'");
    expect(sql).toContain("'app_release_ios_1_6_13_77'");
    expect(sql).toContain("'app_release_android_1_6_14_67'");
    expect(sql).toContain("'app_release_ios_1_6_14_78'");
    expect(sql).toContain("'https://play.google.com/store/apps/details?id=com.razumly.mvp'");
    expect(sql).toContain("'https://apps.apple.com/us/app/bracketiq/id6746649739'");
  });

  it('updates a manually seeded matching release before inserting a missing record', () => {
    expect(sql).toContain('UPDATE "AppReleases" AS target');
    expect(sql).toContain('target."platform" = source."platform"');
    expect(sql).toContain('target."versionName" = source."versionName"');
    expect(sql).toContain('target."buildNumber" = source."buildNumber"');
    expect(sql).toContain('WHERE NOT EXISTS');
  });
});
