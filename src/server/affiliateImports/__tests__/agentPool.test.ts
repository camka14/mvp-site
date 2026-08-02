/** @jest-environment node */

import {
  buildAffiliateAgentIds,
  parseAffiliateAgentCount,
  runAffiliateAgentPool,
} from '../agentPool';

describe('affiliate agent pool', () => {
  it('builds stable unique worker ids for the configured count', () => {
    expect(buildAffiliateAgentIds('codex-luna-mapper', 2)).toEqual([
      'codex-luna-mapper-1',
      'codex-luna-mapper-2',
    ]);
    expect(parseAffiliateAgentCount(undefined)).toBe(1);
  });

  it('rejects unsafe counts and duplicate worker ids', async () => {
    expect(() => parseAffiliateAgentCount('0')).toThrow('1 through 8');
    expect(() => parseAffiliateAgentCount('9')).toThrow('1 through 8');
    await expect(runAffiliateAgentPool({
      agentIds: ['mapper-1', 'mapper-1'],
      runAgent: async () => undefined,
    })).rejects.toThrow('unique');
  });

  it('waits for every active agent before resolving the pool', async () => {
    const releases = new Map<string, () => void>();
    const pool = runAffiliateAgentPool({
      agentIds: ['reviewer-1', 'reviewer-2'],
      runAgent: (agentId) => new Promise<string>((resolve) => {
        releases.set(agentId, () => resolve(agentId));
      }),
    });

    await Promise.resolve();
    releases.get('reviewer-1')?.();
    let resolved = false;
    void pool.then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);

    releases.get('reviewer-2')?.();
    await expect(pool).resolves.toEqual([
      { agentId: 'reviewer-1', result: 'reviewer-1' },
      { agentId: 'reviewer-2', result: 'reviewer-2' },
    ]);
  });
});
