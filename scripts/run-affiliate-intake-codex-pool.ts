import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAffiliateAgentIds,
  parseAffiliateAgentCount,
  runAffiliateAgentPool,
} from '../src/server/affiliateImports/agentPool';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readRepeatedOption = (name: string): string[] => process.argv.flatMap((argument, index) => {
  if (argument.startsWith(`${name}=`)) return [argument.slice(name.length + 1).trim()];
  if (argument === name) return [process.argv[index + 1]?.trim() ?? ''];
  return [];
}).filter(Boolean);

const runMapper = async (input: {
  workspace: string;
  workerId: string;
  useLive: boolean;
  containerIsolated: boolean;
  codexBin?: string;
}) => {
  const executable = path.join(input.workspace, 'node_modules/.bin/tsx');
  const launcher = path.join(input.workspace, 'scripts/run-affiliate-intake-codex-goal.ts');
  const args = [
    launcher,
    ...(input.useLive ? ['--live'] : []),
    ...(input.containerIsolated ? ['--container-isolated'] : []),
    `--worker=${input.workerId}`,
    ...(input.codexBin ? [`--codex-bin=${input.codexBin}`] : []),
  ];
  const child = spawn(executable, args, {
    cwd: input.workspace,
    env: process.env,
    stdio: 'inherit',
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Mapper ${input.workerId} exited from signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Mapper ${input.workerId} exited with code ${exitCode}.`);
  }
};

const main = async () => {
  const count = parseAffiliateAgentCount(
    readOption('--agent-count') ?? process.env.AFFILIATE_MAPPING_AGENT_COUNT,
  );
  const prefix = readOption('--worker-prefix')
    ?? process.env.AFFILIATE_MAPPING_WORKER_PREFIX?.trim()
    ?? 'codex-luna-vm';
  const agentIds = buildAffiliateAgentIds(prefix, count);
  const configuredWorkspaces = readRepeatedOption('--workspace');
  const environmentWorkspaces = process.env.AFFILIATE_MAPPING_WORKSPACES
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  const workspaceValues = configuredWorkspaces.length
    ? configuredWorkspaces
    : environmentWorkspaces.length
      ? environmentWorkspaces
      : [process.cwd()];
  const workspaces = workspaceValues.slice(0, count).map((value) => path.resolve(value));
  if (workspaces.length !== count) {
    throw new Error(`Mapper count ${count} requires ${count} explicit isolated workspaces.`);
  }
  if (new Set(workspaces).size !== workspaces.length) {
    throw new Error('Each mapper requires a distinct workspace.');
  }
  for (const workspace of workspaces) {
    if (!fs.statSync(path.join(workspace, '.git'), { throwIfNoEntry: false })) {
      throw new Error(`Mapper workspace is not a Git checkout: ${workspace}`);
    }
    if (!fs.statSync(path.join(workspace, 'node_modules/.bin/tsx'), { throwIfNoEntry: false })) {
      throw new Error(`Mapper workspace dependencies are missing: ${workspace}`);
    }
  }

  console.log(JSON.stringify({
    schemaVersion: 1,
    count,
    agents: agentIds.map((agentId, index) => ({ agentId, workspace: workspaces[index] })),
  }, null, 2));

  await runAffiliateAgentPool({
    agentIds,
    runAgent: (agentId) => runMapper({
      workspace: workspaces[agentIds.indexOf(agentId)],
      workerId: agentId,
      useLive: process.argv.includes('--live'),
      containerIsolated: process.argv.includes('--container-isolated'),
      codexBin: readOption('--codex-bin') ?? process.env.CODEX_CLI_BIN?.trim(),
    }),
  });
};

main().catch((error) => {
  console.error('[affiliate:intakes:codex-pool] failed', error);
  process.exitCode = 1;
});
