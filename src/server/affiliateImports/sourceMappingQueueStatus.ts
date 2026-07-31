export type AffiliateMappingQueueIntakeRow = {
  id: string;
  status: string;
};

export type AffiliateMappingQueueJobRow = {
  id: string;
  intakeId: string;
  status: string;
  leaseExpiresAt: Date | null;
};

export type AffiliateMappingQueueStatusRows = {
  intakes: AffiliateMappingQueueIntakeRow[];
  jobs: AffiliateMappingQueueJobRow[];
};

export type AffiliateMappingQueueStatus = {
  schemaVersion: 1;
  evaluatedAt: string;
  complete: boolean;
  claimableJobs: number;
  queuedJobs: number;
  expiredLeases: number;
  activeLeases: number;
  claimedWithoutLease: number;
  eligibleReadyIntakesWithoutJob: number;
  readyIntakeIdsWithoutJob: string[];
  reviewRequiredJobs: number;
  failedJobs: number;
  intakeStatusCounts: Record<string, number>;
  jobStatusCounts: Record<string, number>;
};

const countStatuses = (statuses: string[]): Record<string, number> => Object.fromEntries(
  Array.from(new Set(statuses))
    .sort()
    .map((status) => [status, statuses.filter((candidate) => candidate === status).length]),
);

export const summarizeAffiliateMappingQueue = (
  input: AffiliateMappingQueueStatusRows,
  now = new Date(),
): AffiliateMappingQueueStatus => {
  const queuedJobs = input.jobs.filter((job) => job.status === 'QUEUED').length;
  const expiredLeases = input.jobs.filter((job) => (
    job.status === 'CLAIMED'
    && job.leaseExpiresAt !== null
    && job.leaseExpiresAt.getTime() < now.getTime()
  )).length;
  const activeLeases = input.jobs.filter((job) => (
    job.status === 'CLAIMED'
    && job.leaseExpiresAt !== null
    && job.leaseExpiresAt.getTime() >= now.getTime()
  )).length;
  const claimedWithoutLease = input.jobs.filter((job) => (
    job.status === 'CLAIMED' && job.leaseExpiresAt === null
  )).length;
  const intakeIdsWithJobs = new Set(input.jobs.map((job) => job.intakeId));
  const readyIntakeIdsWithoutJob = input.intakes
    .filter((intake) => (
      intake.status === 'READY_FOR_MAPPING' && !intakeIdsWithJobs.has(intake.id)
    ))
    .map((intake) => intake.id)
    .sort();
  const claimableJobs = queuedJobs + expiredLeases;

  return {
    schemaVersion: 1,
    evaluatedAt: now.toISOString(),
    complete: (
      claimableJobs === 0
      && readyIntakeIdsWithoutJob.length === 0
      && claimedWithoutLease === 0
    ),
    claimableJobs,
    queuedJobs,
    expiredLeases,
    activeLeases,
    claimedWithoutLease,
    eligibleReadyIntakesWithoutJob: readyIntakeIdsWithoutJob.length,
    readyIntakeIdsWithoutJob,
    reviewRequiredJobs: input.jobs.filter((job) => job.status === 'REVIEW_REQUIRED').length,
    failedJobs: input.jobs.filter((job) => job.status === 'FAILED').length,
    intakeStatusCounts: countStatuses(input.intakes.map((intake) => intake.status)),
    jobStatusCounts: countStatuses(input.jobs.map((job) => job.status)),
  };
};
