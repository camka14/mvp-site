import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  affiliateMappingWorkerResultSchema,
  affiliateSourceDraftSchema,
  stableAgentArtifactSha256,
  type AffiliateMappingWorkerResult,
} from './agentContracts';
import { renderAffiliateSourceDraft, writeAffiliateGeneratedFiles } from './agentGenerator';
import type {
  AffiliateMappingJobContext,
  AffiliateMappingModelClient,
} from './agentModelClient';

const execFileAsync = promisify(execFile);

export type AffiliateRunnerValidationResult = {
  testsPassed: boolean;
  scrapePassed: boolean;
  warnings: string[];
};

export type AffiliateRunnerValidator = (input: {
  worktreeRoot: string;
  generatedPaths: string[];
}) => Promise<AffiliateRunnerValidationResult>;

const isRefusalMode = (mode: string): boolean => (
  mode === 'BLOCKED' || mode === 'INSUFFICIENT_EVIDENCE'
);

export const runAffiliateMappingDraftJob = async (input: {
  context: AffiliateMappingJobContext;
  workerId: string;
  modelClient: AffiliateMappingModelClient;
  modelManifestSha256: string;
  promptContractVersion: number;
  worktreeRoot: string;
  validate?: AffiliateRunnerValidator;
}): Promise<AffiliateMappingWorkerResult> => {
  const startedAt = Date.now();
  const modelStartedAt = Date.now();
  const model = await input.modelClient.modelRevision();
  const rawDraft = await input.modelClient.createDraft(input.context);
  const modelMs = Date.now() - modelStartedAt;
  const draft = affiliateSourceDraftSchema.parse(rawDraft);

  const contextArtifactHashes = new Set(input.context.artifacts.map((artifact) => artifact.sha256));
  for (const evidence of draft.evidence) {
    if (!contextArtifactHashes.has(evidence.artifactSha256)) {
      throw new Error(`Draft cites evidence outside the job bundle: ${evidence.artifactSha256}`);
    }
  }
  if (
    draft.intakeId !== input.context.intakeId
    || draft.sourceKey !== input.context.sourceKey
    || draft.runId !== input.context.runId
  ) {
    throw new Error('Draft identity does not match the claimed intake job.');
  }
  if (draft.policyDisposition !== input.context.policyDisposition) {
    throw new Error('Draft policy disposition does not match the reviewed intake policy.');
  }

  const renderStartedAt = Date.now();
  const refusal = isRefusalMode(draft.implementationMode);
  const files = refusal ? [] : renderAffiliateSourceDraft(draft);
  if (files.length) {
    await writeAffiliateGeneratedFiles({
      rootDirectory: input.worktreeRoot,
      files,
    });
  }
  const renderMs = Date.now() - renderStartedAt;
  const validationStartedAt = Date.now();
  const validation = input.validate
    ? await input.validate({
        worktreeRoot: input.worktreeRoot,
        generatedPaths: files.map((file) => file.path),
      })
    : {
        testsPassed: false,
        scrapePassed: false,
        warnings: ['Validation was not executed.'],
      };
  const validationMs = Date.now() - validationStartedAt;
  const draftSha256 = stableAgentArtifactSha256(draft);
  return affiliateMappingWorkerResultSchema.parse({
    schemaVersion: 1,
    jobId: input.context.jobId,
    intakeId: input.context.intakeId,
    status: refusal ? 'REFUSED' : 'DRAFT_READY',
    workerId: input.workerId,
    model,
    modelManifestSha256: input.modelManifestSha256,
    promptContractVersion: input.promptContractVersion,
    evidenceRunId: input.context.runId,
    evidenceArtifactSha256s: [...contextArtifactHashes].sort(),
    draft,
    draftSha256,
    generatedFiles: files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
    validation: {
      schemaPassed: true,
      testsPassed: validation.testsPassed,
      scrapePassed: validation.scrapePassed,
      warnings: validation.warnings,
    },
    timingsMs: {
      model: modelMs,
      render: renderMs,
      validation: validationMs,
      total: Date.now() - startedAt,
    },
    errorMessage: null,
  });
};

export const createIsolatedAffiliateAgentWorktree = async (input: {
  repositoryRoot: string;
  baseCommit: string;
  parentDirectory?: string;
}): Promise<{ path: string; baseCommit: string }> => {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const { stdout } = await execFileAsync('git', [
    'rev-parse',
    '--verify',
    `${input.baseCommit}^{commit}`,
  ], {
    cwd: repositoryRoot,
    maxBuffer: 128 * 1024,
  });
  const baseCommit = stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(baseCommit)) throw new Error('Invalid Git base commit.');
  const parentDirectory = path.resolve(
    input.parentDirectory ?? path.join(os.tmpdir(), 'bracketiq-affiliate-agent-worktrees'),
  );
  await fs.mkdir(parentDirectory, { recursive: true });
  const worktreePath = await fs.mkdtemp(path.join(parentDirectory, 'job-'));
  try {
    await execFileAsync('git', ['worktree', 'add', '--detach', worktreePath, baseCommit], {
      cwd: repositoryRoot,
      maxBuffer: 512 * 1024,
    });
  } catch (error) {
    await fs.rm(worktreePath, { recursive: true, force: true });
    throw error;
  }
  return { path: worktreePath, baseCommit };
};

export const validateAffiliateAgentWorktreeDiff = async (
  worktreeRoot: string,
): Promise<void> => {
  await execFileAsync('git', ['diff', '--check'], {
    cwd: worktreeRoot,
    maxBuffer: 512 * 1024,
  });
  const { stdout } = await execFileAsync('git', ['status', '--short'], {
    cwd: worktreeRoot,
    maxBuffer: 512 * 1024,
  });
  const allowedPrefixes = [
    'docs/affiliate-source-registry-fragments/',
    'scripts/setup-',
    'src/server/affiliateImports/__tests__/',
    'src/server/affiliateImports/generatedSources/',
  ];
  const disallowed = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((relativePath) => !allowedPrefixes.some((prefix) => relativePath.startsWith(prefix)));
  if (disallowed.length) {
    throw new Error(`Agent worktree contains disallowed paths: ${disallowed.join(', ')}`);
  }
};
