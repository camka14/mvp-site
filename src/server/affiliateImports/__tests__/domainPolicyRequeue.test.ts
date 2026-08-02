/** @jest-environment node */

import { requeueDeferredAffiliateDomainPolicies } from '../domainPolicyRequeue';

const cutoff = new Date('2026-08-01T12:00:00.000Z');
const now = new Date('2026-08-01T12:05:00.000Z');

const testState = () => {
  const approvals: any[] = [
    {
      id: 'approval_deferred',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'example.org',
      status: 'DEFERRED',
      updatedAt: new Date('2026-08-01T11:00:00.000Z'),
      reviewerId: 'reviewer-1',
      attemptCount: 2,
      finishedAt: new Date('2026-08-01T11:00:00.000Z'),
      decision: { decision: 'DEFER' },
      errorMessage: null,
    },
    {
      id: 'approval_late',
      subjectType: 'DOMAIN_POLICY',
      subjectKey: 'late.example',
      status: 'DEFERRED',
      updatedAt: new Date('2026-08-01T12:01:00.000Z'),
      decision: { decision: 'DEFER' },
    },
    {
      id: 'approval_mapping',
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: 'mapping_1',
      status: 'DEFERRED',
      updatedAt: new Date('2026-08-01T11:00:00.000Z'),
    },
  ];
  const policies: any[] = [
    {
      policyKey: 'example.org',
      status: 'NEEDS_REVIEW',
      evidence: { robotsReviewed: true },
    },
    {
      policyKey: 'late.example',
      status: 'NEEDS_REVIEW',
      evidence: {},
    },
  ];
  const findCandidates = ({ where }: any) => approvals.filter((row) => (
    row.subjectType === where.subjectType
      && row.status === where.status
      && row.updatedAt <= where.updatedAt.lte
  ));
  const client: any = {
    $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) => callback(client)),
    affiliateApprovalJobs: {
      findMany: jest.fn(async (query: any) => findCandidates(query)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = approvals.find((candidate) => (
          candidate.id === where.id
            && candidate.subjectType === where.subjectType
            && candidate.status === where.status
            && candidate.updatedAt <= where.updatedAt.lte
        ));
        if (!row) return { count: 0 };
        Object.assign(row, data, { updatedAt: now });
        return { count: 1 };
      }),
    },
    affiliateSourceDomainPolicies: {
      findMany: jest.fn(async ({ where }: any) => policies.filter((row) => (
        where.policyKey.in.includes(row.policyKey) && row.status === where.status
      ))),
      update: jest.fn(async ({ where, data }: any) => {
        const row = policies.find((candidate) => candidate.policyKey === where.policyKey);
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return { approvals, policies, client };
};

describe('deferred affiliate domain-policy requeue', () => {
  it('previews only deferred domain policies before the cutoff without writing', async () => {
    const state = testState();
    const result = await requeueDeferredAffiliateDomainPolicies({
      apply: false,
      cutoff,
      expectedCount: 1,
      now,
    }, { client: state.client });

    expect(result).toEqual(expect.objectContaining({
      apply: false,
      candidateCount: 1,
      requeuedCount: 0,
      policyKeys: ['example.org'],
    }));
    expect(state.client.$transaction).not.toHaveBeenCalled();
    expect(state.client.affiliateApprovalJobs.updateMany).not.toHaveBeenCalled();
    expect(state.policies[0].evidence).toEqual({ robotsReviewed: true });
  });

  it('preserves the prior decision and resets only the guarded approval row', async () => {
    const state = testState();
    const result = await requeueDeferredAffiliateDomainPolicies({
      apply: true,
      cutoff,
      expectedCount: 1,
      now,
    }, { client: state.client });

    expect(result.requeuedCount).toBe(1);
    expect(state.approvals[0]).toEqual(expect.objectContaining({
      status: 'QUEUED',
      reviewerId: null,
      decision: null,
      finishedAt: null,
    }));
    expect(state.approvals[1].status).toBe('DEFERRED');
    expect(state.approvals[2].status).toBe('DEFERRED');
    expect(state.policies[0].evidence).toEqual(expect.objectContaining({
      robotsReviewed: true,
      domainPolicyApprovalReviewHistory: [expect.objectContaining({
        approvalJobId: 'approval_deferred',
        priorDecision: { decision: 'DEFER' },
        requeueReason: 'explicit-prohibition-only-policy-standard',
      })],
    }));
  });

  it('stops before writing when the expected count does not match', async () => {
    const state = testState();
    await expect(requeueDeferredAffiliateDomainPolicies({
      apply: true,
      cutoff,
      expectedCount: 2,
      now,
    }, { client: state.client })).rejects.toThrow('expected 2 candidates but found 1');
    expect(state.client.affiliateApprovalJobs.updateMany).not.toHaveBeenCalled();
    expect(state.client.affiliateSourceDomainPolicies.update).not.toHaveBeenCalled();
  });
});
