import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storageProvider';

type RetentionArtifact = {
  id: string;
  intakeId: string;
  runId: string;
  fileId: string;
  isPinned: boolean;
  retainUntil: Date | null;
};

type RetentionIntake = {
  id: string;
  status: string;
  selectedLogoArtifactId: string | null;
};

type RetentionRun = { id: string; intakeId: string; createdAt: Date };

export const selectExpiredAffiliateIntakeArtifactIds = (
  intakes: RetentionIntake[],
  runs: RetentionRun[],
  artifacts: RetentionArtifact[],
  now: Date,
): string[] => {
  const intakeById = new Map(intakes.map((intake) => [intake.id, intake]));
  const protectedRunIds = new Set<string>();
  const runsByIntake = new Map<string, RetentionRun[]>();
  for (const run of runs) {
    const rows = runsByIntake.get(run.intakeId) ?? [];
    rows.push(run);
    runsByIntake.set(run.intakeId, rows);
  }
  for (const intakeRuns of runsByIntake.values()) {
    intakeRuns.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    intakeRuns.slice(0, 5).forEach((run) => protectedRunIds.add(run.id));
  }

  return artifacts.filter((artifact) => {
    const intake = intakeById.get(artifact.intakeId);
    if (!intake || intake.status === 'PROMOTED') return false;
    if (artifact.isPinned || intake.selectedLogoArtifactId === artifact.id) return false;
    if (protectedRunIds.has(artifact.runId)) return false;
    return Boolean(artifact.retainUntil && artifact.retainUntil.getTime() <= now.getTime());
  }).map((artifact) => artifact.id);
};

export const cleanupAffiliateSourceIntakeArtifacts = async (
  options: { dryRun?: boolean; now?: Date } = {},
) => {
  const dryRun = options.dryRun !== false;
  const now = options.now ?? new Date();
  const db = prisma as any;
  const [intakes, runs, artifacts] = await Promise.all([
    db.affiliateSourceIntakes.findMany({ select: { id: true, status: true, selectedLogoArtifactId: true } }),
    db.affiliateSourceIntakeRuns.findMany({ select: { id: true, intakeId: true, createdAt: true } }),
    db.affiliateSourceIntakeArtifacts.findMany({ select: { id: true, intakeId: true, runId: true, fileId: true, isPinned: true, retainUntil: true } }),
  ]);
  const artifactIds = selectExpiredAffiliateIntakeArtifactIds(intakes, runs, artifacts, now);
  const selected = artifacts.filter((artifact: RetentionArtifact) => artifactIds.includes(artifact.id));
  const fileIds = Array.from(new Set(selected.map((artifact: RetentionArtifact) => artifact.fileId)));
  const deletableFiles: any[] = [];
  for (const fileId of fileIds) {
    const remainingReferences = await db.affiliateSourceIntakeArtifacts.count({
      where: { fileId, id: { notIn: artifactIds } },
    });
    if (remainingReferences === 0) {
      const file = await db.file.findUnique({ where: { id: fileId } });
      if (file) deletableFiles.push(file);
    }
  }

  if (!dryRun && artifactIds.length) {
    await db.affiliateSourceIntakeArtifacts.deleteMany({ where: { id: { in: artifactIds } } });
    for (const file of deletableFiles) {
      try {
        await getStorageProvider().deleteObject({ key: file.path, bucket: file.bucket });
        await db.file.delete({ where: { id: file.id } });
      } catch (error) {
        console.error('[affiliate:intakes:cleanup] failed to delete orphaned file', file.id, error);
      }
    }
  }

  return {
    dryRun,
    now: now.toISOString(),
    artifactCount: artifactIds.length,
    artifactIds,
    orphanedFileCount: deletableFiles.length,
    orphanedFileIds: deletableFiles.map((file) => file.id),
  };
};
