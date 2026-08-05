import { z } from 'zod';
import {
  affiliateAgentTargetKindSchema,
  affiliateSourceDraftSchema,
  stableAgentArtifactSha256,
  type AffiliateCandidateAssertion,
  type AffiliateSourceDraft,
} from './agentContracts';
import type { AffiliateModelRuntimeObservation } from './agentBakeoff';
import type { AffiliateMappingEvaluationReport } from './agentEvaluation';
import {
  AFFILIATE_MAPPING_SYSTEM_PROMPT,
  type AffiliateMappingJobContext,
} from './agentModelClient';
import {
  assertNoForbiddenAffiliateTrainingData,
  affiliateMappingTeachingEnvelopeSchema,
  type AffiliateMappingTeachingEnvelope,
  type AffiliateMappingSftRelease,
} from './agentTrainingRelease';
import { validateAffiliateAgentSportName } from './affiliateSportMapping';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash.');
const nonEmptyStringSchema = z.string().trim().min(1);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const splitSchema = z.enum(['train', 'validation', 'test']);
const listingKindSchema = affiliateAgentTargetKindSchema;
const implementationModeSchema = z.enum([
  'GENERIC_MAPPING',
  'MANUAL_CANDIDATES',
  'CUSTOM_EXTRACTOR_REQUIRED',
  'BLOCKED',
  'INSUFFICIENT_EVIDENCE',
]);
const evidenceOriginSchema = z.enum([
  'REAL_CAPTURE',
  'DERIVED_EVIDENCE_ABLATION',
  'INVENTED_CONTROL',
]);
const safeReleaseIdSchema = nonEmptyStringSchema.regex(
  /^[a-z0-9][a-z0-9._-]*$/i,
  'Release id may contain only letters, numbers, periods, underscores, and hyphens.',
);

const mappingJobContextSchema = z.object({
  jobId: nonEmptyStringSchema,
  intakeId: nonEmptyStringSchema,
  sourceKey: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  evidenceRunIds: z.array(nonEmptyStringSchema).min(1).optional(),
  policyDisposition: z.enum(['ALLOWED', 'BLOCKED', 'NEEDS_REVIEW']),
  targetKindHints: z.array(listingKindSchema),
  artifacts: z.array(z.object({
    kind: nonEmptyStringSchema,
    sha256: sha256Schema,
    pageUrl: z.string().url(),
    byteLength: z.number().int().nonnegative().optional(),
    intakeId: nonEmptyStringSchema.optional(),
    runId: nonEmptyStringSchema.optional(),
  }).strict()).min(1),
  evidenceExcerpts: z.array(z.object({
    kind: nonEmptyStringSchema,
    sha256: sha256Schema,
    pageUrl: z.string().url(),
    content: z.string(),
    truncated: z.boolean(),
  }).strict()).optional(),
  repositoryExcerpts: z.array(z.object({
    path: nonEmptyStringSchema,
    content: z.string(),
    truncated: z.boolean(),
  }).strict()).optional(),
  instructionsRevision: nonEmptyStringSchema,
}).strict();

const candidateAssertionSchema = z.object({
  listingKind: listingKindSchema,
  title: nonEmptyStringSchema,
  officialActionUrl: z.string().url(),
  sourceUrl: z.string().url().nullable().optional(),
  sportName: nonEmptyStringSchema.nullable().optional(),
  tags: z.array(nonEmptyStringSchema).default([]),
  venueName: nonEmptyStringSchema.nullable().optional(),
  address: nonEmptyStringSchema.nullable().optional(),
  city: nonEmptyStringSchema.nullable().optional(),
  startsAt: isoDateTimeSchema.nullable().optional(),
  endsAt: isoDateTimeSchema.nullable().optional(),
  dateDisplayMode: z.enum(['SCHEDULED', 'NO_FIXED_DATE', 'ONGOING']).optional(),
  dateDisplayText: nonEmptyStringSchema.nullable().optional(),
  priceText: nonEmptyStringSchema.nullable().optional(),
  divisions: z.array(nonEmptyStringSchema).default([]),
}).strict();

const fixturePageSchema = z.object({
  url: z.string().url(),
  finalUrl: z.string().url(),
  statusCode: z.number().int().min(100).max(599),
  file: nonEmptyStringSchema,
  byteLength: z.number().int().nonnegative(),
  sha256: sha256Schema,
  fetchedAt: isoDateTimeSchema.optional(),
}).strict();

const targetSchema = z.union([
  z.object({
    type: z.literal('LISTING_KIND'),
    listingKind: listingKindSchema,
  }).strict(),
  z.object({
    type: z.literal('REFUSAL'),
    refusalClass: z.enum([
      'BLOCKED',
      'INSUFFICIENT_EVIDENCE',
      'CUSTOM_EXTRACTOR_REQUIRED',
    ]),
  }).strict(),
]);

const evidenceOriginDetailsSchema = z.union([
  z.object({
    origin: z.literal('REAL_CAPTURE'),
    withheldEvidence: z.array(nonEmptyStringSchema).max(0),
  }).strict(),
  z.object({
    origin: z.literal('DERIVED_EVIDENCE_ABLATION'),
    withheldEvidence: z.array(nonEmptyStringSchema).min(1),
  }).strict(),
  z.object({
    origin: z.literal('INVENTED_CONTROL'),
    withheldEvidence: z.array(nonEmptyStringSchema).max(0),
  }).strict(),
]);

const isExternalOfficialUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return ['http:', 'https:'].includes(url.protocol)
      && hostname !== 'localhost'
      && hostname !== '127.0.0.1'
      && hostname !== '::1'
      && hostname !== 'bracket-iq.com'
      && !hostname.endsWith('.bracket-iq.com');
  } catch {
    return false;
  }
};

const dateEvidenceSupportsCandidate = (
  draft: AffiliateSourceDraft,
  candidateIndex: number,
): boolean => draft.evidence.some((evidence) => evidence.supports.some((support) => (
  support === 'startsAt'
  || support === 'scheduledDate'
  || support === `expectedCandidates.${candidateIndex}.startsAt`
  || support === `persistedCandidates.${candidateIndex}.startsAt`
)));

const validatePersistedCandidate = (
  candidate: AffiliateCandidateAssertion,
  candidateIndex: number,
  draft: AffiliateSourceDraft,
  approvedAt: string,
  context: z.RefinementCtx,
) => {
  const sportIssue = validateAffiliateAgentSportName(
    candidate.sportName,
    `expectedPersistedCandidates.${candidateIndex}.sportName`,
  );
  if (sportIssue) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'sportName'],
      message: sportIssue.message,
    });
  }
  if (!isExternalOfficialUrl(candidate.officialActionUrl)) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'officialActionUrl'],
      message: 'Persisted candidates must use an official external action URL.',
    });
  }
  if (candidate.dateDisplayMode === 'SCHEDULED' && !candidate.startsAt) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'startsAt'],
      message: 'Scheduled persisted candidates require a source-provided startsAt.',
    });
  }
  if (
    (candidate.dateDisplayMode === 'NO_FIXED_DATE' || candidate.dateDisplayMode === 'ONGOING')
    && candidate.startsAt
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'startsAt'],
      message: 'Evergreen persisted candidates cannot contain an invented start.',
    });
  }
  if (
    (candidate.dateDisplayMode === 'NO_FIXED_DATE' || candidate.dateDisplayMode === 'ONGOING')
    && !candidate.dateDisplayText
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'dateDisplayText'],
      message: 'Evergreen persisted candidates require clear date display text.',
    });
  }
  if (candidate.startsAt) {
    if (new Date(candidate.startsAt).getTime() <= new Date(approvedAt).getTime()) {
      context.addIssue({
        code: 'custom',
        path: ['expectedPersistedCandidates', candidateIndex, 'startsAt'],
        message: 'Scheduled persisted candidates must be future-dated when approved.',
      });
    }
    if (!dateEvidenceSupportsCandidate(draft, candidateIndex)) {
      context.addIssue({
        code: 'custom',
        path: ['expectedPersistedCandidates', candidateIndex, 'startsAt'],
        message: 'Scheduled persisted candidate dates require cited source evidence.',
      });
    }
  }
  if (
    candidate.startsAt
    && candidate.endsAt
    && new Date(candidate.endsAt).getTime() < new Date(candidate.startsAt).getTime()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates', candidateIndex, 'endsAt'],
      message: 'Persisted candidate endsAt cannot be before startsAt.',
    });
  }
};

export const affiliateMappingGoldExampleSchema = z.object({
  schemaVersion: z.literal(1),
  exampleId: nonEmptyStringSchema,
  split: splitSchema,
  registrableDomain: nonEmptyStringSchema.toLowerCase(),
  platformFamily: nonEmptyStringSchema.nullable(),
  target: targetSchema,
  evidenceOrigin: evidenceOriginSchema,
  evidenceOriginDetails: evidenceOriginDetailsSchema,
  includedInTraining: z.boolean(),
  includedInRetrieval: z.boolean(),
  context: mappingJobContextSchema,
  approvedDraft: affiliateSourceDraftSchema,
  expectedPersistedCandidates: z.array(candidateAssertionSchema),
  fixturePages: z.array(fixturePageSchema),
  humanApproval: z.object({
    approvalId: nonEmptyStringSchema,
    approvedByUserId: nonEmptyStringSchema,
    approvedAt: isoDateTimeSchema,
  }).strict(),
}).strict().superRefine((example, context) => {
  if (example.evidenceOrigin !== example.evidenceOriginDetails.origin) {
    context.addIssue({
      code: 'custom',
      path: ['evidenceOriginDetails', 'origin'],
      message: 'Evidence origin details must match evidenceOrigin.',
    });
  }
  if (example.split === 'test' && (example.includedInTraining || example.includedInRetrieval)) {
    context.addIssue({
      code: 'custom',
      path: ['split'],
      message: 'Test examples cannot appear in training or retrieval metadata.',
    });
  }
  if (example.split === 'validation' && example.includedInTraining) {
    context.addIssue({
      code: 'custom',
      path: ['includedInTraining'],
      message: 'Validation examples cannot be marked as weight-training rows.',
    });
  }
  if (
    example.context.intakeId !== example.approvedDraft.intakeId
    || example.context.sourceKey !== example.approvedDraft.sourceKey
    || example.context.runId !== example.approvedDraft.runId
  ) {
    context.addIssue({
      code: 'custom',
      path: ['context'],
      message: 'Gold context and approved draft identities must match.',
    });
  }

  const targetMatches = example.target.type === 'LISTING_KIND'
    ? (
      example.approvedDraft.listingKind === example.target.listingKind
      && !['BLOCKED', 'INSUFFICIENT_EVIDENCE'].includes(
        example.approvedDraft.implementationMode,
      )
    )
    : example.approvedDraft.implementationMode === example.target.refusalClass;
  if (!targetMatches) {
    context.addIssue({
      code: 'custom',
      path: ['target'],
      message: 'Gold target must match the approved draft outcome.',
    });
  }
  if (example.target.type === 'LISTING_KIND') {
    const targetListingKind = example.target.listingKind;
    example.expectedPersistedCandidates.forEach((candidate, index) => {
      if (candidate.listingKind !== targetListingKind) {
        context.addIssue({
          code: 'custom',
          path: ['expectedPersistedCandidates', index, 'listingKind'],
          message: 'Persisted candidate kind must match the gold target.',
        });
      }
    });
  }

  const contextArtifactHashes = new Set(example.context.artifacts.map((artifact) => artifact.sha256));
  example.approvedDraft.evidence.forEach((evidence, index) => {
    if (!contextArtifactHashes.has(evidence.artifactSha256)) {
      context.addIssue({
        code: 'custom',
        path: ['approvedDraft', 'evidence', index, 'artifactSha256'],
        message: 'Approved draft cites an artifact outside the frozen context.',
      });
    }
  });
  example.fixturePages.forEach((page, index) => {
    if (!contextArtifactHashes.has(page.sha256)) {
      context.addIssue({
        code: 'custom',
        path: ['fixturePages', index, 'sha256'],
        message: 'Fixture page hash must exist in the frozen context artifacts.',
      });
    }
  });

  const fixtureRequestUrls = new Set(example.fixturePages.map((page) => page.url));
  const fixtureUrls = new Set(example.fixturePages.flatMap((page) => [page.url, page.finalUrl]));
  if (fixtureRequestUrls.size < example.fixturePages.length) {
    context.addIssue({
      code: 'custom',
      path: ['fixturePages'],
      message: 'Fixture page URLs must be unique within a gold example.',
    });
  }
  if (
    example.approvedDraft.mapping
    && !fixtureUrls.has(example.approvedDraft.mapping.listUrl)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['fixturePages'],
      message: 'Executable mappings require a fixture for the exact list URL.',
    });
  }
  const detailUrlField = example.approvedDraft.mapping?.detailPage?.urlField;
  if (detailUrlField) {
    example.expectedPersistedCandidates.forEach((candidate, index) => {
      const detailUrl = candidate[detailUrlField];
      if (detailUrl && !fixtureUrls.has(detailUrl)) {
        context.addIssue({
          code: 'custom',
          path: ['fixturePages'],
          message: `Missing fixture for expected candidate ${index} detail URL ${detailUrl}.`,
        });
      }
    });
  }

  const isExecutable = (
    example.approvedDraft.implementationMode === 'GENERIC_MAPPING'
    || example.approvedDraft.implementationMode === 'MANUAL_CANDIDATES'
  );
  if (isExecutable && example.expectedPersistedCandidates.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates'],
      message: 'Executable gold examples require expected persisted candidates.',
    });
  }
  if (!isExecutable && example.expectedPersistedCandidates.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['expectedPersistedCandidates'],
      message: 'Non-executable gold examples cannot expect persisted candidates.',
    });
  }
  example.expectedPersistedCandidates.forEach((candidate, index) => {
    validatePersistedCandidate(
      candidate as AffiliateCandidateAssertion,
      index,
      example.approvedDraft,
      example.humanApproval.approvedAt,
      context,
    );
  });
});

export type AffiliateMappingGoldExample = z.infer<
  typeof affiliateMappingGoldExampleSchema
>;

const countMapSchema = z.record(z.string(), z.number().int().nonnegative());

const fixtureManifestForExample = (example: AffiliateMappingGoldExample) => ({
  schemaVersion: 1 as const,
  exampleId: example.exampleId,
  fixturePages: example.fixturePages,
});

const fixtureManifestFileFor = (
  example: AffiliateMappingGoldExample,
  index: number,
): string => (
  `fixture-manifests/${String(index).padStart(4, '0')}-`
  + `${stableAgentArtifactSha256(fixtureManifestForExample(example)).slice(0, 16)}.json`
);

export const affiliateMappingGoldReleaseSchema = z.object({
  manifest: z.object({
    schemaVersion: z.literal(1),
    releaseId: safeReleaseIdSchema,
    createdAt: isoDateTimeSchema,
    repositoryCommit: nonEmptyStringSchema,
    promptContractVersion: z.literal(1),
    systemPromptSha256: sha256Schema,
    goldContractRevision: nonEmptyStringSchema,
    exampleIds: z.array(nonEmptyStringSchema),
    sourceEnvelopeSha256s: z.array(sha256Schema),
    rowSha256s: z.array(sha256Schema),
    fixtureManifestFiles: z.array(nonEmptyStringSchema),
    fixtureManifestSha256s: z.array(sha256Schema),
    counts: z.object({
      split: countMapSchema,
      target: countMapSchema,
      implementationMode: countMapSchema,
      evidenceOrigin: countMapSchema,
      registrableDomain: countMapSchema,
      platformFamily: countMapSchema,
      total: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  examples: z.array(affiliateMappingGoldExampleSchema),
}).strict();

export type AffiliateMappingGoldRelease = z.infer<
  typeof affiliateMappingGoldReleaseSchema
>;

export const affiliateMappingEvaluationExecutionResultSchema = z.object({
  exampleId: nonEmptyStringSchema,
  focusedTestsPassed: z.boolean(),
  generatedPaths: z.array(nonEmptyStringSchema),
  firstRunCandidateCount: z.number().int().nonnegative(),
  secondRunCandidateCount: z.number().int().nonnegative(),
  stableCandidateCount: z.number().int().nonnegative(),
  duplicateIdentityCount: z.number().int().nonnegative(),
  publishedCandidateCount: z.number().int().nonnegative(),
  mappingValidated: z.boolean(),
  autoScrapeEnabled: z.boolean(),
  persistedCandidates: z.array(candidateAssertionSchema),
  publicRequests: z.number().int().nonnegative(),
  liveDatabaseWrites: z.number().int().nonnegative(),
  cleanupPassed: z.boolean(),
  hardViolations: z.array(nonEmptyStringSchema),
  errors: z.array(nonEmptyStringSchema),
}).strict();

export type AffiliateMappingEvaluationExecutionResult = z.infer<
  typeof affiliateMappingEvaluationExecutionResultSchema
>;

export const affiliateMappingTrainingReadinessReportSchema = z.object({
  schemaVersion: z.literal(1),
  decision: z.enum(['DO_NOT_TRAIN', 'TRAINING_CANDIDATE', 'BASE_MODEL_SUFFICIENT']),
  goldReleaseSha256: sha256Schema,
  sourceGoldReleaseSha256s: z.array(sha256Schema).min(1),
  sftReleaseSha256: sha256Schema.nullable(),
  baseEvaluationSha256: sha256Schema.nullable(),
  runtimeObservationSha256: sha256Schema.nullable(),
  counts: z.object({
    train: z.number().int().nonnegative(),
    validation: z.number().int().nonnegative(),
    test: z.number().int().nonnegative(),
  }).strict(),
  realApprovedCounts: z.object({
    train: z.number().int().nonnegative(),
    validation: z.number().int().nonnegative(),
    test: z.number().int().nonnegative(),
  }).strict(),
  coverage: z.object({
    realExecutable: z.object({
      train: z.number().int().nonnegative(),
      validation: z.number().int().nonnegative(),
      test: z.number().int().nonnegative(),
      trainAndValidation: z.number().int().nonnegative(),
    }).strict(),
    realRefusals: z.object({
      train: z.number().int().nonnegative(),
      validation: z.number().int().nonnegative(),
      test: z.number().int().nonnegative(),
    }).strict(),
    executableTargetKinds: z.object({
      train: z.object({
        EVENT: z.number().int().nonnegative(),
        CLUB: z.number().int().nonnegative(),
        RENTAL: z.number().int().nonnegative(),
      }).strict(),
      validation: z.object({
        EVENT: z.number().int().nonnegative(),
        CLUB: z.number().int().nonnegative(),
        RENTAL: z.number().int().nonnegative(),
      }).strict(),
      trainAndValidation: z.object({
        EVENT: z.number().int().nonnegative(),
        CLUB: z.number().int().nonnegative(),
        RENTAL: z.number().int().nonnegative(),
      }).strict(),
    }).strict(),
    executableImplementationModes: z.object({
      train: countMapSchema,
      validation: countMapSchema,
    }).strict(),
  }).strict(),
  testRegistrableDomains: z.number().int().nonnegative(),
  blockingReasons: z.array(nonEmptyStringSchema),
  learnableErrorCategories: z.array(nonEmptyStringSchema),
  solCorrectionSummary: z.object({
    reviewed: z.number().int().nonnegative(),
    materialCorrections: z.number().int().nonnegative(),
    materialCorrectionRate: z.number().min(0).max(1),
  }).strict().nullable(),
}).strict();

export type AffiliateMappingTrainingReadinessReport = z.infer<
  typeof affiliateMappingTrainingReadinessReportSchema
>;

export const AFFILIATE_MAPPING_GOLD_CONTRACT_REVISION = 'affiliate-mapping-gold-v1';

const increment = (counts: Record<string, number>, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export const buildAffiliateMappingGoldRelease = (
  values: unknown[],
  options: {
    releaseId: string;
    createdAt: Date;
    repositoryCommit: string;
  },
): AffiliateMappingGoldRelease => {
  const releaseId = options.releaseId.trim();
  const repositoryCommit = options.repositoryCommit.trim();
  safeReleaseIdSchema.parse(releaseId);
  if (!repositoryCommit) throw new Error('Gold release repository commit is required.');

  const examples = values
    .map((value) => affiliateMappingGoldExampleSchema.parse(value))
    .sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  assertNoForbiddenAffiliateTrainingData(examples);

  const ids = new Set<string>();
  const domainSplits = new Map<string, AffiliateMappingGoldExample['split']>();
  for (const example of examples) {
    if (ids.has(example.exampleId)) {
      throw new Error(`Duplicate gold example id: ${example.exampleId}.`);
    }
    ids.add(example.exampleId);
    const existingSplit = domainSplits.get(example.registrableDomain);
    if (existingSplit && existingSplit !== example.split) {
      throw new Error(
        `Domain ${example.registrableDomain} leaks across ${existingSplit} and ${example.split}.`,
      );
    }
    domainSplits.set(example.registrableDomain, example.split);
  }

  const counts = {
    split: {} as Record<string, number>,
    target: {} as Record<string, number>,
    implementationMode: {} as Record<string, number>,
    evidenceOrigin: {} as Record<string, number>,
    registrableDomain: {} as Record<string, number>,
    platformFamily: {} as Record<string, number>,
    total: examples.length,
  };
  for (const example of examples) {
    increment(counts.split, example.split);
    increment(
      counts.target,
      example.target.type === 'LISTING_KIND'
        ? example.target.listingKind
        : example.target.refusalClass,
    );
    increment(counts.implementationMode, example.approvedDraft.implementationMode);
    increment(counts.evidenceOrigin, example.evidenceOrigin);
    increment(counts.registrableDomain, example.registrableDomain);
    increment(counts.platformFamily, example.platformFamily ?? 'NONE');
  }

  const release = {
    manifest: {
      schemaVersion: 1 as const,
      releaseId,
      createdAt: options.createdAt.toISOString(),
      repositoryCommit,
      promptContractVersion: 1 as const,
      systemPromptSha256: stableAgentArtifactSha256(AFFILIATE_MAPPING_SYSTEM_PROMPT),
      goldContractRevision: AFFILIATE_MAPPING_GOLD_CONTRACT_REVISION,
      exampleIds: examples.map((example) => example.exampleId),
      sourceEnvelopeSha256s: examples.map((example) => stableAgentArtifactSha256({
        context: example.context,
        fixturePages: example.fixturePages,
      })),
      rowSha256s: examples.map((example) => stableAgentArtifactSha256(example)),
      fixtureManifestFiles: examples.map(fixtureManifestFileFor),
      fixtureManifestSha256s: examples.map((example) => (
        stableAgentArtifactSha256(fixtureManifestForExample(example))
      )),
      counts,
    },
    examples,
  };
  return assertAffiliateMappingGoldReleaseIntegrity(release);
};

export const assertAffiliateMappingGoldReleaseIntegrity = (
  value: unknown,
): AffiliateMappingGoldRelease => {
  const release = affiliateMappingGoldReleaseSchema.parse(value);
  const { examples, manifest } = release;
  const expectedExampleIds = examples.map((example) => example.exampleId);
  const expectedSourceEnvelopeSha256s = examples.map((example) => (
    stableAgentArtifactSha256({
      context: example.context,
      fixturePages: example.fixturePages,
    })
  ));
  const expectedRowSha256s = examples.map((example) => stableAgentArtifactSha256(example));
  const expectedFixtureManifestFiles = examples.map(fixtureManifestFileFor);
  const expectedFixtureManifestSha256s = examples.map((example) => (
    stableAgentArtifactSha256(fixtureManifestForExample(example))
  ));
  const assertArrayMatches = (
    label: string,
    actual: string[],
    expected: string[],
  ) => {
    if (
      actual.length !== expected.length
      || actual.some((item, index) => item !== expected[index])
    ) {
      throw new Error(`Gold release ${label} do not match its examples.`);
    }
  };
  assertArrayMatches('example ids', manifest.exampleIds, expectedExampleIds);
  assertArrayMatches(
    'source envelope hashes',
    manifest.sourceEnvelopeSha256s,
    expectedSourceEnvelopeSha256s,
  );
  assertArrayMatches('row hashes', manifest.rowSha256s, expectedRowSha256s);
  assertArrayMatches(
    'fixture manifest files',
    manifest.fixtureManifestFiles,
    expectedFixtureManifestFiles,
  );
  assertArrayMatches(
    'fixture manifest hashes',
    manifest.fixtureManifestSha256s,
    expectedFixtureManifestSha256s,
  );
  if (manifest.counts.total !== examples.length) {
    throw new Error('Gold release total count does not match its examples.');
  }
  return release;
};

export const renderAffiliateMappingGoldJsonLines = (
  examples: AffiliateMappingGoldExample[],
): string => (
  examples.length ? `${examples.map((example) => JSON.stringify(example)).join('\n')}\n` : ''
);

export const affiliateMappingGoldFixtureManifest = (
  example: AffiliateMappingGoldExample,
): ReturnType<typeof fixtureManifestForExample> => fixtureManifestForExample(example);

export const affiliateMappingTeachingEnvelopeFromGoldExample = (
  value: unknown,
): AffiliateMappingTeachingEnvelope => {
  const example = affiliateMappingGoldExampleSchema.parse(value);
  const draftHash = stableAgentArtifactSha256(example.approvedDraft);
  return affiliateMappingTeachingEnvelopeSchema.parse({
    schemaVersion: 1,
    trainingExample: {
      schemaVersion: 1,
      exampleId: example.exampleId,
      evidenceLabel: example.approvedDraft.implementationMode === 'BLOCKED'
        ? 'BLOCKED'
        : 'FAITHFUL',
      input: {
        intakeSourceKey: example.context.sourceKey,
        runId: example.context.runId,
        artifacts: Array.from(new Map(
          example.context.artifacts.map((artifact) => [
            `${artifact.kind}|${artifact.sha256}`,
            {
              kind: artifact.kind,
              sha256: artifact.sha256,
            },
          ]),
        ).values()),
        contextContractVersion: 1,
      },
      output: {
        draftHash,
        approvedMappingHash: example.approvedDraft.mapping
          ? stableAgentArtifactSha256(example.approvedDraft.mapping)
          : null,
        approvedCandidateFixtureHash: example.expectedPersistedCandidates.length
          ? stableAgentArtifactSha256(example.expectedPersistedCandidates)
          : null,
      },
      correction: null,
      split: example.split,
      registrableDomain: example.registrableDomain,
      platformFamily: example.platformFamily,
      humanApproval: {
        approvedByUserId: example.humanApproval.approvedByUserId,
        approvedAt: example.humanApproval.approvedAt,
      },
    },
    context: example.context,
    approvedDraft: example.approvedDraft,
  });
};

const runtimeEligibilityIssues = (
  observation: AffiliateModelRuntimeObservation | null,
): string[] => {
  if (!observation) return ['No verified OVH runtime observation.'];
  const issues: string[] = [];
  if (!observation.serving.offlineColdStartPassed) issues.push('Offline cold start failed.');
  if (observation.serving.peakResidentMemoryBytes > 22 * 1024 ** 3) {
    issues.push('Peak resident memory exceeds 22 GiB.');
  }
  if (observation.serving.peakSwapBytes > 512 * 1024 ** 2) {
    issues.push('Peak swap exceeds 512 MiB.');
  }
  if (observation.serving.minimumAvailableMemoryBytes < 1024 ** 3) {
    issues.push('Available memory fell below 1 GiB.');
  }
  if (observation.serving.representativeJobWallMs > 90 * 60 * 1000) {
    issues.push('Representative job exceeded 90 minutes.');
  }
  if (observation.serving.contextTokens !== 8192) {
    issues.push('Runtime context is not frozen at 8192 tokens.');
  }
  if (observation.serving.maximumOutputTokens !== 2048) {
    issues.push('Runtime output is not frozen at 2048 tokens.');
  }
  return issues;
};

export const buildAffiliateMappingTrainingReadinessReport = (input: {
  goldRelease: AffiliateMappingGoldRelease;
  sftManifest: AffiliateMappingSftRelease['manifest'] | null;
  baseEvaluation: AffiliateMappingEvaluationReport | null;
  runtimeObservation: AffiliateModelRuntimeObservation | null;
  solCorrectionSummary?: {
    reviewed: number;
    materialCorrections: number;
  };
  learnableErrorCategories?: string[];
  sourceGoldReleaseSha256s?: string[];
}): AffiliateMappingTrainingReadinessReport => {
  const goldRelease = assertAffiliateMappingGoldReleaseIntegrity(input.goldRelease);
  const countsForSplit = (split: AffiliateMappingGoldExample['split']) => (
    goldRelease.examples.filter((example) => example.split === split).length
  );
  const realCountForSplit = (split: AffiliateMappingGoldExample['split']) => (
    goldRelease.examples.filter((example) => (
      example.split === split && example.evidenceOrigin === 'REAL_CAPTURE'
    )).length
  );
  const counts = {
    train: countsForSplit('train'),
    validation: countsForSplit('validation'),
    test: countsForSplit('test'),
  };
  const realApprovedCounts = {
    train: realCountForSplit('train'),
    validation: realCountForSplit('validation'),
    test: realCountForSplit('test'),
  };
  const isRealExecutable = (example: AffiliateMappingGoldExample): boolean => (
    example.evidenceOrigin === 'REAL_CAPTURE'
    && example.target.type === 'LISTING_KIND'
    && (
      example.approvedDraft.implementationMode === 'GENERIC_MAPPING'
      || example.approvedDraft.implementationMode === 'MANUAL_CANDIDATES'
    )
  );
  const realExecutableForSplit = (split: AffiliateMappingGoldExample['split']) => (
    goldRelease.examples.filter((example) => example.split === split && isRealExecutable(example))
  );
  const realRefusalsForSplit = (split: AffiliateMappingGoldExample['split']) => (
    goldRelease.examples.filter((example) => (
      example.split === split
      && example.evidenceOrigin === 'REAL_CAPTURE'
      && example.target.type === 'REFUSAL'
    ))
  );
  const executableTargetKindCounts = (examples: AffiliateMappingGoldExample[]) => ({
    EVENT: examples.filter((example) => (
      example.target.type === 'LISTING_KIND' && example.target.listingKind === 'EVENT'
    )).length,
    CLUB: examples.filter((example) => (
      example.target.type === 'LISTING_KIND' && example.target.listingKind === 'CLUB'
    )).length,
    RENTAL: examples.filter((example) => (
      example.target.type === 'LISTING_KIND' && example.target.listingKind === 'RENTAL'
    )).length,
  });
  const executableModeCounts = (examples: AffiliateMappingGoldExample[]) => {
    const result: Record<string, number> = {};
    for (const example of examples) increment(result, example.approvedDraft.implementationMode);
    return result;
  };
  const trainExecutable = realExecutableForSplit('train');
  const validationExecutable = realExecutableForSplit('validation');
  const testExecutable = realExecutableForSplit('test');
  const trainAndValidationExecutable = [...trainExecutable, ...validationExecutable];
  const coverage = {
    realExecutable: {
      train: trainExecutable.length,
      validation: validationExecutable.length,
      test: testExecutable.length,
      trainAndValidation: trainAndValidationExecutable.length,
    },
    realRefusals: {
      train: realRefusalsForSplit('train').length,
      validation: realRefusalsForSplit('validation').length,
      test: realRefusalsForSplit('test').length,
    },
    executableTargetKinds: {
      train: executableTargetKindCounts(trainExecutable),
      validation: executableTargetKindCounts(validationExecutable),
      trainAndValidation: executableTargetKindCounts(trainAndValidationExecutable),
    },
    executableImplementationModes: {
      train: executableModeCounts(trainExecutable),
      validation: executableModeCounts(validationExecutable),
    },
  };
  const testRegistrableDomains = new Set(
    goldRelease.examples
      .filter((example) => (
        example.split === 'test' && example.evidenceOrigin === 'REAL_CAPTURE'
      ))
      .map((example) => example.registrableDomain),
  ).size;
  const blockingReasons: string[] = [];
  const datasetReady = (
    realApprovedCounts.train >= 80
    && realApprovedCounts.validation >= 15
    && realApprovedCounts.test >= 30
    && testRegistrableDomains >= 30
    && coverage.realExecutable.trainAndValidation >= 95
    && coverage.executableTargetKinds.trainAndValidation.CLUB >= 11
    && coverage.executableTargetKinds.trainAndValidation.RENTAL >= 11
    && coverage.executableTargetKinds.train.CLUB >= 10
    && coverage.executableTargetKinds.train.RENTAL >= 10
    && coverage.realRefusals.train >= 12
    && coverage.realRefusals.validation >= 3
    && coverage.executableTargetKinds.validation.EVENT > 0
    && coverage.executableTargetKinds.validation.CLUB > 0
    && coverage.executableTargetKinds.validation.RENTAL > 0
    && (coverage.executableImplementationModes.train.GENERIC_MAPPING ?? 0) > 0
    && (coverage.executableImplementationModes.train.MANUAL_CANDIDATES ?? 0) > 0
    && (coverage.executableImplementationModes.validation.GENERIC_MAPPING ?? 0) > 0
    && (coverage.executableImplementationModes.validation.MANUAL_CANDIDATES ?? 0) > 0
  );
  if (realApprovedCounts.test < 30) {
    blockingReasons.push('Fewer than 30 real approved held-out test examples.');
  }
  if (testRegistrableDomains < 30) {
    blockingReasons.push('Fewer than 30 real held-out test registrable domains.');
  }
  if (realApprovedCounts.train < 80) {
    blockingReasons.push('Fewer than 80 real approved training examples.');
  }
  if (realApprovedCounts.validation < 15) {
    blockingReasons.push('Fewer than 15 real approved validation examples.');
  }
  if (coverage.realExecutable.trainAndValidation < 95) {
    blockingReasons.push(
      'Fewer than 95 real approved executable training-plus-validation examples.',
    );
  }
  if (coverage.executableTargetKinds.trainAndValidation.CLUB < 11) {
    blockingReasons.push(
      'Fewer than 11 real approved executable CLUB training-plus-validation examples.',
    );
  }
  if (coverage.executableTargetKinds.trainAndValidation.RENTAL < 11) {
    blockingReasons.push(
      'Fewer than 11 real approved executable RENTAL training-plus-validation examples.',
    );
  }
  if (coverage.executableTargetKinds.train.CLUB < 10) {
    blockingReasons.push('Fewer than 10 executable CLUB training examples.');
  }
  if (coverage.executableTargetKinds.train.RENTAL < 10) {
    blockingReasons.push('Fewer than 10 executable RENTAL training examples.');
  }
  if (coverage.realRefusals.train < 12) {
    blockingReasons.push('Fewer than 12 real refusal training examples.');
  }
  if (coverage.realRefusals.validation < 3) {
    blockingReasons.push('Fewer than 3 real refusal validation examples.');
  }
  for (const targetKind of ['EVENT', 'CLUB', 'RENTAL'] as const) {
    if (coverage.executableTargetKinds.validation[targetKind] === 0) {
      blockingReasons.push(`Validation has no executable ${targetKind} example.`);
    }
  }
  for (const split of ['train', 'validation'] as const) {
    if ((coverage.executableImplementationModes[split].GENERIC_MAPPING ?? 0) === 0) {
      blockingReasons.push(`${split} has no executable generic selector mapping example.`);
    }
    if ((coverage.executableImplementationModes[split].MANUAL_CANDIDATES ?? 0) === 0) {
      blockingReasons.push(`${split} has no executable manual-candidate example.`);
    }
  }
  if (!input.sftManifest) {
    blockingReasons.push('No immutable SFT release manifest.');
  } else if (
    input.sftManifest.counts.train < 80
    || input.sftManifest.counts.validation < 15
  ) {
    blockingReasons.push('SFT release does not meet the 80 train and 15 validation minimum.');
  }
  if (!input.baseEvaluation) {
    blockingReasons.push('No untouched-base evaluation.');
  } else {
    if (input.baseEvaluation.summary.hardViolationCount > 0) {
      blockingReasons.push('Untouched base evaluation contains hard safety violations.');
    }
    if (input.baseEvaluation.summary.exampleCount < realApprovedCounts.test) {
      blockingReasons.push('Untouched base evaluation did not cover the full real test release.');
    }
  }
  blockingReasons.push(...runtimeEligibilityIssues(input.runtimeObservation));

  const learnableErrorCategories = Array.from(new Set(
    (input.learnableErrorCategories ?? []).map((category) => category.trim()).filter(Boolean),
  )).sort();
  const runtimeReady = runtimeEligibilityIssues(input.runtimeObservation).length === 0;
  const baseSafe = Boolean(
    input.baseEvaluation
    && input.baseEvaluation.summary.hardViolationCount === 0
    && input.baseEvaluation.summary.exampleCount >= realApprovedCounts.test,
  );
  let decision: AffiliateMappingTrainingReadinessReport['decision'] = 'DO_NOT_TRAIN';
  if (
    input.baseEvaluation?.summary.assistedPilotEligible
    && baseSafe
    && runtimeReady
    && realApprovedCounts.test >= 30
    && testRegistrableDomains >= 30
  ) {
    decision = 'BASE_MODEL_SUFFICIENT';
  } else if (
    datasetReady
    && input.sftManifest
    && input.sftManifest.counts.train >= 80
    && input.sftManifest.counts.validation >= 15
    && baseSafe
    && runtimeReady
    && learnableErrorCategories.length > 0
  ) {
    decision = 'TRAINING_CANDIDATE';
  }

  const solCorrectionSummary = input.solCorrectionSummary
    ? {
      reviewed: input.solCorrectionSummary.reviewed,
      materialCorrections: input.solCorrectionSummary.materialCorrections,
      materialCorrectionRate: input.solCorrectionSummary.reviewed
        ? input.solCorrectionSummary.materialCorrections / input.solCorrectionSummary.reviewed
        : 0,
    }
    : null;
  if (
    solCorrectionSummary
    && solCorrectionSummary.materialCorrections > solCorrectionSummary.reviewed
  ) {
    throw new Error('Sol material corrections cannot exceed reviewed examples.');
  }
  const goldReleaseSha256 = stableAgentArtifactSha256(goldRelease);
  const sourceGoldReleaseSha256s = Array.from(new Set(
    input.sourceGoldReleaseSha256s ?? [goldReleaseSha256],
  )).sort();

  return affiliateMappingTrainingReadinessReportSchema.parse({
    schemaVersion: 1,
    decision,
    goldReleaseSha256,
    sourceGoldReleaseSha256s,
    sftReleaseSha256: input.sftManifest
      ? stableAgentArtifactSha256(input.sftManifest)
      : null,
    baseEvaluationSha256: input.baseEvaluation
      ? stableAgentArtifactSha256(input.baseEvaluation)
      : null,
    runtimeObservationSha256: input.runtimeObservation
      ? stableAgentArtifactSha256(input.runtimeObservation)
      : null,
    counts,
    realApprovedCounts,
    coverage,
    testRegistrableDomains,
    blockingReasons: decision === 'BASE_MODEL_SUFFICIENT' ? [] : blockingReasons,
    learnableErrorCategories,
    solCorrectionSummary,
  });
};
