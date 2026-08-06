import path from 'node:path';

export const CODEX_AFFILIATE_INGESTION_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_INGESTION_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_INGESTION_SERVICE_TIER = null;
export const CODEX_AFFILIATE_INGESTION_FAST_MODE = false;
export const CODEX_AFFILIATE_INGESTION_SKILL = '$ingest-affiliate-intakes';

export type CodexAffiliateGoalOptions = {
  repositoryRoot: string;
  useLiveIntakes: boolean;
  workerId: string;
  containerIsolated?: boolean;
};

const npmRunCommand = (script: string, arguments_: string[] = []): string => [
  'npm',
  'run',
  script,
  ...(arguments_.length > 0 ? ['--', ...arguments_] : []),
].join(' ');

const safeWorkerId = (value: string): string => {
  const workerId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(workerId)) {
    throw new Error(
      'Codex affiliate ingestion worker id must use 1-80 letters, numbers, dots, underscores, or hyphens.',
    );
  }
  return workerId;
};

export const buildCodexAffiliateIngestionObjective = (
  options: CodexAffiliateGoalOptions,
): string => {
  const workerId = safeWorkerId(options.workerId);
  const liveArguments = options.useLiveIntakes ? ['--live'] : [];
  const queueStatusCommand = npmRunCommand(
    'affiliate:mapping:queue-status',
    liveArguments,
  );
  const claimCommand = npmRunCommand(
    'affiliate:mapping:claim',
    [...liveArguments, `--worker=${workerId}`],
  );
  const completeCommand = npmRunCommand(
    'affiliate:mapping:complete',
    [...liveArguments, '--job=<job-id>', '--result=<result-json>'],
  );
  const enqueueUrlsCommand = npmRunCommand(
    'affiliate:intakes:enqueue-urls',
    [
      ...liveArguments,
      '--input=<proposal-json>',
      '--result=<result-json>',
      '--job=<job-id>',
      `--worker=${workerId}`,
    ],
  );
  const processCapturesCommand = npmRunCommand(
    'affiliate:intakes:process',
    [...liveArguments, '--limit=25', '--summary'],
  );

  return [
    'Process eligible affiliate intakes until the read-only queue proves claimableJobs=0, eligibleReadyIntakesWithoutJob=0, claimedWithoutLease=0, queuedCaptureRuns=0, and runningCaptureRuns=0.',
    `Use ${CODEX_AFFILIATE_INGESTION_SKILL}; read its skill, completion contract, AGENTS.md, and docs/affiliate-source-rollout-agent-goal.md. Use only the claim command for assignment.`,
    `${queueStatusCommand}. Claim one intake at a time with ${claimCommand}; record terminal results with ${completeCommand}.`,
    'For repairContext, fix every repairReason and blockingIssue in a new commit and add a source regression test. Add one generalized rule there when missing.',
    'For event-datetime-v1, inspect every occurrence; classify SCHEDULED, DATE_ONLY, NO_FIXED_DATE, or ONGOING; verify timezone, precision, end, duration, DST, title-clock consistency, and output under TZ=UTC and a non-UTC host. Prove evergreen rows have source-backed schedule text, no hidden dated session, and are not tryouts/evaluations; record transitions and repair codes.',
    'MANUAL_LOGO_REVIEW: inspect stored branding and use only a verified official mark or crop.',
    `For a directory, enqueue every evidenced official organization URL with ${enqueueUrlsCommand}. Complete that parent job as EXPANDED, run ${processCapturesCommand}, and map child captures.`,
    'Create a review-ready organization setup and mapping with official URLs and logo disposition, tests, two duplicate-safe review scrapes, result, and source-scoped commit.',
    'A REVIEW_REQUIRED event-datetime-v1 result must include dateTimeReview with contractRevision, candidateCount, timezone/precision/end counts, durationWarnings, utcHostRegression, displayModeCounts, evergreenTransitions, and evidence.',
    'For source-only work, run focused Jest, targeted ESLint, and scoped diff checks. Never run full-project npx tsc --noEmit except for explicitly authorized shared importer or app changes.',
    'Use exact current Sports.name values. Never infer a volleyball or soccer surface.',
    'Handle unsupported source sport labels as human-review evidence only; complete such jobs as HUMAN_REVIEW_REQUIRED with SPORT_NOT_IN_CATALOG and do not write candidates.',
    'Run logo-fit only for the current organization; never --all.',
    'Treat each source event as one parent and group every division by its stable event identity/detail-page context. Preserve the exact source division label; use canonical gender M/F/C, ratingType AGE/SKILL. Every accepted EVENT must have a source-supported division. Exclude invalid events; keep price/capacity on the owning division, and differing division prices must produce a compact event range.',
    'Write natural source-derived event and organization descriptions about the activity; never narrate where a record was listed, found, scraped, or mapped or start event copy with its full title. Reuse a source-backed organization-level activity description when needed.',
    'Give every organization its best defensible location. Prefer an address; otherwise geocode the most specific supported city or region. Do not leave organization location null merely because its address is missing.',
    'Keep valid organizations reviewable when individual events lack locations.',
    'Accepted events need an evidenced event venue/address or an explicit SOURCE_ORGANIZATION fallback with stored evidence; reject and log only invalid events. Setup scripts must support guarded --live application.',
    'Skip failed, blocked, incomplete, held-out, duplicate, already-finished, and TEAM-only intakes.',
    'Do not publish candidates or organizations, enable automation, validate mappings, promote training data, push, deploy, or change live packages.',
    `Keep output/affiliate-codex-ingestion/progress/${workerId}.jsonl current and report final status.`,
  ].join(' ');
};

export const buildCodexAffiliateIngestionGoal = (
  options: CodexAffiliateGoalOptions,
): string => {
  const objective = buildCodexAffiliateIngestionObjective(options);
  return [
    'Before doing any other work, call the create_goal tool with exactly the objective',
    'between the <objective> tags and omit token_budget.',
    'After create_goal succeeds, begin the goal immediately. If create_goal is not',
    'available in this session, use the exact objective as the in-session goal and',
    'continue; do not stop or restart only because that tool is unavailable. Keep',
    'working until the stopping condition is proven.',
    `<objective>${objective}</objective>`,
  ].join(' ');
};

export const buildCodexAffiliateIngestionArgs = (
  options: CodexAffiliateGoalOptions,
): string[] => {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const sandboxMode = options.containerIsolated
    ? 'danger-full-access'
    : 'workspace-write';
  return [
    '--ask-for-approval',
    'never',
    'exec',
    '--ephemeral',
    '--cd',
    repositoryRoot,
    '--model',
    CODEX_AFFILIATE_INGESTION_MODEL,
    '--config',
    `model_reasoning_effort="${CODEX_AFFILIATE_INGESTION_REASONING_EFFORT}"`,
    '--config',
    'sandbox_workspace_write.network_access=true',
    '--enable',
    'goals',
    '--sandbox',
    sandboxMode,
    buildCodexAffiliateIngestionGoal({
      ...options,
      repositoryRoot,
    }),
  ];
};
