import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  affiliateSourceDraftSchema,
  type AffiliateSourceDraft,
} from './agentContracts';
import {
  renderAffiliateSourceDraft,
  writeAffiliateGeneratedFiles,
  type AffiliateGeneratedFile,
} from './agentGenerator';
import type { AffiliateAgentValidationExecutor } from './agentValidation';

type ExportedArtifact = {
  kind: string;
  contentHash: string;
  localPath: string;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  file?: {
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
};

type ExportManifest = {
  sourceEvidence?: {
    intakeId?: string;
    intakeSourceKey?: string;
    runId?: string;
    complianceStatus?: string | null;
  };
  artifacts?: ExportedArtifact[];
};

export type AffiliateEvidenceArtifactSummary = {
  kind: string;
  sha256: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type AffiliateAgentToolboxOptions = {
  evidenceDirectory: string;
  repositoryRoot: string;
  writableRoot: string;
  allowedRepositoryRoots?: string[];
  maxArtifactReadBytes?: number;
  maxRepositoryReadBytes?: number;
  maxSearchResults?: number;
  validationExecutor?: AffiliateAgentValidationExecutor;
};

const isWithin = (rootDirectory: string, targetPath: string): boolean => {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
};

const resolveWithin = (rootDirectory: string, relativePath: string): string => {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, relativePath);
  if (!isWithin(root, target)) throw new Error(`Path escapes allowed root: ${relativePath}`);
  return target;
};

const readExportManifest = async (evidenceDirectory: string): Promise<ExportManifest> => {
  const manifestPath = resolveWithin(evidenceDirectory, 'manifest.json');
  const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ExportManifest;
  if (!Array.isArray(parsed.artifacts)) throw new Error('Evidence manifest has no artifact list.');
  return parsed;
};

const artifactMimeType = (artifact: ExportedArtifact): string | null => (
  artifact.mimeType ?? artifact.file?.mimeType ?? null
);

const artifactSize = (artifact: ExportedArtifact): number | null => (
  artifact.sizeBytes ?? artifact.file?.sizeBytes ?? null
);

const isTextArtifact = (artifact: ExportedArtifact): boolean => {
  const mimeType = artifactMimeType(artifact)?.toLowerCase() ?? '';
  return (
    mimeType.startsWith('text/')
    || mimeType.includes('json')
    || mimeType.includes('xml')
    || artifact.localPath.endsWith('.md')
    || artifact.localPath.endsWith('.html')
    || artifact.localPath.endsWith('.txt')
  );
};

export class AffiliateAgentToolbox {
  private readonly evidenceDirectory: string;
  private readonly repositoryRoot: string;
  private readonly writableRoot: string;
  private readonly allowedRepositoryRoots: string[];
  private readonly maxArtifactReadBytes: number;
  private readonly maxRepositoryReadBytes: number;
  private readonly maxSearchResults: number;
  private readonly validationExecutor: AffiliateAgentValidationExecutor | null;

  constructor(options: AffiliateAgentToolboxOptions) {
    this.evidenceDirectory = path.resolve(options.evidenceDirectory);
    this.repositoryRoot = path.resolve(options.repositoryRoot);
    this.writableRoot = path.resolve(options.writableRoot);
    this.allowedRepositoryRoots = (
      options.allowedRepositoryRoots
      ?? [
        'src/server/affiliateImports',
        'docs/admin-affiliate-scrape-sources.md',
        'docs/admin-affiliate-scraping-execplan.md',
      ]
    );
    this.maxArtifactReadBytes = options.maxArtifactReadBytes ?? 256 * 1024;
    this.maxRepositoryReadBytes = options.maxRepositoryReadBytes ?? 128 * 1024;
    this.maxSearchResults = options.maxSearchResults ?? 50;
    this.validationExecutor = options.validationExecutor ?? null;
  }

  async listEvidence(): Promise<AffiliateEvidenceArtifactSummary[]> {
    const manifest = await readExportManifest(this.evidenceDirectory);
    return (manifest.artifacts ?? [])
      .map((artifact) => ({
        kind: artifact.kind,
        sha256: artifact.contentHash,
        sourceUrl: artifact.sourceUrl ?? null,
        finalUrl: artifact.finalUrl ?? null,
        mimeType: artifactMimeType(artifact),
        sizeBytes: artifactSize(artifact),
      }))
      .sort((left, right) => (
        left.kind.localeCompare(right.kind)
        || left.sha256.localeCompare(right.sha256)
      ));
  }

  async verifyEvidenceBundle(): Promise<AffiliateEvidenceArtifactSummary[]> {
    const manifest = await readExportManifest(this.evidenceDirectory);
    for (const artifact of manifest.artifacts ?? []) {
      const artifactPath = resolveWithin(this.evidenceDirectory, artifact.localPath);
      const data = await fs.readFile(artifactPath);
      const actualSha256 = createHash('sha256').update(data).digest('hex');
      if (actualSha256 !== artifact.contentHash) {
        throw new Error(`Evidence artifact hash mismatch for ${artifact.kind}.`);
      }
    }
    return this.listEvidence();
  }

  async readEvidenceArtifact(input: {
    artifactSha256: string;
    offset?: number;
    length?: number;
  }): Promise<{
    kind: string;
    sha256: string;
    offset: number;
    returnedBytes: number;
    totalBytes: number;
    truncated: boolean;
    content: string;
  }> {
    const manifest = await readExportManifest(this.evidenceDirectory);
    const matches = (manifest.artifacts ?? []).filter((artifact) => (
      artifact.contentHash === input.artifactSha256
    ));
    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? 'Evidence hash is ambiguous inside this job bundle.'
          : 'Evidence artifact hash is not present in this job bundle.',
      );
    }
    const artifact = matches[0];
    if (!isTextArtifact(artifact)) {
      throw new Error('Binary evidence must be reviewed through a dedicated image tool.');
    }
    const artifactPath = resolveWithin(this.evidenceDirectory, artifact.localPath);
    const data = await fs.readFile(artifactPath);
    const actualSha256 = createHash('sha256').update(data).digest('hex');
    if (actualSha256 !== artifact.contentHash) {
      throw new Error(`Evidence artifact hash mismatch for ${artifact.kind}.`);
    }
    const offset = Math.max(0, input.offset ?? 0);
    const requestedLength = Math.max(1, input.length ?? this.maxArtifactReadBytes);
    const length = Math.min(requestedLength, this.maxArtifactReadBytes);
    const content = data.subarray(offset, offset + length);
    return {
      kind: artifact.kind,
      sha256: artifact.contentHash,
      offset,
      returnedBytes: content.length,
      totalBytes: data.length,
      truncated: offset + content.length < data.length,
      content: content.toString('utf8'),
    };
  }

  private allowedRepositoryPath(relativePath: string): string {
    const target = resolveWithin(this.repositoryRoot, relativePath);
    const isAllowed = this.allowedRepositoryRoots.some((allowedRoot) => {
      const allowedPath = resolveWithin(this.repositoryRoot, allowedRoot);
      return isWithin(allowedPath, target);
    });
    if (!isAllowed) throw new Error(`Repository path is not allowlisted: ${relativePath}`);
    return target;
  }

  async readRepositoryFile(input: {
    relativePath: string;
    offset?: number;
    length?: number;
  }): Promise<{
    relativePath: string;
    offset: number;
    returnedBytes: number;
    totalBytes: number;
    truncated: boolean;
    content: string;
  }> {
    const target = this.allowedRepositoryPath(input.relativePath);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error('Repository reads require a file path.');
    const data = await fs.readFile(target);
    const offset = Math.max(0, input.offset ?? 0);
    const requestedLength = Math.max(1, input.length ?? this.maxRepositoryReadBytes);
    const length = Math.min(requestedLength, this.maxRepositoryReadBytes);
    const content = data.subarray(offset, offset + length);
    return {
      relativePath: input.relativePath,
      offset,
      returnedBytes: content.length,
      totalBytes: data.length,
      truncated: offset + content.length < data.length,
      content: content.toString('utf8'),
    };
  }

  async searchRepository(input: {
    query: string;
    roots?: string[];
  }): Promise<Array<{ path: string; line: number; text: string }>> {
    const query = input.query.trim();
    if (!query || query.length > 200 || query.includes('\n') || query.includes('\0')) {
      throw new Error('Repository search query must be one bounded text line.');
    }
    const roots = input.roots?.length ? input.roots : this.allowedRepositoryRoots;
    const checkedRoots = roots.map((root) => {
      this.allowedRepositoryPath(root);
      return root;
    });
    const allowedRoots: string[] = [];
    for (const root of checkedRoots) {
      try {
        await fs.access(resolveWithin(this.repositoryRoot, root));
        allowedRoots.push(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (!allowedRoots.length) return [];

    const files: string[] = [];
    const collectFiles = async (relativePath: string): Promise<void> => {
      const absolutePath = resolveWithin(this.repositoryRoot, relativePath);
      const stat = await fs.lstat(absolutePath);
      if (stat.isSymbolicLink()) return;
      if (stat.isFile()) {
        files.push(relativePath);
        return;
      }
      if (!stat.isDirectory()) return;
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        await collectFiles(path.join(relativePath, entry.name));
      }
    };

    for (const root of allowedRoots) {
      await collectFiles(root);
    }

    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const relativePath of files) {
      if (matches.length >= this.maxSearchResults) break;
      const absolutePath = resolveWithin(this.repositoryRoot, relativePath);
      const stat = await fs.stat(absolutePath);
      if (stat.size > this.maxRepositoryReadBytes) continue;
      const content = await fs.readFile(absolutePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].includes(query)) {
          matches.push({
            path: relativePath.split(path.sep).join('/'),
            line: index + 1,
            text: lines[index],
          });
          if (matches.length >= this.maxSearchResults) break;
        }
      }
    }
    return matches;
  }

  validateDraft(value: unknown): AffiliateSourceDraft {
    return affiliateSourceDraftSchema.parse(value);
  }

  renderDraft(value: unknown): AffiliateGeneratedFile[] {
    return renderAffiliateSourceDraft(this.validateDraft(value));
  }

  async writeRenderedDraft(value: unknown): Promise<{
    files: AffiliateGeneratedFile[];
    written: string[];
    unchanged: string[];
  }> {
    const files = this.renderDraft(value);
    const result = await writeAffiliateGeneratedFiles({
      rootDirectory: this.writableRoot,
      files,
    });
    return { files, ...result };
  }

  async runFocusedTest(testId: string) {
    if (!this.validationExecutor) throw new Error('Focused test execution is disabled.');
    return this.validationExecutor.runFocusedTest(testId);
  }

  async runReviewScrape(sourceKey: string) {
    if (!this.validationExecutor) throw new Error('Review scrape execution is disabled.');
    return this.validationExecutor.runReviewScrape(sourceKey);
  }
}
