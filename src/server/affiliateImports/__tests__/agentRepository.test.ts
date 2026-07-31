/** @jest-environment node */

import {
  configureAffiliateLiveDatabaseEnvironment,
  resolveAffiliateDatasetEnvironment,
  resolveAffiliateRepositoryCommit,
} from '../agentRepository';

describe('affiliate agent repository metadata', () => {
  it('preserves non-TLS OVH database mode and normalizes TLS live URLs', () => {
    const ovhEnv: NodeJS.ProcessEnv = {
      PG_SSL_REJECT_UNAUTHORIZED: 'false',
    };
    expect(configureAffiliateLiveDatabaseEnvironment(
      ' postgresql://user:pass@127.0.0.1:5432/app?sslmode=disable ',
      ovhEnv,
    )).toContain('sslmode=disable');
    expect(ovhEnv.DATABASE_URL).toContain('127.0.0.1:5432');
    expect(ovhEnv.PG_SSL_REJECT_UNAUTHORIZED).toBeUndefined();

    const managedEnv: NodeJS.ProcessEnv = {};
    configureAffiliateLiveDatabaseEnvironment(
      'postgresql://user:pass@managed.example/app?sslmode=require',
      managedEnv,
    );
    expect(managedEnv.PG_SSL_REJECT_UNAUTHORIZED).toBe('false');
    expect(() => configureAffiliateLiveDatabaseEnvironment(' ', {}))
      .toThrow('DATABASE_URL_LIVE is required with --live.');
  });

  it('labels a production-local database as live without switching connection modes', () => {
    expect(resolveAffiliateDatasetEnvironment({
      explicitEnvironment: 'live',
      useLiveDatabase: false,
    })).toBe('live');
  });

  it('uses the database mode when no environment label is supplied', () => {
    expect(resolveAffiliateDatasetEnvironment({
      useLiveDatabase: true,
    })).toBe('live');
    expect(resolveAffiliateDatasetEnvironment({
      useLiveDatabase: false,
    })).toBe('local');
  });

  it('rejects unknown dataset environments', () => {
    expect(() => resolveAffiliateDatasetEnvironment({
      explicitEnvironment: 'production',
      useLiveDatabase: false,
    })).toThrow('Dataset environment must be "local" or "live".');
  });

  it('uses an explicit commit without invoking Git', () => {
    const readGitCommit = jest.fn(() => 'unexpected');

    expect(resolveAffiliateRepositoryCommit({
      explicitCommit: '  abc123  ',
      readGitCommit,
    })).toBe('abc123');
    expect(readGitCommit).not.toHaveBeenCalled();
  });

  it('falls back to the repository commit returned by Git', () => {
    expect(resolveAffiliateRepositoryCommit({
      readGitCommit: () => '  def456\n',
    })).toBe('def456');
  });

  it('rejects an empty resolved commit', () => {
    expect(() => resolveAffiliateRepositoryCommit({
      readGitCommit: () => '   ',
    })).toThrow('Repository commit could not be resolved.');
  });
});
