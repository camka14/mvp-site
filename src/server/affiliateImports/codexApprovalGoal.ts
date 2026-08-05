import path from 'node:path';

export const CODEX_AFFILIATE_APPROVAL_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_APPROVAL_SERVICE_TIER = 'fast';
export const CODEX_AFFILIATE_APPROVAL_FAST_MODE = true;
export const CODEX_AFFILIATE_APPROVAL_SKILL = '$review-affiliate-approvals';
export const CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH = 4_000;

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
  const logoEvidenceCommand = npmRunCommand('affiliate:approvals:logo-evidence', [
    ...liveArguments,
    '--approval=<approval-job-id>',
    '--job=<mapping-job-id>',
    `--reviewer=${reviewerId}`,
    '--page-url=<official-page-url>',
    '--logo-url=<official-logo-url>',
  ]);
  return [
    'Review every eligible BracketIQ affiliate approval until',
    'claimableJobs=0, activeLeases=0, and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_APPROVAL_SKILL}; read its contract, AGENTS.md, and the approval ExecPlan.`,
    `Use reviewer id ${reviewerId}.`,
    'Use only the claim command for assignment.',
    `Reconcile pending subjects with ${reconcileCommand}.`,
    `Check progress with ${queueCommand}.`,
    `Claim exactly one approval at a time with ${claimCommand}.`,
    `Record its decision with ${completeCommand}.`,
    `For DOMAIN_POLICY, refresh evidence with ${policyEvidenceCommand} and decide`,
    'BLOCK only for an explicit target-path prohibition; otherwise ALLOW, including',
    'when policy files are missing or inaccessible. DEFER only conflicting scope.',
    `For each MAPPING_PACKAGE claim, run ${packageEvidenceCommand}.`,
    'Verify producer scope, disposable validation database review-scrape evidence,',
    'candidates, locations, duplicate safety, and logos.',
    'Read sportQuality and approve only exact Sports.name values. Return a',
    'correctable name as SPORT_NAME_INVALID producer repair. Immediately REJECT an',
    'unsupported sport as SPORT_NOT_IN_CATALOG with HUMAN_REVIEW_REQUIRED; never guess',
    'a sport surface. Set sportQualityVerified=true only after it passes.',
    'For MANUAL_REVIEW logos, inspect stored branding and the official site. Use',
    `${logoEvidenceCommand} for a found mark, then return OFFICIAL_LOGO_REPAIR_REQUIRED.`,
    'For rendered fit, preview only the claimed organization, never --all, then clean it.',
    'If none, do not reject an otherwise-valid package; set officialLogoVerified=false and logoAbsenceAccepted=true.',
    'Review organizations independently from child events. A street address is optional.',
    'Require the best defensible city/region and server-side Places coordinates; return',
    'missing data as ORGANIZATION_LOCATION_INVALID producer repair. Missing event',
    'locations do not invalidate a valid organization when excluded and logged.',
    'Accepted events need an evidenced address or evidenced SOURCE_ORGANIZATION fallback.',
    'Verify division grouping, source labels, canonical gender M/F/C, AGE/SKILL,',
    'division price/capacity, and compact event price ranges. Every accepted EVENT needs',
    'one division with all fields. Independently verify event and organization description quality;',
    'copy describes activity, not discovery or its title. Set descriptionQualityVerified=true',
    'only after checking; use EVENT_DESCRIPTION_INVALID or ORGANIZATION_DESCRIPTION_INVALID.',
    'Every non-approved mapping result needs mappingDisposition. Send fixable defects to',
    'PRODUCER_REPAIR with all reasonCodes; use HUMAN_REVIEW_REQUIRED for an unsupported',
    'sport, and DEFER only for missing, inaccessible, or conflicting evidence.',
    'Use live data only for queue and governed decisions. NOT_APPLIED before approval is',
    'expected. Disposable scrape IDs need not exist in production.',
    'Never approve a package produced by this reviewer identity.',
    'Do not edit producer packages, publish, enable scraping, validate mappings, approve',
    'training data, push, deploy, or change unrelated live data.',
    'After each completion reconcile and check the queue. Keep',
    `output/affiliate-codex-approvals/progress/${reviewerId}.jsonl current and report outcomes.`,
  ].join(' ');
};

export const buildCodexAffiliateApprovalGoal = (
  options: CodexAffiliateApprovalGoalOptions,
): string => {
  const objective = buildCodexAffiliateApprovalObjective(options);
  if (objective.length > CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH) {
    throw new Error(
      `Codex affiliate approval objective must be at most ${CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH} characters.`,
    );
  }
  return [
    'Before doing any other work, call the create_goal tool with exactly the objective',
    'between the <objective> tags and omit token_budget. After create_goal succeeds,',
    'begin immediately. If create_goal is not available in this session, use the exact',
    'objective as the in-session goal and continue; do not stop or restart only because',
    'that tool is unavailable. Continue until the stopping condition is proven.',
    `<objective>${objective}</objective>`,
  ].join(' ');
};

export const buildCodexAffiliateApprovalArgs = (
  options: CodexAffiliateApprovalGoalOptions,
): string[] => [
  '--ask-for-approval',
  'never',
  'exec',
  '--ephemeral',
  '--cd',
  path.resolve(options.repositoryRoot),
  '--model',
  CODEX_AFFILIATE_APPROVAL_MODEL,
  '--config',
  `model_reasoning_effort="${CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT}"`,
  '--config',
  `service_tier="${CODEX_AFFILIATE_APPROVAL_SERVICE_TIER}"`,
  '--config',
  `features.fast_mode=${CODEX_AFFILIATE_APPROVAL_FAST_MODE}`,
  '--config',
  'sandbox_workspace_write.network_access=true',
  '--enable',
  'goals',
  '--sandbox',
  options.containerIsolated ? 'danger-full-access' : 'workspace-write',
  buildCodexAffiliateApprovalGoal(options),
];
