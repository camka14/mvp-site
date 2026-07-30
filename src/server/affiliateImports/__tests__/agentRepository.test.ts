/** @jest-environment node */

import { resolveAffiliateRepositoryCommit } from '../agentRepository';

describe('affiliate agent repository metadata', () => {
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
