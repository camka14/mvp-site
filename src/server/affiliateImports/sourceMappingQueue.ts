import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';

const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1000;

const mappingDb = () => ({
  intakes: (prisma as any).affiliateSourceIntakes,
  jobs: (prisma as any).affiliateSourceMappingJobs,
  approvals: (prisma as any).affiliateApprovalJobs,
});

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export const claimNextAffiliateSourceIntakeForMapping = async (options: {
  workerId: string;
  intakeId?: string;
  now?: Date;
  leaseMs?: number;
}) => {
  const workerId = options.workerId.trim();
  if (!workerId) throw new Error('Mapping worker id is required.');
  const now = options.now ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { intakes, jobs } = mappingDb();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let job = await jobs.findFirst({
      where: {
        ...(options.intakeId ? { intakeId: options.intakeId } : {}),
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job && options.intakeId) {
      const intake = await intakes.findFirst({
        where: { id: options.intakeId, status: 'READY_FOR_MAPPING' },
      });
      if (intake) {
        job = await jobs.create({
          data: { id: createId(), intakeId: intake.id, status: 'QUEUED' },
        });
      }
    }
    if (!job) return null;
    const claimed = await jobs.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        leaseExpiresAt,
        workerId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) continue;
    const intake = await intakes.findUnique({ where: { id: job.intakeId } });
    if (!intake) {
      await jobs.update({
        where: { id: job.id },
        data: { status: 'FAILED', finishedAt: now, errorMessage: 'Affiliate source intake not found.' },
      });
      continue;
    }
    await intakes.update({ where: { id: intake.id }, data: { status: 'MAPPING_IN_PROGRESS' } });
    return {
      jobId: job.id,
      intakeId: intake.id,
      sourceKey: intake.sourceKey,
      workerId,
      leaseExpiresAt,
    };
  }
  return null;
};

export const releaseAffiliateSourceMappingClaim = async (
  intakeId: string,
  workerId?: string | null,
) => {
  const { intakes, jobs } = mappingDb();
  const job = await jobs.findFirst({
    where: {
      intakeId,
      status: 'CLAIMED',
      ...(workerId?.trim() ? { workerId: workerId.trim() } : {}),
    },
    orderBy: { claimedAt: 'desc' },
  });
  if (!job) throw new Error('Active affiliate source mapping claim not found.');
  await jobs.update({
    where: { id: job.id },
    data: { status: 'QUEUED', claimedAt: null, leaseExpiresAt: null, workerId: null },
  });
  await intakes.update({ where: { id: intakeId }, data: { status: 'READY_FOR_MAPPING' } });
  return { jobId: job.id, intakeId, status: 'QUEUED' };
};

export const finishAffiliateSourceMappingClaim = async (input: {
  jobId: string;
  status: 'REVIEW_REQUIRED' | 'EXPANDED' | 'APPROVED' | 'FAILED';
  branch?: string | null;
  commit?: string | null;
  resultSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) => {
  const { intakes, jobs, approvals } = mappingDb();
  const job = await jobs.findUnique({ where: { id: input.jobId } });
  if (!job) throw new Error('Affiliate source mapping job not found.');
  const previousEnvelope = recordValue(job.resultSummary);
  const repairHistory = Array.isArray(previousEnvelope.mappingRepairHistory)
    ? previousEnvelope.mappingRepairHistory
    : [];
  const nextResultSummary = input.resultSummary
    ? {
        ...input.resultSummary,
        ...(repairHistory.length ? { mappingRepairHistory: repairHistory } : {}),
      }
    : undefined;
  const updated = await jobs.update({
    where: { id: job.id },
    data: {
      status: input.status,
      branch: input.branch?.trim() || null,
      commit: input.commit?.trim() || null,
      resultSummary: nextResultSummary,
      errorMessage: input.errorMessage?.trim() || null,
      finishedAt: new Date(),
      leaseExpiresAt: null,
    },
  });
  await intakes.update({
    where: { id: job.intakeId },
    data: {
      status: input.status === 'APPROVED'
        ? 'PROMOTED'
        : input.status,
    },
  });
  if (input.status === 'REVIEW_REQUIRED') {
    const approval = await approvals.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: job.id,
        },
      },
    });
    if (approval && ['REJECTED', 'DEFERRED'].includes(approval.status)) {
      await approvals.update({
        where: { id: approval.id },
        data: {
          status: 'QUEUED',
          claimedAt: null,
          leaseExpiresAt: null,
          reviewerId: null,
          decision: null,
          errorMessage: null,
          finishedAt: null,
        },
      });
    }
  }
  return updated;
};
