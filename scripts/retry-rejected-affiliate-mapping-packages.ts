import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import {
  affiliateMappingProducerRepairEligibility,
  MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS,
} from '../src/server/affiliateImports/mappingPackageRepair';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const jobArgument = process.argv.find((argument) => argument.startsWith('--job='));
const selectedJobId = jobArgument?.slice('--job='.length).trim() || null;
if (apply && !useLive) throw new Error('--apply requires --live.');
if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const repairHistory = (resultSummary: unknown): Record<string, unknown>[] => {
  const history = recordValue(resultSummary).mappingRepairHistory;
  return Array.isArray(history) ? history.map(recordValue) : [];
};

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const approvals = await db.affiliateApprovalJobs.findMany({
      where: {
        subjectType: 'MAPPING_PACKAGE',
        status: { in: ['REJECTED', 'DEFERRED'] },
        ...(selectedJobId ? { subjectKey: selectedJobId } : {}),
      },
      orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
    });
    const mappingJobs = approvals.length
      ? await db.affiliateSourceMappingJobs.findMany({
          where: { id: { in: approvals.map((approval: any) => approval.subjectKey) } },
        })
      : [];
    const mappingById = new Map(mappingJobs.map((job: any) => [job.id, job]));
    const producerRepairs: Array<{
      approval: any;
      mapping: any;
      repairReason: string;
      reasonCodes: string[];
    }> = [];
    const humanReviews: Array<{
      approval: any;
      mapping: any;
      reason: string;
      reasonCodes: string[];
    }> = [];
    const reviewerRetries: Array<{
      approval: any;
      mapping: any;
      reason: string;
      reasonCodes: string[];
    }> = [];
    const excluded: Record<string, number> = {};

    for (const approval of approvals) {
      const mapping = mappingById.get(approval.subjectKey) as any;
      if (!mapping) {
        excluded['mapping-job-missing'] = (excluded['mapping-job-missing'] ?? 0) + 1;
        continue;
      }
      const selection = affiliateMappingProducerRepairEligibility({
        approvalStatus: approval.status,
        approvalDecision: approval.decision,
        mappingStatus: mapping.status,
        mappingErrorMessage: mapping.errorMessage,
        resultSummary: mapping.resultSummary,
      });
      if (selection.disposition === 'PRODUCER_REPAIR' && selection.repairReason) {
        if (repairHistory(mapping.resultSummary).length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS) {
          humanReviews.push({
            approval,
            mapping,
            reason: 'automatic-repair-limit-exhausted',
            reasonCodes: Array.from(new Set([...selection.reasonCodes, 'RETRY_LIMIT_EXCEEDED'])),
          });
        } else {
          producerRepairs.push({
            approval,
            mapping,
            repairReason: selection.repairReason,
            reasonCodes: selection.reasonCodes,
          });
        }
        continue;
      }
      if (selection.disposition === 'HUMAN_REVIEW_REQUIRED') {
        humanReviews.push({
          approval,
          mapping,
          reason: selection.reason,
          reasonCodes: selection.reasonCodes,
        });
        continue;
      }
      if (selection.disposition === 'REVIEWER_RETRY') {
        reviewerRetries.push({
          approval,
          mapping,
          reason: selection.reason,
          reasonCodes: selection.reasonCodes,
        });
        continue;
      }
      excluded[selection.reason] = (excluded[selection.reason] ?? 0) + 1;
    }

    const preview = {
      schemaVersion: 2,
      environment: useLive ? 'live' : 'configured-database',
      apply,
      selectedJobId,
      terminalApprovals: approvals.length,
      producerRepairs: producerRepairs.length,
      reviewerRetries: reviewerRetries.length,
      humanReviews: humanReviews.length,
      excluded,
      jobs: [
        ...producerRepairs.map(({ approval, mapping, repairReason, reasonCodes }) => ({
          approvalJobId: approval.id,
          approvalStatus: approval.status,
          mappingJobId: mapping.id,
          intakeId: mapping.intakeId,
          disposition: 'PRODUCER_REPAIR',
          repairReason,
          reasonCodes,
        })),
        ...humanReviews.map(({ approval, mapping, reason, reasonCodes }) => ({
          approvalJobId: approval.id,
          approvalStatus: approval.status,
          mappingJobId: mapping.id,
          intakeId: mapping.intakeId,
          disposition: 'HUMAN_REVIEW_REQUIRED',
          reason,
          reasonCodes,
          alreadyMarked: mapping.status === 'HUMAN_REVIEW_REQUIRED',
        })),
        ...reviewerRetries.map(({ approval, mapping, reason, reasonCodes }) => ({
          approvalJobId: approval.id,
          approvalStatus: approval.status,
          mappingJobId: mapping.id,
          intakeId: mapping.intakeId,
          disposition: 'REVIEWER_RETRY',
          reason,
          reasonCodes,
        })),
      ],
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const reset: string[] = [];
    const requeuedForReviewer: string[] = [];
    const markedForHumanReview: string[] = [];
    for (const candidate of producerRepairs) {
      await db.$transaction(async (transaction: any) => {
        const currentApproval = await transaction.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        const currentMapping = await transaction.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        if (!currentApproval || !currentMapping) return;
        const selection = affiliateMappingProducerRepairEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          mappingErrorMessage: currentMapping.errorMessage,
          resultSummary: currentMapping.resultSummary,
        });
        const history = repairHistory(currentMapping.resultSummary);
        if (
          selection.disposition !== 'PRODUCER_REPAIR'
          || !selection.repairReason
          || history.length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
        ) return;

        const envelope = recordValue(currentMapping.resultSummary);
        const { approvalReview: _approvalReview, humanReviewRequired: _humanReview, ...preservedEnvelope } = envelope;
        const queuedAt = new Date();
        await transaction.affiliateSourceMappingJobs.update({
          where: { id: currentMapping.id },
          data: {
            status: 'QUEUED',
            claimedAt: null,
            leaseExpiresAt: null,
            workerId: null,
            branch: null,
            commit: null,
            errorMessage: null,
            finishedAt: null,
            resultSummary: {
              ...preservedEnvelope,
              mappingRepairHistory: [...history, {
                queuedAt: queuedAt.toISOString(),
                repairReason: selection.repairReason,
                repairReasons: selection.reasonCodes,
                priorMappingStatus: currentMapping.status,
                priorMappingErrorMessage: currentMapping.errorMessage,
                approvalJobId: currentApproval.id,
                approvalStatus: currentApproval.status,
                reviewerId: currentApproval.reviewerId,
                decision: recordValue(currentApproval.decision).decision,
                rationale: recordValue(currentApproval.decision).rationale,
                blockingIssues: recordValue(currentApproval.decision).blockingIssues,
              }],
            },
          },
        });
        await transaction.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'READY_FOR_MAPPING' },
        });
        reset.push(currentMapping.id);
      });
    }

    for (const candidate of reviewerRetries) {
      await db.$transaction(async (transaction: any) => {
        const currentApproval = await transaction.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        const currentMapping = await transaction.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        if (!currentApproval || !currentMapping) return;
        const selection = affiliateMappingProducerRepairEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          mappingErrorMessage: currentMapping.errorMessage,
          resultSummary: currentMapping.resultSummary,
        });
        if (selection.disposition !== 'REVIEWER_RETRY') return;

        const retriedAt = new Date();
        const envelope = recordValue(currentMapping.resultSummary);
        const { humanReviewRequired: _humanReview, ...preservedEnvelope } = envelope;
        const retryHistory = Array.isArray(envelope.approvalRetryHistory)
          ? envelope.approvalRetryHistory.map(recordValue)
          : [];
        await transaction.affiliateSourceMappingJobs.update({
          where: { id: currentMapping.id },
          data: {
            status: 'REVIEW_REQUIRED',
            claimedAt: null,
            leaseExpiresAt: null,
            workerId: null,
            errorMessage: null,
            resultSummary: {
              ...preservedEnvelope,
              approvalRetryHistory: [...retryHistory, {
                retriedAt: retriedAt.toISOString(),
                reason: selection.reason,
                reasonCodes: selection.reasonCodes,
                priorMappingStatus: currentMapping.status,
                priorMappingErrorMessage: currentMapping.errorMessage,
                approvalJobId: currentApproval.id,
                approvalStatus: currentApproval.status,
                reviewerId: currentApproval.reviewerId,
                decision: currentApproval.decision,
              }],
            },
          },
        });
        await transaction.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'REVIEW_REQUIRED' },
        });
        await transaction.affiliateApprovalJobs.update({
          where: { id: currentApproval.id },
          data: {
            status: 'QUEUED',
            claimedAt: null,
            leaseExpiresAt: null,
            reviewerId: null,
            decision: null,
            errorMessage: null,
            finishedAt: null,
          },
        });
        requeuedForReviewer.push(currentMapping.id);
      });
    }

    for (const candidate of humanReviews) {
      await db.$transaction(async (transaction: any) => {
        const currentApproval = await transaction.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        const currentMapping = await transaction.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        if (!currentApproval || !currentMapping || currentMapping.status === 'HUMAN_REVIEW_REQUIRED') return;
        const selection = affiliateMappingProducerRepairEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          mappingErrorMessage: currentMapping.errorMessage,
          resultSummary: currentMapping.resultSummary,
        });
        const history = repairHistory(currentMapping.resultSummary);
        const exhausted = (
          selection.disposition === 'PRODUCER_REPAIR'
          && history.length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
        );
        if (selection.disposition !== 'HUMAN_REVIEW_REQUIRED' && !exhausted) return;
        const reasonCodes = exhausted
          ? Array.from(new Set([...selection.reasonCodes, 'RETRY_LIMIT_EXCEEDED']))
          : selection.reasonCodes;
        const markedAt = new Date();
        const envelope = recordValue(currentMapping.resultSummary);
        await transaction.affiliateSourceMappingJobs.update({
          where: { id: currentMapping.id },
          data: {
            status: 'HUMAN_REVIEW_REQUIRED',
            claimedAt: null,
            leaseExpiresAt: null,
            workerId: null,
            finishedAt: markedAt,
            errorMessage: exhausted
              ? `Automatic producer repair limit of ${MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS} was exhausted.`
              : currentMapping.errorMessage || 'Historical terminal package requires human review.',
            resultSummary: {
              ...envelope,
              mappingRepairHistory: history,
              humanReviewRequired: {
                markedAt: markedAt.toISOString(),
                source: 'HISTORICAL_TERMINAL_CLASSIFICATION',
                approvalJobId: currentApproval.id,
                approvalStatus: currentApproval.status,
                reviewerId: currentApproval.reviewerId,
                decision: recordValue(currentApproval.decision).decision,
                reasonCodes,
                rationale: recordValue(currentApproval.decision).rationale,
                blockingIssues: recordValue(currentApproval.decision).blockingIssues,
              },
            },
          },
        });
        await transaction.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'REVIEW_REQUIRED' },
        });
        markedForHumanReview.push(currentMapping.id);
      });
    }

    console.log(JSON.stringify({
      ...preview,
      resetCount: reset.length,
      reset,
      reviewerRetryCount: requeuedForReviewer.length,
      reviewerRetry: requeuedForReviewer,
      markedForHumanReviewCount: markedForHumanReview.length,
      markedForHumanReview,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:retry-rejected] failed', error);
  process.exitCode = 1;
});
