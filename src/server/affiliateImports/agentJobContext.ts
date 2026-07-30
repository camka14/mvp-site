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
}> => {
  const toolbox = new AffiliateAgentToolbox({
    evidenceDirectory: input.evidenceDirectory,
    repositoryRoot: input.repositoryRoot,
    writableRoot: input.repositoryRoot,
    allowedRepositoryRoots: [
      'src/server/affiliateImports/types.ts',
      'docs/admin-affiliate-scrape-sources.md',
      'docs/admin-affiliate-scraping-execplan.md',
      'docs/affiliate-source-mapping-slm-execplan.md',
    ],
    maxArtifactReadBytes: 96 * 1024,
    maxRepositoryReadBytes: 48 * 1024,
  });
  const [manifest, artifacts] = await Promise.all([
    readManifest(input.evidenceDirectory),
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

  const selectionOrder = ['ROBOTS', 'POLICY_NOTE', 'PAGE_MARKDOWN', 'PAGE_HTML', 'PAGE_LINKS'];
  const selected = artifacts
    .filter((artifact) => selectionOrder.includes(artifact.kind))
    .sort((left, right) => (
      selectionOrder.indexOf(left.kind) - selectionOrder.indexOf(right.kind)
      || left.sha256.localeCompare(right.sha256)
    ))
    .slice(0, 8);
  const evidenceExcerpts = [];
  for (const artifact of selected) {
    try {
      const excerpt = await toolbox.readEvidenceArtifact({
        artifactSha256: artifact.sha256,
        length: artifact.kind === 'PAGE_HTML' ? 64 * 1024 : 96 * 1024,
      });
      evidenceExcerpts.push({
        kind: artifact.kind,
        sha256: artifact.sha256,
        pageUrl: artifact.sourceUrl ?? artifact.finalUrl ?? '',
        content: excerpt.content,
        truncated: excerpt.truncated,
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
        length: 48 * 1024,
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
      policyDisposition: reviewedPolicy(
        sourceEvidence.complianceStatus ?? intake.complianceStatus,
      ),
      targetKindHints: (intake.targetKindHints ?? [])
        .filter(isAffiliateAgentTargetKind),
      artifacts: artifacts.map((artifact) => ({
        kind: artifact.kind,
        sha256: artifact.sha256,
        pageUrl: artifact.sourceUrl ?? artifact.finalUrl ?? '',
        byteLength: artifact.sizeBytes ?? undefined,
      })),
      evidenceExcerpts,
      repositoryExcerpts,
      instructionsRevision: input.instructionsRevision,
    },
    toolbox,
  };
};
