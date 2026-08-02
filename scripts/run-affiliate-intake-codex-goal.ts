import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildCodexAffiliateIngestionArgs,
  buildCodexAffiliateIngestionGoal,
  CODEX_AFFILIATE_INGESTION_FAST_MODE,
  CODEX_AFFILIATE_INGESTION_MODEL,
  CODEX_AFFILIATE_INGESTION_REASONING_EFFORT,
  CODEX_AFFILIATE_INGESTION_SERVICE_TIER,
} from '../src/server/affiliateImports/codexCliGoal';

const execFileAsync = promisify(execFile);

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const repositoryRoot = path.resolve(process.cwd());
const codexExecutable = readOption('--codex-bin')
  ?? process.env.CODEX_CLI_BIN?.trim()
  ?? 'codex';
const useLiveIntakes = process.argv.includes('--live');
const isDryRun = process.argv.includes('--dry-run');
const containerIsolated = process.argv.includes('--container-isolated');
const workerId = readOption('--worker') ?? `codex-luna-${process.pid}`;
const options = {
  repositoryRoot,
  useLiveIntakes,
  workerId,
  containerIsolated,
};

const inspectCodex = async () => {
  let version: string | null = null;
  let cliAvailable = false;
  let authenticated = false;
  try {
    const result = await execFileAsync(codexExecutable, ['--version'], {
      cwd: repositoryRoot,
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    });
    version = result.stdout.trim() || result.stderr.trim() || null;
    cliAvailable = true;
  } catch {
    return { cliAvailable, authenticated, version };
  }
  try {
    await execFileAsync(codexExecutable, ['login', 'status'], {
      cwd: repositoryRoot,
      timeout: 15_000,
      maxBuffer: 256 * 1024,
    });
    authenticated = true;
  } catch {
    authenticated = false;
  }
  return { cliAvailable, authenticated, version };
};

const main = async () => {
  const args = buildCodexAffiliateIngestionArgs(options);
  const goal = buildCodexAffiliateIngestionGoal(options);
  const preflight = await inspectCodex();
  console.log(JSON.stringify({
    schemaVersion: 1,
    dryRun: isDryRun,
    repositoryRoot,
    model: CODEX_AFFILIATE_INGESTION_MODEL,
    reasoningEffort: CODEX_AFFILIATE_INGESTION_REASONING_EFFORT,
    serviceTier: CODEX_AFFILIATE_INGESTION_SERVICE_TIER,
    fastMode: CODEX_AFFILIATE_INGESTION_FAST_MODE,
    useLiveIntakes,
    containerIsolated,
    workerId,
    codex: preflight,
    loginCommand: preflight.authenticated ? null : 'codex login --device-auth',
    command: {
      executable: codexExecutable,
      args,
    },
    goal,
    authority: useLiveIntakes
      ? containerIsolated
        ? 'container-isolated-live-directory-intake-capture-and-mapping-queue'
        : 'live-directory-intake-capture-and-mapping-queue'
      : 'local-directory-intake-capture-and-mapping-queue',
  }, null, 2));

  if (isDryRun) return;
  if (containerIsolated && !fs.existsSync('/.dockerenv')) {
    throw new Error(
      '--container-isolated may only be used inside the dedicated Docker boundary.',
    );
  }
  if (!preflight.cliAvailable) {
    throw new Error(
      'Codex CLI is not runnable. Install or repair @openai/codex on the VM, then retry.',
    );
  }
  if (!preflight.authenticated) {
    throw new Error('Codex CLI login is required. Run: codex login --device-auth');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('The Codex ingestion goal requires an interactive terminal.');
  }

  const child = spawn(codexExecutable, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Codex ingestion goal exited from signal ${signal}.`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Codex ingestion goal exited with code ${exitCode}.`);
  }
};

main().catch((error) => {
  console.error('[affiliate:intakes:codex-goal] failed', error);
  process.exitCode = 1;
});
