import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import type { AffiliateApprovalQueueStatus } from './approvalQueue';
import {
  summarizeAffiliateMappingQueue,
  type AffiliateMappingQueueStatus,
} from './sourceMappingQueueStatus';

export const AFFILIATE_MAPPING_FULL_REVIEW_SUBJECT_TYPE = 'MAPPING_FULL_REVIEW_COHORT';
export const AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS = 'WAITING_FOR_MAPPING_DRAIN';
export const AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS = 'ENQUEUED_FOR_REVIEW';

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const recordArray = (value: unknown): JsonRecord[] => (
  Array.isArray(value) ? value.map(recordValue) : []
);

const validCohortKey = (value: string): string => {
  const key = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(key)) {
    throw new Error('Affiliate mapping full-review cohort key is invalid.');
  }
  return key;
};

const loadMappingQueueStatus = async (client: any): Promise<AffiliateMappingQueueStatus> => {
  const [intakes, jobs, captureRuns] = await Promise.all([
    client.affiliateSourceIntakes.findMany({
      select: { id: true, status: true, complianceStatus: true },
      orderBy: { id: 'asc' },
    }),
    client.affiliateSourceMappingJobs.findMany({
      select: { id: true, intakeId: true, status: true, leaseExpiresAt: true },
      orderBy: { id: 'asc' },
    }),
    client.affiliateSourceIntakeRuns.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true, intakeId: true, status: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return summarizeAffiliateMappingQueue({ intakes, jobs, captureRuns });
};

export type AffiliateMappingFullReviewAdvanceResult = {
  cohortKey: string;
  state: 'WAITING' | 'ENQUEUED' | 'ALREADY_ENQUEUED';
  mappingQueue: AffiliateMappingQueueStatus | null;
  approvalQueueComplete: boolean;
  blockers: string[];
  enqueuedMappingCount: number;
};

export const advanceAffiliateMappingFullReviewCohort = async (input: {
  cohortKey: string;
  approvalQueue: AffiliateApprovalQueueStatus;
  now?: Date;
}, dependencies: {
  client?: any;
  loadMappingStatus?: (client: any) => Promise<AffiliateMappingQueueStatus>;
} = {}): Promise<AffiliateMappingFullReviewAdvanceResult> => {
  const cohortKey = validCohortKey(input.cohortKey);
  const now = input.now ?? new Date();
  const client = dependencies.client ?? prisma as any;
  const approvals = client.affiliateApprovalJobs;
  const compoundWhere = {
    subjectType_subjectKey: {
      subjectType: AFFILIATE_MAPPING_FULL_REVIEW_SUBJECT_TYPE,
      subjectKey: cohortKey,
    },
  };
  let cohort = await approvals.findUnique({ where: compoundWhere });
  if (!cohort) {
    cohort = await approvals.create({
      data: {
        id: createId(),
        subjectType: AFFILIATE_MAPPING_FULL_REVIEW_SUBJECT_TYPE,
        subjectKey: cohortKey,
        status: AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS,
        decision: {
          schemaVersion: 1,
          cohortKey,
          armedAt: now.toISOString(),
          mappingCreatedAtCutoff: now.toISOString(),
        },
      },
    });
  }
  if (cohort.status === AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS) {
    const summary = recordValue(cohort.decision);
    return {
      cohortKey,
      state: 'ALREADY_ENQUEUED',
      mappingQueue: null,
      approvalQueueComplete: input.approvalQueue.complete,
      blockers: [],
      enqueuedMappingCount: Number(summary.enqueuedMappingCount ?? 0),
    };
  }
  if (cohort.status !== AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS) {
    throw new Error(`Affiliate mapping full-review cohort has unsupported status ${cohort.status}.`);
  }

  const mappingQueue = await (dependencies.loadMappingStatus ?? loadMappingQueueStatus)(client);
  const blockers = [
    ...(!input.approvalQueue.complete ? ['APPROVAL_QUEUE_ACTIVE'] : []),
    ...(!mappingQueue.complete ? ['MAPPING_OR_CAPTURE_QUEUE_ACTIVE'] : []),
    ...(mappingQueue.activeLeases > 0 ? ['ACTIVE_MAPPING_LEASE'] : []),
    ...(mappingQueue.reviewRequiredJobs > 0 ? ['MAPPING_REVIEWS_PENDING'] : []),
  ];
  if (blockers.length) {
    return {
      cohortKey,
      state: 'WAITING',
      mappingQueue,
      approvalQueueComplete: input.approvalQueue.complete,
      blockers,
      enqueuedMappingCount: 0,
    };
  }

  const cohortDecision = recordValue(cohort.decision);
  const cutoffText = typeof cohortDecision.mappingCreatedAtCutoff === 'string'
    ? cohortDecision.mappingCreatedAtCutoff
    : '';
  const cutoff = new Date(cutoffText);
  if (!cutoffText || Number.isNaN(cutoff.getTime())) {
    throw new Error('Affiliate mapping full-review cohort cutoff is invalid.');
  }

  const enqueuedMappingCount = await client.$transaction(async (transaction: any) => {
    const current = await transaction.affiliateApprovalJobs.findUnique({ where: compoundWhere });
    if (current?.status === AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS) {
      return Number(recordValue(current.decision).enqueuedMappingCount ?? 0);
    }
    if (current?.status !== AFFILIATE_MAPPING_FULL_REVIEW_WAITING_STATUS) {
      throw new Error('Affiliate mapping full-review cohort changed before enqueue.');
    }
    const mappings = await transaction.affiliateSourceMappingJobs.findMany({
      where: { status: 'APPROVED', createdAt: { lte: cutoff } },
      select: { id: true, resultSummary: true },
      orderBy: { createdAt: 'asc' },
    });
    const mappingIds = mappings.map((mapping: any) => mapping.id);
    const mappingApprovals = mappingIds.length
      ? await transaction.affiliateApprovalJobs.findMany({
        where: {
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: { in: mappingIds },
        },
      })
      : [];
    const approvalsByMappingId = new Map(
      mappingApprovals.map((approval: any) => [approval.subjectKey, approval]),
    );
    for (const mapping of mappings) {
      let approval = approvalsByMappingId.get(mapping.id) as any;
      const priorApprovalStatus = approval?.status ?? 'MISSING';
      if (approval && approval.status !== 'APPROVED') {
        throw new Error(`Approved mapping ${mapping.id} does not have an approved review row.`);
      }
      if (!approval) {
        approval = await transaction.affiliateApprovalJobs.create({
          data: {
            id: createId(),
            subjectType: 'MAPPING_PACKAGE',
            subjectKey: mapping.id,
            status: 'QUEUED',
          },
        });
      }
      const envelope = recordValue(mapping.resultSummary);
      const repairHistory = recordArray(envelope.mappingRepairHistory);
      const mappingFullReviewHistory = recordArray(envelope.mappingFullReviewHistory);
      await transaction.affiliateSourceMappingJobs.update({
        where: { id: mapping.id },
        data: {
          status: 'REVIEW_REQUIRED',
          finishedAt: null,
          resultSummary: {
            ...envelope,
            mappingFullReviewHistory: [...mappingFullReviewHistory, {
              cohortKey,
              queuedAt: now.toISOString(),
              repairHistoryStartIndex: repairHistory.length,
              priorApprovalJobId: approval.id,
              priorApprovalStatus,
              priorDecision: priorApprovalStatus === 'MISSING' ? null : approval.decision,
              approvalRowCreatedForCohort: priorApprovalStatus === 'MISSING',
            }],
          },
        },
      });
      if (priorApprovalStatus !== 'MISSING') {
        await transaction.affiliateApprovalJobs.update({
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
    await transaction.affiliateApprovalJobs.update({
      where: { id: current.id },
      data: {
        status: AFFILIATE_MAPPING_FULL_REVIEW_ENQUEUED_STATUS,
        decision: {
          ...recordValue(current.decision),
          enqueuedAt: now.toISOString(),
          enqueuedMappingCount: mappings.length,
        },
        finishedAt: now,
      },
    });
    return mappings.length;
  });

  return {
    cohortKey,
    state: 'ENQUEUED',
    mappingQueue,
    approvalQueueComplete: true,
    blockers: [],
    enqueuedMappingCount,
  };
};
