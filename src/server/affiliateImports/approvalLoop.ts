import type { AffiliateApprovalQueueStatus } from './approvalQueue';

type AffiliateApprovalLoopDependencies = {
  reconcile: () => Promise<unknown>;
  getStatus: () => Promise<AffiliateApprovalQueueStatus>;
  advanceFullReview?: (queue: AffiliateApprovalQueueStatus) => Promise<unknown>;
  launchGoal: () => Promise<void>;
};

export type AffiliateApprovalLoopCycle = {
  reconciliation: unknown;
  fullReview: unknown;
  launchedGoal: boolean;
  queueBeforeLaunch: AffiliateApprovalQueueStatus;
  queueAfterLaunch: AffiliateApprovalQueueStatus;
};

export const runAffiliateApprovalLoopCycle = async (
  dependencies: AffiliateApprovalLoopDependencies,
): Promise<AffiliateApprovalLoopCycle> => {
  const reconciliation = await dependencies.reconcile();
  let queueBeforeLaunch = await dependencies.getStatus();
  const fullReview = dependencies.advanceFullReview
    ? await dependencies.advanceFullReview(queueBeforeLaunch)
    : null;
  if (fullReview) {
    await dependencies.reconcile();
    queueBeforeLaunch = await dependencies.getStatus();
  }
  if (queueBeforeLaunch.claimableJobs === 0) {
    return {
      reconciliation,
      fullReview,
      launchedGoal: false,
      queueBeforeLaunch,
      queueAfterLaunch: queueBeforeLaunch,
    };
  }

  // Intentionally await the child goal before querying or launching again. The
  // outer process also holds its PostgreSQL advisory lock for this whole wait.
  await dependencies.launchGoal();
  await dependencies.reconcile();
  const queueAfterLaunch = await dependencies.getStatus();
  return {
    reconciliation,
    fullReview,
    launchedGoal: true,
    queueBeforeLaunch,
    queueAfterLaunch,
  };
};
