import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  affiliateApprovalResultSchema,
  type AffiliateApprovalResult,
} from './approvalResult';
import { codexAffiliateIngestionResultSchema } from './codexIngestionResult';
import { applyAffiliateSourceDomainPolicy } from './sourceDiscovery';
import { findAffiliateIntakeIdsForPolicyKey } from './sourcePolicyIntakes';

const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

const approvalDb = () => ({
  approvals: (prisma as any).affiliateApprovalJobs,
  policies: (prisma as any).affiliateSourceDomainPolicies,
  mappingJobs: (prisma as any).affiliateSourceMappingJobs,
  intakes: (prisma as any).affiliateSourceIntakes,
  pages: (prisma as any).affiliateSourceIntakePages,
});

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

export const reconcileAffiliateApprovalQueue = async (): Promise<{
  domainPolicies: number;
  mappingPackages: number;
  created: number;
}> => {
  const { approvals, policies, mappingJobs } = approvalDb();
  const [policyRows, mappingRows] = await Promise.all([
    policies.findMany({
      where: { status: 'NEEDS_REVIEW' },
      select: { policyKey: true },
      orderBy: { createdAt: 'asc' },
    }),
    mappingJobs.findMany({
      where: { status: 'REVIEW_REQUIRED' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const subjects = [
    ...policyRows.map((row: any) => ({ subjectType: 'DOMAIN_POLICY', subjectKey: row.policyKey })),
    ...mappingRows.map((row: any) => ({ subjectType: 'MAPPING_PACKAGE', subjectKey: row.id })),
  ];
  const existingRows = subjects.length
    ? await approvals.findMany({
      where: { OR: subjects },
      select: { subjectType: true, subjectKey: true },
    })
    : [];
  const existingSubjects = new Set(existingRows.map((row: any) => (
    `${row.subjectType}:${row.subjectKey}`
  )));
  let created = 0;
  for (const subject of subjects) {
    if (existingSubjects.has(`${subject.subjectType}:${subject.subjectKey}`)) continue;
    await approvals.create({
      data: {
        id: createId(),
        ...subject,
        status: 'QUEUED',
      },
    });
    created += 1;
  }
  return {
    domainPolicies: policyRows.length,
    mappingPackages: mappingRows.length,
    created,
  };
};

export type AffiliateApprovalQueueRow = {
  id: string;
  subjectType: string;
  subjectKey: string;
  status: string;
  leaseExpiresAt: Date | null;
};

export type AffiliateApprovalQueueStatus = {
  schemaVersion: 1;
  evaluatedAt: string;
  complete: boolean;
  claimableJobs: number;
  queuedJobs: number;
  expiredLeases: number;
  activeLeases: number;
  claimedWithoutLease: number;
  statusCounts: Record<string, number>;
  subjectTypeCounts: Record<string, number>;
};

const countValues = (values: string[]): Record<string, number> => Object.fromEntries(
  Array.from(new Set(values)).sort().map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]),
);

export const summarizeAffiliateApprovalQueue = (
  rows: AffiliateApprovalQueueRow[],
  now = new Date(),
): AffiliateApprovalQueueStatus => {
  const queuedJobs = rows.filter((row) => row.status === 'QUEUED').length;
  const expiredLeases = rows.filter((row) => (
    row.status === 'CLAIMED'
    && row.leaseExpiresAt !== null
    && row.leaseExpiresAt.getTime() < now.getTime()
  )).length;
  const activeLeases = rows.filter((row) => (
    row.status === 'CLAIMED'
    && row.leaseExpiresAt !== null
    && row.leaseExpiresAt.getTime() >= now.getTime()
  )).length;
  const claimedWithoutLease = rows.filter((row) => (
    row.status === 'CLAIMED' && row.leaseExpiresAt === null
  )).length;
  const claimableJobs = queuedJobs + expiredLeases;
  return {
    schemaVersion: 1,
    evaluatedAt: now.toISOString(),
    complete: claimableJobs === 0 && activeLeases === 0 && claimedWithoutLease === 0,
    claimableJobs,
    queuedJobs,
    expiredLeases,
    activeLeases,
    claimedWithoutLease,
    statusCounts: countValues(rows.map((row) => row.status)),
    subjectTypeCounts: countValues(rows.map((row) => row.subjectType)),
  };
};

export const getAffiliateApprovalQueueStatus = async (
  now = new Date(),
): Promise<AffiliateApprovalQueueStatus> => {
  const rows = await approvalDb().approvals.findMany({
    select: {
      id: true,
      subjectType: true,
      subjectKey: true,
      status: true,
      leaseExpiresAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return summarizeAffiliateApprovalQueue(rows, now);
};

const approvalSubjectContext = async (approval: any) => {
  const { policies, mappingJobs, intakes, pages } = approvalDb();
  if (approval.subjectType === 'DOMAIN_POLICY') {
    const policy = await policies.findUnique({ where: { policyKey: approval.subjectKey } });
    if (!policy) throw new Error('Approval domain policy was not found.');
    const intakeIds = await findAffiliateIntakeIdsForPolicyKey(prisma as any, approval.subjectKey);
    const [intakeRows, pageRows] = await Promise.all([
      intakes.findMany({
        where: { id: { in: intakeIds } },
        select: {
          id: true,
          sourceKey: true,
          name: true,
          region: true,
          baseUrl: true,
          status: true,
          complianceStatus: true,
          lastRunId: true,
        },
        orderBy: { id: 'asc' },
      }),
      pages.findMany({
        where: { intakeId: { in: intakeIds } },
        select: {
          id: true,
          intakeId: true,
          canonicalUrl: true,
          role: true,
          robotsStatus: true,
          robotsNotes: true,
          metadata: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      policy,
      intakeIds,
      intakes: intakeRows,
      pages: pageRows,
      producerId: null,
    };
  }
  if (approval.subjectType === 'MAPPING_PACKAGE') {
    const mappingJob = await mappingJobs.findUnique({ where: { id: approval.subjectKey } });
    if (!mappingJob) throw new Error('Approval mapping package was not found.');
    const envelope = recordValue(mappingJob.resultSummary);
    const parsed = codexAffiliateIngestionResultSchema.safeParse(envelope.result);
    return {
      mappingJob,
      ingestionResult: parsed.success ? parsed.data : null,
      ingestionResultError: parsed.success ? null : parsed.error.message,
      producerId: parsed.success
        ? parsed.data.workerId
        : stringValue(recordValue(envelope.result).workerId),
    };
  }
  throw new Error(`Unsupported affiliate approval subject type ${approval.subjectType}.`);
};

export const claimNextAffiliateApproval = async (options: {
  reviewerId: string;
  approvalJobId?: string;
  now?: Date;
  leaseMs?: number;
}) => {
  const reviewerId = options.reviewerId.trim();
  if (!reviewerId) throw new Error('Affiliate approval reviewer id is required.');
  const now = options.now ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { approvals } = approvalDb();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const approval = await approvals.findFirst({
      where: {
        ...(options.approvalJobId ? { id: options.approvalJobId } : {}),
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!approval) return null;
    const claimed = await approvals.updateMany({
      where: {
        id: approval.id,
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        leaseExpiresAt,
        reviewerId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) continue;
    const claimedApproval = await approvals.findUnique({ where: { id: approval.id } });
    try {
      return {
        approvalJob: claimedApproval,
        subject: await approvalSubjectContext(claimedApproval),
      };
    } catch (error) {
      await approvals.update({
        where: { id: approval.id },
        data: {
          status: 'FAILED',
          finishedAt: now,
          leaseExpiresAt: null,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return null;
};

type ApprovalCompletionDependencies = {
  applyDomainPolicy?: typeof applyAffiliateSourceDomainPolicy;
  applyMappingPackage?: (
    mappingJobId: string,
    reviewerId: string,
    result: AffiliateApprovalResult,
  ) => Promise<void>;
};

const terminalApprovalStatus = (result: AffiliateApprovalResult): string => {
  if (result.decision === 'ALLOW' || result.decision === 'APPROVE') return 'APPROVED';
  if (result.decision === 'BLOCK') return 'BLOCKED';
  if (result.decision === 'REJECT') return 'REJECTED';
  return 'DEFERRED';
};

export const completeAffiliateApproval = async (
  unparsedResult: unknown,
  dependencies: ApprovalCompletionDependencies = {},
) => {
  const result = affiliateApprovalResultSchema.parse(unparsedResult);
  const { approvals, policies, mappingJobs, intakes } = approvalDb();
  const approval = await approvals.findUnique({ where: { id: result.approvalJobId } });
  if (!approval) throw new Error('Affiliate approval job not found.');
  const terminalStatus = terminalApprovalStatus(result);
  if (['APPROVED', 'BLOCKED', 'REJECTED', 'DEFERRED'].includes(approval.status)) {
    if (approval.status === terminalStatus && approval.reviewerId === result.reviewerId) return approval;
    throw new Error(`Affiliate approval job is already terminal with status ${approval.status}.`);
  }
  if (approval.status !== 'CLAIMED') {
    throw new Error(`Affiliate approval job must be CLAIMED, received ${approval.status}.`);
  }
  if (approval.reviewerId !== result.reviewerId) {
    throw new Error('Reviewer result does not own the affiliate approval claim.');
  }
  if (approval.subjectType !== result.subjectType || approval.subjectKey !== result.subjectKey) {
    throw new Error('Reviewer result subject does not match the affiliate approval claim.');
  }

  if (result.subjectType === 'DOMAIN_POLICY') {
    const policy = await policies.findUnique({ where: { policyKey: result.subjectKey } });
    if (!policy) throw new Error('Affiliate source domain policy not found.');
    if (result.decision !== 'DEFER') {
      const desiredStatus = result.decision === 'ALLOW' ? 'ALLOWED' : 'BLOCKED';
      if (policy.status !== desiredStatus) {
        const applyPolicy = dependencies.applyDomainPolicy ?? applyAffiliateSourceDomainPolicy;
        await applyPolicy(result.subjectKey, {
          status: desiredStatus,
          termsUrl: policy.termsUrl,
          robotsSummary: policy.robotsSummary,
          restrictionNotes: result.decision === 'BLOCK' ? result.rationale : policy.restrictionNotes,
          evidence: {
            approvalJobId: result.approvalJobId,
            reviewerId: result.reviewerId,
            reviewerResult: result,
          },
        }, result.reviewerId);
      }
    }
  } else {
    const mappingJob = await mappingJobs.findUnique({ where: { id: result.subjectKey } });
    if (!mappingJob) throw new Error('Affiliate source mapping job not found.');
    const envelope = recordValue(mappingJob.resultSummary);
    const ingestionResult = codexAffiliateIngestionResultSchema.safeParse(envelope.result);
    const producerId = ingestionResult.success
      ? ingestionResult.data.workerId
      : stringValue(recordValue(envelope.result).workerId);
    if (!producerId) throw new Error('Mapping package producer identity is missing.');
    if (producerId === result.reviewerId) {
      throw new Error('Affiliate mapping packages cannot be approved or reviewed by their producer identity.');
    }
    if (result.decision === 'APPROVE') {
      if (!ingestionResult.success || ingestionResult.data.status !== 'REVIEW_REQUIRED') {
        throw new Error('Mapping approval requires a valid review-required Codex ingestion result.');
      }
      if (ingestionResult.data.logoDisposition === 'MANUAL_REVIEW') {
        throw new Error('Mapping approval requires a verified official logo disposition.');
      }
      if (mappingJob.status === 'REVIEW_REQUIRED') {
        if (!dependencies.applyMappingPackage) {
          throw new Error('Mapping package approval requires the live application boundary.');
        }
        await dependencies.applyMappingPackage(mappingJob.id, result.reviewerId, result);
      }
      const applied = await mappingJobs.findUnique({ where: { id: mappingJob.id } });
      if (applied?.status !== 'APPROVED') {
        throw new Error('Mapping package application did not mark the mapping job approved.');
      }
    } else if (result.decision === 'REJECT' && mappingJob.status === 'REVIEW_REQUIRED') {
      const finishedAt = new Date();
      await mappingJobs.update({
        where: { id: mappingJob.id },
        data: {
          status: 'FAILED',
          finishedAt,
          errorMessage: result.blockingIssues.join(' '),
          resultSummary: {
            ...envelope,
            approvalReview: result,
          },
        },
      });
      await intakes.update({
        where: { id: mappingJob.intakeId },
        data: { status: 'REVIEW_REQUIRED' },
      });
    }
  }

  return approvals.update({
    where: { id: approval.id },
    data: {
      status: terminalStatus,
      decision: result,
      errorMessage: null,
      finishedAt: new Date(),
      leaseExpiresAt: null,
    },
  });
};
