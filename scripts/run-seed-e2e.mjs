import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const tsxCliPath = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const seedScriptPath = path.join(projectRoot, 'prisma', 'seed.e2e.ts');

const env = {
  ...process.env,
  E2E_SEED: '1',
};

if (process.argv.includes('--skip-reset')) {
  env.SEED_SKIP_RESET = '1';
}

const result = spawnSync(
  process.execPath,
  [tsxCliPath, seedScriptPath],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
