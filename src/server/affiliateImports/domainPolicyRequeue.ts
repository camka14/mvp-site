import { prisma } from '@/lib/prisma';

type JsonRecord = Record<string, unknown>;

type DeferredPolicyCandidate = {
  approval: any;
  policy: any;
};

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const recordArray = (value: unknown): JsonRecord[] => (
  Array.isArray(value) ? value.map(recordValue) : []
);

const isoValue = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.trim() ? value : null;
};

const loadCandidates = async (client: any, cutoff: Date): Promise<DeferredPolicyCandidate[]> => {
  const approvals = await client.affiliateApprovalJobs.findMany({
    where: {
      subjectType: 'DOMAIN_POLICY',
      status: 'DEFERRED',
      updatedAt: { lte: cutoff },
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
  });
  if (!approvals.length) return [];

  const policies = await client.affiliateSourceDomainPolicies.findMany({
    where: {
      policyKey: { in: approvals.map((approval: any) => approval.subjectKey) },
      status: 'NEEDS_REVIEW',
    },
  });
  const policyByKey = new Map(policies.map((policy: any) => [policy.policyKey, policy]));
  return approvals.flatMap((approval: any) => {
    const policy = policyByKey.get(approval.subjectKey);
    return policy ? [{ approval, policy }] : [];
  });
};

export type AffiliateDeferredDomainPolicyRequeueResult = {
  schemaVersion: 1;
  apply: boolean;
  cutoff: string;
  expectedCount: number | null;
  candidateCount: number;
  requeuedCount: number;
  policyKeys: string[];
};

export const requeueDeferredAffiliateDomainPolicies = async (input: {
  apply: boolean;
  cutoff: Date;
  expectedCount?: number;
  now?: Date;
}, dependencies: { client?: any } = {}): Promise<AffiliateDeferredDomainPolicyRequeueResult> => {
  if (Number.isNaN(input.cutoff.getTime())) {
    throw new Error('Affiliate domain-policy requeue cutoff must be a valid date.');
  }
  if (input.apply && input.expectedCount === undefined) {
    throw new Error('Affiliate domain-policy requeue apply requires expectedCount.');
  }
  if (input.expectedCount !== undefined && (
    !Number.isInteger(input.expectedCount) || input.expectedCount < 0
  )) {
    throw new Error('Affiliate domain-policy requeue expectedCount must be a non-negative integer.');
  }

  const client = dependencies.client ?? prisma as any;
  const requeuedAt = input.now ?? new Date();
  const run = async (transaction: any, apply: boolean) => {
    const candidates = await loadCandidates(transaction, input.cutoff);
    if (input.expectedCount !== undefined && candidates.length !== input.expectedCount) {
      throw new Error(
        `Affiliate domain-policy requeue expected ${input.expectedCount} candidates but found ${candidates.length}.`,
      );
    }
    if (apply) {
      for (const { approval, policy } of candidates) {
        const evidence = recordValue(policy.evidence);
        const history = recordArray(evidence.domainPolicyApprovalReviewHistory);
        await transaction.affiliateSourceDomainPolicies.update({
          where: { policyKey: policy.policyKey },
          data: {
            evidence: {
              ...evidence,
              domainPolicyApprovalReviewHistory: [
                ...history,
                {
                  approvalJobId: approval.id,
                  priorStatus: approval.status,
                  priorReviewerId: approval.reviewerId ?? null,
                  priorAttemptCount: approval.attemptCount,
                  priorFinishedAt: isoValue(approval.finishedAt),
                  priorDecision: approval.decision ?? null,
                  requeuedAt: requeuedAt.toISOString(),
                  requeueReason: 'explicit-prohibition-only-policy-standard',
                },
              ],
            },
          },
        });
        const updated = await transaction.affiliateApprovalJobs.updateMany({
          where: {
            id: approval.id,
            subjectType: 'DOMAIN_POLICY',
            status: 'DEFERRED',
            updatedAt: { lte: input.cutoff },
          },
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
        if (updated.count !== 1) {
          throw new Error(`Affiliate domain-policy approval ${approval.id} changed during requeue.`);
        }
      }
    }
    return candidates;
  };

  const candidates = input.apply
    ? await client.$transaction((transaction: any) => run(transaction, true))
    : await run(client, false);
  return {
    schemaVersion: 1,
    apply: input.apply,
    cutoff: input.cutoff.toISOString(),
    expectedCount: input.expectedCount ?? null,
    candidateCount: candidates.length,
    requeuedCount: input.apply ? candidates.length : 0,
    policyKeys: candidates.map(({ policy }: DeferredPolicyCandidate) => policy.policyKey),
  };
};
