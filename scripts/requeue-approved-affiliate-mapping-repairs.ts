/**
 * Requeues explicitly selected approved mapping packages for producer repair.
 *
 * This command is dry-run by default. Apply mode requires --live,
 * --expected-count, at least one --job, one --reason-code, and one --issue.
 * It defers the prior approval with an operator repair record until the
 * repaired producer package is complete. The mapping completion path then
 * reopens that approval for an independent review.
 */

import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS } from '../src/server/affiliateImports/mappingPackageRepair';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const values = (name: string): string[] => {
  const prefix = `--${name}=`;
  return process.argv
    .filter((argument) => argument.startsWith(prefix))
    .map((argument) => argument.slice(prefix.length).trim())
    .filter(Boolean);
};
const jobIds = Array.from(new Set(values('job')));
const reasonCodes = Array.from(new Set(values('reason-code')));
const blockingIssues = Array.from(new Set(values('issue')));
const requestedBy = values('requested-by')[0] ?? 'operator';
const rationale = values('rationale')[0]
  ?? 'A live publication-readiness audit found a producer-owned mapping defect.';
const expectedText = values('expected-count')[0] ?? null;
const expectedCount = expectedText === null ? null : Number.parseInt(expectedText, 10);

if (!useLive) throw new Error('Approved mapping repair requeue requires --live.');
if (!jobIds.length) throw new Error('At least one --job is required.');
if (!reasonCodes.length) throw new Error('At least one --reason-code is required.');
if (!blockingIssues.length) throw new Error('At least one --issue is required.');
if (expectedCount !== null && (!Number.isInteger(expectedCount) || expectedCount < 0)) {
  throw new Error('--expected-count must be a non-negative integer.');
}
if (apply && expectedCount === null) {
  throw new Error('--apply requires --expected-count.');
}

configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const recordArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value) ? value.map(recordValue) : []
);

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const mappings = await db.affiliateSourceMappingJobs.findMany({
      where: { id: { in: jobIds } },
      orderBy: { id: 'asc' },
    });
    const approvals = await db.affiliateApprovalJobs.findMany({
      where: {
        subjectType: 'MAPPING_PACKAGE',
        subjectKey: { in: jobIds },
      },
      orderBy: { id: 'asc' },
    });
    const approvalByJobId = new Map(approvals.map((row: any) => [row.subjectKey, row]));
    const mappingById = new Map(mappings.map((row: any) => [row.id, row]));
    const excluded: Array<{ mappingJobId: string; reason: string }> = [];
    const eligible: Array<{ mapping: any; approval: any }> = [];

    for (const jobId of jobIds) {
      const mapping = mappingById.get(jobId) as any;
      const approval = approvalByJobId.get(jobId) as any;
      if (!mapping) {
        excluded.push({ mappingJobId: jobId, reason: 'mapping-not-found' });
      } else if (!approval) {
        excluded.push({ mappingJobId: jobId, reason: 'approval-not-found' });
      } else if (mapping.status !== 'APPROVED') {
        excluded.push({ mappingJobId: jobId, reason: `mapping-status-${mapping.status}` });
      } else if (approval.status !== 'APPROVED') {
        excluded.push({ mappingJobId: jobId, reason: `approval-status-${approval.status}` });
      } else if (mapping.leaseExpiresAt) {
        excluded.push({ mappingJobId: jobId, reason: 'mapping-has-lease' });
      } else if (
        recordArray(recordValue(mapping.resultSummary).mappingRepairHistory).length
          >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS
      ) {
        excluded.push({ mappingJobId: jobId, reason: 'automatic-repair-limit-exhausted' });
      } else {
        eligible.push({ mapping, approval });
      }
    }

    const preview = {
      schemaVersion: 1,
      environment: 'live',
      apply,
      requested: jobIds.length,
      eligible: eligible.length,
      expectedCount,
      requestedBy,
      reasonCodes,
      blockingIssues,
      excluded,
      jobs: eligible.map(({ mapping, approval }) => ({
        mappingJobId: mapping.id,
        intakeId: mapping.intakeId,
        priorMappingStatus: mapping.status,
        approvalJobId: approval.id,
        approvalStatus: approval.status,
        priorRepairCount: recordArray(
          recordValue(mapping.resultSummary).mappingRepairHistory,
        ).length,
      })),
    };
    if (expectedCount !== null && eligible.length !== expectedCount) {
      throw new Error(
        `Eligible mapping repair count ${eligible.length} did not match expected ${expectedCount}.`,
      );
    }
    if (!apply) {
      console.log(JSON.stringify(preview, null, 2));
      return;
    }

    const requeued: string[] = [];
    for (const candidate of eligible) {
      await db.$transaction(async (transaction: any) => {
        const currentMapping = await transaction.affiliateSourceMappingJobs.findUnique({
          where: { id: candidate.mapping.id },
        });
        const currentApproval = await transaction.affiliateApprovalJobs.findUnique({
          where: { id: candidate.approval.id },
        });
        if (currentMapping?.status !== 'APPROVED' || currentApproval?.status !== 'APPROVED') {
          throw new Error(`Mapping ${candidate.mapping.id} changed before repair requeue.`);
        }
        if (currentMapping.leaseExpiresAt) {
          throw new Error(`Mapping ${candidate.mapping.id} gained a lease before repair requeue.`);
        }
        const envelope = recordValue(currentMapping.resultSummary);
        const history = recordArray(envelope.mappingRepairHistory);
        if (history.length >= MAX_AUTOMATIC_AFFILIATE_MAPPING_REPAIRS) {
          throw new Error(`Mapping ${candidate.mapping.id} exhausted its automatic repair limit.`);
        }
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
              ...envelope,
              mappingRepairHistory: [...history, {
                queuedAt: queuedAt.toISOString(),
                repairReason: reasonCodes[0],
                repairReasons: reasonCodes,
                priorMappingStatus: currentMapping.status,
                priorMappingErrorMessage: currentMapping.errorMessage,
                approvalJobId: currentApproval.id,
                approvalStatus: currentApproval.status,
                reviewerId: requestedBy,
                decision: 'OPERATOR_REPAIR_REQUEST',
                rationale,
                blockingIssues,
              }],
            },
          },
        });
        await transaction.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'READY_FOR_MAPPING' },
        });
        await transaction.affiliateApprovalJobs.update({
          where: { id: currentApproval.id },
          data: {
            status: 'DEFERRED',
            claimedAt: null,
            leaseExpiresAt: null,
            reviewerId: requestedBy,
            decision: {
              schemaVersion: 1,
              decision: 'OPERATOR_REPAIR_REQUEST',
              requestedAt: queuedAt.toISOString(),
              requestedBy,
              reasonCodes,
              rationale,
              blockingIssues,
            },
            errorMessage: null,
            finishedAt: queuedAt,
          },
        });
        requeued.push(currentMapping.id);
      });
    }

    console.log(JSON.stringify({ ...preview, requeued }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
