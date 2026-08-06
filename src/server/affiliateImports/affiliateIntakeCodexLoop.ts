export type AffiliateMappingClaim = {
  claimed: boolean;
  jobId?: string;
  intakeId?: string;
  sourceKey?: string;
  workerId?: string;
  resumed?: boolean;
};

export type AffiliateMapperReconciliation = {
  claim: AffiliateMappingClaim | null;
  hasPendingWork: boolean;
};

export type AffiliateIntakeCodexLoopOptions = {
  intervalSeconds?: number;
  maxCycles?: number;
};

export type AffiliateIntakeCodexLoopDependencies = {
  claim: () => Promise<AffiliateMappingClaim>;
  reconcile?: () => Promise<AffiliateMapperReconciliation>;
  runGoal: (claim: AffiliateMappingClaim) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  onIdle?: (intervalSeconds: number) => void;
  onPendingWork?: (intervalSeconds: number) => void;
};

const DEFAULT_INTERVAL_SECONDS = 300;
const MIN_INTERVAL_SECONDS = 10;
const MAX_INTERVAL_SECONDS = 3_600;

export const parseAffiliateMapperLoopIntervalSeconds = (
  value: string | undefined,
  fallback = DEFAULT_INTERVAL_SECONDS,
): number => {
  const parsed = value === undefined ? Number.NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_INTERVAL_SECONDS || parsed > MAX_INTERVAL_SECONDS) {
    return fallback;
  }
  return parsed;
};

export const parseAffiliateMappingClaimOutput = (output: string): AffiliateMappingClaim => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Affiliate mapping claim command returned invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Affiliate mapping claim command returned an invalid result.');
  }
  const result = parsed as Record<string, unknown>;
  if (result.claimed === false) return { claimed: false };
  if (result.claimed !== true) {
    throw new Error('Affiliate mapping claim result must contain claimed=true or claimed=false.');
  }
  const required = ['jobId', 'intakeId', 'sourceKey', 'workerId'];
  for (const key of required) {
    if (typeof result[key] !== 'string' || !result[key].trim()) {
      throw new Error(`Affiliate mapping claim result is missing ${key}.`);
    }
  }
  return {
    claimed: true,
    jobId: result.jobId as string,
    intakeId: result.intakeId as string,
    sourceKey: result.sourceKey as string,
    workerId: result.workerId as string,
    resumed: result.resumed === true,
  };
};

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

export const runAffiliateIntakeCodexLoop = async (
  options: AffiliateIntakeCodexLoopOptions,
  dependencies: AffiliateIntakeCodexLoopDependencies,
): Promise<{ cycles: number; goalsStarted: number }> => {
  const intervalSeconds = parseAffiliateMapperLoopIntervalSeconds(
    options.intervalSeconds === undefined ? undefined : String(options.intervalSeconds),
  );
  const sleep = dependencies.sleep ?? defaultSleep;
  const maxCycles = options.maxCycles === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.trunc(options.maxCycles));
  let cycles = 0;
  let goalsStarted = 0;

  while (cycles < maxCycles) {
    cycles += 1;
    const claim = await dependencies.claim();
    if (!claim.claimed) {
      const reconciliation = await dependencies.reconcile?.();
      if (reconciliation?.claim?.claimed) {
        goalsStarted += 1;
        await dependencies.runGoal(reconciliation.claim);
        continue;
      }
      if (reconciliation?.hasPendingWork) {
        dependencies.onPendingWork?.(intervalSeconds);
        await sleep(intervalSeconds * 1_000);
        continue;
      }
      dependencies.onIdle?.(intervalSeconds);
      await sleep(intervalSeconds * 1_000);
      continue;
    }
    goalsStarted += 1;
    await dependencies.runGoal(claim);
  }

  return { cycles, goalsStarted };
};
