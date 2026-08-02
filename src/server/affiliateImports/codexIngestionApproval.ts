import path from 'node:path';
import {
  codexAffiliateIngestionResultSchema,
  type CodexAffiliateIngestionResult,
} from './codexIngestionResult';

export type AffiliateMappingApprovalJob = {
  id: string;
  intakeId: string;
  status: string;
  resultSummary: unknown;
};

export type AffiliateMappingLiveApprovalCandidate = {
  jobId: string;
  intakeId: string;
  setupScript: string;
  result: CodexAffiliateIngestionResult;
  resultEnvelope: Record<string, unknown>;
};

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export const affiliateSourceMatchesIntakeEvidence = (
  metadata: unknown,
  input: { intakeId: string; intakeSourceKey: string },
): boolean => {
  const sourceEvidence = recordValue(recordValue(metadata).sourceEvidence);
  return sourceEvidence.intakeId === input.intakeId
    || sourceEvidence.intakeSourceKey === input.intakeSourceKey;
};

export const selectAffiliateMappingLiveApprovalCandidates = (
  jobs: AffiliateMappingApprovalJob[],
): {
  approvable: AffiliateMappingLiveApprovalCandidate[];
  manualReview: AffiliateMappingLiveApprovalCandidate[];
} => {
  const approvable: AffiliateMappingLiveApprovalCandidate[] = [];
  const manualReview: AffiliateMappingLiveApprovalCandidate[] = [];

  for (const job of jobs) {
    if (job.status !== 'REVIEW_REQUIRED') continue;
    const resultEnvelope = recordValue(job.resultSummary);
    const result = codexAffiliateIngestionResultSchema.parse(resultEnvelope.result);
    if (result.jobId !== job.id || result.intakeId !== job.intakeId) {
      throw new Error(`Mapping job ${job.id} result identity does not match its live row.`);
    }
    const setupPaths = result.generatedPaths.filter((generatedPath) => (
      /^scripts\/setup-[a-z0-9-]+-affiliate-source\.ts$/.test(generatedPath)
    ));
    if (setupPaths.length !== 1) {
      throw new Error(`Mapping job ${job.id} must name exactly one source setup script.`);
    }
    const candidate = {
      jobId: job.id,
      intakeId: job.intakeId,
      setupScript: setupPaths[0],
      result,
      resultEnvelope,
    };
    if (result.logoDisposition === 'MANUAL_REVIEW') {
      manualReview.push(candidate);
    }
    approvable.push(candidate);
  }

  return { approvable, manualReview };
};

export const resolveApprovedAffiliateSetupScript = (
  repositoryRoot: string,
  setupScript: string,
): string => {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, setupScript);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Setup script escapes the repository: ${setupScript}`);
  }
  return resolved;
};
