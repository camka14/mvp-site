import { createHash } from 'node:crypto';

type GoldCapturePage = {
  url: string;
  role: string;
};

export type GoldCaptureEvidencePage = {
  id: string;
  intakeId: string;
  role: string;
  robotsStatus: string;
  robotsNotes?: string | null;
};

export type GoldCaptureEvidenceArtifact = {
  pageId: string | null;
  runId: string;
  kind: string;
  provider: string | null;
  sizeBytes: number | null;
  storageReady: boolean;
};

export type GoldCaptureCohortExample = {
  sourceKey: string;
  scenarioIntent: string;
  requiredCapturePages: GoldCapturePage[];
};

export type GoldCaptureCohortProposal = {
  schemaVersion: 1;
  cohortId: string;
  repositoryCommit: string;
  inventorySha256: string;
  proposalSha256: string;
  examples: GoldCaptureCohortExample[];
  reservedForLater: unknown[];
  lockedDomainAssignments: unknown[];
  lockedPlatformFamilies: string[];
  summary: Record<string, unknown>;
  deficits: string[];
  readyToLock: boolean;
};

export type GoldCaptureCohortLock = {
  schemaVersion: 1;
  cohortId: string;
  proposalSha256: string;
  repositoryCommit: string;
  approvedByUserId: string;
  lockedAt: string;
  domainAssignments: unknown[];
  platformFamilies: string[];
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
};

const stableSha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(stableValue(value)))
  .digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const proposalBody = (proposal: GoldCaptureCohortProposal) => ({
  repositoryCommit: proposal.repositoryCommit,
  inventorySha256: proposal.inventorySha256,
  examples: proposal.examples,
  reservedForLater: proposal.reservedForLater,
  lockedDomainAssignments: proposal.lockedDomainAssignments,
  lockedPlatformFamilies: proposal.lockedPlatformFamilies,
  summary: proposal.summary,
  deficits: proposal.deficits,
});

export const assertLockedGoldCaptureCohort = (
  proposalValue: unknown,
  lockValue: unknown,
): {
  proposal: GoldCaptureCohortProposal;
  lock: GoldCaptureCohortLock;
} => {
  if (!isRecord(proposalValue) || !isRecord(lockValue)) {
    throw new Error('Gold capture proposal and lock must be JSON objects.');
  }
  const proposal = proposalValue as GoldCaptureCohortProposal;
  const lock = lockValue as GoldCaptureCohortLock;
  if (
    proposal.schemaVersion !== 1
    || typeof proposal.cohortId !== 'string'
    || typeof proposal.repositoryCommit !== 'string'
    || typeof proposal.inventorySha256 !== 'string'
    || typeof proposal.proposalSha256 !== 'string'
    || !Array.isArray(proposal.examples)
    || !Array.isArray(proposal.reservedForLater)
    || !Array.isArray(proposal.lockedDomainAssignments)
    || !Array.isArray(proposal.lockedPlatformFamilies)
    || !isRecord(proposal.summary)
    || !Array.isArray(proposal.deficits)
    || typeof proposal.readyToLock !== 'boolean'
  ) {
    throw new Error('Gold capture proposal is missing required fields.');
  }
  for (const example of proposal.examples) {
    if (
      !isRecord(example)
      || typeof example.sourceKey !== 'string'
      || typeof example.scenarioIntent !== 'string'
      || !Array.isArray(example.requiredCapturePages)
      || example.requiredCapturePages.some((page) => (
        !isRecord(page)
        || typeof page.url !== 'string'
        || typeof page.role !== 'string'
      ))
    ) {
      throw new Error('Gold capture proposal contains an invalid example.');
    }
  }
  const expectedProposalSha256 = stableSha256(proposalBody(proposal));
  if (proposal.proposalSha256 !== expectedProposalSha256) {
    throw new Error('Gold capture proposal hash does not match its contents.');
  }
  const expectedCohortId = `affiliate-mapping-test-${expectedProposalSha256.slice(0, 16)}`;
  if (proposal.cohortId !== expectedCohortId) {
    throw new Error('Gold capture cohort id does not match the proposal hash.');
  }
  if (!proposal.readyToLock || proposal.deficits.length) {
    throw new Error('Gold capture proposal is not ready to lock.');
  }
  if (
    lock.schemaVersion !== 1
    || lock.cohortId !== proposal.cohortId
    || lock.proposalSha256 !== proposal.proposalSha256
    || lock.repositoryCommit !== proposal.repositoryCommit
    || typeof lock.approvedByUserId !== 'string'
    || !lock.approvedByUserId.trim()
    || lock.approvedByUserId.includes('@')
    || typeof lock.lockedAt !== 'string'
    || Number.isNaN(Date.parse(lock.lockedAt))
    || !Array.isArray(lock.domainAssignments)
    || !Array.isArray(lock.platformFamilies)
  ) {
    throw new Error('Gold capture lock does not match the approved proposal.');
  }
  if (
    stableSha256(lock.domainAssignments) !== stableSha256(proposal.lockedDomainAssignments)
    || stableSha256(lock.platformFamilies) !== stableSha256(proposal.lockedPlatformFamilies)
  ) {
    throw new Error('Gold capture lock assignments do not match the approved proposal.');
  }
  return { proposal, lock };
};

export const planGoldCaptureBatches = (
  pages: GoldCapturePage[],
  maximumPages = 10,
): GoldCapturePage[][] => {
  if (!Number.isInteger(maximumPages) || maximumPages < 1) {
    throw new Error('Gold capture batch size must be a positive integer.');
  }
  const batches: GoldCapturePage[][] = [];
  for (let index = 0; index < pages.length; index += maximumPages) {
    batches.push(pages.slice(index, index + maximumPages));
  }
  return batches;
};

export const DEFAULT_GOLD_CAPTURE_MAX_ATTEMPTS = 3;

export const resolveGoldCaptureMaxAttempts = (
  value?: string,
): number => {
  if (value === undefined) return DEFAULT_GOLD_CAPTURE_MAX_ATTEMPTS;
  const maximumAttempts = Number.parseInt(value, 10);
  if (
    !Number.isInteger(maximumAttempts)
    || maximumAttempts < 1
    || String(maximumAttempts) !== value.trim()
  ) {
    throw new Error('Gold capture maximum attempts must be a positive integer.');
  }
  return maximumAttempts;
};

export const pageHasCurrentGoldCaptureEvidence = (
  page: GoldCaptureEvidencePage,
  artifacts: GoldCaptureEvidenceArtifact[],
  successfulRunIds: Set<string>,
  provider = 'SCRAPINGDOG',
): boolean => {
  const pageArtifacts = artifacts.filter((artifact) => (
    artifact.pageId === page.id
    && (artifact.sizeBytes ?? 0) > 0
    && artifact.storageReady
  ));
  if (page.robotsStatus === 'DISALLOWED') {
    return pageArtifacts.some((artifact) => artifact.kind === 'ROBOTS');
  }
  if (page.role === 'REGISTRATION' && pageArtifacts.some((artifact) => (
    artifact.kind === 'PAGE_ACCESS_STATUS'
    && artifact.provider === 'DIRECT'
    && successfulRunIds.has(artifact.runId)
  ))) {
    return true;
  }
  return pageArtifacts.some((artifact) => (
    (artifact.kind === 'PAGE_HTML' || artifact.kind === 'PAGE_MARKDOWN')
    && artifact.provider === provider
    && successfulRunIds.has(artifact.runId)
  ));
};

export const goldCapturePageNeedsRobotsReview = (
  page: GoldCaptureEvidencePage,
): boolean => page.robotsStatus === 'UNCLEAR'
  && /certificate|cert_|ssl|tls/i.test(page.robotsNotes ?? '');
