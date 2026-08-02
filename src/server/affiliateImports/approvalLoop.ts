import type { AffiliateApprovalQueueStatus } from './approvalQueue';
import { runAffiliateAgentPool } from './agentPool';

type AffiliateApprovalLoopDependencies = {
  reconcile: () => Promise<unknown>;
  getStatus: () => Promise<AffiliateApprovalQueueStatus>;
  advanceFullReview?: (queue: AffiliateApprovalQueueStatus) => Promise<unknown>;
  reviewerIds?: string[];
  launchGoal: (reviewerId?: string) => Promise<void>;
};

export type AffiliateApprovalLoopCycle = {
  reconciliation: unknown;
  fullReview: unknown;
  launchedGoal: boolean;
  launchedGoalCount: number;
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
      launchedGoalCount: 0,
      queueBeforeLaunch,
      queueAfterLaunch: queueBeforeLaunch,
    };
  }

  // Wait for the complete active pool before querying or launching again. The
  // outer process also holds its PostgreSQL advisory lock for this whole wait.
  const reviewerIds = dependencies.reviewerIds?.length
    ? dependencies.reviewerIds
    : [''];
  await runAffiliateAgentPool({
    agentIds: reviewerIds,
    runAgent: (reviewerId) => dependencies.launchGoal(reviewerId || undefined),
  });
  await dependencies.reconcile();
  const queueAfterLaunch = await dependencies.getStatus();
  return {
    reconciliation,
    fullReview,
    launchedGoal: true,
    launchedGoalCount: reviewerIds.length,
    queueBeforeLaunch,
    queueAfterLaunch,
  };
};
