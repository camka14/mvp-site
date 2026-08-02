import path from 'node:path';

export const CODEX_AFFILIATE_INGESTION_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_INGESTION_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_INGESTION_SERVICE_TIER = 'fast';
export const CODEX_AFFILIATE_INGESTION_FAST_MODE = true;
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
    'Process every eligible BracketIQ affiliate source intake without stopping',
    'until the read-only queue report proves claimableJobs=0 and',
    'eligibleReadyIntakesWithoutJob=0 and claimedWithoutLease=0 and',
    'queuedCaptureRuns=0 and runningCaptureRuns=0.',
    `Use ${CODEX_AFFILIATE_INGESTION_SKILL} and read`,
    '.agents/skills/ingest-affiliate-intakes/SKILL.md, its completion contract,',
    'AGENTS.md, and docs/affiliate-source-rollout-agent-goal.md before acting.',
    `Use worker id ${workerId}.`,
    `Check progress with ${queueStatusCommand}.`,
    `Claim one intake at a time with ${claimCommand}`,
    `and record each terminal result with ${completeCommand}.`,
    'For repairContext, fix every repairReason and blockingIssue in a new commit',
    'and add a source regression test. Add one generalized rule there when the repo',
    'skill or contract lacks that reusable failure class; never weaken validation.',
    'MANUAL_LOGO_REVIEW means inspect stored branding, images, logo candidates,',
    'HTML/CSS, metadata, and screenshots; normalize only a verified official mark or',
    'crop. If none is provable, record the evidence gap and do not loop.',
    'For a directory, enqueue every evidenced official organization URL with',
    `${enqueueUrlsCommand}. Complete that parent job as EXPANDED, run`,
    `${processCapturesCommand}, and map successful child captures.`,
    'For each eligible intake create the complete review-ready organization package:',
    'organization setup, EVENT/RENTAL/CLUB mapping or justified extractor, official',
    'outbound URLs, an official normalized logo or explicit unresolved-logo disposition,',
    'source provenance, fixtures, focused tests, two duplicate-safe review scrapes,',
    'a result artifact, and a source-scoped commit.',
    'Treat each source event as one parent record and group every division by its',
    'stable event identity/detail-page context; never merge divisions across cards,',
    'dates, venues, or registration pages. Preserve the exact source division label',
    'as the display name, then separately select canonical gender M/F/C, ratingType',
    'AGE/SKILL, divisionTypeId, skillDivisionTypeId, and ageDivisionTypeId. Use Coed',
    'only when the source says coed/mixed or leaves gender unspecified; flag ambiguous',
    'age or skill classification instead of guessing. Keep source prices and capacity',
    'on their owning divisions without copying or averaging. Use an event-level price',
    'only for a genuinely single-price or single-division event; differing division',
    'prices must produce a compact event range with fee caveats in details.',
    'Write natural source-derived event and organization descriptions. Describe the',
    'activity or services; never narrate where a record was listed, found, scraped, or mapped',
    'or start event copy with its full title. If needed, reuse a source-backed',
    'organization-level activity description for related events.',
    'Keep valid organizations reviewable when individual events lack locations.',
    'Accepted events need an evidenced event venue/address or an explicit',
    'SOURCE_ORGANIZATION fallback with stored evidence; reject and log only invalid',
    'events during each review scrape. Setup scripts must support guarded --live',
    'application even though this producer goal must validate them only disposably.',
    'Use sufficient stored evidence. Skip failed, blocked, incomplete, held-out,',
    'duplicate, already-finished, and TEAM-only intakes.',
    'Never invent dates, organization facts, or logos.',
    'Do not publish candidates or organizations, enable automation, mark mappings',
    'validated, promote training data, push, deploy, or mutate live organization,',
    'source, mapping, or candidate rows.',
    'The live flag permits intake/capture and queue work, never live organization,',
    'source, mapping, candidate, or publication writes.',
    'Keep output/affiliate-codex-ingestion/progress.jsonl current and report final status.',
  ].join(' ');
};

export const buildCodexAffiliateIngestionGoal = (
  options: CodexAffiliateGoalOptions,
): string => {
  const objective = buildCodexAffiliateIngestionObjective(options);
  return [
    'Before doing any other work, call the create_goal tool with exactly the objective',
    'between the <objective> tags and omit token_budget.',
    'After create_goal succeeds, begin the goal immediately and keep working until its',
    'stopping condition is proven.',
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
    '--cd',
    repositoryRoot,
    '--model',
    CODEX_AFFILIATE_INGESTION_MODEL,
    '--config',
    `model_reasoning_effort="${CODEX_AFFILIATE_INGESTION_REASONING_EFFORT}"`,
    '--config',
    `service_tier="${CODEX_AFFILIATE_INGESTION_SERVICE_TIER}"`,
    '--config',
    `features.fast_mode=${CODEX_AFFILIATE_INGESTION_FAST_MODE}`,
    '--config',
    'sandbox_workspace_write.network_access=true',
    '--enable',
    'goals',
    '--sandbox',
    sandboxMode,
    '--ask-for-approval',
    'never',
    buildCodexAffiliateIngestionGoal({
      ...options,
      repositoryRoot,
    }),
  ];
};
