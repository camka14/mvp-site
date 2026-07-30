import { z } from 'zod';
import {
  openWeightModelManifestSchema,
  stableAgentArtifactSha256,
  type OpenWeightModelManifest,
} from './agentContracts';
import type {
  AffiliateMappingEvaluationReport,
} from './agentEvaluation';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const nonEmptyStringSchema = z.string().trim().min(1);
const gib = 1024 ** 3;
const mib = 1024 ** 2;

export const affiliateModelRuntimeObservationSchema = z.object({
  schemaVersion: z.literal(1),
  verifiedAt: z.string().datetime({ offset: true }),
  host: z.object({
    provider: z.literal('OVH'),
    orderId: nonEmptyStringSchema,
    region: nonEmptyStringSchema,
    imageId: nonEmptyStringSchema,
    cpuModel: nonEmptyStringSchema,
    cpuFlags: z.array(nonEmptyStringSchema).min(1),
    onlineCores: z.number().int().positive(),
    physicalMemoryBytes: z.number().int().positive(),
    diskBytes: z.number().int().positive(),
    monthlyPriceUsd: z.number().nonnegative(),
    renewalPriceUsd: z.number().nonnegative(),
    taxUsd: z.number().nonnegative(),
    dailyBackupIncluded: z.boolean(),
  }).strict(),
  serving: z.object({
    runtimeImage: nonEmptyStringSchema.regex(/@sha256:[a-f0-9]{64}$/i),
    runtimeRevision: nonEmptyStringSchema,
    modelFileSha256: sha256Schema,
    contextTokens: z.number().int().positive(),
    maximumOutputTokens: z.number().int().positive(),
    parallelSlots: z.literal(1),
    cacheTypeK: nonEmptyStringSchema,
    cacheTypeV: nonEmptyStringSchema,
    offlineColdStartPassed: z.boolean(),
    coldStartMs: z.number().nonnegative(),
    peakResidentMemoryBytes: z.number().int().nonnegative(),
    peakSwapBytes: z.number().int().nonnegative(),
    minimumAvailableMemoryBytes: z.number().int().nonnegative(),
    representativeJobWallMs: z.number().nonnegative(),
    promptTokensPerSecond: z.number().nonnegative(),
    outputTokensPerSecond: z.number().nonnegative(),
  }).strict(),
}).strict();

export type AffiliateModelRuntimeObservation = z.infer<
  typeof affiliateModelRuntimeObservationSchema
>;

export type AffiliateMappingBakeoffReport = {
  schemaVersion: 1;
  reportId: string;
  capturedAt: string;
  modelManifestSha256: string;
  modelManifest: OpenWeightModelManifest;
  runtime: AffiliateModelRuntimeObservation;
  evaluation: AffiliateMappingEvaluationReport;
  solMaterialCorrectionRate: number | null;
  compositeScore: number;
  eligibilityViolations: string[];
  eligible: boolean;
};

const evaluationSummarySchema = z.object({
  exampleCount: z.number().int().nonnegative(),
  validResultEnvelopeRate: z.number().min(0).max(1),
  safeRefusalAccuracy: z.number().min(0).max(1),
  policyAccuracy: z.number().min(0).max(1),
  targetKindAccuracy: z.number().min(0).max(1),
  officialUrlAccuracy: z.number().min(0).max(1),
  publishCriticalFieldAccuracy: z.number().min(0).max(1),
  candidatePrecision: z.number().min(0).max(1),
  candidateRecall: z.number().min(0).max(1),
  evidenceCitationAccuracy: z.number().min(0).max(1),
  generatorPassRate: z.number().min(0).max(1),
  hardViolationCount: z.number().int().nonnegative(),
  assistedPilotEligible: z.boolean(),
}).strict();

export const affiliateMappingEvaluationReportSchema = z.object({
  schemaVersion: z.literal(1),
  model: z.object({
    family: nonEmptyStringSchema,
    upstreamRepository: nonEmptyStringSchema,
    upstreamRevision: nonEmptyStringSchema,
    artifactSha256: sha256Schema,
    adapterRevision: nonEmptyStringSchema.nullable(),
    promptTemplateRevision: nonEmptyStringSchema,
  }).strict(),
  examples: z.array(z.object({
    exampleId: nonEmptyStringSchema,
    schemaValid: z.boolean(),
    safeRefusalCorrect: z.boolean(),
    policyCorrect: z.boolean(),
    targetKindCorrect: z.boolean(),
    officialUrlAccuracy: z.number().min(0).max(1),
    publishCriticalFieldAccuracy: z.number().min(0).max(1),
    candidatePrecision: z.number().min(0).max(1),
    candidateRecall: z.number().min(0).max(1),
    evidenceCitationAccuracy: z.number().min(0).max(1),
    generatedFileCount: z.number().int().nonnegative(),
    generatorPassed: z.boolean(),
    hardViolations: z.array(nonEmptyStringSchema),
    errors: z.array(nonEmptyStringSchema),
    latencyMs: z.number().nonnegative(),
  }).strict()),
  summary: evaluationSummarySchema,
}).strict();

export const affiliateMappingCompositeScore = (
  summary: AffiliateMappingEvaluationReport['summary'],
): number => Number((
  summary.validResultEnvelopeRate * 0.1
  + summary.safeRefusalAccuracy * 0.15
  + summary.policyAccuracy * 0.1
  + summary.targetKindAccuracy * 0.1
  + summary.officialUrlAccuracy * 0.15
  + summary.publishCriticalFieldAccuracy * 0.2
  + summary.candidatePrecision * 0.05
  + summary.candidateRecall * 0.05
  + summary.evidenceCitationAccuracy * 0.05
  + summary.generatorPassRate * 0.05
).toFixed(6));

export const affiliateMappingBakeoffReportSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: nonEmptyStringSchema,
  capturedAt: z.string().datetime({ offset: true }),
  modelManifestSha256: sha256Schema,
  modelManifest: openWeightModelManifestSchema,
  runtime: affiliateModelRuntimeObservationSchema,
  evaluation: affiliateMappingEvaluationReportSchema,
  solMaterialCorrectionRate: z.number().min(0).max(1).nullable(),
  compositeScore: z.number().min(0).max(1),
  eligibilityViolations: z.array(nonEmptyStringSchema),
  eligible: z.boolean(),
}).strict();

export const buildAffiliateMappingBakeoffReport = (input: {
  reportId: string;
  capturedAt: Date;
  modelManifest: unknown;
  runtime: unknown;
  evaluation: unknown;
  solMaterialCorrectionRate?: number | null;
}): AffiliateMappingBakeoffReport => {
  if (!input.reportId.trim()) throw new Error('Bakeoff report id is required.');
  const manifest = openWeightModelManifestSchema.parse(input.modelManifest);
  const runtime = affiliateModelRuntimeObservationSchema.parse(input.runtime);
  const evaluation = affiliateMappingEvaluationReportSchema.parse(
    input.evaluation,
  ) as AffiliateMappingEvaluationReport;
  const solMaterialCorrectionRate = input.solMaterialCorrectionRate ?? null;
  if (
    solMaterialCorrectionRate !== null
    && (
      !Number.isFinite(solMaterialCorrectionRate)
      || solMaterialCorrectionRate < 0
      || solMaterialCorrectionRate > 1
    )
  ) {
    throw new Error('Sol material correction rate must be between zero and one.');
  }
  if (
    evaluation.model.upstreamRepository !== manifest.upstreamRepository
    || evaluation.model.upstreamRevision !== manifest.upstreamRevision
    || evaluation.model.artifactSha256 !== manifest.quantization.artifactSha256
    || runtime.serving.modelFileSha256 !== manifest.quantization.artifactSha256
  ) {
    throw new Error('Evaluation, runtime observation, and model manifest identity do not match.');
  }
  const violations: string[] = [];
  if (!manifest.license.commercialUseApproved) violations.push('COMMERCIAL_USE_NOT_APPROVED');
  if (!manifest.license.modificationApproved) violations.push('MODIFICATION_NOT_APPROVED');
  if (!manifest.license.derivativeDeploymentApproved) {
    violations.push('DERIVATIVE_DEPLOYMENT_NOT_APPROVED');
  }
  if (manifest.requiresVendorApi) violations.push('VENDOR_API_REQUIRED');
  if (!manifest.offlineColdStartVerifiedAt || !runtime.serving.offlineColdStartPassed) {
    violations.push('OFFLINE_COLD_START_FAILED');
  }
  if (!evaluation.summary.assistedPilotEligible) violations.push('EVALUATION_GATE_FAILED');
  if (runtime.serving.peakResidentMemoryBytes > 22 * gib) {
    violations.push('PEAK_RESIDENT_MEMORY_EXCEEDED');
  }
  if (runtime.serving.peakSwapBytes > 512 * mib) violations.push('SWAP_EXCEEDED');
  if (runtime.serving.minimumAvailableMemoryBytes < gib) {
    violations.push('AVAILABLE_MEMORY_FLOOR_BREACHED');
  }
  if (runtime.serving.representativeJobWallMs > 90 * 60 * 1000) {
    violations.push('REPRESENTATIVE_JOB_TIMEOUT');
  }
  if (runtime.serving.contextTokens !== 8192) violations.push('CONTEXT_NOT_FROZEN_AT_8192');
  if (runtime.serving.maximumOutputTokens !== 2048) {
    violations.push('OUTPUT_LIMIT_NOT_FROZEN_AT_2048');
  }
  return {
    schemaVersion: 1,
    reportId: input.reportId.trim(),
    capturedAt: input.capturedAt.toISOString(),
    modelManifestSha256: stableAgentArtifactSha256(manifest),
    modelManifest: manifest,
    runtime,
    evaluation,
    solMaterialCorrectionRate,
    compositeScore: affiliateMappingCompositeScore(evaluation.summary),
    eligibilityViolations: violations,
    eligible: violations.length === 0,
  };
};

export const selectAffiliateMappingBakeoffWinner = (
  reports: AffiliateMappingBakeoffReport[],
): {
  selectedReportId: string | null;
  selectedModelFamily: string | null;
  eligibleReportIds: string[];
  rejected: Array<{ reportId: string; violations: string[] }>;
  reason: string;
} => {
  const ids = new Set<string>();
  for (const report of reports) {
    affiliateMappingBakeoffReportSchema.parse(report);
    if (ids.has(report.reportId)) throw new Error(`Duplicate bakeoff report id: ${report.reportId}.`);
    ids.add(report.reportId);
  }
  const eligible = reports.filter((report) => report.eligible);
  const ordered = [...eligible].sort((left, right) => {
    const scoreDifference = right.compositeScore - left.compositeScore;
    if (Math.abs(scoreDifference) > 0.02) return scoreDifference;
    const leftCorrection = left.solMaterialCorrectionRate ?? Number.POSITIVE_INFINITY;
    const rightCorrection = right.solMaterialCorrectionRate ?? Number.POSITIVE_INFINITY;
    if (leftCorrection !== rightCorrection) return leftCorrection - rightCorrection;
    const memoryDifference = (
      left.runtime.serving.peakResidentMemoryBytes
      - right.runtime.serving.peakResidentMemoryBytes
    );
    if (memoryDifference !== 0) return memoryDifference;
    return (
      left.runtime.serving.representativeJobWallMs
      - right.runtime.serving.representativeJobWallMs
    );
  });
  const selected = ordered[0] ?? null;
  return {
    selectedReportId: selected?.reportId ?? null,
    selectedModelFamily: selected?.modelManifest.modelFamily ?? null,
    eligibleReportIds: ordered.map((report) => report.reportId),
    rejected: reports
      .filter((report) => !report.eligible)
      .map((report) => ({
        reportId: report.reportId,
        violations: report.eligibilityViolations,
      })),
    reason: selected
      ? 'Selected by frozen composite score; candidates within two points use lower Sol correction rate, then memory and wall time.'
      : 'No candidate passed every open-weight, safety, accuracy, memory, swap, and latency gate.',
  };
};
