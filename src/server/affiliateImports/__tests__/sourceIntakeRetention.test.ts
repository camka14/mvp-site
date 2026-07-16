/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { selectExpiredAffiliateIntakeArtifactIds } from '@/server/affiliateImports/sourceIntakeRetention';

describe('affiliate source intake artifact retention', () => {
  it('keeps latest runs, pinned and selected-logo artifacts, and promoted intake evidence', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const old = new Date('2026-01-01T00:00:00.000Z');
    const runs = Array.from({ length: 7 }, (_, index) => ({
      id: `run_${index}`,
      intakeId: 'intake_1',
      createdAt: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
    }));
    const artifacts = runs.map((run, index) => ({
      id: `artifact_${index}`,
      intakeId: 'intake_1',
      runId: run.id,
      fileId: `file_${index}`,
      isPinned: index === 0,
      retainUntil: old,
    }));
    artifacts.push({ id: 'promoted_old', intakeId: 'intake_2', runId: 'promoted_run', fileId: 'file_8', isPinned: false, retainUntil: old });

    const result = selectExpiredAffiliateIntakeArtifactIds(
      [
        { id: 'intake_1', status: 'REVIEW_REQUIRED', selectedLogoArtifactId: 'artifact_1' },
        { id: 'intake_2', status: 'PROMOTED', selectedLogoArtifactId: null },
      ],
      [...runs, { id: 'promoted_run', intakeId: 'intake_2', createdAt: old }],
      artifacts,
      now,
    );

    expect(result).toEqual([]);
    const withoutProtection = artifacts.map((artifact) => ({ ...artifact, isPinned: false }));
    expect(selectExpiredAffiliateIntakeArtifactIds(
      [{ id: 'intake_1', status: 'REVIEW_REQUIRED', selectedLogoArtifactId: null }],
      runs,
      withoutProtection.filter((artifact) => artifact.intakeId === 'intake_1'),
      now,
    )).toEqual(['artifact_0', 'artifact_1']);
  });
});
