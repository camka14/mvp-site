import path from 'node:path';

export const CODEX_AFFILIATE_INGESTION_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_INGESTION_REASONING_EFFORT = 'xhigh';
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

  return [
    'Process every eligible BracketIQ affiliate source intake without stopping',
    'until the read-only queue report proves claimableJobs=0 and',
    'eligibleReadyIntakesWithoutJob=0 and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_INGESTION_SKILL} and read`,
    '.agents/skills/ingest-affiliate-intakes/SKILL.md, its completion contract,',
    'AGENTS.md, and docs/affiliate-source-rollout-agent-goal.md before acting.',
    `Use worker id ${workerId}.`,
    `Check progress with ${queueStatusCommand}.`,
    `Claim one intake at a time with ${claimCommand}`,
    `and record each terminal result with ${completeCommand}.`,
    'For each eligible intake create the complete review-ready organization package:',
    'organization setup, EVENT/RENTAL/CLUB mapping or justified extractor, official',
    'outbound URLs, official normalized logo or explicit manual-review disposition,',
    'source provenance, fixtures, focused tests, two duplicate-safe review scrapes,',
    'a result artifact, and a source-scoped commit.',
    'Use only stored intake evidence when it is sufficient.',
    'Skip failed, blocked, incomplete, held-out, duplicate, already-finished, and',
    'TEAM-only intakes without retrying them.',
    'Never invent dates, organization facts, or logos.',
    'Do not publish candidates or organizations, enable automation, mark mappings',
    'validated, promote training data, push, deploy, or mutate live organization,',
    'source, mapping, or candidate rows.',
    'The live flag, when present, authorizes only intake evidence reads and mapping-job',
    'queue transitions.',
    'Keep output/affiliate-codex-ingestion/progress.jsonl current and finish with a',
    'compact report of review-ready, skipped, and failed intakes plus the final queue status.',
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
