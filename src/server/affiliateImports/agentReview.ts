import { spawn } from 'node:child_process';
import {
  affiliateMappingReviewSchema,
  affiliateMappingWorkerResultSchema,
  stableAgentArtifactSha256,
  type AffiliateMappingReview,
  type AffiliateMappingWorkerResult,
} from './agentContracts';

export type AffiliateMappingReviewerInput = {
  schemaVersion: 1;
  workerResult: AffiliateMappingWorkerResult;
  scopedDiff: string;
  validationTranscripts: Array<{
    name: string;
    passed: boolean;
    output: string;
  }>;
  evidenceExcerpts: Array<{
    artifactSha256: string;
    artifactKind: string;
    pageUrl: string;
    content: string;
  }>;
  normalizedCandidateSamples: Array<Record<string, unknown>>;
  checklist: string[];
  authorityNotice: string;
};

export interface AffiliateMappingReviewer {
  review(input: AffiliateMappingReviewerInput): Promise<unknown>;
}

export class FixtureAffiliateMappingReviewer implements AffiliateMappingReviewer {
  constructor(private readonly reviewResult: unknown) {}

  async review(): Promise<unknown> {
    return this.reviewResult;
  }
}

const sensitiveKeyPattern = /(?:authorization|cookie|password|secret|token|database[_-]?url|payment|card)/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const signedQueryPattern = /([?&](?:x-amz-(?:signature|credential)|signature|sig|token|api[_-]?key)=)[^&#\s]+/gi;

const redactReviewerString = (value: string): string => value
  .replace(bearerPattern, 'Bearer [REDACTED]')
  .replace(signedQueryPattern, '$1[REDACTED]')
  .replace(emailPattern, '[REDACTED_EMAIL]')
  .replace(phonePattern, '[REDACTED_PHONE]');

export const redactAffiliateReviewerPayload = (value: unknown): unknown => {
  if (typeof value === 'string') return redactReviewerString(value);
  if (Array.isArray(value)) return value.map(redactAffiliateReviewerPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? '[REDACTED]'
          : redactAffiliateReviewerPayload(nested),
      ]),
    );
  }
  return value;
};

const boundedText = (value: string, limit: number, label: string): string => {
  const byteLength = Buffer.byteLength(value, 'utf8');
  if (byteLength > limit) throw new Error(`${label} exceeds the ${limit} byte reviewer limit.`);
  return value;
};

export const buildAffiliateReviewerInput = (input: {
  workerResult: unknown;
  scopedDiff: string;
  validationTranscripts: AffiliateMappingReviewerInput['validationTranscripts'];
  evidenceExcerpts: AffiliateMappingReviewerInput['evidenceExcerpts'];
  normalizedCandidateSamples: AffiliateMappingReviewerInput['normalizedCandidateSamples'];
}): AffiliateMappingReviewerInput => {
  const workerResult = affiliateMappingWorkerResultSchema.parse(input.workerResult);
  const payload: AffiliateMappingReviewerInput = {
    schemaVersion: 1,
    workerResult,
    scopedDiff: boundedText(input.scopedDiff, 512 * 1024, 'Scoped diff'),
    validationTranscripts: input.validationTranscripts.slice(0, 20).map((transcript) => ({
      name: transcript.name,
      passed: transcript.passed,
      output: boundedText(transcript.output, 64 * 1024, `Validation transcript ${transcript.name}`),
    })),
    evidenceExcerpts: input.evidenceExcerpts.slice(0, 30).map((excerpt) => ({
      ...excerpt,
      content: boundedText(excerpt.content, 128 * 1024, `Evidence excerpt ${excerpt.artifactSha256}`),
    })),
    normalizedCandidateSamples: input.normalizedCandidateSamples.slice(0, 25),
    checklist: [
      'source policy and robots disposition',
      'listing kind and implementation mode',
      'artifact-backed official URLs and scheduled dates',
      'publish-critical venue, address, city, pricing, divisions, and tags',
      'official logo provenance without generated organization branding',
      'mapping schema, dedupe behavior, setup idempotence, and file scope',
      'candidate results, duplicate safety, and withheld rows',
    ],
    authorityNotice: (
      'This is a recommendation only. Do not publish candidates, enable scraping, '
      + 'validate mappings, push code, or mutate any database.'
    ),
  };
  return redactAffiliateReviewerPayload(payload) as AffiliateMappingReviewerInput;
};

export const reviewAffiliateMappingWorkerResult = async (input: {
  reviewer: AffiliateMappingReviewer;
  reviewerInput: AffiliateMappingReviewerInput;
}): Promise<AffiliateMappingReview> => {
  const workerResultSha256 = stableAgentArtifactSha256(input.reviewerInput.workerResult);
  const rawReview = await input.reviewer.review(input.reviewerInput);
  const review = affiliateMappingReviewSchema.parse(rawReview);
  if (review.jobId !== input.reviewerInput.workerResult.jobId) {
    throw new Error('Reviewer result job id does not match the worker result.');
  }
  if (review.workerResultSha256 !== workerResultSha256) {
    throw new Error('Reviewer result hash does not match the reviewed worker result.');
  }
  if (
    review.outcome === 'APPROVE_RECOMMENDATION'
    && (
      !input.reviewerInput.workerResult.validation.schemaPassed
      || !input.reviewerInput.workerResult.validation.testsPassed
      || !input.reviewerInput.workerResult.validation.scrapePassed
    )
  ) {
    throw new Error('Reviewer cannot recommend approval before schema, tests, and review scrape pass.');
  }
  return review;
};

export class StdioAffiliateMappingReviewer implements AffiliateMappingReviewer {
  constructor(private readonly options: {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
  }) {}

  async review(input: AffiliateMappingReviewerInput): Promise<unknown> {
    const timeoutMs = this.options.timeoutMs ?? 10 * 60 * 1000;
    const maxOutputBytes = this.options.maxOutputBytes ?? 2 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.executable, this.options.args, {
        cwd: this.options.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Reviewer command exceeded ${timeoutMs} ms.`));
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          child.kill('SIGTERM');
          clearTimeout(timer);
          reject(new Error(`Reviewer output exceeds ${maxOutputBytes} bytes.`));
          return;
        }
        stdout.push(Buffer.from(chunk));
      });
      child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(
            `Reviewer command exited ${code}: ${Buffer.concat(stderr).toString('utf8').slice(0, 4000)}`,
          ));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
        } catch {
          reject(new Error('Reviewer command did not return one JSON review object.'));
        }
      });
      child.stdin.end(`${JSON.stringify(input)}\n`);
    });
  }
}

export type AffiliateMappingHumanDisposition =
  | 'APPROVE_WORKER'
  | 'APPROVE_CORRECTION'
  | 'REJECT';

export type AffiliateMappingTeachingSignal = {
  schemaVersion: 1;
  jobId: string;
  disposition: AffiliateMappingHumanDisposition;
  workerResultSha256: string;
  reviewSha256: string;
  approvedDraftSha256: string | null;
  approvedByUserId: string;
  approvedAt: string;
  eligibleForDatasetReview: boolean;
  rejectionReason: string | null;
};

export const createAffiliateMappingTeachingSignal = (input: {
  workerResult: unknown;
  review: unknown;
  disposition: AffiliateMappingHumanDisposition;
  approvedByUserId: string;
  approvedAt: Date;
  rejectionReason?: string | null;
}): AffiliateMappingTeachingSignal => {
  const workerResult = affiliateMappingWorkerResultSchema.parse(input.workerResult);
  const review = affiliateMappingReviewSchema.parse(input.review);
  if (review.jobId !== workerResult.jobId) {
    throw new Error('Human disposition inputs refer to different jobs.');
  }
  const approvedDraft = input.disposition === 'APPROVE_CORRECTION'
    ? review.correctedDraft
    : input.disposition === 'APPROVE_WORKER'
      ? workerResult.draft
      : null;
  if (input.disposition === 'APPROVE_CORRECTION' && !review.correctedDraft) {
    throw new Error('APPROVE_CORRECTION requires a structured corrected draft.');
  }
  if (input.disposition !== 'REJECT' && !approvedDraft) {
    throw new Error('An approved teaching signal requires an approved draft.');
  }
  const rejectionReason = input.rejectionReason?.trim() || null;
  if (input.disposition === 'REJECT' && !rejectionReason) {
    throw new Error('Rejected teaching signals require a reason.');
  }
  return {
    schemaVersion: 1,
    jobId: workerResult.jobId,
    disposition: input.disposition,
    workerResultSha256: stableAgentArtifactSha256(workerResult),
    reviewSha256: stableAgentArtifactSha256(review),
    approvedDraftSha256: approvedDraft ? stableAgentArtifactSha256(approvedDraft) : null,
    approvedByUserId: input.approvedByUserId.trim(),
    approvedAt: input.approvedAt.toISOString(),
    eligibleForDatasetReview: input.disposition !== 'REJECT',
    rejectionReason,
  };
};
