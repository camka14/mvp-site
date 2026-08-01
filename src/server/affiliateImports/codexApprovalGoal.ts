import path from 'node:path';

export const CODEX_AFFILIATE_APPROVAL_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT = 'xhigh';
export const CODEX_AFFILIATE_APPROVAL_SKILL = '$review-affiliate-approvals';

export type CodexAffiliateApprovalGoalOptions = {
  repositoryRoot: string;
  useLiveApprovals: boolean;
  reviewerId: string;
  containerIsolated?: boolean;
};

const npmRunCommand = (script: string, arguments_: string[] = []): string => [
  'npm',
  'run',
  script,
  ...(arguments_.length ? ['--', ...arguments_] : []),
].join(' ');

const safeReviewerId = (value: string): string => {
  const reviewerId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(reviewerId)) {
    throw new Error('Codex affiliate reviewer id must use 1-80 letters, numbers, dots, underscores, or hyphens.');
  }
  return reviewerId;
};

export const buildCodexAffiliateApprovalObjective = (
  options: CodexAffiliateApprovalGoalOptions,
): string => {
  const reviewerId = safeReviewerId(options.reviewerId);
  const liveArguments = options.useLiveApprovals ? ['--live'] : [];
  const reconcileCommand = npmRunCommand('affiliate:approvals:reconcile', liveArguments);
  const queueCommand = npmRunCommand('affiliate:approvals:queue-status', liveArguments);
  const claimCommand = npmRunCommand('affiliate:approvals:claim', [
    ...liveArguments,
    `--worker=${reviewerId}`,
  ]);
  const completeCommand = npmRunCommand('affiliate:approvals:complete', [
    ...liveArguments,
    '--job=<approval-job-id>',
    '--result=<review-json>',
  ]);
  const policyEvidenceCommand = npmRunCommand('affiliate:approvals:policy-evidence', [
    ...liveArguments,
    '--policy=<policy-key>',
  ]);
  const packageEvidenceCommand = npmRunCommand('affiliate:approvals:package-evidence', [
    ...liveArguments,
    '--job=<mapping-job-id>',
  ]);
  return [
    'Independently review every eligible BracketIQ affiliate approval until',
    'claimableJobs=0, activeLeases=0, and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_APPROVAL_SKILL} and read its SKILL.md and approval contract,`,
    'plus AGENTS.md and docs/affiliate-luna-approval-agent-execplan.md before acting.',
    `Use reviewer id ${reviewerId}.`,
    `Reconcile pending subjects with ${reconcileCommand}.`,
    `Check progress with ${queueCommand}.`,
    `Claim exactly one approval at a time with ${claimCommand}.`,
    `Record its decision with ${completeCommand}.`,
    `For each DOMAIN_POLICY claim, refresh bounded evidence with ${policyEvidenceCommand}.`,
    'For DOMAIN_POLICY subjects inspect stored robots, terms, intake pages, and policy',
    'evidence. ALLOW only when public automated capture is supported; BLOCK when it is',
    'prohibited; DEFER when evidence is missing or ambiguous.',
    `For each MAPPING_PACKAGE claim, run ${packageEvidenceCommand}.`,
    'Use its read-only producer commit and generated-file evidence plus its disposable',
    'validation database review-scrape evidence to inspect file scope, tests, two stable',
    'duplicate-safe scrapes, candidate output, official logo, and location resolution.',
    'Use the live database only for the approval queue and unpublished organization,',
    'disabled automation, unvalidated mapping, and guarded application safety checks.',
    'Before first approval, no evidence-matched live source is the expected NOT_APPLIED',
    'state, not a rejection reason. Check for conflicting or already-published live rows;',
    'the guarded APPROVE completion creates the package and then enforces unpublished,',
    'disabled, and unvalidated postconditions.',
    'Never reject or defer a package merely because its disposable review-scrape IDs do',
    'not exist in production, and never require the producer commit to exist in the',
    'reviewer checkout when the package-evidence command verifies it in the read-only',
    'producer repository.',
    'Never approve a package produced by this reviewer identity.',
    'Do not edit a producer package while reviewing it. REJECT with exact blocking issues',
    'or DEFER when independent evidence is insufficient.',
    'Never publish an organization or candidate, enable recurring scraping, validate a',
    'mapping, approve training data, push code, deploy, or change unrelated live data.',
    'The live flag authorizes only approval queue transitions, evidence-backed domain',
    'policy/intake decisions and capture queueing, and guarded application of an approved',
    'mapping package as an unpublished disabled source.',
    'After every completion reconcile and check the queue again. Keep',
    'output/affiliate-codex-approvals/progress.jsonl current and finish with a compact',
    'report of allowed, blocked, approved, rejected, and deferred subjects.',
  ].join(' ');
};

export const buildCodexAffiliateApprovalGoal = (
  options: CodexAffiliateApprovalGoalOptions,
): string => {
  const objective = buildCodexAffiliateApprovalObjective(options);
  return [
    'Before doing any other work, call the create_goal tool with exactly the objective',
    'between the <objective> tags and omit token_budget. After create_goal succeeds,',
    'begin immediately and continue until the stopping condition is proven.',
    `<objective>${objective}</objective>`,
  ].join(' ');
};

export const buildCodexAffiliateApprovalArgs = (
  options: CodexAffiliateApprovalGoalOptions,
): string[] => [
  '--ask-for-approval',
  'never',
  'exec',
  '--cd',
  path.resolve(options.repositoryRoot),
  '--model',
  CODEX_AFFILIATE_APPROVAL_MODEL,
  '--config',
  `model_reasoning_effort="${CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT}"`,
  '--config',
  'sandbox_workspace_write.network_access=true',
  '--enable',
  'goals',
  '--sandbox',
  options.containerIsolated ? 'danger-full-access' : 'workspace-write',
  buildCodexAffiliateApprovalGoal(options),
];
