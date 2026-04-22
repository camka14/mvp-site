import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..');

const resolveCleanupCommand = (): string =>
  process.env.E2E_CLEANUP_COMMAND ?? 'npm run seed:dev';

const globalTeardown = async (): Promise<void> => {
  execSync(resolveCleanupCommand(), {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_SEED: process.env.E2E_SEED ?? '1',
      SEED_SKIP_RESET: '1',
    },
  });
};

export default globalTeardown;
