import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildCodexAffiliateApprovalArgs,
  buildCodexAffiliateApprovalGoal,
  CODEX_AFFILIATE_APPROVAL_MODEL,
  CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT,
} from '../src/server/affiliateImports/codexApprovalGoal';

const execFileAsync = promisify(execFile);

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const repositoryRoot = path.resolve(process.cwd());
const codexExecutable = readOption('--codex-bin') ?? process.env.CODEX_CLI_BIN?.trim() ?? 'codex';
const options = {
  repositoryRoot,
  useLiveApprovals: process.argv.includes('--live'),
  reviewerId: readOption('--worker') ?? `codex-luna-approval-${process.pid}`,
  containerIsolated: process.argv.includes('--container-isolated'),
};
const isDryRun = process.argv.includes('--dry-run');

const inspectCodex = async () => {
  try {
    const version = await execFileAsync(codexExecutable, ['--version'], {
      cwd: repositoryRoot,
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    });
    try {
      await execFileAsync(codexExecutable, ['login', 'status'], {
        cwd: repositoryRoot,
        timeout: 15_000,
        maxBuffer: 256 * 1024,
      });
      return { cliAvailable: true, authenticated: true, version: version.stdout.trim() };
    } catch {
      return { cliAvailable: true, authenticated: false, version: version.stdout.trim() };
    }
  } catch {
    return { cliAvailable: false, authenticated: false, version: null };
  }
};

const main = async () => {
  const preflight = await inspectCodex();
  const args = buildCodexAffiliateApprovalArgs(options);
  console.log(JSON.stringify({
    schemaVersion: 1,
    dryRun: isDryRun,
    repositoryRoot,
    model: CODEX_AFFILIATE_APPROVAL_MODEL,
    reasoningEffort: CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT,
    reviewerId: options.reviewerId,
    useLiveApprovals: options.useLiveApprovals,
    codex: preflight,
    loginCommand: preflight.authenticated ? null : 'codex login --device-auth',
    command: { executable: codexExecutable, args },
    goal: buildCodexAffiliateApprovalGoal(options),
    authority: options.useLiveApprovals
      ? 'live-affiliate-approval-queue-and-guarded-unpublished-source-application'
      : 'local-affiliate-approval-queue',
  }, null, 2));
  if (isDryRun) return;
  if (!preflight.cliAvailable) throw new Error('Codex CLI is not runnable.');
  if (!preflight.authenticated) throw new Error('Codex CLI login is required. Run: codex login --device-auth');

  const child = spawn(codexExecutable, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Codex approval goal exited from signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) throw new Error(`Codex approval goal exited with code ${exitCode}.`);
};

main().catch((error) => {
  console.error('[affiliate:approvals:codex-goal] failed', error);
  process.exitCode = 1;
});
