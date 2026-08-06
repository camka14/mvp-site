import path from 'node:path';

export const CODEX_AFFILIATE_APPROVAL_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_APPROVAL_SERVICE_TIER = null;
export const CODEX_AFFILIATE_APPROVAL_FAST_MODE = false;
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
    'Continue until claimableJobs=0, activeLeases=0, and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_APPROVAL_SKILL}; read its contract, AGENTS.md, and the approval ExecPlan.`,
    `Use only the claim command for assignment. ${reconcileCommand}; ${queueCommand}; ${claimCommand}; ${completeCommand}. Reviewer ${reviewerId}.`,
    `For DOMAIN_POLICY, refresh evidence with ${policyEvidenceCommand}: BLOCK only for an explicit target-path prohibition; otherwise ALLOW when policy files are missing or inaccessible. DEFER only conflicting scope.`,
    `For each MAPPING_PACKAGE claim, run ${packageEvidenceCommand}; verify disposable validation database review-scrape evidence.`,
    'Read sportQuality and approve only exact Sports.name values. Return correctable names as SPORT_NAME_INVALID producer repair; unsupported sport is SPORT_NOT_IN_CATALOG with HUMAN_REVIEW_REQUIRED; never guess a sport surface. Set sportQualityVerified=true only after it passes.',
    `For MANUAL_REVIEW logos, inspect stored branding and the official site; use ${logoEvidenceCommand} for a found mark, then return OFFICIAL_LOGO_REPAIR_REQUIRED.`,
    'preview only the claimed organization, never --all, then clean it.',
    'If none, do not reject an otherwise-valid package; set officialLogoVerified=false and logoAbsenceAccepted=true.',
    'Review organizations independently from child events. A street address is optional. Require the best defensible city/region and server-side Places coordinates; missing data is ORGANIZATION_LOCATION_INVALID producer repair. Missing event locations do not invalidate a valid organization. Accepted events need an evidenced address or evidenced SOURCE_ORGANIZATION fallback.',
    'Verify division grouping, source labels, canonical gender M/F/C, AGE/SKILL, division price/capacity, and compact event price ranges. Every accepted EVENT needs one division. Independently verify event and organization description quality; copy describes activity, not discovery or its title. Set descriptionQualityVerified=true; use EVENT_DESCRIPTION_INVALID or ORGANIZATION_DESCRIPTION_INVALID.',
    'For event-datetime-v1 packages, verify dateTimeReview for every occurrence: recompute event-local UTC instants, timezone evidence, start precision, end/duration, DST, title-clock consistency, and TZ=UTC regression. Verify evergreen schedule text, absent timestamps, no hidden dated sessions, and no tryout/evaluation marked evergreen. Set dateTimeQualityVerified=true only after all checks. Use EVENT_DATETIME_* producer repair codes; use INSUFFICIENT_STORED_EVIDENCE only when evidence cannot resolve datetime.',
    'Every non-approved mapping result needs mappingDisposition. Send fixable defects to PRODUCER_REPAIR with all reasonCodes; use HUMAN_REVIEW_REQUIRED for an unsupported sport. Missing paths or scrape rows are PACKAGE_VALIDATION_FAILED; candidate-count conflicts are DUPLICATE_SAFETY_INVALID. DEFER only genuinely inaccessible or conflicting evidence.',
    'Use live data only for queue and governed decisions. NOT_APPLIED before approval is expected; disposable scrape IDs need not exist in production.',
    'Never approve a package produced by this reviewer identity.',
    'Do not edit producer packages, publish, push, deploy, or change unrelated live data.',
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
  'sandbox_workspace_write.network_access=true',
  '--enable',
  'goals',
  '--sandbox',
  options.containerIsolated ? 'danger-full-access' : 'workspace-write',
  buildCodexAffiliateApprovalGoal(options),
];
