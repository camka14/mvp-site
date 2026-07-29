/** @jest-environment node */

import {
  buildAffiliateMappingBakeoffReport,
  selectAffiliateMappingBakeoffWinner,
} from '../agentBakeoff';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const gib = 1024 ** 3;

const manifest = {
  schemaVersion: 1,
  upstreamRepository: 'open/model',
  upstreamRevision: 'revision-1',
  modelFamily: 'model-a',
  weightArtifacts: [{ filename: 'model.gguf', sha256: HASH_A }],
  tokenizerRevision: 'tokenizer-1',
  promptTemplateRevision: 'prompt-1',
  license: {
    spdxId: 'Apache-2.0',
    textSha256: HASH_B,
    notices: ['LICENSE'],
    commercialUseApproved: true,
    modificationApproved: true,
    derivativeDeploymentApproved: true,
  },
  runtimeSourceRepository: 'ggml-org/llama.cpp',
  runtimeRevision: 'runtime-1',
  trainingSourceRepository: 'bracketiq/mvp-site',
  trainingStackRevision: 'stack-1',
  quantization: {
    format: 'GGUF-Q4_K_M',
    sourceCheckpointSha256: HASH_C,
    artifactSha256: HASH_A,
  },
  offlineColdStartVerifiedAt: '2026-07-29T20:00:00.000Z',
  requiresVendorApi: false,
};

const runtime = {
  schemaVersion: 1,
  verifiedAt: '2026-07-29T20:01:00.000Z',
  host: {
    provider: 'OVH',
    orderId: 'order-1',
    region: 'us-west',
    imageId: 'ubuntu-24.04',
    cpuModel: 'Fixture CPU',
    cpuFlags: ['avx2'],
    onlineCores: 8,
    physicalMemoryBytes: 24 * gib,
    diskBytes: 200 * gib,
    monthlyPriceUsd: 23.37,
    renewalPriceUsd: 23.37,
    taxUsd: 0,
    dailyBackupIncluded: true,
  },
  serving: {
    runtimeImage: `llama.cpp@sha256:${HASH_B}`,
    runtimeRevision: 'runtime-1',
    modelFileSha256: HASH_A,
    contextTokens: 8192,
    maximumOutputTokens: 2048,
    parallelSlots: 1,
    cacheTypeK: 'q8_0',
    cacheTypeV: 'q8_0',
    offlineColdStartPassed: true,
    coldStartMs: 1000,
    peakResidentMemoryBytes: 18 * gib,
    peakSwapBytes: 0,
    minimumAvailableMemoryBytes: 3 * gib,
    representativeJobWallMs: 60_000,
    promptTokensPerSecond: 10,
    outputTokensPerSecond: 5,
  },
};

const evaluation = {
  schemaVersion: 1,
  model: {
    family: 'model-a',
    upstreamRepository: 'open/model',
    upstreamRevision: 'revision-1',
    artifactSha256: HASH_A,
    adapterRevision: null,
    promptTemplateRevision: 'prompt-1',
  },
  examples: [],
  summary: {
    exampleCount: 10,
    validResultEnvelopeRate: 1,
    safeRefusalAccuracy: 1,
    policyAccuracy: 1,
    targetKindAccuracy: 1,
    officialUrlAccuracy: 1,
    publishCriticalFieldAccuracy: 1,
    candidatePrecision: 1,
    candidateRecall: 1,
    evidenceCitationAccuracy: 1,
    generatorPassRate: 1,
    hardViolationCount: 0,
    assistedPilotEligible: true,
  },
};

const report = (overrides: {
  reportId?: string;
  manifest?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  correctionRate?: number | null;
} = {}) => buildAffiliateMappingBakeoffReport({
  reportId: overrides.reportId ?? 'report-a',
  capturedAt: new Date('2026-07-29T20:02:00.000Z'),
  modelManifest: overrides.manifest ?? manifest,
  runtime: overrides.runtime ?? runtime,
  evaluation: overrides.evaluation ?? evaluation,
  solMaterialCorrectionRate: overrides.correctionRate,
});

describe('affiliate mapping model bakeoff', () => {
  it('accepts a matching open-weight model that passes accuracy and capacity gates', () => {
    const result = report();
    expect(result.eligible).toBe(true);
    expect(result.eligibilityViolations).toEqual([]);
    expect(result.compositeScore).toBe(1);
  });

  it('rejects a high-scoring model that exceeds memory or fails offline cold start', () => {
    const unsafeRuntime = structuredClone(runtime);
    unsafeRuntime.serving.peakResidentMemoryBytes = 23 * gib;
    unsafeRuntime.serving.offlineColdStartPassed = false;
    const result = report({ runtime: unsafeRuntime });
    expect(result.eligible).toBe(false);
    expect(result.eligibilityViolations).toEqual(expect.arrayContaining([
      'OFFLINE_COLD_START_FAILED',
      'PEAK_RESIDENT_MEMORY_EXCEEDED',
    ]));
  });

  it('uses Sol correction rate, memory, and latency only for close eligible scores', () => {
    const first = report({ reportId: 'first', correctionRate: 0.2 });
    const secondManifest = { ...manifest, modelFamily: 'model-b' };
    const secondEvaluation = structuredClone(evaluation);
    secondEvaluation.model.family = 'model-b';
    const second = report({
      reportId: 'second',
      manifest: secondManifest,
      evaluation: secondEvaluation,
      correctionRate: 0.1,
    });
    const selection = selectAffiliateMappingBakeoffWinner([first, second]);
    expect(selection.selectedReportId).toBe('second');
    expect(selection.selectedModelFamily).toBe('model-b');

    const unsafeRuntime = structuredClone(runtime);
    unsafeRuntime.serving.peakSwapBytes = 600 * 1024 ** 2;
    const rejected = report({ reportId: 'rejected', runtime: unsafeRuntime });
    expect(selectAffiliateMappingBakeoffWinner([rejected]).selectedReportId).toBeNull();
  });
});
