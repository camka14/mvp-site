/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260714090000_enforce_app_release_identity',
  'migration.sql',
);

describe('AppReleases identity migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('deterministically reconciles duplicate identities before deleting losing rows', () => {
    expect(sql.trimStart()).toMatch(/^--[\s\S]*\nBEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql).toContain('PARTITION BY "platform", "versionName", "buildNumber"');
    expect(sql).toContain('ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC');
    expect(sql).toContain('BOOL_OR(releases."hasBreakingChanges")');
    expect(sql).toContain('BOOL_OR(releases."isActive")');
    expect(sql).toContain('SELECT DISTINCT ON (members."winnerId", BTRIM(change."value"))');
    expect(sql).toContain('UNNEST(releases."changes") WITH ORDINALITY');
    expect(sql).toContain('members."memberId" <> members."winnerId"');
  });

  it('constrains both numbered and null-build release identities', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "AppReleases_platform_versionName_buildNumber_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "AppReleases_platform_versionName_null_build_key"');
    expect(sql).toContain('WHERE "buildNumber" IS NULL');
  });
});
