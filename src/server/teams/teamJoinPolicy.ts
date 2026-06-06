export type TeamJoinPolicy = 'CLOSED' | 'OPEN_REGISTRATION' | 'REQUEST_TO_JOIN';

export const TEAM_JOIN_POLICY_CLOSED: TeamJoinPolicy = 'CLOSED';
export const TEAM_JOIN_POLICY_OPEN_REGISTRATION: TeamJoinPolicy = 'OPEN_REGISTRATION';
export const TEAM_JOIN_POLICY_REQUEST_TO_JOIN: TeamJoinPolicy = 'REQUEST_TO_JOIN';

const VALID_TEAM_JOIN_POLICIES = new Set<string>([
  TEAM_JOIN_POLICY_CLOSED,
  TEAM_JOIN_POLICY_OPEN_REGISTRATION,
  TEAM_JOIN_POLICY_REQUEST_TO_JOIN,
]);

export const normalizeTeamJoinPolicy = (
  value: unknown,
  fallback: TeamJoinPolicy = TEAM_JOIN_POLICY_CLOSED,
): TeamJoinPolicy => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return VALID_TEAM_JOIN_POLICIES.has(normalized)
    ? normalized as TeamJoinPolicy
    : fallback;
};

export const inferTeamJoinPolicyFromOpenRegistration = (openRegistration: unknown): TeamJoinPolicy => (
  openRegistration === true
    ? TEAM_JOIN_POLICY_OPEN_REGISTRATION
    : TEAM_JOIN_POLICY_CLOSED
);

export const resolveSerializedTeamJoinPolicy = (team: {
  joinPolicy?: unknown;
  openRegistration?: unknown;
}): TeamJoinPolicy => (
  normalizeTeamJoinPolicy(
    team.joinPolicy,
    inferTeamJoinPolicyFromOpenRegistration(team.openRegistration),
  )
);
