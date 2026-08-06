import { prisma } from '@/lib/prisma';

type JsonRecord = Record<string, unknown>;

type HumanReviewJobRow = {
  id: string;
  intakeId: string;
  status: string;
  updatedAt: Date | string;
  finishedAt?: Date | string | null;
  attemptCount?: number | null;
  errorMessage?: string | null;
  resultSummary?: unknown;
};

type HumanReviewIntakeRow = {
  id: string;
  name: string;
  sourceKey: string;
  region?: string | null;
  baseUrl?: string | null;
  status: string;
  complianceStatus: string;
  selectedLogoArtifactId?: string | null;
};

export type AffiliateMappingHumanReviewRow = {
  jobId: string;
  intakeId: string;
  intakeName: string;
  sourceKey: string;
  region: string | null;
  baseUrl: string | null;
  intakeStatus: string;
  complianceStatus: string;
  attemptCount: number;
  markedAt: string;
  errorMessage: string | null;
  source: string | null;
  requestedNextAction: string | null;
  reasonCodes: string[];
  sourceSportLabels: string[];
  rationale: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
  reviewOwner: AffiliateMappingReviewOwner;
  reviewQuestion: string;
  recommendedAction: string;
};

export type AffiliateMappingReviewOwner = 'USER' | 'MAPPING_AGENT' | 'SYSTEM';

type ReviewGuidance = Pick<
  AffiliateMappingHumanReviewRow,
  'reviewOwner' | 'reviewQuestion' | 'recommendedAction'
>;

const reviewDb = () => ({
  jobs: (prisma as any).affiliateSourceMappingJobs,
  intakes: (prisma as any).affiliateSourceIntakes,
});

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map(stringValue).filter((entry): entry is string => Boolean(entry))))
    : []
);

const isoValue = (value: Date | string | null | undefined): string => {
  const parsed = value instanceof Date ? value : new Date(value ?? 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
};

const producerRepairReasonCodes = new Set([
  'LIVE_SETUP_UNSUPPORTED',
  'EVENT_LOCATION_INVALID',
  'ORGANIZATION_LOCATION_INVALID',
  'SPORT_NAME_INVALID',
  'EVENT_DIVISION_GROUPING_INVALID',
  'EVENT_DIVISION_CLASSIFICATION_INVALID',
  'EVENT_PRICING_INVALID',
  'EVENT_CAPACITY_INVALID',
  'EVENT_DESCRIPTION_INVALID',
  'ORGANIZATION_DESCRIPTION_INVALID',
  'OFFICIAL_LOGO_REPAIR_REQUIRED',
  'PACKAGE_VALIDATION_FAILED',
  'DUPLICATE_SAFETY_INVALID',
  'OTHER_PRODUCER_DEFECT',
]);

const producerHandoffPattern = /(?:(?:producer|package[- ]evidence|exact[- ]commit|producer-workspace|repository|commit).{0,160}(?:unavailable|inaccessible|missing|cannot|could not|not resolve|not reachable)|(?:unavailable|inaccessible|missing|cannot|could not|not resolve|not reachable).{0,160}(?:producer|package[- ]evidence|exact[- ]commit|producer-workspace|repository|commit))/i;

export const affiliateMappingReviewGuidance = (input: {
  requestedNextAction?: string | null;
  reasonCodes?: string[];
  rationale?: string | null;
  blockingIssues?: string[];
  errorMessage?: string | null;
}): ReviewGuidance => {
  const reasonCodes = input.reasonCodes ?? [];
  const evidence = [
    input.rationale,
    ...(input.blockingIssues ?? []),
    input.errorMessage,
  ].filter((value): value is string => Boolean(value)).join(' ');

  if (producerHandoffPattern.test(evidence)) {
    return {
      reviewOwner: 'SYSTEM',
      reviewQuestion: 'Can the producer package and exact-commit evidence handoff be restored?',
      recommendedAction: 'Repair the producer workspace or commit handoff, then return this job to review. Do not judge the source content yet.',
    };
  }

  const substantiveReasonCodes = reasonCodes.filter((reasonCode) => reasonCode !== 'RETRY_LIMIT_EXCEEDED');
  const logoAbsenceOnly = substantiveReasonCodes.length > 0
    && substantiveReasonCodes.every((reasonCode) => reasonCode === 'NO_VERIFIABLE_OFFICIAL_LOGO');
  if (logoAbsenceOnly) {
    return {
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'Can this mapping proceed with no official logo?',
      recommendedAction: 'Accept the missing logo and return the package to automated review. A missing logo alone must not block the mapping.',
    };
  }

  const hasProducerRepair = input.requestedNextAction === 'PRODUCER_REPAIR'
    || reasonCodes.some((reasonCode) => producerRepairReasonCodes.has(reasonCode));
  if (hasProducerRepair) {
    return {
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'What must the mapping agent repair before this package can pass review?',
      recommendedAction: 'Use the reason codes and blocking issues as repair instructions, then return the corrected package to review.',
    };
  }

  if (reasonCodes.includes('CONFLICTING_LIVE_RECORD')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Is this source the same as the conflicting live record, or should both records remain separate?',
      recommendedAction: 'Compare the source identity with the live record. Choose whether to merge, replace, keep separate, or stop this source.',
    };
  }

  if (reasonCodes.includes('SPORT_NOT_IN_CATALOG')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Should this sport be added to the BracketIQ sports catalog?',
      recommendedAction: 'Review the source sport below. Add a fully configured canonical sport only when BracketIQ should support it; otherwise leave this mapping stopped.',
    };
  }

  if (reasonCodes.includes('RETRY_LIMIT_EXCEEDED')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Should this source receive another repair attempt, or should automatic retries stop?',
      recommendedAction: 'Review the last failure below. Requeue only when the failure is repairable; otherwise leave it stopped for a later manual check.',
    };
  }

  if (reasonCodes.includes('INSUFFICIENT_STORED_EVIDENCE')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Is there another official public page or stored capture that proves this source identity?',
      recommendedAction: 'Provide or capture the missing first-party evidence. Stop the source if no reliable evidence is available.',
    };
  }

  return {
    reviewOwner: 'USER',
    reviewQuestion: 'Should this source be repaired and retried, or should it remain stopped for manual review?',
    recommendedAction: 'Use the recorded concern below to choose whether to retry, supply evidence, or stop this source.',
  };
};

export const listAffiliateMappingHumanReviewJobs = async (
  options: { limit?: number } = {},
): Promise<AffiliateMappingHumanReviewRow[]> => {
  const requestedLimit = Number.isFinite(options.limit) ? Number(options.limit) : 250;
  const limit = Math.max(1, Math.min(250, Math.trunc(requestedLimit)));
  const { jobs, intakes } = reviewDb();
  const jobRows: HumanReviewJobRow[] = await jobs.findMany({
    where: { status: 'HUMAN_REVIEW_REQUIRED' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      intakeId: true,
      status: true,
      updatedAt: true,
      finishedAt: true,
      attemptCount: true,
      errorMessage: true,
      resultSummary: true,
    },
  });
  if (!jobRows.length) return [];

  const intakeRows: HumanReviewIntakeRow[] = await intakes.findMany({
    where: { id: { in: Array.from(new Set(jobRows.map((job) => job.intakeId))) } },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      region: true,
      baseUrl: true,
      status: true,
      complianceStatus: true,
      selectedLogoArtifactId: true,
    },
  });
  const intakeById = new Map(intakeRows.map((intake) => [intake.id, intake]));

  return jobRows.map((job) => {
    const intake = intakeById.get(job.intakeId);
    const humanReview = recordValue(recordValue(job.resultSummary).humanReviewRequired);
    const reasonCodes = stringValues(humanReview.reasonCodes);
    const rationale = stringValue(humanReview.rationale);
    const blockingIssues = stringValues(humanReview.blockingIssues);
    const errorMessage = stringValue(job.errorMessage);
    const requestedNextAction = stringValue(humanReview.requestedNextAction);
    const sourceSportLabels = stringValues(humanReview.sourceSportLabels);
    const guidance = affiliateMappingReviewGuidance({
      requestedNextAction,
      reasonCodes,
      rationale,
      blockingIssues,
      errorMessage,
    });
    return {
      jobId: job.id,
      intakeId: job.intakeId,
      intakeName: intake?.name ?? 'Missing intake',
      sourceKey: intake?.sourceKey ?? job.intakeId,
      region: stringValue(intake?.region),
      baseUrl: stringValue(intake?.baseUrl),
      intakeStatus: intake?.status ?? 'MISSING',
      complianceStatus: intake?.complianceStatus ?? 'UNKNOWN',
      attemptCount: typeof job.attemptCount === 'number' ? job.attemptCount : 0,
      markedAt: isoValue(stringValue(humanReview.markedAt) ?? job.finishedAt ?? job.updatedAt),
      errorMessage,
      source: stringValue(humanReview.source),
      requestedNextAction,
      reasonCodes,
      sourceSportLabels,
      rationale,
      blockingIssues,
      hasSelectedLogo: Boolean(intake?.selectedLogoArtifactId),
      ...guidance,
    };
  });
};
