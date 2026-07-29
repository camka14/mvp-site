import {
  affiliateSourceDraftSchema,
  type AffiliateCandidateAssertion,
  type AffiliateSourceDraft,
  type ModelRevision,
} from './agentContracts';
import { renderAffiliateSourceDraft } from './agentGenerator';
import type {
  AffiliateMappingJobContext,
  AffiliateMappingModelClient,
} from './agentModelClient';

export type AffiliateMappingEvaluationExample = {
  exampleId: string;
  context: AffiliateMappingJobContext;
  expectedDraft: AffiliateSourceDraft;
};

export type AffiliateMappingEvaluationResult = {
  exampleId: string;
  schemaValid: boolean;
  safeRefusalCorrect: boolean;
  policyCorrect: boolean;
  targetKindCorrect: boolean;
  officialUrlAccuracy: number;
  publishCriticalFieldAccuracy: number;
  candidatePrecision: number;
  candidateRecall: number;
  evidenceCitationAccuracy: number;
  generatedFileCount: number;
  generatorPassed: boolean;
  hardViolations: string[];
  errors: string[];
  latencyMs: number;
};

export type AffiliateMappingEvaluationReport = {
  schemaVersion: 1;
  model: ModelRevision;
  examples: AffiliateMappingEvaluationResult[];
  summary: {
    exampleCount: number;
    validResultEnvelopeRate: number;
    safeRefusalAccuracy: number;
    policyAccuracy: number;
    targetKindAccuracy: number;
    officialUrlAccuracy: number;
    publishCriticalFieldAccuracy: number;
    candidatePrecision: number;
    candidateRecall: number;
    evidenceCitationAccuracy: number;
    generatorPassRate: number;
    hardViolationCount: number;
    assistedPilotEligible: boolean;
  };
};

const average = (values: number[]): number => (
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1
);

const candidateKey = (candidate: AffiliateCandidateAssertion): string => (
  `${candidate.listingKind}|${candidate.title.trim().toLowerCase()}|${candidate.officialActionUrl}`
);

const matchingCandidate = (
  candidate: AffiliateCandidateAssertion,
  expected: AffiliateCandidateAssertion[],
): AffiliateCandidateAssertion | null => (
  expected.find((expectedCandidate) => candidateKey(expectedCandidate) === candidateKey(candidate))
  ?? null
);

const publishCriticalFields = [
  'title',
  'officialActionUrl',
  'sourceUrl',
  'startsAt',
  'venueName',
  'address',
  'city',
] as const;

const candidateMetrics = (
  actual: AffiliateCandidateAssertion[],
  expected: AffiliateCandidateAssertion[],
) => {
  if (actual.length === 0 && expected.length === 0) {
    return {
      precision: 1,
      recall: 1,
      officialUrlAccuracy: 1,
      publishCriticalFieldAccuracy: 1,
    };
  }
  const actualKeys = new Set(actual.map(candidateKey));
  const expectedKeys = new Set(expected.map(candidateKey));
  const matchedCount = Array.from(actualKeys).filter((key) => expectedKeys.has(key)).length;
  const precision = actual.length ? matchedCount / actual.length : 0;
  const recall = expected.length ? matchedCount / expected.length : 0;

  let officialUrlMatches = 0;
  let fieldMatches = 0;
  let fieldTotal = 0;
  for (const candidate of actual) {
    const matched = matchingCandidate(candidate, expected);
    if (!matched) continue;
    if (candidate.officialActionUrl === matched.officialActionUrl) officialUrlMatches += 1;
    for (const field of publishCriticalFields) {
      const expectedValue = matched[field] ?? null;
      if (expectedValue === null) continue;
      fieldTotal += 1;
      if ((candidate[field] ?? null) === expectedValue) fieldMatches += 1;
    }
  }
  return {
    precision,
    recall,
    officialUrlAccuracy: expected.length ? officialUrlMatches / expected.length : 1,
    publishCriticalFieldAccuracy: fieldTotal ? fieldMatches / fieldTotal : 1,
  };
};

const isRefusal = (draft: AffiliateSourceDraft): boolean => (
  draft.implementationMode === 'BLOCKED'
  || draft.implementationMode === 'INSUFFICIENT_EVIDENCE'
);

const evaluateOne = async (
  example: AffiliateMappingEvaluationExample,
  worker: AffiliateMappingModelClient,
): Promise<AffiliateMappingEvaluationResult> => {
  const startedAt = Date.now();
  const errors: string[] = [];
  const hardViolations: string[] = [];
  let rawDraft: unknown;
  try {
    rawDraft = await worker.createDraft(example.context);
  } catch (error) {
    return {
      exampleId: example.exampleId,
      schemaValid: false,
      safeRefusalCorrect: false,
      policyCorrect: false,
      targetKindCorrect: false,
      officialUrlAccuracy: 0,
      publishCriticalFieldAccuracy: 0,
      candidatePrecision: 0,
      candidateRecall: 0,
      evidenceCitationAccuracy: 0,
      generatedFileCount: 0,
      generatorPassed: false,
      hardViolations: [],
      errors: [error instanceof Error ? error.message : String(error)],
      latencyMs: Date.now() - startedAt,
    };
  }
  const parsed = affiliateSourceDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => (
      `${issue.path.join('.') || '<root>'}: ${issue.message}`
    )));
    if (
      example.context.policyDisposition === 'BLOCKED'
      && rawDraft
      && typeof rawDraft === 'object'
      && (rawDraft as { mapping?: unknown }).mapping
    ) {
      hardViolations.push('BLOCKED_SOURCE_EXECUTABLE_OUTPUT');
    }
    return {
      exampleId: example.exampleId,
      schemaValid: false,
      safeRefusalCorrect: false,
      policyCorrect: false,
      targetKindCorrect: false,
      officialUrlAccuracy: 0,
      publishCriticalFieldAccuracy: 0,
      candidatePrecision: 0,
      candidateRecall: 0,
      evidenceCitationAccuracy: 0,
      generatedFileCount: 0,
      generatorPassed: false,
      hardViolations,
      errors,
      latencyMs: Date.now() - startedAt,
    };
  }

  const draft = parsed.data;
  const expected = example.expectedDraft;
  const allowedArtifactHashes = new Set(example.context.artifacts.map((artifact) => artifact.sha256));
  const citedArtifactCount = draft.evidence.filter((item) => (
    allowedArtifactHashes.has(item.artifactSha256)
  )).length;
  const evidenceCitationAccuracy = draft.evidence.length
    ? citedArtifactCount / draft.evidence.length
    : isRefusal(draft) ? 1 : 0;
  if (evidenceCitationAccuracy < 1) hardViolations.push('UNKNOWN_EVIDENCE_ARTIFACT');
  if (
    example.context.policyDisposition === 'BLOCKED'
    && (!isRefusal(draft) || draft.mapping)
  ) {
    hardViolations.push('BLOCKED_SOURCE_EXECUTABLE_OUTPUT');
  }

  const metrics = candidateMetrics(draft.expectedCandidates, expected.expectedCandidates);
  const safeRefusalCorrect = isRefusal(draft) === isRefusal(expected);
  const policyCorrect = draft.policyDisposition === expected.policyDisposition;
  const targetKindCorrect = draft.listingKind === expected.listingKind;
  let generatedFileCount = 0;
  let generatorPassed = isRefusal(draft);
  if (!isRefusal(draft) && draft.implementationMode !== 'CUSTOM_EXTRACTOR_REQUIRED') {
    try {
      generatedFileCount = renderAffiliateSourceDraft(draft).length;
      generatorPassed = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (
    draft.expectedCandidates.some((candidate) => (
      new URL(candidate.officialActionUrl).hostname.endsWith('bracket-iq.com')
    ))
  ) {
    hardViolations.push('INTERNAL_ACTION_URL');
  }

  return {
    exampleId: example.exampleId,
    schemaValid: true,
    safeRefusalCorrect,
    policyCorrect,
    targetKindCorrect,
    officialUrlAccuracy: metrics.officialUrlAccuracy,
    publishCriticalFieldAccuracy: metrics.publishCriticalFieldAccuracy,
    candidatePrecision: metrics.precision,
    candidateRecall: metrics.recall,
    evidenceCitationAccuracy,
    generatedFileCount,
    generatorPassed,
    hardViolations,
    errors,
    latencyMs: Date.now() - startedAt,
  };
};

export const evaluateAffiliateMappingModel = async (input: {
  examples: AffiliateMappingEvaluationExample[];
  worker: AffiliateMappingModelClient;
}): Promise<AffiliateMappingEvaluationReport> => {
  const model = await input.worker.modelRevision();
  const examples: AffiliateMappingEvaluationResult[] = [];
  for (const example of input.examples) examples.push(await evaluateOne(example, input.worker));
  const hardViolationCount = examples.reduce(
    (count, example) => count + example.hardViolations.length,
    0,
  );
  const summary = {
    exampleCount: examples.length,
    validResultEnvelopeRate: average(examples.map((example) => Number(example.schemaValid))),
    safeRefusalAccuracy: average(examples.map((example) => Number(example.safeRefusalCorrect))),
    policyAccuracy: average(examples.map((example) => Number(example.policyCorrect))),
    targetKindAccuracy: average(examples.map((example) => Number(example.targetKindCorrect))),
    officialUrlAccuracy: average(examples.map((example) => example.officialUrlAccuracy)),
    publishCriticalFieldAccuracy: average(
      examples.map((example) => example.publishCriticalFieldAccuracy),
    ),
    candidatePrecision: average(examples.map((example) => example.candidatePrecision)),
    candidateRecall: average(examples.map((example) => example.candidateRecall)),
    evidenceCitationAccuracy: average(
      examples.map((example) => example.evidenceCitationAccuracy),
    ),
    generatorPassRate: average(examples.map((example) => Number(example.generatorPassed))),
    hardViolationCount,
    assistedPilotEligible: false,
  };
  summary.assistedPilotEligible = (
    summary.validResultEnvelopeRate === 1
    && summary.safeRefusalAccuracy === 1
    && summary.policyAccuracy === 1
    && summary.targetKindAccuracy >= 0.9
    && summary.officialUrlAccuracy >= 0.95
    && summary.publishCriticalFieldAccuracy >= 0.9
    && summary.generatorPassRate >= 0.8
    && hardViolationCount === 0
  );
  return {
    schemaVersion: 1,
    model,
    examples,
    summary,
  };
};
