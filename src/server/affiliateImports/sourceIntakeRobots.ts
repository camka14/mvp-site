export type RobotsPathDecision = {
  status: 'ALLOWED' | 'DISALLOWED';
  matchedRule: string | null;
  userAgent: string;
};

type RobotsRule = {
  directive: 'allow' | 'disallow';
  value: string;
};

type RobotsGroup = {
  userAgents: string[];
  rules: RobotsRule[];
};

const stripComment = (value: string): string => value.replace(/\s*#.*$/, '').trim();

const parseGroups = (text: string): RobotsGroup[] => {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let hasRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      if (!current || hasRules) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      if (value) current.userAgents.push(value.toLowerCase());
      continue;
    }

    if ((key === 'allow' || key === 'disallow') && current) {
      if (key === 'disallow' && !value) continue;
      current.rules.push({ directive: key, value });
      hasRules = true;
    }
  }

  return groups;
};

const escapeRegex = (value: string): string => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const ruleRegex = (value: string): RegExp => {
  const anchoredAtEnd = value.endsWith('$');
  const pattern = (anchoredAtEnd ? value.slice(0, -1) : value)
    .split('*')
    .map(escapeRegex)
    .join('.*');
  return new RegExp(`^${pattern}${anchoredAtEnd ? '$' : ''}`);
};

export const evaluateRobotsPath = (
  robotsText: string,
  pageUrl: string,
  userAgent = 'BracketIQ-Affiliate-Intake',
): RobotsPathDecision => {
  const groups = parseGroups(robotsText);
  const normalizedAgent = userAgent.toLowerCase();
  const exactGroups = groups.filter((group) => group.userAgents.some((agent) => (
    agent !== '*' && normalizedAgent.includes(agent)
  )));
  const applicable = exactGroups.length
    ? exactGroups
    : groups.filter((group) => group.userAgents.includes('*'));
  const path = `${new URL(pageUrl).pathname}${new URL(pageUrl).search}`;
  const matches = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => ruleRegex(rule.value).test(path))
    .sort((left, right) => {
      const lengthDifference = right.value.replace(/\*|\$$/g, '').length
        - left.value.replace(/\*|\$$/g, '').length;
      if (lengthDifference !== 0) return lengthDifference;
      if (left.directive === right.directive) return 0;
      return left.directive === 'allow' ? -1 : 1;
    });
  const winner = matches[0];

  return {
    status: winner?.directive === 'disallow' ? 'DISALLOWED' : 'ALLOWED',
    matchedRule: winner ? `${winner.directive}: ${winner.value}` : null,
    userAgent: exactGroups.length ? normalizedAgent : '*',
  };
};
