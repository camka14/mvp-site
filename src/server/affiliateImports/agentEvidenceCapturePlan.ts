import {
  assertLockedGoldCaptureCohort,
  type GoldCaptureCohortExample,
} from './agentGoldCaptureCohort';
import {
  affiliatePlatformFamilyForUrl,
  registrableDomainForUrl,
} from './agentDataset';
import {
  assertAffiliateGoldCohortProposalIntegrity,
  type AffiliateGoldCohortCandidate,
  type AffiliateGoldCohortProposal,
} from './agentGoldCohort';
import {
  isAffiliateAgentTargetKind,
  stableAgentArtifactSha256,
} from './agentContracts';

type JsonRecord = Record<string, unknown>;

export type AffiliateEvidenceCapturePlanExample = AffiliateGoldCohortCandidate & {
  scenarioIntent: 'EXECUTABLE_MAPPING' | 'BLOCKED_REFUSAL';
};

export type AffiliateEvidenceCapturePlan = {
  schemaVersion: 1;
  planType: 'TRAINING_EVIDENCE_CAPTURE';
  capturePlanId: string;
  repositoryCommit: string;
  inventorySha256: string;
  heldOutCohortId: string;
  heldOutProposalSha256: string;
  planSha256: string;
  examples: AffiliateEvidenceCapturePlanExample[];
  excluded: Array<{
    sourceId: string;
    sourceKey: string;
    registrableDomain: string;
    reason:
      | 'HELD_OUT_DOMAIN'
      | 'HELD_OUT_PLATFORM_FAMILY'
      | 'HELD_OUT_EVIDENCE_DOMAIN'
      | 'HELD_OUT_EVIDENCE_PLATFORM_FAMILY'
      | 'UNSUPPORTED_TARGET_KIND';
  }>;
  summary: {
    exampleCount: number;
    executableExampleCount: number;
    blockedExampleCount: number;
    registrableDomainCount: number;
    requiredPageCount: number;
    targetKinds: Record<string, number>;
    minimumRealExampleCount: 95;
    preferredRealExampleCount: 120;
    minimumBlockedOrInsufficientExampleCount?: 12;
    preferredExecutableTargetKinds?: {
      EVENT: 60;
      CLUB: 20;
      RENTAL: 15;
    };
    databaseWrites: 0;
    publicRequests: 0;
  };
  deficits: string[];
  readyToCapture: boolean;
  readyForMinimumCorpus: boolean;
};

export type AffiliateEvidenceCaptureApproval = {
  schemaVersion: 1;
  capturePlanId: string;
  planSha256: string;
  repositoryCommit: string;
  approvedByUserId: string;
  approvedAt: string;
};

export type AffiliateEvidenceCaptureSelection = {
  selectionId: string;
  selectionSha256: string;
  repositoryCommit: string;
  approvedByUserId: string;
  examples: GoldCaptureCohortExample[];
};

const recordValue = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const countBy = (values: string[]): Record<string, number> => (
  Object.fromEntries(Array.from(new Set(values)).sort().map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]))
);

const capturePlanBody = (
  plan: Omit<
    AffiliateEvidenceCapturePlan,
    'schemaVersion' | 'capturePlanId' | 'planSha256' | 'readyToCapture' | 'readyForMinimumCorpus'
  >,
) => plan;

export const buildAffiliateEvidenceCapturePlan = (input: {
  candidates: AffiliateGoldCohortCandidate[];
  heldOutProposal: AffiliateGoldCohortProposal;
  repositoryCommit: string;
  inventorySha256: string;
}): AffiliateEvidenceCapturePlan => {
  assertAffiliateGoldCohortProposalIntegrity(input.heldOutProposal);
  const repositoryCommit = input.repositoryCommit.trim();
  const inventorySha256 = input.inventorySha256.trim();
  if (!repositoryCommit) throw new Error('Capture plan repository commit is required.');
  if (!inventorySha256) throw new Error('Capture plan inventory hash is required.');

  const heldOutDomains = new Set(
    input.heldOutProposal.lockedDomainAssignments.map((row) => row.registrableDomain),
  );
  const heldOutPlatformFamilies = new Set(input.heldOutProposal.lockedPlatformFamilies);
  const excluded: AffiliateEvidenceCapturePlan['excluded'] = [];
  const examples = input.candidates.flatMap((candidate): AffiliateEvidenceCapturePlanExample[] => {
    if (!isAffiliateAgentTargetKind(candidate.targetKind)) {
      excluded.push({
        sourceId: candidate.sourceId,
        sourceKey: candidate.sourceKey,
        registrableDomain: candidate.registrableDomain,
        reason: 'UNSUPPORTED_TARGET_KIND',
      });
      return [];
    }
    if (heldOutDomains.has(candidate.registrableDomain)) {
      excluded.push({
        sourceId: candidate.sourceId,
        sourceKey: candidate.sourceKey,
        registrableDomain: candidate.registrableDomain,
        reason: 'HELD_OUT_DOMAIN',
      });
      return [];
    }
    if (
      candidate.platformFamily
      && heldOutPlatformFamilies.has(candidate.platformFamily)
    ) {
      excluded.push({
        sourceId: candidate.sourceId,
        sourceKey: candidate.sourceKey,
        registrableDomain: candidate.registrableDomain,
        reason: 'HELD_OUT_PLATFORM_FAMILY',
      });
      return [];
    }
    const heldOutEvidenceDomain = candidate.requiredCapturePages
      .map((page) => registrableDomainForUrl(page.url))
      .find((domain): domain is string => Boolean(domain && heldOutDomains.has(domain)));
    if (heldOutEvidenceDomain) {
      excluded.push({
        sourceId: candidate.sourceId,
        sourceKey: candidate.sourceKey,
        registrableDomain: candidate.registrableDomain,
        reason: 'HELD_OUT_EVIDENCE_DOMAIN',
      });
      return [];
    }
    const heldOutEvidencePlatformFamily = candidate.requiredCapturePages
      .map((page) => affiliatePlatformFamilyForUrl(page.url))
      .find((family): family is string => Boolean(
        family && heldOutPlatformFamilies.has(family),
      ));
    if (heldOutEvidencePlatformFamily) {
      excluded.push({
        sourceId: candidate.sourceId,
        sourceKey: candidate.sourceKey,
        registrableDomain: candidate.registrableDomain,
        reason: 'HELD_OUT_EVIDENCE_PLATFORM_FAMILY',
      });
      return [];
    }
    return [{
      ...candidate,
      scenarioIntent: candidate.priorEvidenceLabel === 'BLOCKED'
        ? 'BLOCKED_REFUSAL'
        : 'EXECUTABLE_MAPPING',
    }];
  }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  excluded.sort((left, right) => (
    left.sourceKey.localeCompare(right.sourceKey)
    || left.reason.localeCompare(right.reason)
  ));

  const executable = examples.filter(
    (example) => example.scenarioIntent === 'EXECUTABLE_MAPPING',
  );
  const targetKinds = countBy(executable.map((example) => example.targetKind));
  const deficits: string[] = [];
  const requireCount = (label: string, actual: number, required: number) => {
    if (actual < required) deficits.push(`${label}: required ${required}, found ${actual}.`);
  };
  requireCount('real executable examples', executable.length, 95);
  requireCount('RENTAL examples across train and validation', targetKinds.RENTAL ?? 0, 11);
  requireCount('CLUB examples across train and validation', targetKinds.CLUB ?? 0, 11);
  requireCount(
    'blocked or insufficient-evidence examples across train and validation',
    examples.length - executable.length,
    12,
  );

  const summary = {
    exampleCount: examples.length,
    executableExampleCount: executable.length,
    blockedExampleCount: examples.length - executable.length,
    registrableDomainCount: new Set(examples.map((example) => example.registrableDomain)).size,
    requiredPageCount: examples.reduce(
      (total, example) => total + example.requiredCapturePages.length,
      0,
    ),
    targetKinds,
    minimumRealExampleCount: 95 as const,
    preferredRealExampleCount: 120 as const,
    minimumBlockedOrInsufficientExampleCount: 12 as const,
    preferredExecutableTargetKinds: {
      EVENT: 60 as const,
      CLUB: 20 as const,
      RENTAL: 15 as const,
    },
    databaseWrites: 0 as const,
    publicRequests: 0 as const,
  };
  const body = capturePlanBody({
    planType: 'TRAINING_EVIDENCE_CAPTURE',
    repositoryCommit,
    inventorySha256,
    heldOutCohortId: input.heldOutProposal.cohortId,
    heldOutProposalSha256: input.heldOutProposal.proposalSha256,
    examples,
    excluded,
    summary,
    deficits,
  });
  const planSha256 = stableAgentArtifactSha256(body);
  return {
    schemaVersion: 1,
    capturePlanId: `affiliate-mapping-training-capture-${planSha256.slice(0, 16)}`,
    ...body,
    planSha256,
    readyToCapture: examples.length > 0,
    readyForMinimumCorpus: deficits.length === 0,
  };
};

export function assertAffiliateEvidenceCapturePlan(
  value: unknown,
): asserts value is AffiliateEvidenceCapturePlan {
  const plan = recordValue(value) as AffiliateEvidenceCapturePlan | null;
  if (
    !plan
    || plan.schemaVersion !== 1
    || plan.planType !== 'TRAINING_EVIDENCE_CAPTURE'
    || typeof plan.capturePlanId !== 'string'
    || typeof plan.repositoryCommit !== 'string'
    || typeof plan.inventorySha256 !== 'string'
    || typeof plan.heldOutCohortId !== 'string'
    || typeof plan.heldOutProposalSha256 !== 'string'
    || typeof plan.planSha256 !== 'string'
    || !Array.isArray(plan.examples)
    || !Array.isArray(plan.excluded)
    || !recordValue(plan.summary)
    || !Array.isArray(plan.deficits)
    || typeof plan.readyToCapture !== 'boolean'
    || typeof plan.readyForMinimumCorpus !== 'boolean'
  ) {
    throw new Error('Affiliate evidence capture plan is missing required fields.');
  }
  for (const example of plan.examples) {
    if (
      !recordValue(example)
      || typeof example.sourceKey !== 'string'
      || !['EXECUTABLE_MAPPING', 'BLOCKED_REFUSAL'].includes(example.scenarioIntent)
      || !Array.isArray(example.requiredCapturePages)
      || example.requiredCapturePages.some((page) => (
        !recordValue(page)
        || typeof page.url !== 'string'
        || typeof page.role !== 'string'
      ))
    ) {
      throw new Error('Affiliate evidence capture plan contains an invalid example.');
    }
  }
  const body = capturePlanBody({
    planType: plan.planType,
    repositoryCommit: plan.repositoryCommit,
    inventorySha256: plan.inventorySha256,
    heldOutCohortId: plan.heldOutCohortId,
    heldOutProposalSha256: plan.heldOutProposalSha256,
    examples: plan.examples,
    excluded: plan.excluded,
    summary: plan.summary,
    deficits: plan.deficits,
  });
  const expectedSha256 = stableAgentArtifactSha256(body);
  if (plan.planSha256 !== expectedSha256) {
    throw new Error('Affiliate evidence capture plan hash does not match its contents.');
  }
  if (
    plan.capturePlanId
    !== `affiliate-mapping-training-capture-${expectedSha256.slice(0, 16)}`
  ) {
    throw new Error('Affiliate evidence capture plan id does not match its contents.');
  }
  if (plan.readyToCapture !== (plan.examples.length > 0)) {
    throw new Error('Affiliate evidence capture readiness does not match its examples.');
  }
  if (plan.readyForMinimumCorpus !== (plan.deficits.length === 0)) {
    throw new Error('Affiliate minimum-corpus readiness does not match its deficits.');
  }
}

export const assertApprovedAffiliateEvidenceCapturePlan = (
  planValue: unknown,
  approvalValue: unknown,
): {
  plan: AffiliateEvidenceCapturePlan;
  approval: AffiliateEvidenceCaptureApproval;
} => {
  assertAffiliateEvidenceCapturePlan(planValue);
  const approval = recordValue(approvalValue) as AffiliateEvidenceCaptureApproval | null;
  if (
    !approval
    || approval.schemaVersion !== 1
    || approval.capturePlanId !== planValue.capturePlanId
    || approval.planSha256 !== planValue.planSha256
    || approval.repositoryCommit !== planValue.repositoryCommit
    || typeof approval.approvedByUserId !== 'string'
    || !approval.approvedByUserId.trim()
    || approval.approvedByUserId.includes('@')
    || typeof approval.approvedAt !== 'string'
    || Number.isNaN(Date.parse(approval.approvedAt))
  ) {
    throw new Error('Affiliate evidence capture approval does not match the plan.');
  }
  if (!planValue.readyToCapture) {
    throw new Error('Affiliate evidence capture plan has no capture examples.');
  }
  return { plan: planValue, approval };
};

export const resolveAffiliateEvidenceCaptureSelection = (
  planValue: unknown,
  approvalValue: unknown,
): AffiliateEvidenceCaptureSelection => {
  if (recordValue(planValue)?.planType === 'TRAINING_EVIDENCE_CAPTURE') {
    const { plan, approval } = assertApprovedAffiliateEvidenceCapturePlan(
      planValue,
      approvalValue,
    );
    return {
      selectionId: plan.capturePlanId,
      selectionSha256: plan.planSha256,
      repositoryCommit: plan.repositoryCommit,
      approvedByUserId: approval.approvedByUserId,
      examples: plan.examples,
    };
  }
  const { proposal, lock } = assertLockedGoldCaptureCohort(planValue, approvalValue);
  return {
    selectionId: proposal.cohortId,
    selectionSha256: proposal.proposalSha256,
    repositoryCommit: proposal.repositoryCommit,
    approvedByUserId: lock.approvedByUserId,
    examples: proposal.examples,
  };
};
