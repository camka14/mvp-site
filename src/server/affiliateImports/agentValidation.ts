import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AffiliateAgentCommandResult = {
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type AffiliateAgentCommandRunner = (input: {
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}) => Promise<AffiliateAgentCommandResult>;

const defaultCommandRunner: AffiliateAgentCommandRunner = async (input) => {
  const startedAt = Date.now();
  const result = await execFileAsync(input.executable, input.args, {
    cwd: input.cwd,
    timeout: input.timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: Date.now() - startedAt,
  };
};

const safeSourceKey = (value: string): string => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error('Generated-source test id contains an unsafe source key.');
  }
  return value;
};

const focusedTestPaths = (testId: string): string[] => {
  if (testId === 'agent-contracts') {
    return ['src/server/affiliateImports/__tests__/agentContracts.test.ts'];
  }
  if (testId === 'agent-generator') {
    return [
      'src/server/affiliateImports/__tests__/agentGenerator.test.ts',
      'src/server/affiliateImports/__tests__/agentEvaluation.test.ts',
    ];
  }
  if (testId === 'mapping-extractor') {
    return ['src/server/affiliateImports/__tests__/mappingExtractor.test.ts'];
  }
  if (testId === 'affiliate-service') {
    return ['src/server/affiliateImports/__tests__/service.test.ts'];
  }
  if (testId.startsWith('generated-source:')) {
    const sourceKey = safeSourceKey(testId.slice('generated-source:'.length));
    return [
      `src/server/affiliateImports/__tests__/${sourceKey}GeneratedSource.test.ts`,
    ];
  }
  throw new Error(`Focused test id is not allowlisted: ${testId}`);
};

export class AffiliateAgentValidationExecutor {
  private readonly worktreeRoot: string;
  private readonly toolchainRoot: string;
  private readonly commandRunner: AffiliateAgentCommandRunner;
  private readonly allowReviewScrape: boolean;
  private readonly usesDefaultCommandRunner: boolean;

  constructor(input: {
    worktreeRoot: string;
    toolchainRoot?: string;
    commandRunner?: AffiliateAgentCommandRunner;
    allowReviewScrape?: boolean;
  }) {
    this.worktreeRoot = path.resolve(input.worktreeRoot);
    this.toolchainRoot = path.resolve(input.toolchainRoot ?? process.cwd());
    this.commandRunner = input.commandRunner ?? defaultCommandRunner;
    this.allowReviewScrape = input.allowReviewScrape ?? false;
    this.usesDefaultCommandRunner = !input.commandRunner;
  }

  private async ensurePinnedDependencies(): Promise<void> {
    if (!this.usesDefaultCommandRunner) return;
    const worktreeNodeModules = path.join(this.worktreeRoot, 'node_modules');
    try {
      await fs.lstat(worktreeNodeModules);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.symlink(
      path.join(this.toolchainRoot, 'node_modules'),
      worktreeNodeModules,
      'dir',
    );
  }

  async runFocusedTest(testId: string): Promise<AffiliateAgentCommandResult & {
    testId: string;
    testPaths: string[];
  }> {
    const testPaths = focusedTestPaths(testId);
    await this.ensurePinnedDependencies();
    const result = await this.commandRunner({
      executable: path.join(this.toolchainRoot, 'node_modules/.bin/jest'),
      args: ['--runInBand', ...testPaths],
      cwd: this.worktreeRoot,
      timeoutMs: 5 * 60 * 1000,
    });
    return { testId, testPaths, ...result };
  }

  async runDiffCheck(): Promise<AffiliateAgentCommandResult> {
    return this.commandRunner({
      executable: 'git',
      args: ['diff', '--check'],
      cwd: this.worktreeRoot,
      timeoutMs: 60_000,
    });
  }

  async runReviewScrape(sourceKey: string): Promise<AffiliateAgentCommandResult & {
    sourceKey: string;
    setupPath: string;
  }> {
    if (!this.allowReviewScrape) {
      throw new Error('Review scrape execution is disabled for this job.');
    }
    const safeKey = safeSourceKey(sourceKey);
    const setupPath = `scripts/setup-${safeKey}-affiliate-source.ts`;
    const result = await this.commandRunner({
      executable: path.join(this.toolchainRoot, 'node_modules/.bin/tsx'),
      args: [setupPath, '--scrape'],
      cwd: this.worktreeRoot,
      timeoutMs: 10 * 60 * 1000,
    });
    return { sourceKey: safeKey, setupPath, ...result };
  }
}
