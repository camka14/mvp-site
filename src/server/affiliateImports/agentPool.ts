const DEFAULT_AGENT_COUNT = 1;
const MAX_AGENT_COUNT = 8;

const workerIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,74}$/;

export const parseAffiliateAgentCount = (
  value: string | number | null | undefined,
  fallback = DEFAULT_AGENT_COUNT,
): number => {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AGENT_COUNT) {
    throw new Error(`Affiliate agent count must be an integer from 1 through ${MAX_AGENT_COUNT}.`);
  }
  return parsed;
};

export const buildAffiliateAgentIds = (prefixValue: string, count: number): string[] => {
  const prefix = prefixValue.trim().replace(/-+$/, '');
  if (!workerIdPattern.test(prefix)) {
    throw new Error('Affiliate agent id prefix is invalid.');
  }
  const boundedCount = parseAffiliateAgentCount(count);
  return Array.from({ length: boundedCount }, (_, index) => `${prefix}-${index + 1}`);
};

export const runAffiliateAgentPool = async <T>(input: {
  agentIds: string[];
  runAgent: (agentId: string) => Promise<T>;
}): Promise<Array<{ agentId: string; result: T }>> => {
  if (input.agentIds.length === 0) {
    throw new Error('Affiliate agent pool requires at least one agent id.');
  }
  if (new Set(input.agentIds).size !== input.agentIds.length) {
    throw new Error('Affiliate agent pool ids must be unique.');
  }
  return Promise.all(input.agentIds.map(async (agentId) => ({
    agentId,
    result: await input.runAgent(agentId),
  })));
};
