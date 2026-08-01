import {
  codexAffiliateIngestionResultSchema,
  type CodexAffiliateIngestionResult,
} from './codexIngestionResult';

export type AffiliateMappingHandoffRetryInput = {
  approvalStatus: string;
  approvalDecision: unknown;
  mappingStatus: string;
  resultSummary: unknown;
};

export type AffiliateMappingHandoffRetryEligibility = {
  eligible: boolean;
  reason: string;
  result: CodexAffiliateIngestionResult | null;
};

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export const hasAffiliateProducerHandoffBlocker = (decision: unknown): boolean => {
  const text = JSON.stringify(decision ?? '').toLowerCase();
  return text.includes('producer commit')
    || text.includes('package files')
    || text.includes('generated paths')
    || text.includes('reviewer checkout')
    || text.includes('stored setup script')
    || text.includes('source-specific generated')
    || text.includes('commit could not be independently resolved');
};

export const affiliateMappingHandoffRetryEligibility = (
  input: AffiliateMappingHandoffRetryInput,
): AffiliateMappingHandoffRetryEligibility => {
  if (!['REJECTED', 'DEFERRED'].includes(input.approvalStatus)) {
    return { eligible: false, reason: 'approval-not-terminal-handoff-state', result: null };
  }
  if (
    (input.approvalStatus === 'REJECTED' && input.mappingStatus !== 'FAILED')
    || (input.approvalStatus === 'DEFERRED' && input.mappingStatus !== 'REVIEW_REQUIRED')
  ) {
    return { eligible: false, reason: 'mapping-status-does-not-match-decision', result: null };
  }
  const parsed = codexAffiliateIngestionResultSchema.safeParse(
    recordValue(input.resultSummary).result,
  );
  if (!parsed.success || parsed.data.status !== 'REVIEW_REQUIRED') {
    return { eligible: false, reason: 'invalid-review-required-result', result: null };
  }
  if (parsed.data.logoDisposition === 'MANUAL_REVIEW') {
    return { eligible: false, reason: 'manual-logo-review-still-required', result: parsed.data };
  }
  if (!hasAffiliateProducerHandoffBlocker(input.approvalDecision)) {
    return { eligible: false, reason: 'decision-does-not-match-handoff-failure', result: parsed.data };
  }
  return { eligible: true, reason: 'verified-handoff-retry-candidate', result: parsed.data };
};
