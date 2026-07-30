import { z } from 'zod';
import {
  affiliateAgentTargetKindSchema,
  affiliateMappingTrainingExampleSchema,
  affiliateSourceDraftSchema,
  stableAgentArtifactSha256,
  type AffiliateMappingTrainingExample,
  type AffiliateSourceDraft,
} from './agentContracts';
import {
  AFFILIATE_MAPPING_SYSTEM_PROMPT,
  type AffiliateMappingJobContext,
} from './agentModelClient';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const nonEmptyStringSchema = z.string().trim().min(1);

const mappingJobContextSchema = z.object({
  jobId: nonEmptyStringSchema,
  intakeId: nonEmptyStringSchema,
  sourceKey: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  evidenceRunIds: z.array(nonEmptyStringSchema).min(1).optional(),
  policyDisposition: z.enum(['ALLOWED', 'BLOCKED', 'NEEDS_REVIEW']),
  targetKindHints: z.array(affiliateAgentTargetKindSchema),
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

export const affiliateMappingTeachingEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  trainingExample: affiliateMappingTrainingExampleSchema,
  context: mappingJobContextSchema,
  approvedDraft: affiliateSourceDraftSchema,
}).strict();

export type AffiliateMappingTeachingEnvelope = z.infer<
  typeof affiliateMappingTeachingEnvelopeSchema
>;

export type AffiliateMappingSftRow = {
  schemaVersion: 1;
  exampleId: string;
  split: 'train' | 'validation' | 'test';
  registrableDomain: string;
  evidenceLabel: 'FAITHFUL' | 'BLOCKED';
  sourceEnvelopeSha256: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
};

export type AffiliateMappingSftRelease = {
  manifest: {
    schemaVersion: 1;
    releaseId: string;
    createdAt: string;
    promptContractVersion: 1;
    systemPromptSha256: string;
    sourceEnvelopeSha256s: string[];
    rowSha256s: string[];
    counts: Record<'train' | 'validation' | 'test' | 'total', number>;
    registrableDomains: Record<'train' | 'validation' | 'test', string[]>;
  };
  rows: AffiliateMappingSftRow[];
};

const affiliateMappingSftRowSchema = z.object({
  schemaVersion: z.literal(1),
  exampleId: nonEmptyStringSchema,
  split: z.enum(['train', 'validation', 'test']),
  registrableDomain: nonEmptyStringSchema,
  evidenceLabel: z.enum(['FAITHFUL', 'BLOCKED']),
  sourceEnvelopeSha256: sha256Schema,
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  }).strict()).length(3),
}).strict();

export const affiliateMappingSftReleaseSchema = z.object({
  manifest: z.object({
    schemaVersion: z.literal(1),
    releaseId: nonEmptyStringSchema,
    createdAt: z.string().datetime({ offset: true }),
    promptContractVersion: z.literal(1),
    systemPromptSha256: sha256Schema,
    sourceEnvelopeSha256s: z.array(sha256Schema),
    rowSha256s: z.array(sha256Schema),
    counts: z.object({
      train: z.number().int().nonnegative(),
      validation: z.number().int().nonnegative(),
      test: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }).strict(),
    registrableDomains: z.object({
      train: z.array(nonEmptyStringSchema),
      validation: z.array(nonEmptyStringSchema),
      test: z.array(nonEmptyStringSchema),
    }).strict(),
  }).strict(),
  rows: z.array(affiliateMappingSftRowSchema),
}).strict();

const forbiddenTrainingDataPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { label: 'database URL', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\//i },
  { label: 'bearer credential', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { label: 'GitHub credential', pattern: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{12,}/i },
  { label: 'provider API credential', pattern: /\b(?:sk-|AKIA)[A-Za-z0-9_-]{12,}/ },
  { label: 'direct email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  {
    label: 'signed or credentialed URL',
    pattern: /[?&](?:x-amz-[^=]*|sig|signature|token|api[_-]?key|access[_-]?key|auth)=[^&\s"]+/i,
  },
];

export const assertNoForbiddenAffiliateTrainingData = (value: unknown): void => {
  const serialized = JSON.stringify(value);
  const match = forbiddenTrainingDataPatterns.find(({ pattern }) => pattern.test(serialized));
  if (match) throw new Error(`Training envelope contains a forbidden ${match.label}.`);
};

const expectedDraftHashes = (example: AffiliateMappingTrainingExample): string[] => [
  example.output?.draftHash,
  example.correction?.approvedCorrectedDraftHash,
].filter((value): value is string => Boolean(value));

const validateTeachingEnvelope = (
  envelope: AffiliateMappingTeachingEnvelope,
): {
  example: AffiliateMappingTrainingExample;
  context: AffiliateMappingJobContext;
  draft: AffiliateSourceDraft;
} => {
  const { trainingExample: example, context, approvedDraft: draft } = envelope;
  if (!['FAITHFUL', 'BLOCKED'].includes(example.evidenceLabel)) {
    throw new Error(
      `${example.exampleId} is ${example.evidenceLabel}; only FAITHFUL and BLOCKED examples may train.`,
    );
  }
  if (!example.humanApproval) {
    throw new Error(`${example.exampleId} has no human approval.`);
  }
  if (
    context.sourceKey !== example.input.intakeSourceKey
    || context.runId !== example.input.runId
    || draft.sourceKey !== context.sourceKey
    || draft.runId !== context.runId
    || draft.intakeId !== context.intakeId
  ) {
    throw new Error(`${example.exampleId} has inconsistent source, intake, or evidence-run identity.`);
  }
  const contextArtifactHashes = new Set(context.artifacts.map((artifact) => artifact.sha256));
  const missingArtifact = example.input.artifacts.find(
    (artifact) => !contextArtifactHashes.has(artifact.sha256),
  );
  if (missingArtifact) {
    throw new Error(
      `${example.exampleId} is missing context artifact ${missingArtifact.sha256}.`,
    );
  }
  const draftHash = stableAgentArtifactSha256(draft);
  if (!expectedDraftHashes(example).includes(draftHash)) {
    throw new Error(`${example.exampleId} approved draft does not match an approved draft hash.`);
  }
  if (
    example.evidenceLabel === 'BLOCKED'
    && (
      draft.policyDisposition !== 'BLOCKED'
      || draft.implementationMode !== 'BLOCKED'
      || draft.mapping !== null
    )
  ) {
    throw new Error(`${example.exampleId} BLOCKED training output is not a safe refusal.`);
  }
  assertNoForbiddenAffiliateTrainingData(envelope);
  return { example, context, draft };
};

const rowForEnvelope = (
  envelope: AffiliateMappingTeachingEnvelope,
): AffiliateMappingSftRow => {
  const { example, context, draft } = validateTeachingEnvelope(envelope);
  return {
    schemaVersion: 1,
    exampleId: example.exampleId,
    split: example.split,
    registrableDomain: example.registrableDomain,
    evidenceLabel: example.evidenceLabel as 'FAITHFUL' | 'BLOCKED',
    sourceEnvelopeSha256: stableAgentArtifactSha256(envelope),
    messages: [
      { role: 'system', content: AFFILIATE_MAPPING_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(context) },
      { role: 'assistant', content: JSON.stringify(draft) },
    ],
  };
};

export const buildAffiliateMappingSftRelease = (
  values: unknown[],
  options: { releaseId: string; createdAt: Date },
): AffiliateMappingSftRelease => {
  const releaseId = options.releaseId.trim();
  if (!releaseId) throw new Error('Training release id is required.');
  const envelopes = values.map((value) => affiliateMappingTeachingEnvelopeSchema.parse(value));
  const rows = envelopes.map(rowForEnvelope).sort(
    (left, right) => left.exampleId.localeCompare(right.exampleId),
  );
  const exampleIds = new Set<string>();
  const domainSplits = new Map<string, AffiliateMappingSftRow['split']>();
  for (const row of rows) {
    if (exampleIds.has(row.exampleId)) {
      throw new Error(`Duplicate training example id: ${row.exampleId}.`);
    }
    exampleIds.add(row.exampleId);
    const existingSplit = domainSplits.get(row.registrableDomain);
    if (existingSplit && existingSplit !== row.split) {
      throw new Error(
        `Domain ${row.registrableDomain} leaks across ${existingSplit} and ${row.split}.`,
      );
    }
    domainSplits.set(row.registrableDomain, row.split);
  }
  const forSplit = (split: AffiliateMappingSftRow['split']) => (
    rows.filter((row) => row.split === split)
  );
  const domainsForSplit = (split: AffiliateMappingSftRow['split']) => Array.from(new Set(
    forSplit(split).map((row) => row.registrableDomain),
  )).sort();
  return assertAffiliateMappingSftReleaseIntegrity({
    manifest: {
      schemaVersion: 1,
      releaseId,
      createdAt: options.createdAt.toISOString(),
      promptContractVersion: 1,
      systemPromptSha256: stableAgentArtifactSha256(AFFILIATE_MAPPING_SYSTEM_PROMPT),
      sourceEnvelopeSha256s: rows.map((row) => row.sourceEnvelopeSha256),
      rowSha256s: rows.map((row) => stableAgentArtifactSha256(row)),
      counts: {
        train: forSplit('train').length,
        validation: forSplit('validation').length,
        test: forSplit('test').length,
        total: rows.length,
      },
      registrableDomains: {
        train: domainsForSplit('train'),
        validation: domainsForSplit('validation'),
        test: domainsForSplit('test'),
      },
    },
    rows,
  });
};

export const assertAffiliateMappingSftReleaseIntegrity = (
  value: unknown,
): AffiliateMappingSftRelease => {
  const release = affiliateMappingSftReleaseSchema.parse(value) as AffiliateMappingSftRelease;
  const rows = release.rows;
  const expectedSourceEnvelopeSha256s = rows.map((row) => row.sourceEnvelopeSha256);
  const expectedRowSha256s = rows.map((row) => stableAgentArtifactSha256(row));
  const expectedCounts = {
    train: rows.filter((row) => row.split === 'train').length,
    validation: rows.filter((row) => row.split === 'validation').length,
    test: rows.filter((row) => row.split === 'test').length,
    total: rows.length,
  };
  const domainsForSplit = (split: AffiliateMappingSftRow['split']) => Array.from(new Set(
    rows.filter((row) => row.split === split).map((row) => row.registrableDomain),
  )).sort();
  const expectedDomains = {
    train: domainsForSplit('train'),
    validation: domainsForSplit('validation'),
    test: domainsForSplit('test'),
  };
  const assertArrayMatches = (
    label: string,
    actual: string[],
    expected: string[],
  ) => {
    if (
      actual.length !== expected.length
      || actual.some((item, index) => item !== expected[index])
    ) {
      throw new Error(`SFT release ${label} do not match its rows.`);
    }
  };
  assertArrayMatches(
    'source envelope hashes',
    release.manifest.sourceEnvelopeSha256s,
    expectedSourceEnvelopeSha256s,
  );
  assertArrayMatches('row hashes', release.manifest.rowSha256s, expectedRowSha256s);
  for (const split of ['train', 'validation', 'test'] as const) {
    assertArrayMatches(
      `${split} domains`,
      release.manifest.registrableDomains[split],
      expectedDomains[split],
    );
  }
  if (JSON.stringify(release.manifest.counts) !== JSON.stringify(expectedCounts)) {
    throw new Error('SFT release counts do not match its rows.');
  }
  if (
    release.manifest.systemPromptSha256
    !== stableAgentArtifactSha256(AFFILIATE_MAPPING_SYSTEM_PROMPT)
  ) {
    throw new Error('SFT release system prompt hash does not match the current contract.');
  }
  const ids = new Set<string>();
  const domainSplits = new Map<string, AffiliateMappingSftRow['split']>();
  for (const row of rows) {
    if (
      row.messages[0]?.role !== 'system'
      || row.messages[0].content !== AFFILIATE_MAPPING_SYSTEM_PROMPT
      || row.messages[1]?.role !== 'user'
      || row.messages[2]?.role !== 'assistant'
    ) {
      throw new Error(`${row.exampleId} does not use the frozen system/user/assistant message order.`);
    }
    if (ids.has(row.exampleId)) {
      throw new Error(`Duplicate training example id: ${row.exampleId}.`);
    }
    ids.add(row.exampleId);
    const existingSplit = domainSplits.get(row.registrableDomain);
    if (existingSplit && existingSplit !== row.split) {
      throw new Error(
        `Domain ${row.registrableDomain} leaks across ${existingSplit} and ${row.split}.`,
      );
    }
    domainSplits.set(row.registrableDomain, row.split);
  }
  return release;
};

export const renderAffiliateMappingSftJsonLines = (
  rows: AffiliateMappingSftRow[],
): string => (
  rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')
);
