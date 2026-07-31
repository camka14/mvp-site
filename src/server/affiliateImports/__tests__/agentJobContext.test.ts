/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildAffiliateMappingJobContextFromExport,
  buildAffiliateMappingJobContextFromExports,
} from '../agentJobContext';

describe('affiliate mapping job context builder', () => {
  it('verifies the export and retrieves bounded Markdown, HTML, policy, and repository context', async () => {
    const temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-context-');
    const evidenceDirectory = path.join(temporaryDirectory, 'evidence');
    const repositoryRoot = path.join(temporaryDirectory, 'repo');
    try {
      await fs.mkdir(evidenceDirectory, { recursive: true });
      await fs.mkdir(path.join(repositoryRoot, 'src/server/affiliateImports'), { recursive: true });
      await fs.mkdir(path.join(repositoryRoot, 'docs'), { recursive: true });
      const markdown = Buffer.from(
        '# River City events\nContact coach@rivercity.example\n'
        + 'Asset: https://cdn.example/image?Signature=secret-value&Key-Pair-Id=public',
      );
      const robots = Buffer.from('User-agent: *\\nAllow: /events');
      const markdownHash = createHash('sha256').update(markdown).digest('hex');
      const robotsHash = createHash('sha256').update(robots).digest('hex');
      await Promise.all([
        fs.writeFile(path.join(evidenceDirectory, 'page.md'), markdown),
        fs.writeFile(path.join(evidenceDirectory, 'robots.txt'), robots),
        fs.writeFile(
          path.join(repositoryRoot, 'src/server/affiliateImports/types.ts'),
          'export type Contract = true;\n',
        ),
        fs.writeFile(
          path.join(repositoryRoot, 'docs/admin-affiliate-scraping-execplan.md'),
          '# Import process\n',
        ),
        fs.writeFile(
          path.join(repositoryRoot, 'docs/affiliate-source-mapping-slm-execplan.md'),
          '# Agent plan\n',
        ),
      ]);
      await fs.writeFile(path.join(evidenceDirectory, 'manifest.json'), JSON.stringify({
        sourceEvidence: {
          intakeId: 'intake_1',
          intakeSourceKey: 'river-city',
          runId: 'run_1',
          complianceStatus: 'ALLOWED',
        },
        intake: {
          id: 'intake_1',
          sourceKey: 'river-city',
          targetKindHints: ['EVENT', 'TEAM', 'INVALID'],
        },
        artifacts: [
          {
            kind: 'PAGE_MARKDOWN',
            contentHash: markdownHash,
            localPath: 'page.md',
            sourceUrl: 'https://rivercity.example/events',
            mimeType: 'text/markdown',
            sizeBytes: markdown.length,
          },
          {
            kind: 'ROBOTS',
            contentHash: robotsHash,
            localPath: 'robots.txt',
            sourceUrl: 'https://rivercity.example/robots.txt',
            mimeType: 'text/plain',
            sizeBytes: robots.length,
          },
        ],
      }));

      const result = await buildAffiliateMappingJobContextFromExport({
        jobId: 'job_1',
        evidenceDirectory,
        repositoryRoot,
        instructionsRevision: 'instructions-v1',
      });
      expect(result.context).toEqual(expect.objectContaining({
        jobId: 'job_1',
        intakeId: 'intake_1',
        sourceKey: 'river-city',
        runId: 'run_1',
        policyDisposition: 'ALLOWED',
        targetKindHints: ['EVENT'],
        artifacts: expect.arrayContaining([
          expect.objectContaining({ sha256: markdownHash }),
          expect.objectContaining({ sha256: robotsHash }),
        ]),
        evidenceExcerpts: expect.arrayContaining([
          expect.objectContaining({ kind: 'ROBOTS', content: robots.toString('utf8') }),
          expect.objectContaining({
            kind: 'PAGE_MARKDOWN',
            content: '# River City events\nContact [redacted-email]\n'
              + 'Asset: https://cdn.example/image[redacted-signed-parameter]&Key-Pair-Id=public',
            truncated: true,
          }),
        ]),
        repositoryExcerpts: expect.arrayContaining([
          expect.objectContaining({ path: 'src/server/affiliateImports/types.ts' }),
        ]),
      }));
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects one tampered artifact even when it is not selected for prompt text', async () => {
    const temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-context-');
    const evidenceDirectory = path.join(temporaryDirectory, 'evidence');
    const repositoryRoot = path.join(temporaryDirectory, 'repo');
    try {
      await fs.mkdir(evidenceDirectory, { recursive: true });
      await fs.mkdir(path.join(repositoryRoot, 'src/server/affiliateImports'), { recursive: true });
      await fs.mkdir(path.join(repositoryRoot, 'docs'), { recursive: true });
      await fs.writeFile(path.join(evidenceDirectory, 'image.png'), 'tampered');
      await fs.writeFile(path.join(evidenceDirectory, 'manifest.json'), JSON.stringify({
        sourceEvidence: {
          intakeId: 'intake_1',
          intakeSourceKey: 'river-city',
          runId: 'run_1',
          complianceStatus: 'ALLOWED',
        },
        artifacts: [{
          kind: 'PAGE_SCREENSHOT',
          contentHash: 'a'.repeat(64),
          localPath: 'image.png',
          mimeType: 'image/png',
        }],
      }));
      await expect(buildAffiliateMappingJobContextFromExport({
        jobId: 'job_1',
        evidenceDirectory,
        repositoryRoot,
        instructionsRevision: 'v1',
      })).rejects.toThrow('hash mismatch');
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('combines bounded evidence from multiple capture runs with exact provenance', async () => {
    const temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-context-');
    const repositoryRoot = path.join(temporaryDirectory, 'repo');
    const firstEvidenceDirectory = path.join(temporaryDirectory, 'evidence-1');
    const secondEvidenceDirectory = path.join(temporaryDirectory, 'evidence-2');
    try {
      await Promise.all([
        fs.mkdir(firstEvidenceDirectory, { recursive: true }),
        fs.mkdir(secondEvidenceDirectory, { recursive: true }),
        fs.mkdir(path.join(repositoryRoot, 'src/server/affiliateImports'), { recursive: true }),
        fs.mkdir(path.join(repositoryRoot, 'docs'), { recursive: true }),
      ]);
      await Promise.all([
        fs.writeFile(
          path.join(repositoryRoot, 'src/server/affiliateImports/types.ts'),
          'export type Contract = true;\n',
        ),
        fs.writeFile(
          path.join(repositoryRoot, 'docs/admin-affiliate-scraping-execplan.md'),
          '# Import process\n',
        ),
        fs.writeFile(
          path.join(repositoryRoot, 'docs/affiliate-source-mapping-slm-execplan.md'),
          '# Agent plan\n',
        ),
      ]);
      const artifacts = [
        {
          evidenceDirectory: firstEvidenceDirectory,
          intakeId: 'intake_1',
          sourceKey: 'river-city',
          runId: 'run_1',
          pageUrl: 'https://rivercity.example/events',
          file: 'events.md',
          content: '# Events',
        },
        {
          evidenceDirectory: secondEvidenceDirectory,
          intakeId: 'intake_2',
          sourceKey: 'river-registration',
          runId: 'run_2',
          pageUrl: 'https://register.rivercity.example/form',
          file: 'registration.md',
          content: '# Registration',
        },
      ];
      for (const artifact of artifacts) {
        const data = Buffer.from(artifact.content);
        const hash = createHash('sha256').update(data).digest('hex');
        await fs.writeFile(path.join(artifact.evidenceDirectory, artifact.file), data);
        await fs.writeFile(
          path.join(artifact.evidenceDirectory, 'manifest.json'),
          JSON.stringify({
            sourceEvidence: {
              intakeId: artifact.intakeId,
              intakeSourceKey: artifact.sourceKey,
              runId: artifact.runId,
              complianceStatus: 'ALLOWED',
            },
            intake: {
              id: artifact.intakeId,
              sourceKey: artifact.sourceKey,
              targetKindHints: ['EVENT'],
            },
            artifacts: [{
              kind: 'PAGE_MARKDOWN',
              contentHash: hash,
              localPath: artifact.file,
              sourceUrl: artifact.pageUrl,
              mimeType: 'text/markdown',
              sizeBytes: data.length,
            }],
          }),
        );
      }

      const result = await buildAffiliateMappingJobContextFromExports({
        jobId: 'job_1',
        evidenceDirectories: [firstEvidenceDirectory, secondEvidenceDirectory],
        repositoryRoot,
        instructionsRevision: 'instructions-v1',
      });

      expect(result.context.runId).toBe('run_1');
      expect(result.context.evidenceRunIds).toEqual(['run_1', 'run_2']);
      expect(result.context.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          pageUrl: 'https://rivercity.example/events',
          intakeId: 'intake_1',
          runId: 'run_1',
        }),
        expect.objectContaining({
          pageUrl: 'https://register.rivercity.example/form',
          intakeId: 'intake_2',
          runId: 'run_2',
        }),
      ]));
      expect(result.context.evidenceExcerpts).toHaveLength(2);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
