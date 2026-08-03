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

export const hasAffiliateProducerRepositoryHandoffBlocker = (decision: unknown): boolean => {
  const text = JSON.stringify(decision ?? '').toLowerCase();
  const namesRepository = text.includes('/producer-workspace')
    || text.includes('producer repository')
    || text.includes('producer checkout');
  const namesCommit = text.includes('producer commit')
    || text.includes('exact commit')
    || text.includes('commit could not be independently resolved');
  const namesResolutionFailure = text.includes('cannot resolve')
    || text.includes('could not resolve')
    || text.includes('could not be resolved')
    || text.includes('inaccessible producer handoff')
    || text.includes('single-revision error')
    || text.includes('needed a single revision')
    || text.includes('not a valid object name');
  return namesRepository && namesCommit && namesResolutionFailure;
};

export const affiliateMappingHandoffRetryEligibility = (
  input: AffiliateMappingHandoffRetryInput,
): AffiliateMappingHandoffRetryEligibility => {
  if (!['REJECTED', 'DEFERRED'].includes(input.approvalStatus)) {
    return { eligible: false, reason: 'approval-not-terminal-handoff-state', result: null };
  }
  const humanReviewHandoff = (
    input.mappingStatus === 'HUMAN_REVIEW_REQUIRED'
    && hasAffiliateProducerRepositoryHandoffBlocker(input.approvalDecision)
    && hasAffiliateProducerRepositoryHandoffBlocker(
      recordValue(recordValue(input.resultSummary).humanReviewRequired),
    )
  );
  if (
    (input.approvalStatus === 'REJECTED' && input.mappingStatus !== 'FAILED')
    || (input.approvalStatus === 'DEFERRED' && input.mappingStatus !== 'REVIEW_REQUIRED')
  ) {
    if (!humanReviewHandoff) {
      return { eligible: false, reason: 'mapping-status-does-not-match-decision', result: null };
    }
  }
  if (input.mappingStatus === 'HUMAN_REVIEW_REQUIRED' && !humanReviewHandoff) {
    return { eligible: false, reason: 'mapping-status-does-not-match-decision', result: null };
  }
  const parsed = codexAffiliateIngestionResultSchema.safeParse(
    recordValue(input.resultSummary).result,
  );
  if (!parsed.success || parsed.data.status !== 'REVIEW_REQUIRED') {
    return { eligible: false, reason: 'invalid-review-required-result', result: null };
  }
  if (parsed.data.logoDisposition === 'MANUAL_REVIEW' && !humanReviewHandoff) {
    return { eligible: false, reason: 'manual-logo-review-still-required', result: parsed.data };
  }
  if (!hasAffiliateProducerHandoffBlocker(input.approvalDecision)) {
    return { eligible: false, reason: 'decision-does-not-match-handoff-failure', result: parsed.data };
  }
  return {
    eligible: true,
    reason: humanReviewHandoff
      ? 'verified-human-review-handoff-retry-candidate'
      : 'verified-handoff-retry-candidate',
    result: parsed.data,
  };
};
