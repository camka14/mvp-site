import fs from 'node:fs/promises';
import path from 'node:path';
import { AffiliateAgentToolbox } from './agentTooling';
import type { AffiliateMappingJobContext } from './agentModelClient';
import {
  isAffiliateAgentTargetKind,
} from './agentContracts';

type ExportManifest = {
  sourceEvidence?: {
    intakeId?: string;
    intakeSourceKey?: string;
    runId?: string;
    complianceStatus?: string | null;
  };
  intake?: {
    id?: string;
    sourceKey?: string;
    complianceStatus?: string | null;
    targetKindHints?: string[];
  };
};

const reviewedPolicy = (
  value: string | null | undefined,
): 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW' => {
  if (value === 'ALLOWED') return 'ALLOWED';
  if (value === 'BLOCKED') return 'BLOCKED';
  return 'NEEDS_REVIEW';
};

const redactAffiliatePromptExcerpt = (content: string): {
  content: string;
  redacted: boolean;
} => {
  const redacted = content
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[redacted-email]',
    )
    .replace(
      /\b(?:sk-|AKIA)[A-Za-z0-9_-]{12,}/g,
      '[redacted-provider-key]',
    )
    .replace(
      /[?&](?:x-amz-[^=&\s]*|sig|signature|token|api[_-]?key|access[_-]?key|auth)=[^&\s"'<>\\)]+/gi,
      '[redacted-signed-parameter]',
    );
  return {
    content: redacted,
    redacted: redacted !== content,
  };
};

const readManifest = async (evidenceDirectory: string): Promise<ExportManifest> => (
  JSON.parse(
    await fs.readFile(path.join(path.resolve(evidenceDirectory), 'manifest.json'), 'utf8'),
  ) as ExportManifest
);

export const buildAffiliateMappingJobContextFromExport = async (input: {
  jobId: string;
  evidenceDirectory: string;
  repositoryRoot: string;
  instructionsRevision: string;
}): Promise<{
  context: AffiliateMappingJobContext;
  toolbox: AffiliateAgentToolbox;
}> => buildAffiliateMappingJobContextFromExports({
  jobId: input.jobId,
  evidenceDirectories: [input.evidenceDirectory],
  repositoryRoot: input.repositoryRoot,
  instructionsRevision: input.instructionsRevision,
});

export const buildAffiliateMappingJobContextFromExports = async (input: {
  jobId: string;
  evidenceDirectories: string[];
  repositoryRoot: string;
  instructionsRevision: string;
}): Promise<{
  context: AffiliateMappingJobContext;
  toolbox: AffiliateAgentToolbox;
}> => {
  if (input.evidenceDirectories.length === 0) {
    throw new Error('At least one evidence export is required.');
  }
  const exports = await Promise.all(input.evidenceDirectories.map(async (evidenceDirectory) => {
    const toolbox = new AffiliateAgentToolbox({
      evidenceDirectory,
      repositoryRoot: input.repositoryRoot,
      writableRoot: input.repositoryRoot,
      allowedRepositoryRoots: [
        'src/server/affiliateImports/types.ts',
        'docs/admin-affiliate-scrape-sources.md',
        'docs/admin-affiliate-scraping-execplan.md',
        'docs/affiliate-source-mapping-slm-execplan.md',
      ],
      maxArtifactReadBytes: 3 * 1024,
      maxRepositoryReadBytes: 2 * 1024,
    });
    const [manifest, artifacts] = await Promise.all([
      readManifest(evidenceDirectory),
      toolbox.verifyEvidenceBundle(),
    ]);
    const sourceEvidence = manifest.sourceEvidence ?? {};
    const intake = manifest.intake ?? {};
    const intakeId = sourceEvidence.intakeId ?? intake.id;
    const sourceKey = sourceEvidence.intakeSourceKey ?? intake.sourceKey;
    const runId = sourceEvidence.runId;
    if (!intakeId || !sourceKey || !runId) {
      throw new Error('Evidence export is missing intake id, source key, or run id.');
    }
    return {
      toolbox,
      manifest,
      intakeId,
      sourceKey,
      runId,
      artifacts,
    };
  }));
  const primary = exports[0];
  const toolbox = primary.toolbox;
  const sourceEvidence = primary.manifest.sourceEvidence ?? {};
  const intake = primary.manifest.intake ?? {};
  const intakeId = sourceEvidence.intakeId ?? intake.id;
  const sourceKey = sourceEvidence.intakeSourceKey ?? intake.sourceKey;
  const runId = sourceEvidence.runId;
  if (!intakeId || !sourceKey || !runId) {
    throw new Error('Evidence export is missing intake id, source key, or run id.');
  }

  const artifacts = Array.from(new Map(
    exports.flatMap((exported) => exported.artifacts.map((artifact) => ({
      artifact,
      toolbox: exported.toolbox,
      intakeId: exported.intakeId,
      runId: exported.runId,
    }))).map((row) => [
      [
        row.artifact.kind,
        row.artifact.sha256,
        row.artifact.sourceUrl ?? row.artifact.finalUrl ?? '',
        row.intakeId,
        row.runId,
      ].join('|'),
      row,
    ]),
  ).values());
  const policyEvidence = artifacts
    .filter(({ artifact }) => artifact.kind === 'POLICY_NOTE' || artifact.kind === 'ROBOTS')
    .sort((left, right) => (
      left.artifact.kind.localeCompare(right.artifact.kind)
      || left.artifact.sha256.localeCompare(right.artifact.sha256)
    ))
    .slice(0, 2);
  const contentEvidence = Array.from(new Map(
    artifacts
      .filter(({ artifact }) => (
        artifact.kind === 'PAGE_MARKDOWN' || artifact.kind === 'PAGE_HTML'
      ))
      .sort((left, right) => (
        Number(right.artifact.kind === 'PAGE_HTML') - Number(left.artifact.kind === 'PAGE_HTML')
        || (left.artifact.sourceUrl ?? left.artifact.finalUrl ?? '').localeCompare(
          right.artifact.sourceUrl ?? right.artifact.finalUrl ?? '',
        )
        || left.artifact.sha256.localeCompare(right.artifact.sha256)
      ))
      .map((row) => [
        row.artifact.sourceUrl ?? row.artifact.finalUrl ?? row.artifact.sha256,
        row,
      ]),
  ).values()).slice(0, 9);
  const selected = Array.from(new Map(
    [...policyEvidence, ...contentEvidence].map((row) => [row.artifact.sha256, row]),
  ).values());
  const evidenceExcerpts = [];
  for (const { artifact, toolbox: artifactToolbox } of selected) {
    try {
      const excerpt = await artifactToolbox.readEvidenceArtifact({
        artifactSha256: artifact.sha256,
        length: artifact.kind === 'PAGE_HTML' ? 3 * 1024 : 2 * 1024,
      });
      const promptExcerpt = redactAffiliatePromptExcerpt(excerpt.content);
      evidenceExcerpts.push({
        kind: artifact.kind,
        sha256: artifact.sha256,
        pageUrl: artifact.sourceUrl ?? artifact.finalUrl ?? '',
        content: promptExcerpt.content,
        truncated: excerpt.truncated || promptExcerpt.redacted,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Binary evidence')) throw error;
    }
  }

  const repositoryPaths = [
    'src/server/affiliateImports/types.ts',
    'docs/admin-affiliate-scraping-execplan.md',
    'docs/affiliate-source-mapping-slm-execplan.md',
  ];
  const repositoryExcerpts = [];
  for (const repositoryPath of repositoryPaths) {
    try {
      const excerpt = await toolbox.readRepositoryFile({
        relativePath: repositoryPath,
        length: 2 * 1024,
      });
      repositoryExcerpts.push({
        path: repositoryPath,
        content: excerpt.content,
        truncated: excerpt.truncated,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  return {
    context: {
      jobId: input.jobId,
      intakeId,
      sourceKey,
      runId,
      evidenceRunIds: Array.from(new Set(exports.map((exported) => exported.runId))).sort(),
      policyDisposition: reviewedPolicy(
        sourceEvidence.complianceStatus ?? intake.complianceStatus,
      ),
      targetKindHints: (intake.targetKindHints ?? [])
        .filter(isAffiliateAgentTargetKind),
      artifacts: artifacts.map((row) => ({
        kind: row.artifact.kind,
        sha256: row.artifact.sha256,
        pageUrl: row.artifact.sourceUrl ?? row.artifact.finalUrl ?? '',
        byteLength: row.artifact.sizeBytes ?? undefined,
        intakeId: row.intakeId,
        runId: row.runId,
      })),
      evidenceExcerpts,
      repositoryExcerpts,
      instructionsRevision: input.instructionsRevision,
    },
    toolbox,
  };
};
