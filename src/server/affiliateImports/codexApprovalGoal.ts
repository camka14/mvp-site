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
    'Independently review every eligible BracketIQ affiliate approval until',
    'claimableJobs=0, activeLeases=0, and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_APPROVAL_SKILL} and read its SKILL.md and approval contract,`,
    'plus AGENTS.md and docs/affiliate-luna-approval-agent-execplan.md before acting.',
    'The skill and contract are complete; follow every required check and output field.',
    `Use reviewer id ${reviewerId}.`,
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
    'For MANUAL_REVIEW logos, inspect stored branding and the official site. Persist a',
    `newly found official mark with ${logoEvidenceCommand}, then return`,
    'OFFICIAL_LOGO_REPAIR_REQUIRED. If a bounded search proves no mark, do not reject an',
    'otherwise-valid package; set officialLogoVerified=false and logoAbsenceAccepted=true.',
    'Never normalize, assign, commit, or fabricate a logo.',
    'Review organizations independently from child events. Missing event locations do',
    'not invalidate a valid organization when those events were excluded and logged.',
    'Accepted events need an evidenced address or evidenced SOURCE_ORGANIZATION fallback.',
    'Verify division grouping, source labels, canonical gender M/F/C, AGE/SKILL, each',
    'division price/capacity, and compact event price ranges. Never cross event boundaries',
    'or guess ambiguity.',
    'Independently verify event and organization description quality from first-party',
    'evidence. Copy must naturally describe the activity or organization, never where it',
    'was listed, found, scraped, or mapped. Event copy must not begin with the full title.',
    'A natural source-backed organization fallback may be shared when event prose is',
    'absent. Set descriptionQualityVerified=true only after checking. Return concrete',
    'defects as EVENT_DESCRIPTION_INVALID or ORGANIZATION_DESCRIPTION_INVALID.',
    'Every non-approved mapping result needs mappingDisposition. Send fixable defects to',
    'PRODUCER_REPAIR with all reasonCodes; use HUMAN_REVIEW_REQUIRED and DEFER only for',
    'missing, inaccessible, or conflicting evidence, never a repairable defect.',
    'Use live data only for the approval queue, governed evidence/policy decisions, and',
    'guarded application as an unpublished, disabled, unvalidated source. NOT_APPLIED',
    'before approval is expected. Disposable scrape IDs need not exist in production.',
    'Never approve a package produced by this reviewer identity.',
    'Do not edit producer packages, publish, enable scraping, validate mappings, approve',
    'training data, push, deploy, or change unrelated live data.',
    'After every completion reconcile and check the queue again. Keep',
    'output/affiliate-codex-approvals/progress.jsonl current and finish with a compact',
    'report of allowed, blocked, approved, rejected, and deferred subjects.',
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
