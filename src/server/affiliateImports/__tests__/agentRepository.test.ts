/** @jest-environment node */

import {
  resolveAffiliateDatasetEnvironment,
  resolveAffiliateRepositoryCommit,
} from '../agentRepository';

describe('affiliate agent repository metadata', () => {
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
