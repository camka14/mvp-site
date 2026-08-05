import { codexAffiliateIngestionResultSchema } from './codexIngestionResult';
import { hasAffiliateProducerHandoffBlocker } from './approvalHandoffRetry';

type JsonRecord = Record<string, unknown>;

export const MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS = 3;

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
  | 'ORGANIZATION_LOCATION_INVALID'
  | 'SPORT_NAME_INVALID'
  | 'MANUAL_LOGO_REVIEW'
  | 'EVENT_DIVISION_GROUPING_INVALID'
  | 'EVENT_DIVISION_CLASSIFICATION_INVALID'
  | 'EVENT_PRICING_INVALID'
  | 'EVENT_CAPACITY_INVALID'
  | 'EVENT_DESCRIPTION_INVALID'
  | 'ORGANIZATION_DESCRIPTION_INVALID'
  | 'PACKAGE_VALIDATION_FAILED'
  | 'DUPLICATE_SAFETY_INVALID'
  | 'OTHER_PRODUCER_DEFECT';

export type AffiliateMappingTerminalDisposition =
  | 'PRODUCER_REPAIR'
  | 'REVIEWER_RETRY'
  | 'HUMAN_REVIEW_REQUIRED'
  | null;

export type AffiliateMappingProducerRepairEligibility = {
  eligible: boolean;
  reason: string;
  repairReason: AffiliateMappingProducerRepairReason | null;
  disposition: AffiliateMappingTerminalDisposition;
  reasonCodes: string[];
};

const producerRepair = (
  repairReason: AffiliateMappingProducerRepairReason,
  reasonCodes: string[] = [repairReason],
): AffiliateMappingProducerRepairEligibility => ({
  eligible: true,
  reason: 'producer-repair-required',
  repairReason,
  disposition: 'PRODUCER_REPAIR',
  reasonCodes,
});

const humanReview = (
  reason: string,
  reasonCodes: string[],
): AffiliateMappingProducerRepairEligibility => ({
  eligible: false,
  reason,
  repairReason: null,
  disposition: 'HUMAN_REVIEW_REQUIRED',
  reasonCodes,
});

const reviewerRetry = (
  reason: string,
): AffiliateMappingProducerRepairEligibility => ({
  eligible: false,
  reason,
  repairReason: null,
  disposition: 'REVIEWER_RETRY',
  reasonCodes: ['NO_VERIFIABLE_OFFICIAL_LOGO'],
});

const ignored = (reason: string): AffiliateMappingProducerRepairEligibility => ({
  eligible: false,
  reason,
  repairReason: null,
  disposition: null,
  reasonCodes: [],
});

const structuredRepairReason = (reasonCodes: string[]): AffiliateMappingProducerRepairReason => {
  if (reasonCodes.includes('LIVE_SETUP_UNSUPPORTED')) return 'LIVE_SETUP_UNSUPPORTED';
  if (reasonCodes.includes('EVENT_LOCATION_INVALID')) return 'EVENT_LOCATION_PACKAGE_REJECTION';
  if (reasonCodes.includes('ORGANIZATION_LOCATION_INVALID')) return 'ORGANIZATION_LOCATION_INVALID';
  if (reasonCodes.includes('SPORT_NAME_INVALID')) return 'SPORT_NAME_INVALID';
  if (reasonCodes.includes('OFFICIAL_LOGO_REPAIR_REQUIRED')) return 'MANUAL_LOGO_REVIEW';
  if (reasonCodes.includes('EVENT_DIVISION_GROUPING_INVALID')) return 'EVENT_DIVISION_GROUPING_INVALID';
  if (reasonCodes.includes('EVENT_DIVISION_CLASSIFICATION_INVALID')) return 'EVENT_DIVISION_CLASSIFICATION_INVALID';
  if (reasonCodes.includes('EVENT_PRICING_INVALID')) return 'EVENT_PRICING_INVALID';
  if (reasonCodes.includes('EVENT_CAPACITY_INVALID')) return 'EVENT_CAPACITY_INVALID';
  if (reasonCodes.includes('EVENT_DESCRIPTION_INVALID')) return 'EVENT_DESCRIPTION_INVALID';
  if (reasonCodes.includes('ORGANIZATION_DESCRIPTION_INVALID')) return 'ORGANIZATION_DESCRIPTION_INVALID';
  if (reasonCodes.includes('DUPLICATE_SAFETY_INVALID')) return 'DUPLICATE_SAFETY_INVALID';
  if (reasonCodes.includes('PACKAGE_VALIDATION_FAILED')) return 'PACKAGE_VALIDATION_FAILED';
  return 'OTHER_PRODUCER_DEFECT';
};

export const affiliateMappingProducerRepairEligibility = (input: {
  approvalStatus: unknown;
  approvalDecision: unknown;
  mappingStatus: unknown;
  mappingErrorMessage?: unknown;
  resultSummary?: unknown;
}): AffiliateMappingProducerRepairEligibility => {
  if (!['REJECTED', 'DEFERRED'].includes(String(input.approvalStatus))) {
    return ignored('approval-not-terminal');
  }
  const envelope = recordValue(input.resultSummary);
  const result = codexAffiliateIngestionResultSchema.safeParse(envelope.result);
  const hasManualLogoResult = result.success
    && result.data.status === 'REVIEW_REQUIRED'
    && result.data.logoDisposition === 'MANUAL_REVIEW';
  if (input.mappingStatus === 'HUMAN_REVIEW_REQUIRED') {
    const humanReviewRequired = recordValue(envelope.humanReviewRequired);
    const reasonCodes = stringValues(humanReviewRequired.reasonCodes);
    if (
      hasManualLogoResult
      && reasonCodes.length > 0
      && reasonCodes.every((reasonCode) => reasonCode === 'NO_VERIFIABLE_OFFICIAL_LOGO')
    ) {
      return reviewerRetry('logo-absence-policy-changed');
    }
    return humanReview(
      'already-human-review-required',
      reasonCodes.length ? reasonCodes : ['UNCLASSIFIED_TERMINAL_FAILURE'],
    );
  }
  const terminalPair = (
    (input.approvalStatus === 'REJECTED' && input.mappingStatus === 'FAILED')
    || (input.approvalStatus === 'DEFERRED' && input.mappingStatus === 'REVIEW_REQUIRED')
  );
  if (!terminalPair) return ignored('mapping-not-terminal-for-approval');

  const decision = recordValue(input.approvalDecision);
  const mappingDisposition = recordValue(decision.mappingDisposition);
  const structuredNextAction = stringValues(mappingDisposition.nextAction)[0] ?? null;
  const structuredReasonCodes = stringValues(mappingDisposition.reasonCodes);
  if (structuredNextAction === 'HUMAN_REVIEW_REQUIRED') {
    if (
      hasManualLogoResult
      && structuredReasonCodes.length > 0
      && structuredReasonCodes.every((reasonCode) => reasonCode === 'NO_VERIFIABLE_OFFICIAL_LOGO')
    ) {
      return reviewerRetry('logo-absence-policy-changed');
    }
    return humanReview(
      'reviewer-human-review-required',
      structuredReasonCodes.length ? structuredReasonCodes : ['UNCLASSIFIED_TERMINAL_FAILURE'],
    );
  }
  if (structuredNextAction === 'PRODUCER_REPAIR') {
    return producerRepair(
      structuredRepairReason(structuredReasonCodes),
      structuredReasonCodes.length ? structuredReasonCodes : ['OTHER_PRODUCER_DEFECT'],
    );
  }
  const currentMappingFailure = stringValues(input.mappingErrorMessage).join(' ');
  if (!currentMappingFailure && hasAffiliateProducerHandoffBlocker(input.approvalDecision)) {
    return ignored('reviewer-handoff-retry-required');
  }

  const embeddedReview = recordValue(envelope.approvalReview);
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
    return humanReview('rejection-reason-missing', ['INSUFFICIENT_STORED_EVIDENCE']);
  }

  const skippedExistingProducerRepair = /skipped\s+already-finished\s+intake.{0,240}(?:already\s+represented|existing).{0,160}package/i.test(evidence);
  if (skippedExistingProducerRepair) {
    return producerRepair('PACKAGE_VALIDATION_FAILED', [
      'PACKAGE_VALIDATION_FAILED',
      'PRODUCER_REPAIR_SKIPPED_EXISTING_PACKAGE',
    ]);
  }

  const liveSetupUnsupported = /(?:--live.{0,160}(?:refus|unsupported|not support|cannot|does not|prevent)|(?:refus|unsupported|not support|cannot|does not|prevent).{0,160}--live)/i.test(evidence);
  if (liveSetupUnsupported) return producerRepair('LIVE_SETUP_UNSUPPORTED');

  const eventLocationPackageRejection = /(?:(?:event|candidate).{0,180}(?:location|venue|address|coordinate)|(?:location|venue|address|coordinate).{0,180}(?:event|candidate))/i.test(evidence);
  if (eventLocationPackageRejection) {
    return producerRepair('EVENT_LOCATION_PACKAGE_REJECTION', ['EVENT_LOCATION_INVALID']);
  }

  const organizationLocationInvalid = /(?:(?:organization|club|facility).{0,180}(?:location|city|region|address|coordinate)|(?:location|city|region|address|coordinate).{0,180}(?:organization|club|facility))/i.test(evidence);
  if (organizationLocationInvalid) return producerRepair('ORGANIZATION_LOCATION_INVALID');

  const sportNameInvalid = /(?:(?:sport|sportName).{0,160}(?:canonical|catalog|name|case|spelling)|(?:canonical|catalog).{0,160}(?:sport|sportName))/i.test(evidence);
  if (sportNameInvalid) return producerRepair('SPORT_NAME_INVALID');

  const divisionGroupingInvalid = /(?:division.{0,180}(?:group|merge|leak|parent event|event card)|(?:group|merge|leak).{0,180}division)/i.test(evidence);
  if (divisionGroupingInvalid) return producerRepair('EVENT_DIVISION_GROUPING_INVALID');

  const divisionClassificationInvalid = /(?:division.{0,180}(?:classif|gender|age|skill|ratingType|divisionType)|(?:gender|ratingType|divisionType).{0,180}division)/i.test(evidence);
  if (divisionClassificationInvalid) return producerRepair('EVENT_DIVISION_CLASSIFICATION_INVALID');

  const eventPricingInvalid = /(?:(?:event|division).{0,180}(?:price|pricing|fee)|(?:price|pricing|fee).{0,180}(?:event|division))/i.test(evidence);
  if (eventPricingInvalid) return producerRepair('EVENT_PRICING_INVALID');

  const eventCapacityInvalid = /(?:(?:event|division).{0,180}(?:capacity|participant limit)|(?:capacity|participant limit).{0,180}(?:event|division))/i.test(evidence);
  if (eventCapacityInvalid) return producerRepair('EVENT_CAPACITY_INVALID');

  const eventDescriptionInvalid = /(?:(?:event|candidate).{0,180}(?:description|copy).{0,180}(?:listed|found|source|title|repeat|generic|unnatural)|(?:description|copy).{0,180}(?:listed|found|source|title|repeat|generic|unnatural).{0,180}(?:event|candidate))/i.test(evidence);
  if (eventDescriptionInvalid) return producerRepair('EVENT_DESCRIPTION_INVALID');

  const organizationDescriptionInvalid = /(?:(?:organization|club|facility).{0,180}(?:description|copy).{0,180}(?:listed|found|source|name|repeat|generic|unnatural)|(?:description|copy).{0,180}(?:listed|found|source|name|repeat|generic|unnatural).{0,180}(?:organization|club|facility))/i.test(evidence);
  if (organizationDescriptionInvalid) return producerRepair('ORGANIZATION_DESCRIPTION_INVALID');

  const duplicateSafetyInvalid = /(?:duplicate.{0,120}(?:unsafe|safety|candidate|scrape)|(?:unstable|mismatch).{0,120}(?:scrape|hash))/i.test(evidence);
  if (duplicateSafetyInvalid) return producerRepair('DUPLICATE_SAFETY_INVALID');

  const packageValidationFailed = /(?:(?:test|fixture|validation|generated file|commit).{0,160}(?:fail|missing|invalid|unavailable)|(?:fail|missing|invalid|unavailable).{0,160}(?:test|fixture|validation|generated file|commit))/i.test(evidence);
  if (packageValidationFailed) return producerRepair('PACKAGE_VALIDATION_FAILED');

  const noVerifiableOfficialLogo = /(?:no\s+(?:verifiable|verified)\s+official\s+(?:logo|mark|asset)|(?:cannot|could not|unable to).{0,100}(?:verify|identify|find).{0,100}official\s+(?:logo|mark|asset)|manual[_ -]?logo[_ -]?review.{0,100}(?:cannot be resolved|terminally failed)|(?:logo|official mark).{0,160}(?:no stored image asset|no safe official logo asset|terminally failed to prevent looping))/i.test(evidence);
  if (noVerifiableOfficialLogo && hasManualLogoResult) {
    return reviewerRetry('logo-absence-policy-changed');
  }

  const manualLogoReview = hasManualLogoResult
    && /(?:official\s+logo|logoDisposition|manual[_ -]?review|brand(?:ing)?\s+(?:asset|mark|evidence))/i.test(evidence);
  if (manualLogoReview) return reviewerRetry('manual-logo-policy-review');

  if (input.approvalStatus === 'DEFERRED') {
    return humanReview('historical-deferred-evidence-review', ['INSUFFICIENT_STORED_EVIDENCE']);
  }

  return humanReview('unclassified-terminal-failure', ['UNCLASSIFIED_TERMINAL_FAILURE']);
};
