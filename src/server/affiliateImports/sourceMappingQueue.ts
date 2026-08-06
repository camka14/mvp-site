import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
  affiliateEventDateTimeReviewSchema,
} from './codexIngestionResult';

const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1000;
const ACTIVE_MAPPING_JOB_STATUSES = ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] as const;

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

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(stringValues);
  const single = stringValue(value);
  return single ? [single] : [];
};

const hasEventDateTimeRemediationContext = (value: unknown): boolean => {
  const envelope = recordValue(value);
  const directContexts = [
    envelope.remediationContext,
    envelope.remediationContexts,
    envelope.cohortKey,
    envelope.cohortKeys,
    recordValue(envelope.repairContext).remediationContext,
    recordValue(envelope.repairContext).remediationContexts,
    recordValue(envelope.repairContext).cohortKey,
    recordValue(envelope.repairContext).cohortKeys,
  ].flatMap(stringValues);
  if (directContexts.includes(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT)) return true;
  return [envelope.mappingRepairHistory, envelope.mappingFullReviewHistory]
    .flatMap((history) => (Array.isArray(history) ? history : []))
    .some((entry) => {
      const record = recordValue(entry);
      return [
        record.remediationContext,
        record.remediationContexts,
        record.cohortKey,
        record.cohortKeys,
      ]
        .flatMap(stringValues)
        .includes(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT);
    });
};

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 'P2002')
);

const latestMappingRepairContext = (resultSummary: unknown) => {
  const envelope = recordValue(resultSummary);
  const history = envelope.mappingRepairHistory;
  const latest = Array.isArray(history) && history.length > 0
    ? recordValue(history[history.length - 1])
    : {};
  const fullReviewHistory = envelope.mappingFullReviewHistory;
  const latestFullReview = Array.isArray(fullReviewHistory) && fullReviewHistory.length > 0
    ? recordValue(fullReviewHistory[fullReviewHistory.length - 1])
    : {};
  const repairReasons = stringValues(latest.repairReasons);
  const repairReason = stringValue(latest.repairReason) ?? repairReasons[0] ?? null;
  const remediationContexts = [
    envelope.remediationContext,
    envelope.remediationContexts,
    recordValue(envelope.repairContext).remediationContext,
    recordValue(envelope.repairContext).remediationContexts,
    latest.remediationContext,
    latest.remediationContexts,
    latestFullReview.remediationContext,
    latestFullReview.remediationContexts,
    ...[
      envelope.cohortKey,
      envelope.cohortKeys,
      recordValue(envelope.repairContext).cohortKey,
      recordValue(envelope.repairContext).cohortKeys,
      latest.cohortKey,
      latest.cohortKeys,
      latestFullReview.cohortKey,
      latestFullReview.cohortKeys,
    ]
      .flatMap(stringValues)
      .filter((context) => context === AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT),
  ]
    .flatMap(stringValues);
  if (!repairReason && !remediationContexts.length) return null;
  return {
    ...(repairReason
      ? {
          repairReason,
          repairReasons: repairReasons.length ? repairReasons : [repairReason],
        }
      : {}),
    queuedAt: stringValue(latest.queuedAt),
    priorMappingStatus: stringValue(latest.priorMappingStatus),
    priorMappingErrorMessage: stringValue(latest.priorMappingErrorMessage),
    approvalJobId: stringValue(latest.approvalJobId),
    approvalStatus: stringValue(latest.approvalStatus),
    reviewerId: stringValue(latest.reviewerId),
    decision: stringValue(latest.decision),
    rationale: stringValue(latest.rationale),
    blockingIssues: stringValues(latest.blockingIssues),
    ...(remediationContexts.length
      ? {
          remediationContext: remediationContexts[0],
          remediationContexts: Array.from(new Set(remediationContexts)),
        }
      : {}),
  };
};

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

  const activeJob = await jobs.findFirst({
    where: {
      ...(options.intakeId ? { intakeId: options.intakeId } : {}),
      status: 'CLAIMED',
      workerId,
      leaseExpiresAt: { gte: now },
    },
    orderBy: { claimedAt: 'asc' },
  });
  if (
    activeJob?.status === 'CLAIMED'
    && activeJob.workerId === workerId
    && activeJob.leaseExpiresAt instanceof Date
    && activeJob.leaseExpiresAt.getTime() >= now.getTime()
  ) {
    const renewed = await jobs.updateMany({
      where: {
        id: activeJob.id,
        status: 'CLAIMED',
        workerId,
        leaseExpiresAt: { gte: now },
      },
      data: { leaseExpiresAt },
    });
    if (renewed.count === 1) {
      const intake = await intakes.findUnique({ where: { id: activeJob.intakeId } });
      if (!intake) throw new Error('Claimed affiliate source intake not found.');
      return {
        jobId: activeJob.id,
        intakeId: intake.id,
        sourceKey: intake.sourceKey,
        workerId,
        leaseExpiresAt,
        resumed: true,
        repairContext: latestMappingRepairContext(activeJob.resultSummary),
      };
    }
  }

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
        try {
          job = await jobs.create({
            data: { id: createId(), intakeId: intake.id, status: 'QUEUED' },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;

          const existingActiveJob = await jobs.findFirst({
            where: {
              intakeId: intake.id,
              status: { in: [...ACTIVE_MAPPING_JOB_STATUSES] },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (!existingActiveJob) continue;

          const existingLeaseIsValid = existingActiveJob.status === 'CLAIMED'
            && existingActiveJob.leaseExpiresAt instanceof Date
            && existingActiveJob.leaseExpiresAt.getTime() >= now.getTime();
          if (existingActiveJob.status === 'REVIEW_REQUIRED' || existingLeaseIsValid) return null;
          job = existingActiveJob;
        }
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
      resumed: false,
      repairContext: latestMappingRepairContext(job.resultSummary),
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
  status: 'REVIEW_REQUIRED' | 'EXPANDED' | 'APPROVED' | 'FAILED' | 'HUMAN_REVIEW_REQUIRED';
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
  const fullReviewHistory = Array.isArray(previousEnvelope.mappingFullReviewHistory)
    ? previousEnvelope.mappingFullReviewHistory
    : [];
  const carriesEventDateTimeContext = hasEventDateTimeRemediationContext(job.resultSummary);
  if (
    input.status === 'REVIEW_REQUIRED'
    && hasEventDateTimeRemediationContext(job.resultSummary)
  ) {
    const submittedResult = recordValue(recordValue(input.resultSummary).result);
    const dateTimeReview = affiliateEventDateTimeReviewSchema.safeParse(submittedResult.dateTimeReview);
    if (!dateTimeReview.success) {
      throw new Error(
        'event-datetime-v1 review-required mapping results require a valid dateTimeReview section. '
        + dateTimeReview.error.message,
      );
    }
  }
  const nextResultSummary = input.resultSummary
    ? {
        ...input.resultSummary,
        ...(carriesEventDateTimeContext
          ? {
              cohortKey: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
              remediationContext: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
              remediationContexts: [AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT],
            }
          : {}),
        ...(repairHistory.length ? { mappingRepairHistory: repairHistory } : {}),
        ...(fullReviewHistory.length ? { mappingFullReviewHistory: fullReviewHistory } : {}),
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
    if (approval && ['APPROVED', 'REJECTED', 'DEFERRED'].includes(approval.status)) {
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
