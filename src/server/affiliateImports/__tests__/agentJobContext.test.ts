/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildAffiliateMappingJobContextFromExport,
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
      const markdown = Buffer.from('# River City events');
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
          expect.objectContaining({ kind: 'PAGE_MARKDOWN', content: markdown.toString('utf8') }),
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
});
