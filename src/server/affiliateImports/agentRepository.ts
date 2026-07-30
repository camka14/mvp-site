import { execFileSync } from 'node:child_process';

export type AffiliateDatasetEnvironment = 'local' | 'live';

export const configureAffiliateLiveDatabaseEnvironment = (
  liveDatabaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const normalizedUrl = liveDatabaseUrl?.trim();
  if (!normalizedUrl) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  env.DATABASE_URL = normalizedUrl;
  try {
    const sslMode = new URL(normalizedUrl).searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable') {
      delete env.PG_SSL_REJECT_UNAUTHORIZED;
    } else {
      env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
    }
  } catch {
    env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  }
  return normalizedUrl;
};

export const resolveAffiliateDatasetEnvironment = (input: {
  explicitEnvironment?: string;
  useLiveDatabase: boolean;
}): AffiliateDatasetEnvironment => {
  const explicitEnvironment = input.explicitEnvironment?.trim();
  if (
    explicitEnvironment
    && explicitEnvironment !== 'local'
    && explicitEnvironment !== 'live'
  ) {
    throw new Error('Dataset environment must be "local" or "live".');
  }
  return explicitEnvironment
    ? explicitEnvironment as AffiliateDatasetEnvironment
    : input.useLiveDatabase
      ? 'live'
      : 'local';
};

export const resolveAffiliateRepositoryCommit = (input: {
  explicitCommit?: string;
  repositoryRoot?: string;
  readGitCommit?: () => string;
} = {}): string => {
  const explicitCommit = input.explicitCommit?.trim();
  if (explicitCommit) return explicitCommit;

  const repositoryCommit = (
    input.readGitCommit
      ?? (() => execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: input.repositoryRoot ?? process.cwd(),
        encoding: 'utf8',
      }))
  )().trim();
  if (!repositoryCommit) {
    throw new Error('Repository commit could not be resolved.');
  }
  return repositoryCommit;
};
