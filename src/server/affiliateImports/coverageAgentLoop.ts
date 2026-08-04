export type AffiliateCoverageQueueStatus = {
  totalJobs: number;
  claimableJobs: number;
  activeLeases: number;
  claimedWithoutLease: number;
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
};

type AffiliateCoverageLoopDependencies = {
  reconcile: () => Promise<unknown>;
  getStatus: () => Promise<AffiliateCoverageQueueStatus>;
  launchGoal: () => Promise<void>;
};

export type AffiliateCoverageLoopCycle = {
  reconciliation: unknown;
  launchedGoal: boolean;
  queueBeforeLaunch: AffiliateCoverageQueueStatus;
  queueAfterLaunch: AffiliateCoverageQueueStatus;
};

export const runAffiliateCoverageLoopCycle = async (
  dependencies: AffiliateCoverageLoopDependencies,
): Promise<AffiliateCoverageLoopCycle> => {
  const reconciliation = await dependencies.reconcile();
  const queueBeforeLaunch = await dependencies.getStatus();
  if (queueBeforeLaunch.claimableJobs === 0) {
    return {
      reconciliation,
      launchedGoal: false,
      queueBeforeLaunch,
      queueAfterLaunch: queueBeforeLaunch,
    };
  }

  // The caller keeps its advisory lock while this goal runs. Do not inspect or
  // launch another goal until the active goal exits.
  await dependencies.launchGoal();
  await dependencies.reconcile();
  const queueAfterLaunch = await dependencies.getStatus();
  return {
    reconciliation,
    launchedGoal: true,
    queueBeforeLaunch,
    queueAfterLaunch,
  };
};
