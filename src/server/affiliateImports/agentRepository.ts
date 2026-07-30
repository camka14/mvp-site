import { execFileSync } from 'node:child_process';

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
