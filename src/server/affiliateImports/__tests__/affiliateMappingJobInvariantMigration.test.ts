/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('affiliate mapping job invariant migration', () => {
  it('retires claimable approvals before creating the active-job index', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260806190000_enforce_one_active_affiliate_mapping_job_per_intake/migration.sql',
    );
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('CREATE UNIQUE INDEX "AffiliateSourceMappingJobs_one_active_per_intake"');
    expect(migration).toContain('UPDATE "AffiliateApprovalJobs" AS approval');
    expect(migration).toContain("approval.status IN ('QUEUED', 'CLAIMED')");
    expect(migration).toContain('audit.job_rank > 1');
    expect(migration).toContain("status = 'FAILED'");
    expect(migration).toContain('"claimedAt" = NULL');
    expect(migration).toContain('"leaseExpiresAt" = NULL');
    expect(migration).toContain('"reviewerId" = NULL');
    expect(migration.indexOf('UPDATE "AffiliateApprovalJobs"')).toBeLessThan(
      migration.indexOf('CREATE UNIQUE INDEX "AffiliateSourceMappingJobs_one_active_per_intake"'),
    );
  });

  it('marks pre-migration active and review jobs for the identity backfill exception', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'prisma/migrations/20260806220000_add_affiliate_mapping_job_package_identity/migration.sql',
    );
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('"legacyIdentityMigrationEligible" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"status" IN (\'QUEUED\', \'CLAIMED\', \'REVIEW_REQUIRED\')');
    expect(migration).toContain('"sourceId" IS NULL');
    expect(migration).toContain('"mappingId" IS NULL');
  });
});
