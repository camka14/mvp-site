import { codexAffiliateIngestionResultSchema } from './codexIngestionResult';

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const stringValues = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
};

export type AffiliateMappingProducerRepairReason =
  | 'LIVE_SETUP_UNSUPPORTED'
  | 'EVENT_LOCATION_PACKAGE_REJECTION'
  | 'MANUAL_LOGO_REVIEW';

export const affiliateMappingProducerRepairEligibility = (input: {
  approvalStatus: unknown;
  approvalDecision: unknown;
  mappingStatus: unknown;
  mappingErrorMessage?: unknown;
  resultSummary?: unknown;
}): { eligible: boolean; reason: string; repairReason: AffiliateMappingProducerRepairReason | null } => {
  if (input.approvalStatus !== 'REJECTED') {
    return { eligible: false, reason: 'approval-not-rejected', repairReason: null };
  }
  if (input.mappingStatus !== 'FAILED') {
    return { eligible: false, reason: 'mapping-not-failed', repairReason: null };
  }

  const decision = recordValue(input.approvalDecision);
  const envelope = recordValue(input.resultSummary);
  const embeddedReview = recordValue(envelope.approvalReview);
  const currentMappingFailure = stringValues(input.mappingErrorMessage).join(' ');
  const priorReviewEvidence = [
    ...stringValues(decision.rationale),
    ...stringValues(decision.blockingIssues),
    ...stringValues(embeddedReview.rationale),
    ...stringValues(embeddedReview.blockingIssues),
  ].join(' ');
  // A later producer attempt can fail for a different, terminal reason while the
  // approval row still contains an older repairable review. In that case the
  // current mapping failure is authoritative and must not be masked by stale
  // approval evidence.
  const evidence = currentMappingFailure || priorReviewEvidence;
  if (!evidence) {
    return { eligible: false, reason: 'rejection-reason-missing', repairReason: null };
  }

  const liveSetupUnsupported = /(?:--live.{0,160}(?:refus|unsupported|not support|cannot|does not|prevent)|(?:refus|unsupported|not support|cannot|does not|prevent).{0,160}--live)/i.test(evidence);
  if (liveSetupUnsupported) {
    return { eligible: true, reason: 'producer-repair-required', repairReason: 'LIVE_SETUP_UNSUPPORTED' };
  }

  const eventLocationPackageRejection = /(?:(?:event|candidate).{0,180}(?:location|venue|address|coordinate)|(?:location|venue|address|coordinate).{0,180}(?:event|candidate))/i.test(evidence);
  if (eventLocationPackageRejection) {
    return {
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'EVENT_LOCATION_PACKAGE_REJECTION',
    };
  }

  const result = codexAffiliateIngestionResultSchema.safeParse(
    recordValue(input.resultSummary).result,
  );
  const manualLogoReview = result.success
    && result.data.status === 'REVIEW_REQUIRED'
    && result.data.logoDisposition === 'MANUAL_REVIEW'
    && /(?:official\s+logo|logoDisposition|manual[_ -]?review|brand(?:ing)?\s+(?:asset|mark|evidence))/i.test(evidence);
  if (manualLogoReview) {
    return {
      eligible: true,
      reason: 'producer-repair-required',
      repairReason: 'MANUAL_LOGO_REVIEW',
    };
  }

  return { eligible: false, reason: 'unrelated-producer-defect', repairReason: null };
};
