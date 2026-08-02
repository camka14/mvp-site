import dotenv from 'dotenv';
import { Client } from 'pg';
import {
  affiliateMappingHandoffRetryEligibility,
  hasAffiliateProducerHandoffBlocker,
} from '../src/server/affiliateImports/approvalHandoffRetry';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS } from '../src/server/affiliateImports/mappingPackageRepair';
import {
  inspectAffiliateDisposableReviewScrapes,
  inspectAffiliateProducerPackage,
  resolveAffiliateDisposableDatabaseUrl,
  resolveAffiliateProducerRepositoryRoot,
} from '../src/server/affiliateImports/producerPackageEvidence';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const disposableDatabaseUrl = resolveAffiliateDisposableDatabaseUrl();
const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
if (!useLive) throw new Error('Affiliate approval handoff retry requires --live.');
if (apply && !process.argv.includes('--live')) throw new Error('--apply requires --live.');
configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

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
  const producerRoot = resolveAffiliateProducerRepositoryRoot();
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  const disposable = new Client({ connectionString: disposableDatabaseUrl });
  try {
    const approvals = await db.affiliateApprovalJobs.findMany({
      where: {
        subjectType: 'MAPPING_PACKAGE',
        status: { in: ['REJECTED', 'DEFERRED'] },
      },
      orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
    });
    const mappingJobs = await db.affiliateSourceMappingJobs.findMany({
      where: { id: { in: approvals.map((row: any) => row.subjectKey) } },
    });
    const mappingById = new Map(mappingJobs.map((row: any) => [row.id, row]));
    await disposable.connect();
    const eligible: Array<{ approval: any; mapping: any; result: any }> = [];
    const excluded: Record<string, number> = {};
    const producerRepairCandidates: Array<{ approval: any; mapping: any; error: string }> = [];
    for (const approval of approvals) {
      const mapping = mappingById.get(approval.subjectKey) as any;
      if (!mapping) {
        excluded['mapping-job-missing'] = (excluded['mapping-job-missing'] ?? 0) + 1;
        continue;
      }
      const selection = affiliateMappingHandoffRetryEligibility({
        approvalStatus: approval.status,
        approvalDecision: approval.decision,
        mappingStatus: mapping.status,
        resultSummary: mapping.resultSummary,
      });
      if (
        selection.reason === 'invalid-review-required-result'
        && hasAffiliateProducerHandoffBlocker(approval.decision)
      ) {
        producerRepairCandidates.push({
          approval,
          mapping,
          error: 'Mapping package does not contain a schema-valid REVIEW_REQUIRED ingestion result for evidence verification.',
        });
        continue;
      }
      if (!selection.eligible || !selection.result) {
        excluded[selection.reason] = (excluded[selection.reason] ?? 0) + 1;
        continue;
      }
      try {
        inspectAffiliateProducerPackage({ repositoryRoot: producerRoot, result: selection.result });
        await inspectAffiliateDisposableReviewScrapes({ queryable: disposable, result: selection.result });
        eligible.push({ approval, mapping, result: selection.result });
      } catch (error) {
        producerRepairCandidates.push({
          approval,
          mapping,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const producerRepairs = producerRepairCandidates.filter(({ mapping }) => (
      repairHistory(mapping.resultSummary).length < MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
    ));
    const humanReviewRequired = producerRepairCandidates.filter(({ mapping }) => (
      repairHistory(mapping.resultSummary).length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
    ));
    const evidenceFailures = producerRepairCandidates.map(({ approval, mapping, error }) => ({
      approvalJobId: approval.id,
      mappingJobId: mapping.id,
      error,
      disposition: repairHistory(mapping.resultSummary).length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
        ? 'HUMAN_REVIEW_REQUIRED'
        : 'PRODUCER_REPAIR',
    }));

    const preview = {
      schemaVersion: 1,
      environment: 'live',
      apply,
      terminalMappingApprovals: approvals.length,
      eligible: eligible.length,
      producerRepairs: producerRepairs.length,
      humanReviewRequired: humanReviewRequired.length,
      excluded,
      evidenceFailures,
      jobs: eligible.map(({ approval, mapping, result }) => ({
        approvalJobId: approval.id,
        mappingJobId: mapping.id,
        intakeId: mapping.intakeId,
        sourceKey: result.sourceKey,
        priorApprovalStatus: approval.status,
        logoDisposition: result.logoDisposition,
      })),
    };
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const reset: string[] = [];
    for (const candidate of eligible) {
      await db.$transaction(async (tx: any) => {
        const currentApproval = await tx.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        const currentMapping = await tx.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        if (!currentApproval || !currentMapping) return;
        const currentSelection = affiliateMappingHandoffRetryEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          resultSummary: currentMapping.resultSummary,
        });
        if (!currentSelection.eligible) return;
        const envelope = recordValue(currentMapping.resultSummary);
        const previousHistory = Array.isArray(envelope.approvalReviewHistory)
          ? envelope.approvalReviewHistory
          : [];
        const historyEntry = {
          approvalJobId: currentApproval.id,
          status: currentApproval.status,
          reviewerId: currentApproval.reviewerId,
          attemptCount: currentApproval.attemptCount,
          finishedAt: currentApproval.finishedAt?.toISOString?.() ?? currentApproval.finishedAt ?? null,
          decision: currentApproval.decision,
          retryReason: 'producer-workspace-and-disposable-review-evidence-handoff-repaired',
        };
        const { approvalReview: _approvalReview, ...preservedEnvelope } = envelope;
        await tx.affiliateSourceMappingJobs.update({
          where: { id: currentMapping.id },
          data: {
            status: 'REVIEW_REQUIRED',
            errorMessage: null,
            resultSummary: {
              ...preservedEnvelope,
              approvalReviewHistory: [...previousHistory, historyEntry],
            },
          },
        });
        await tx.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'REVIEW_REQUIRED' },
        });
        await tx.affiliateApprovalJobs.update({
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
        reset.push(currentApproval.id);
      });
    }
    const requeuedProducerRepairs: string[] = [];
    const markedForHumanReview: string[] = [];
    for (const candidate of producerRepairCandidates) {
      await db.$transaction(async (tx: any) => {
        const currentApproval = await tx.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        const currentMapping = await tx.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        if (!currentApproval || !currentMapping) return;
        const currentSelection = affiliateMappingHandoffRetryEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          resultSummary: currentMapping.resultSummary,
        });
        const invalidHandoffPackage = (
          currentSelection.reason === 'invalid-review-required-result'
          && hasAffiliateProducerHandoffBlocker(currentApproval.decision)
        );
        if (!currentSelection.eligible && !invalidHandoffPackage) return;

        const envelope = recordValue(currentMapping.resultSummary);
        const history = repairHistory(currentMapping.resultSummary);
        const reviewedAt = new Date();
        if (history.length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS) {
          await tx.affiliateSourceMappingJobs.update({
            where: { id: currentMapping.id },
            data: {
              status: 'HUMAN_REVIEW_REQUIRED',
              claimedAt: null,
              leaseExpiresAt: null,
              workerId: null,
              finishedAt: reviewedAt,
              errorMessage: `Automatic producer repair limit of ${MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS} was exhausted.`,
              resultSummary: {
                ...envelope,
                mappingRepairHistory: history,
                humanReviewRequired: {
                  markedAt: reviewedAt.toISOString(),
                  source: 'PRODUCER_HANDOFF_EVIDENCE_REPAIR',
                  approvalJobId: currentApproval.id,
                  reviewerId: currentApproval.reviewerId,
                  decision: recordValue(currentApproval.decision).decision,
                  reasonCodes: ['PACKAGE_VALIDATION_FAILED', 'RETRY_LIMIT_EXCEEDED'],
                  rationale: candidate.error,
                  blockingIssues: [candidate.error],
                },
              },
            },
          });
          await tx.affiliateSourceIntakes.update({
            where: { id: currentMapping.intakeId },
            data: { status: 'REVIEW_REQUIRED' },
          });
          markedForHumanReview.push(currentMapping.id);
          return;
        }

        const { approvalReview: _approvalReview, humanReviewRequired: _humanReview, ...preservedEnvelope } = envelope;
        await tx.affiliateSourceMappingJobs.update({
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
                queuedAt: reviewedAt.toISOString(),
                repairReason: 'PACKAGE_VALIDATION_FAILED',
                repairReasons: ['PACKAGE_VALIDATION_FAILED'],
                priorMappingStatus: currentMapping.status,
                priorMappingErrorMessage: currentMapping.errorMessage,
                approvalJobId: currentApproval.id,
                approvalStatus: currentApproval.status,
                reviewerId: currentApproval.reviewerId,
                decision: recordValue(currentApproval.decision).decision,
                rationale: candidate.error,
                blockingIssues: [candidate.error],
              }],
            },
          },
        });
        await tx.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'READY_FOR_MAPPING' },
        });
        requeuedProducerRepairs.push(currentMapping.id);
      });
    }
    console.log(JSON.stringify({
      ...preview,
      resetCount: reset.length,
      reset,
      requeuedProducerRepairCount: requeuedProducerRepairs.length,
      requeuedProducerRepairs,
      markedForHumanReviewCount: markedForHumanReview.length,
      markedForHumanReview,
    }, null, 2));
  } finally {
    await disposable.end().catch(() => undefined);
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:retry-handoff] failed', error);
  process.exitCode = 1;
});
