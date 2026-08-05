/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260805120000_default_organization_ownership_unclaimed',
  'migration.sql',
);

describe('organization ownership default migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('uses fail-closed defaults for omitted organization ownership fields', () => {
    expect(sql).toContain('ALTER COLUMN "originType" SET DEFAULT \'AFFILIATE_IMPORTED\'');
    expect(sql).toContain('ALTER COLUMN "ownershipStatus" SET DEFAULT \'UNCLAIMED\'');
  });

  it('rejects claimed affiliate organizations without claim evidence', () => {
    expect(sql).toContain('Organizations_affiliate_claimed_requires_evidence');
    expect(sql).toContain('"originType" <> \'AFFILIATE_IMPORTED\'');
    expect(sql).toContain('"ownershipStatus" <> \'CLAIMED\'');
    expect(sql).toContain('"claimedAt" IS NOT NULL');
    expect(sql).toContain('"claimedByUserId" IS NOT NULL');
    expect(sql).toContain('NOT VALID');
  });
});
