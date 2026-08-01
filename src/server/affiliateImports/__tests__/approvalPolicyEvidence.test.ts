/** @jest-environment node */

import { refreshAffiliateApprovalPolicyEvidence } from '../approvalPolicyEvidence';

describe('affiliate approval policy evidence', () => {
  it('stores bounded robots and policy resources without changing the decision', async () => {
    let storedEvidence: unknown = {
      likelyTermsUrls: ['https://club.example.test/legal'],
      discovery: { source: 'directory' },
    };
    const policy = {
      policyKey: 'example.test',
      status: 'NEEDS_REVIEW',
      termsUrl: null,
      evidence: storedEvidence,
    };
    const db = {
      affiliateSourceDomainPolicies: {
        findUnique: jest.fn(async () => policy),
        update: jest.fn(async ({ data }: any) => {
          storedEvidence = data.evidence;
          return { ...policy, evidence: storedEvidence };
        }),
      },
      affiliateSourceIntakes: {
        findMany: jest.fn(async () => [{ id: 'intake_1', baseUrl: 'https://club.example.test' }]),
      },
      affiliateSourceIntakePages: {
        findMany: jest.fn(async () => [{
          id: 'page_1',
          intakeId: 'intake_1',
          canonicalUrl: 'https://club.example.test/events',
        }]),
      },
    };
    const fetchResource = jest.fn(async (url: string) => ({
      body: Buffer.from(`evidence for ${url}`),
      finalUrl: url,
      statusCode: 200,
      contentType: 'text/plain',
      headers: {},
    }));

    const result = await refreshAffiliateApprovalPolicyEvidence('example.test', {
      db,
      fetchResource,
      now: () => new Date('2026-07-31T12:00:00.000Z'),
    });

    expect(fetchResource).toHaveBeenCalledWith(
      'https://club.example.test/robots.txt',
      { maxBytes: 512 * 1024, timeoutMs: 15_000 },
    );
    expect(result.approvalEvidence).toEqual(expect.objectContaining({
      policyKey: 'example.test',
      intakeIds: ['intake_1'],
      capturedAt: '2026-07-31T12:00:00.000Z',
      resources: expect.arrayContaining([
        expect.objectContaining({ requestedUrl: 'https://club.example.test/legal', statusCode: 200 }),
      ]),
    }));
    expect(storedEvidence).toEqual(expect.objectContaining({
      discovery: { source: 'directory' },
      approvalEvidence: expect.any(Object),
    }));
    expect(policy.status).toBe('NEEDS_REVIEW');
  });
});
