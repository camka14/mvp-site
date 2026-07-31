import {
  assertAffiliateEvidenceCapturePlan,
  type AffiliateEvidenceCapturePlan,
  type AffiliateEvidenceCapturePlanExample,
} from './agentEvidenceCapturePlan';
import {
  assertAffiliateMappingGoldReleaseIntegrity,
  type AffiliateMappingGoldExample,
  type AffiliateMappingGoldRelease,
} from './agentGoldDataset';
import {
  buildAffiliateTrainingValidationSplitAssignments,
  type AffiliateFrozenTrainingValidationExample,
} from './agentGoldMaterialization';
import {
  stableAgentArtifactSha256,
  type AffiliateAgentTargetKind,
} from './agentContracts';

type JsonRecord = Record<string, unknown>;
type TargetKindCounts = Record<AffiliateAgentTargetKind, number>;

export type AffiliateTrainingRecoveryAction =
  | 'CAPTURE_MISSING_EVIDENCE'
  | 'REPAIR_REQUIRED_PAGE_CONFIGURATION'
  | 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE';

export type AffiliateTrainingRecoveryCandidate = {
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  registrableDomain: string;
  targetKind: AffiliateAgentTargetKind;
  mappingMode: AffiliateEvidenceCapturePlanExample['mappingMode'];
  requiredCapturePages: AffiliateEvidenceCapturePlanExample['requiredCapturePages'];
  auditStatus: string;
  evidenceStatus: string;
  action: AffiliateTrainingRecoveryAction;
  assignedSplit: 'train' | 'validation' | null;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  coverageGoals: string[];
};

export type AffiliateTrainingAcquisitionPlan = {
  schemaVersion: 1;
  planType: 'TRAINING_GAP_ACQUISITION';
  acquisitionPlanId: string;
  planSha256: string;
  repositoryCommit: string;
  sourceCapturePlanId: string;
  sourceCapturePlanSha256: string;
  sourceGoldReleaseId: string;
  sourceGoldReleaseSha256: string;
  heldOutCohortId: string;
  heldOutProposalSha256: string;
  frozenDomainAssignments: Array<{
    registrableDomain: string;
    split: 'train' | 'validation';
  }>;
  currentCoverage: {
    trainExamples: number;
    validationExamples: number;
    realExecutableExamples: number;
    realRefusalExamples: number;
    executableTargetKinds: TargetKindCounts;
    trainExecutableTargetKinds: TargetKindCounts;
    executableMaterializationYield: number;
    trainHasSelector: boolean;
    validationHasSelector: boolean;
  };
  requiredFinishedAdditions: {
    trainingExamples: number;
    executableExamples: number;
    preferredExecutableTargetKinds: TargetKindCounts;
    trainRentalExamples: number;
    trainSelectorExamples: number;
    validationSelectorExamples: number;
  };
  recoveryCandidates: AffiliateTrainingRecoveryCandidate[];
  recoverySummary: {
    actionableCount: number;
    policyOrTlsHoldCount: number;
    intendedExecutableTargetKinds: TargetKindCounts;
    assignedTrainRentalCount: number;
    assignedValidationSelectorDomainCount: number;
  };
  newSourceRequirements: {
    minimumFinishedExecutableTargetKindsAfterActionableRecovery: TargetKindCounts;
    minimumFinishedExecutableCountAfterActionableRecovery: number;
    bufferedCandidateTargetAtObservedYield: TargetKindCounts;
    bufferedCandidateCountAtObservedYield: number;
    rules: string[];
  };
  deficits: string[];
  readyToCaptureRecovery: boolean;
  readyForTraining: false;
  databaseWrites: 0;
  publicRequests: 0;
};

export type AffiliateTrainingAcquisitionApproval = {
  schemaVersion: 1;
  acquisitionPlanId: string;
  planSha256: string;
  repositoryCommit: string;
  approvedByUserId: string;
  approvedAt: string;
};

export type AffiliateTrainingRecoverySelection = {
  selectionId: string;
  selectionSha256: string;
  repositoryCommit: string;
  sourceCapturePlanId: string;
  sourceCapturePlanSha256: string;
  approvedByUserId: string;
  recoveryCandidates: AffiliateTrainingRecoveryCandidate[];
};

type CaptureAudit = {
  cohortId?: string;
  sources?: Array<{
    sourceKey?: string;
    status?: string;
    batches?: Array<{
      prepareAttempts?: Array<{
        queueStatus?: string;
      }>;
    }>;
  }>;
};

const recordValue = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const emptyTargetKindCounts = (): TargetKindCounts => ({
  EVENT: 0,
  CLUB: 0,
  RENTAL: 0,
});

const targetKindCounts = (
  values: Array<{ targetKind: AffiliateAgentTargetKind }>,
): TargetKindCounts => {
  const counts = emptyTargetKindCounts();
  for (const value of values) counts[value.targetKind] += 1;
  return counts;
};

const subtractTargetKindCounts = (
  required: TargetKindCounts,
  available: TargetKindCounts,
): TargetKindCounts => ({
  EVENT: Math.max(0, required.EVENT - available.EVENT),
  CLUB: Math.max(0, required.CLUB - available.CLUB),
  RENTAL: Math.max(0, required.RENTAL - available.RENTAL),
});

const totalTargetKindCounts = (counts: TargetKindCounts): number => (
  counts.EVENT + counts.CLUB + counts.RENTAL
);

const isExecutable = (example: AffiliateMappingGoldExample): boolean => (
  example.evidenceOrigin === 'REAL_CAPTURE'
  && example.target.type === 'LISTING_KIND'
  && (
    example.approvedDraft.implementationMode === 'GENERIC_MAPPING'
    || example.approvedDraft.implementationMode === 'MANUAL_CANDIDATES'
  )
);

const frozenExample = (
  example: AffiliateMappingGoldExample,
): AffiliateFrozenTrainingValidationExample => ({
  registrableDomain: example.registrableDomain,
  split: example.split as 'train' | 'validation',
  targetKind: example.target.type === 'LISTING_KIND'
    ? example.target.listingKind
    : null,
  mappingMode: example.approvedDraft.implementationMode === 'GENERIC_MAPPING'
    ? 'SELECTOR'
    : example.approvedDraft.implementationMode === 'MANUAL_CANDIDATES'
      ? 'MANUAL_CANDIDATES'
      : 'NONE',
});

const evidenceStatusFor = (
  source: NonNullable<CaptureAudit['sources']>[number] | undefined,
): string => {
  const statuses = source?.batches?.flatMap((batch) => (
    batch.prepareAttempts?.map((attempt) => attempt.queueStatus).filter(Boolean) ?? []
  )) ?? [];
  if (statuses.includes('ROBOTS_REVIEW_REQUIRED')) return 'ROBOTS_REVIEW_REQUIRED';
  if (statuses.includes('REQUIRED_BATCH_PAGES_MISSING')) {
    return 'REQUIRED_BATCH_PAGES_MISSING';
  }
  if (statuses.includes('EVIDENCE_MISSING')) return 'EVIDENCE_MISSING';
  return statuses[statuses.length - 1] ?? source?.status ?? 'UNKNOWN';
};

const recoveryActionFor = (evidenceStatus: string): AffiliateTrainingRecoveryAction => {
  if (evidenceStatus === 'ROBOTS_REVIEW_REQUIRED') {
    return 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE';
  }
  if (evidenceStatus === 'REQUIRED_BATCH_PAGES_MISSING') {
    return 'REPAIR_REQUIRED_PAGE_CONFIGURATION';
  }
  return 'CAPTURE_MISSING_EVIDENCE';
};

const recoveryPriority = (input: {
  example: AffiliateEvidenceCapturePlanExample;
  action: AffiliateTrainingRecoveryAction;
  assignedSplit: 'train' | 'validation' | null;
}): AffiliateTrainingRecoveryCandidate['priority'] => {
  if (input.action === 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE') return 'P3';
  if (
    input.example.targetKind === 'RENTAL'
    || (
      input.example.mappingMode === 'SELECTOR'
      && input.assignedSplit === 'validation'
    )
  ) {
    return 'P0';
  }
  if (input.example.mappingMode === 'SELECTOR' || input.example.targetKind === 'CLUB') {
    return 'P1';
  }
  return 'P2';
};

const coverageGoalsFor = (input: {
  example: AffiliateEvidenceCapturePlanExample;
  assignedSplit: 'train' | 'validation' | null;
}): string[] => {
  const goals = [`${input.example.targetKind}_EXECUTABLE`];
  if (input.example.targetKind === 'RENTAL' && input.assignedSplit === 'train') {
    goals.push('TRAIN_RENTAL_FLOOR');
  }
  if (input.example.mappingMode === 'SELECTOR') {
    goals.push(
      input.assignedSplit === 'validation'
        ? 'VALIDATION_SELECTOR'
        : 'TRAIN_SELECTOR',
    );
  }
  return goals;
};

const acquisitionPlanBody = (
  plan: Omit<
    AffiliateTrainingAcquisitionPlan,
    'schemaVersion' | 'acquisitionPlanId' | 'planSha256'
  >,
) => plan;

export const buildAffiliateTrainingAcquisitionPlan = (input: {
  capturePlan: AffiliateEvidenceCapturePlan;
  captureAudit: unknown;
  goldRelease: AffiliateMappingGoldRelease;
  sourceGoldReleaseSha256: string;
  repositoryCommit: string;
}): AffiliateTrainingAcquisitionPlan => {
  assertAffiliateEvidenceCapturePlan(input.capturePlan);
  const goldRelease = assertAffiliateMappingGoldReleaseIntegrity(input.goldRelease);
  if (goldRelease.examples.some((example) => example.split === 'test')) {
    throw new Error('Training acquisition cannot use a gold release containing test examples.');
  }
  const captureAudit = input.captureAudit as CaptureAudit;
  if (
    !recordValue(captureAudit)
    || captureAudit.cohortId !== input.capturePlan.capturePlanId
    || !Array.isArray(captureAudit.sources)
  ) {
    throw new Error('Training acquisition capture audit does not match the capture plan.');
  }
  const repositoryCommit = input.repositoryCommit.trim();
  if (!repositoryCommit) throw new Error('Training acquisition repository commit is required.');
  if (!/^[a-f0-9]{64}$/i.test(input.sourceGoldReleaseSha256)) {
    throw new Error('Training acquisition source gold release hash is invalid.');
  }

  const executableExamples = goldRelease.examples.filter(isExecutable);
  const trainExecutableExamples = executableExamples.filter(
    (example) => example.split === 'train',
  );
  const executableWithKind = executableExamples.map((example) => ({
    targetKind: (
      example.target.type === 'LISTING_KIND' ? example.target.listingKind : 'EVENT'
    ) as AffiliateAgentTargetKind,
  }));
  const trainExecutableWithKind = trainExecutableExamples.map((example) => ({
    targetKind: (
      example.target.type === 'LISTING_KIND' ? example.target.listingKind : 'EVENT'
    ) as AffiliateAgentTargetKind,
  }));
  const executableCounts = targetKindCounts(executableWithKind);
  const trainExecutableCounts = targetKindCounts(trainExecutableWithKind);
  const currentCoverage = {
    trainExamples: goldRelease.examples.filter((example) => example.split === 'train').length,
    validationExamples: goldRelease.examples.filter(
      (example) => example.split === 'validation',
    ).length,
    realExecutableExamples: executableExamples.length,
    realRefusalExamples: goldRelease.examples.filter((example) => (
      example.evidenceOrigin === 'REAL_CAPTURE' && example.target.type === 'REFUSAL'
    )).length,
    executableTargetKinds: executableCounts,
    trainExecutableTargetKinds: trainExecutableCounts,
    executableMaterializationYield: goldRelease.examples.length
      ? executableExamples.length / goldRelease.examples.length
      : 0,
    trainHasSelector: trainExecutableExamples.some(
      (example) => example.approvedDraft.implementationMode === 'GENERIC_MAPPING',
    ),
    validationHasSelector: executableExamples.some((example) => (
      example.split === 'validation'
      && example.approvedDraft.implementationMode === 'GENERIC_MAPPING'
    )),
  };
  const preferredTargetKinds: TargetKindCounts = {
    EVENT: 60,
    CLUB: 20,
    RENTAL: 15,
  };
  const requiredFinishedAdditions = {
    trainingExamples: Math.max(0, 80 - currentCoverage.trainExamples),
    executableExamples: Math.max(0, 95 - currentCoverage.realExecutableExamples),
    preferredExecutableTargetKinds: subtractTargetKindCounts(
      preferredTargetKinds,
      executableCounts,
    ),
    trainRentalExamples: Math.max(0, 10 - trainExecutableCounts.RENTAL),
    trainSelectorExamples: currentCoverage.trainHasSelector ? 0 : 1,
    validationSelectorExamples: currentCoverage.validationHasSelector ? 0 : 1,
  };

  const goldExampleIds = new Set(goldRelease.examples.map((example) => example.exampleId));
  const auditBySourceKey = new Map(
    captureAudit.sources.map((source) => [source.sourceKey ?? '', source]),
  );
  const recoveryExamples = input.capturePlan.examples.filter((example) => (
    !goldExampleIds.has(`${input.capturePlan.capturePlanId}-${example.sourceKey}`)
  ));
  const actionableExamples = recoveryExamples.filter((example) => (
    recoveryActionFor(evidenceStatusFor(auditBySourceKey.get(example.sourceKey)))
    !== 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE'
  ));
  const splitAssignments = buildAffiliateTrainingValidationSplitAssignments({
    candidates: actionableExamples.map((example) => ({
      registrableDomain: example.registrableDomain,
      sourceKey: example.sourceKey,
      targetKind: example.targetKind,
      mappingMode: example.mappingMode,
    })),
    frozenExamples: goldRelease.examples.map(frozenExample),
  });
  const recoveryCandidates = recoveryExamples.map((example) => {
    const audit = auditBySourceKey.get(example.sourceKey);
    const evidenceStatus = evidenceStatusFor(audit);
    const action = recoveryActionFor(evidenceStatus);
    const assignedSplit = action === 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE'
      ? null
      : splitAssignments.get(example.registrableDomain) ?? 'train';
    return {
      sourceId: example.sourceId,
      sourceKey: example.sourceKey,
      sourceName: example.sourceName,
      registrableDomain: example.registrableDomain,
      targetKind: example.targetKind,
      mappingMode: example.mappingMode,
      requiredCapturePages: example.requiredCapturePages,
      auditStatus: audit?.status ?? 'UNKNOWN',
      evidenceStatus,
      action,
      assignedSplit,
      priority: recoveryPriority({ example, action, assignedSplit }),
      coverageGoals: coverageGoalsFor({ example, assignedSplit }),
    };
  }).sort((left, right) => (
    left.priority.localeCompare(right.priority)
    || left.sourceKey.localeCompare(right.sourceKey)
  ));
  const actionableRecovery = recoveryCandidates.filter(
    (candidate) => candidate.action !== 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE',
  );
  const recoveryTargetKinds = targetKindCounts(actionableRecovery);
  const remainingAfterRecovery = subtractTargetKindCounts(
    requiredFinishedAdditions.preferredExecutableTargetKinds,
    recoveryTargetKinds,
  );
  const yieldRate = currentCoverage.executableMaterializationYield;
  const bufferedTarget = (required: number, plannedRecovery: number): number => (
    yieldRate > 0 ? Math.max(0, Math.ceil(required / yieldRate) - plannedRecovery) : required
  );
  const bufferedCandidateTargetAtObservedYield: TargetKindCounts = {
    EVENT: bufferedTarget(
      requiredFinishedAdditions.preferredExecutableTargetKinds.EVENT,
      recoveryTargetKinds.EVENT,
    ),
    CLUB: bufferedTarget(
      requiredFinishedAdditions.preferredExecutableTargetKinds.CLUB,
      recoveryTargetKinds.CLUB,
    ),
    RENTAL: bufferedTarget(
      requiredFinishedAdditions.preferredExecutableTargetKinds.RENTAL,
      recoveryTargetKinds.RENTAL,
    ),
  };
  const recoverySummary = {
    actionableCount: actionableRecovery.length,
    policyOrTlsHoldCount: recoveryCandidates.length - actionableRecovery.length,
    intendedExecutableTargetKinds: recoveryTargetKinds,
    assignedTrainRentalCount: actionableRecovery.filter((candidate) => (
      candidate.targetKind === 'RENTAL' && candidate.assignedSplit === 'train'
    )).length,
    assignedValidationSelectorDomainCount: new Set(actionableRecovery
      .filter((candidate) => (
        candidate.mappingMode === 'SELECTOR'
        && candidate.assignedSplit === 'validation'
      ))
      .map((candidate) => candidate.registrableDomain)).size,
  };
  const newSourceRequirements = {
    minimumFinishedExecutableTargetKindsAfterActionableRecovery: remainingAfterRecovery,
    minimumFinishedExecutableCountAfterActionableRecovery: totalTargetKindCounts(
      remainingAfterRecovery,
    ),
    bufferedCandidateTargetAtObservedYield,
    bufferedCandidateCountAtObservedYield: totalTargetKindCounts(
      bufferedCandidateTargetAtObservedYield,
    ),
    rules: [
      'Keep every held-out test domain and platform family excluded.',
      'Assign new domains to train unless validation still lacks a materialized selector.',
      'Acquire at least the remaining RENTAL examples in train before adding surplus EVENT rows.',
      'Count a source only after exact captured evidence materializes an executable mapping.',
      'Preserve official URLs, source-provided dates, publish-critical location, and policy refusals.',
    ],
  };
  const deficits = [
    `${requiredFinishedAdditions.executableExamples} additional finished executable examples are required.`,
    `${requiredFinishedAdditions.trainingExamples} additional approved training rows are required.`,
    `${requiredFinishedAdditions.preferredExecutableTargetKinds.EVENT} EVENT, `
      + `${requiredFinishedAdditions.preferredExecutableTargetKinds.CLUB} CLUB, and `
      + `${requiredFinishedAdditions.preferredExecutableTargetKinds.RENTAL} RENTAL executable `
      + 'examples are required for the preferred 60/20/15 composition.',
    `${requiredFinishedAdditions.trainRentalExamples} additional executable RENTAL training `
      + 'examples are required.',
    ...(requiredFinishedAdditions.trainSelectorExamples
      ? ['Training has no materialized generic selector example.']
      : []),
    ...(requiredFinishedAdditions.validationSelectorExamples
      ? ['Validation has no materialized generic selector example.']
      : []),
  ];
  const frozenDomainAssignments = Array.from(new Map(
    goldRelease.examples.map((example) => [
      example.registrableDomain,
      {
        registrableDomain: example.registrableDomain,
        split: example.split as 'train' | 'validation',
      },
    ]),
  ).values()).sort((left, right) => left.registrableDomain.localeCompare(right.registrableDomain));
  const body = acquisitionPlanBody({
    planType: 'TRAINING_GAP_ACQUISITION',
    repositoryCommit,
    sourceCapturePlanId: input.capturePlan.capturePlanId,
    sourceCapturePlanSha256: input.capturePlan.planSha256,
    sourceGoldReleaseId: goldRelease.manifest.releaseId,
    sourceGoldReleaseSha256: input.sourceGoldReleaseSha256,
    heldOutCohortId: input.capturePlan.heldOutCohortId,
    heldOutProposalSha256: input.capturePlan.heldOutProposalSha256,
    frozenDomainAssignments,
    currentCoverage,
    requiredFinishedAdditions,
    recoveryCandidates,
    recoverySummary,
    newSourceRequirements,
    deficits,
    readyToCaptureRecovery: actionableRecovery.length > 0,
    readyForTraining: false,
    databaseWrites: 0,
    publicRequests: 0,
  });
  const planSha256 = stableAgentArtifactSha256(body);
  return {
    schemaVersion: 1,
    acquisitionPlanId: `affiliate-mapping-training-acquisition-${planSha256.slice(0, 16)}`,
    ...body,
    planSha256,
  };
};

export const assertAffiliateTrainingAcquisitionPlan = (
  value: unknown,
): AffiliateTrainingAcquisitionPlan => {
  const plan = recordValue(value) as AffiliateTrainingAcquisitionPlan | null;
  if (
    !plan
    || plan.schemaVersion !== 1
    || plan.planType !== 'TRAINING_GAP_ACQUISITION'
    || typeof plan.acquisitionPlanId !== 'string'
    || typeof plan.planSha256 !== 'string'
    || !Array.isArray(plan.recoveryCandidates)
    || !Array.isArray(plan.frozenDomainAssignments)
    || !Array.isArray(plan.deficits)
  ) {
    throw new Error('Affiliate training acquisition plan is missing required fields.');
  }
  const { schemaVersion: _schemaVersion, acquisitionPlanId: _id, planSha256: _sha, ...body } = plan;
  const expectedSha256 = stableAgentArtifactSha256(body);
  if (plan.planSha256 !== expectedSha256) {
    throw new Error('Affiliate training acquisition plan hash does not match its contents.');
  }
  if (
    plan.acquisitionPlanId
    !== `affiliate-mapping-training-acquisition-${expectedSha256.slice(0, 16)}`
  ) {
    throw new Error('Affiliate training acquisition plan id does not match its contents.');
  }
  return plan;
};

export const resolveApprovedAffiliateTrainingRecoverySelection = (
  planValue: unknown,
  approvalValue: unknown,
): AffiliateTrainingRecoverySelection => {
  const plan = assertAffiliateTrainingAcquisitionPlan(planValue);
  const approval = recordValue(
    approvalValue,
  ) as AffiliateTrainingAcquisitionApproval | null;
  if (
    !approval
    || approval.schemaVersion !== 1
    || approval.acquisitionPlanId !== plan.acquisitionPlanId
    || approval.planSha256 !== plan.planSha256
    || approval.repositoryCommit !== plan.repositoryCommit
    || typeof approval.approvedByUserId !== 'string'
    || !approval.approvedByUserId.trim()
    || approval.approvedByUserId.includes('@')
    || typeof approval.approvedAt !== 'string'
    || Number.isNaN(Date.parse(approval.approvedAt))
  ) {
    throw new Error('Affiliate training acquisition approval does not match the plan.');
  }
  const recoveryCandidates = plan.recoveryCandidates.filter(
    (candidate) => candidate.action !== 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE',
  );
  if (
    !plan.readyToCaptureRecovery
    || !recoveryCandidates.length
    || recoveryCandidates.length !== plan.recoverySummary.actionableCount
  ) {
    throw new Error('Affiliate training acquisition plan has no valid recovery capture scope.');
  }
  return {
    selectionId: plan.acquisitionPlanId,
    selectionSha256: plan.planSha256,
    repositoryCommit: plan.repositoryCommit,
    sourceCapturePlanId: plan.sourceCapturePlanId,
    sourceCapturePlanSha256: plan.sourceCapturePlanSha256,
    approvedByUserId: approval.approvedByUserId,
    recoveryCandidates,
  };
};
