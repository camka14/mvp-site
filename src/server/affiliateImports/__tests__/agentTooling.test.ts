/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AffiliateAgentToolbox } from '../agentTooling';

const HASH_B = 'b'.repeat(64);

const draftFor = (artifactSha256: string) => ({
  schemaVersion: 1,
  intakeId: 'intake_1',
  sourceKey: 'river-city',
  runId: 'run_1',
  policyDisposition: 'ALLOWED',
  implementationMode: 'GENERIC_MAPPING',
  listingKind: 'EVENT',
  evidence: [{
    artifactKind: 'PAGE_HTML',
    artifactSha256,
    pageUrl: 'https://rivercity.example/events',
    supports: ['title', 'officialActionUrl'],
  }],
  organization: {
    name: 'River City Sports Club',
    website: 'https://rivercity.example',
    description: 'Local sports organization.',
    city: 'Portland',
    address: '100 Main Street',
  },
  mapping: {
    kind: 'EVENT',
    listUrl: 'https://rivercity.example/events',
    itemSelector: '.event',
    fields: {
      title: { selector: '.title' },
      officialActionUrl: {
        selector: 'a',
        mode: 'attribute',
        attribute: 'href',
      },
    },
  },
  expectedCandidates: [{
    listingKind: 'EVENT',
    title: 'River City Summer League',
    officialActionUrl: 'https://rivercity.example/register',
    tags: ['League'],
    divisions: [],
  }],
  logo: {
    disposition: 'OFFICIAL_ASSET',
    artifactSha256: HASH_B,
    sourceUrl: 'https://rivercity.example/logo.png',
  },
  warnings: [],
  unresolvedQuestions: [],
});

describe('affiliate mapping bounded agent tools', () => {
  let temporaryDirectory: string;
  let evidenceDirectory: string;
  let repositoryRoot: string;
  let writableRoot: string;
  let artifactSha256: string;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp('/tmp/affiliate-agent-tools-');
    evidenceDirectory = path.join(temporaryDirectory, 'evidence');
    repositoryRoot = path.join(temporaryDirectory, 'repository');
    writableRoot = path.join(temporaryDirectory, 'worktree');
    await Promise.all([
      fs.mkdir(evidenceDirectory, { recursive: true }),
      fs.mkdir(path.join(repositoryRoot, 'src/server/affiliateImports'), { recursive: true }),
      fs.mkdir(path.join(repositoryRoot, 'docs'), { recursive: true }),
      fs.mkdir(writableRoot, { recursive: true }),
    ]);
    const artifact = Buffer.from('<article>River City Summer League</article>');
    artifactSha256 = createHash('sha256').update(artifact).digest('hex');
    await fs.writeFile(path.join(evidenceDirectory, 'page.html'), artifact);
    await fs.writeFile(path.join(evidenceDirectory, 'manifest.json'), JSON.stringify({
      artifacts: [{
        kind: 'PAGE_HTML',
        contentHash: artifactSha256,
        localPath: 'page.html',
        sourceUrl: 'https://rivercity.example/events',
        mimeType: 'text/html',
        sizeBytes: artifact.length,
      }],
    }));
    await fs.writeFile(
      path.join(repositoryRoot, 'src/server/affiliateImports/types.ts'),
      'export const marker = "affiliate-contract";\n',
    );
    await fs.writeFile(
      path.join(repositoryRoot, 'docs/admin-affiliate-scrape-sources.md'),
      '# Sources\n',
    );
  });

  afterEach(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  const toolbox = () => new AffiliateAgentToolbox({
    evidenceDirectory,
    repositoryRoot,
    writableRoot,
    maxArtifactReadBytes: 16,
  });

  it('lists hash-addressed evidence and returns bounded verified chunks', async () => {
    const tools = toolbox();
    expect(await tools.listEvidence()).toEqual([expect.objectContaining({
      kind: 'PAGE_HTML',
      sha256: artifactSha256,
    })]);
    const chunk = await tools.readEvidenceArtifact({ artifactSha256 });
    expect(chunk.returnedBytes).toBe(16);
    expect(chunk.truncated).toBe(true);
    expect(chunk.content).toBe('<article>River C');
  });

  it('detects evidence tampering before returning content', async () => {
    await fs.appendFile(path.join(evidenceDirectory, 'page.html'), 'tampered');
    await expect(toolbox().readEvidenceArtifact({
      artifactSha256,
    })).rejects.toThrow('hash mismatch');
  });

  it('allows repository reads and fixed-string searches only inside allowlisted roots', async () => {
    const tools = toolbox();
    expect((await tools.readRepositoryFile({
      relativePath: 'src/server/affiliateImports/types.ts',
    })).content).toContain('affiliate-contract');
    expect(await tools.searchRepository({ query: 'affiliate-contract' })).toEqual([{
      path: 'src/server/affiliateImports/types.ts',
      line: 1,
      text: 'export const marker = "affiliate-contract";',
    }]);
    await expect(tools.readRepositoryFile({
      relativePath: 'package.json',
    })).rejects.toThrow('not allowlisted');
    await expect(tools.readRepositoryFile({
      relativePath: '../../etc/passwd',
    })).rejects.toThrow('escapes allowed root');
  });

  it('validates and writes only deterministic generated files', async () => {
    const tools = toolbox();
    const result = await tools.writeRenderedDraft(draftFor(artifactSha256));
    expect(result.written).toHaveLength(4);
    expect(result.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    const repeated = await tools.writeRenderedDraft(draftFor(artifactSha256));
    expect(repeated.written).toHaveLength(0);
    expect(repeated.unchanged).toHaveLength(4);
  });
});
