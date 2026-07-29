import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const POSTGRES_IMAGE =
  'postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193';

type CommandResult = { stdout: string; stderr: string };

const run = (
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
  } = {},
): Promise<CommandResult> => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
    reject(new Error(`Command timed out: ${executable}`));
  }, options.timeoutMs ?? 10 * 60 * 1000);
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    stderr += chunk;
  });
  child.on('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.on('close', (code) => {
    clearTimeout(timeout);
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${executable} exited ${code}: ${stderr || stdout}`));
  });
  child.stdin.end(options.input);
});

const waitForPostgres = async (container: string) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run('docker', [
        'exec',
        container,
        'pg_isready',
        '-U',
        'fixture',
        '-d',
        'fixture',
      ], { timeoutMs: 5_000 });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Disposable PostgreSQL did not become ready.');
};

const scalarQuery = async (container: string, sql: string): Promise<number> => {
  const result = await run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '--username',
    'fixture',
    '--dbname',
    'fixture',
    '--tuples-only',
    '--no-align',
  ], { input: `${sql}\n` });
  const value = Number(result.stdout.trim());
  if (!Number.isFinite(value)) throw new Error(`Expected scalar query result, got ${result.stdout}.`);
  return value;
};

const cleanupTemporaryWorktrees = async (
  repositoryRoot: string,
  worktreeDirectory: string,
) => {
  const result = await run(
    'git',
    ['worktree', 'list', '--porcelain'],
    { cwd: repositoryRoot, timeoutMs: 30_000 },
  ).catch(() => null);
  if (!result) return;
  const canonicalDirectory = await fs.realpath(worktreeDirectory)
    .catch(() => path.resolve(worktreeDirectory));
  const directoryPrefix = `${canonicalDirectory}${path.sep}`;
  const temporaryWorktrees = result.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((worktree) => path.resolve(worktree).startsWith(directoryPrefix));
  for (const worktree of temporaryWorktrees) {
    await run(
      'git',
      ['worktree', 'remove', '--force', worktree],
      { cwd: repositoryRoot, timeoutMs: 60_000 },
    ).catch(() => {});
  }
};

const fixtureHtml = `<!doctype html>
<html lang="en">
  <body>
    <article class="event-card">
      <h2 class="event-title">River City Summer League</h2>
      <a class="register" href="https://fixture.invalid/register">Register</a>
      <p class="venue">River City Sports Complex</p>
      <p class="address">100 Main Street</p>
      <p class="city">Portland</p>
    </article>
  </body>
</html>
`;

const buildFixtureJob = (control: any) => {
  const value = structuredClone(control);
  value.context.jobId = 'fixture_job_disposable_review';
  value.context.intakeId = 'fixture_intake_disposable_review';
  value.context.sourceKey = 'river-city-soccer-disposable';
  value.context.runId = 'fixture_run_disposable_review';
  value.context.artifacts[0].pageUrl = 'https://fixture.invalid/events';
  value.draft.intakeId = value.context.intakeId;
  value.draft.sourceKey = value.context.sourceKey;
  value.draft.runId = value.context.runId;
  value.draft.evidence[0].pageUrl = 'https://fixture.invalid/events';
  value.draft.organization.website = 'https://fixture.invalid';
  value.draft.mapping.listUrl = 'https://fixture.invalid/events';
  value.draft.mapping.fields = {
    ...value.draft.mapping.fields,
    sportName: { selector: ':scope', mode: 'literal', value: 'Soccer' },
    formatLabel: { selector: ':scope', mode: 'literal', value: 'League' },
    dateDisplayMode: { selector: ':scope', mode: 'literal', value: 'NO_FIXED_DATE' },
    dateDisplayText: { selector: ':scope', mode: 'literal', value: 'Registration open' },
    divisionText: { selector: ':scope', mode: 'literal', value: 'Adult' },
    tagText: { selector: ':scope', mode: 'literal', value: 'League' },
  };
  value.draft.expectedCandidates[0].officialActionUrl = 'https://fixture.invalid/register';
  value.draft.expectedCandidates[0].sourceUrl = 'https://fixture.invalid/events';
  value.draft.logo.sourceUrl = 'https://fixture.invalid/logo.png';
  return value;
};

const main = async () => {
  const repositoryRoot = process.cwd();
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'bracketiq-affiliate-agent-scrape-'),
  );
  const fixtureDirectory = path.join(temporaryRoot, 'fixture-pages');
  const worktreeDirectory = path.join(temporaryRoot, 'worktrees');
  const container = `bracketiq-affiliate-agent-fixture-${process.pid}-${Date.now()}`;
  let containerStarted = false;
  try {
    await fs.mkdir(fixtureDirectory, { recursive: true });
    await fs.mkdir(worktreeDirectory, { recursive: true });
    await fs.writeFile(path.join(fixtureDirectory, 'events.html'), fixtureHtml, 'utf8');
    await fs.writeFile(path.join(fixtureDirectory, 'pages.json'), `${JSON.stringify({
      schemaVersion: 1,
      pages: [{
        url: 'https://fixture.invalid/events',
        finalUrl: 'https://fixture.invalid/events',
        statusCode: 200,
        file: 'events.html',
        sha256: createHash('sha256').update(fixtureHtml).digest('hex'),
      }],
    }, null, 2)}\n`, 'utf8');
    const control = JSON.parse(await fs.readFile(
      path.join(
        repositoryRoot,
        'training/affiliate-source-mapping/fixtures/control-job-v1.json',
      ),
      'utf8',
    ));
    const fixturePath = path.join(temporaryRoot, 'job.json');
    await fs.writeFile(
      fixturePath,
      `${JSON.stringify(buildFixtureJob(control), null, 2)}\n`,
      'utf8',
    );

    await run('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--env',
      'POSTGRES_USER=fixture',
      '--env',
      'POSTGRES_PASSWORD=fixture-password',
      '--env',
      'POSTGRES_DB=fixture',
      '--publish',
      '127.0.0.1::5432',
      POSTGRES_IMAGE,
    ], { timeoutMs: 5 * 60 * 1000 });
    containerStarted = true;
    await waitForPostgres(container);
    const portResult = await run('docker', ['port', container, '5432/tcp']);
    const portMatch = portResult.stdout.match(/127\.0\.0\.1:(\d+)/);
    if (!portMatch) throw new Error(`Could not determine disposable PostgreSQL port.`);
    const databaseUrl =
      `postgresql://fixture:fixture-password@127.0.0.1:${portMatch[1]}/fixture`;
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      STORAGE_PROVIDER: 'local',
      STORAGE_ROOT: path.join(temporaryRoot, 'uploads'),
      AFFILIATE_AGENT_REVIEW_FIXTURE_DIRECTORY: fixtureDirectory,
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
      SCRAPINGDOG_API_KEY: '',
    };

    await run(
      path.join(repositoryRoot, 'node_modules/.bin/prisma'),
      ['migrate', 'deploy'],
      { cwd: repositoryRoot, env: environment, timeoutMs: 10 * 60 * 1000 },
    );
    await run('docker', [
      'exec',
      '-i',
      container,
      'psql',
      '--username',
      'fixture',
      '--dbname',
      'fixture',
    ], {
      input: `
        INSERT INTO "AuthUser" ("id", "email", "passwordHash", "createdAt", "updatedAt")
        VALUES (
          'fixture_owner',
          'samuel.r@razumly.com',
          'fixture-not-a-login-password',
          NOW(),
          NOW()
        );
      `,
    });

    const runs: unknown[] = [];
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const result = await run(
        path.join(repositoryRoot, 'node_modules/.bin/tsx'),
        [
          'scripts/run-affiliate-mapping-agent.ts',
          `--fixture=${fixturePath}`,
          '--review-scrape',
          `--worktree-parent=${worktreeDirectory}`,
        ],
        { cwd: repositoryRoot, env: environment, timeoutMs: 15 * 60 * 1000 },
      );
      runs.push(JSON.parse(result.stdout));
    }

    const sourceCount = await scalarQuery(
      container,
      `SELECT COUNT(*) FROM "AffiliateScrapeSources"
       WHERE "sourceKey" = 'river-city-soccer-disposable'
         AND "autoScrapeEnabled" = false;`,
    );
    const unvalidatedMappingCount = await scalarQuery(
      container,
      `SELECT COUNT(*) FROM "AffiliateScrapeMappings" AS mapping
       JOIN "AffiliateScrapeSources" AS source ON source.id = mapping."sourceId"
       WHERE source."sourceKey" = 'river-city-soccer-disposable'
         AND mapping."validatedAt" IS NULL;`,
    );
    const candidateCount = await scalarQuery(
      container,
      `SELECT COUNT(*) FROM "AffiliateImportCandidates" AS candidate
       JOIN "AffiliateScrapeSources" AS source ON source.id = candidate."sourceId"
       WHERE source."sourceKey" = 'river-city-soccer-disposable';`,
    );
    const publishedCount = await scalarQuery(
      container,
      `SELECT COUNT(*) FROM "AffiliateImportCandidates" AS candidate
       JOIN "AffiliateScrapeSources" AS source ON source.id = candidate."sourceId"
       WHERE source."sourceKey" = 'river-city-soccer-disposable'
         AND candidate.status = 'PUBLISHED';`,
    );
    const scrapeRunCount = await scalarQuery(
      container,
      `SELECT COUNT(*) FROM "AffiliateScrapeRuns" AS run
       JOIN "AffiliateScrapeSources" AS source ON source.id = run."sourceId"
       WHERE source."sourceKey" = 'river-city-soccer-disposable'
         AND run.status = 'SUCCEEDED';`,
    );
    const checks = {
      sourceCount,
      unvalidatedMappingCount,
      candidateCount,
      publishedCount,
      scrapeRunCount,
    };
    if (
      sourceCount !== 1
      || unvalidatedMappingCount !== 1
      || candidateCount !== 1
      || publishedCount !== 0
      || scrapeRunCount !== 2
    ) {
      throw new Error(`Disposable scrape checks failed: ${JSON.stringify(checks)}.`);
    }
    console.log(JSON.stringify({
      schemaVersion: 1,
      fixture: 'river-city-soccer-disposable',
      iterations: runs.length,
      checks,
      publicScrapeRequests: 0,
      liveDatabaseWrites: 0,
      disposed: true,
    }, null, 2));
  } finally {
    if (containerStarted) {
      await run('docker', ['rm', '--force', container], { timeoutMs: 60_000 }).catch(() => {});
    }
    await cleanupTemporaryWorktrees(repositoryRoot, worktreeDirectory);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:disposable-scrape] failed', error);
  process.exitCode = 1;
});
