BEGIN;

-- Audit active duplicate jobs before creating the invariant. Keep a valid
-- in-progress claim first, then a completed review package, then queued work.
-- Older duplicate rows are retained as FAILED history instead of being
-- deleted.
CREATE TEMP TABLE "_AffiliateMappingJobActiveAudit" ON COMMIT DROP AS
SELECT
  ranked.id,
  ranked."intakeId",
  ranked.job_rank
FROM (
  SELECT
    job.id,
    job."intakeId",
    ROW_NUMBER() OVER (
      PARTITION BY job."intakeId"
      ORDER BY
        CASE
          WHEN job.status = 'CLAIMED'
            AND job."leaseExpiresAt" IS NOT NULL
            AND job."leaseExpiresAt" >= CURRENT_TIMESTAMP THEN 0
          WHEN job.status = 'REVIEW_REQUIRED' THEN 1
          WHEN job.status = 'QUEUED' THEN 2
          ELSE 3
        END,
        CASE WHEN job.status = 'CLAIMED' THEN job."claimedAt" ELSE job."createdAt" END NULLS LAST,
        job."createdAt",
        job.id
    ) AS job_rank
  FROM "AffiliateSourceMappingJobs" AS job
  WHERE job.status IN ('QUEUED', 'CLAIMED', 'REVIEW_REQUIRED')
) AS ranked;

DO $$
DECLARE
  duplicate_job_count INTEGER;
  duplicate_intake_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_job_count
  FROM "_AffiliateMappingJobActiveAudit"
  WHERE job_rank > 1;

  SELECT COUNT(DISTINCT "intakeId") INTO duplicate_intake_count
  FROM "_AffiliateMappingJobActiveAudit"
  WHERE job_rank > 1;

  RAISE NOTICE 'Affiliate mapping active-job audit found % duplicate job(s) across % intake(s).',
    duplicate_job_count,
    duplicate_intake_count;
END $$;

UPDATE "AffiliateSourceMappingJobs" AS job
SET
  status = 'FAILED',
  "errorMessage" = concat_ws(
    ' ',
    NULLIF(job."errorMessage", ''),
    'Duplicate active mapping job retired before enforcing one active job per intake.'
  ),
  "finishedAt" = COALESCE(job."finishedAt", CURRENT_TIMESTAMP),
  "claimedAt" = NULL,
  "leaseExpiresAt" = NULL,
  "workerId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_AffiliateMappingJobActiveAudit" AS audit
WHERE audit.id = job.id
  AND audit.job_rank > 1;

DO $$
DECLARE
  retired_approval_count INTEGER;
BEGIN
  UPDATE "AffiliateApprovalJobs" AS approval
  SET
    status = 'FAILED',
    "errorMessage" = concat_ws(
      ' ',
      NULLIF(approval."errorMessage", ''),
      'Approval retired because its duplicate mapping job was retired before enforcing one active job per intake.'
    ),
    "finishedAt" = COALESCE(approval."finishedAt", CURRENT_TIMESTAMP),
    "claimedAt" = NULL,
    "leaseExpiresAt" = NULL,
    "reviewerId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "_AffiliateMappingJobActiveAudit" AS audit
  WHERE audit.id = approval."subjectKey"
    AND audit.job_rank > 1
    AND approval."subjectType" = 'MAPPING_PACKAGE'
    AND approval.status IN ('QUEUED', 'CLAIMED');

  GET DIAGNOSTICS retired_approval_count = ROW_COUNT;
  RAISE NOTICE 'Retired % active approval(s) attached to discarded affiliate mapping job(s).',
    retired_approval_count;
END $$;

CREATE UNIQUE INDEX "AffiliateSourceMappingJobs_one_active_per_intake"
ON "AffiliateSourceMappingJobs" ("intakeId")
WHERE status IN ('QUEUED', 'CLAIMED', 'REVIEW_REQUIRED');

COMMIT;
