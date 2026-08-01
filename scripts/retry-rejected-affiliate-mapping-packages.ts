import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { affiliateMappingProducerRepairEligibility } from '../src/server/affiliateImports/mappingPackageRepair';

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

const main = async () => {
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  try {
    const approvals = await db.affiliateApprovalJobs.findMany({
      where: {
        subjectType: 'MAPPING_PACKAGE',
        status: 'REJECTED',
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
    const eligible: Array<{ approval: any; mapping: any; repairReason: string }> = [];
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
      if (!selection.eligible || !selection.repairReason) {
        excluded[selection.reason] = (excluded[selection.reason] ?? 0) + 1;
        continue;
      }
      eligible.push({ approval, mapping, repairReason: selection.repairReason });
    }

    const preview = {
      schemaVersion: 1,
      environment: useLive ? 'live' : 'configured-database',
      apply,
      selectedJobId,
      rejectedApprovals: approvals.length,
      eligible: eligible.length,
      excluded,
      jobs: eligible.map(({ approval, mapping, repairReason }) => ({
        approvalJobId: approval.id,
        mappingJobId: mapping.id,
        intakeId: mapping.intakeId,
        repairReason,
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
        const selection = affiliateMappingProducerRepairEligibility({
          approvalStatus: currentApproval.status,
          approvalDecision: currentApproval.decision,
          mappingStatus: currentMapping.status,
          mappingErrorMessage: currentMapping.errorMessage,
          resultSummary: currentMapping.resultSummary,
        });
        if (!selection.eligible || !selection.repairReason) return;

        const envelope = recordValue(currentMapping.resultSummary);
        const history = Array.isArray(envelope.mappingRepairHistory)
          ? envelope.mappingRepairHistory
          : [];
        const { approvalReview: _approvalReview, ...preservedEnvelope } = envelope;
        const queuedAt = new Date();
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
                queuedAt: queuedAt.toISOString(),
                repairReason: selection.repairReason,
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
        await tx.affiliateSourceIntakes.update({
          where: { id: currentMapping.intakeId },
          data: { status: 'READY_FOR_MAPPING' },
        });
        reset.push(currentMapping.id);
      });
    }

    console.log(JSON.stringify({ ...preview, resetCount: reset.length, reset }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:retry-rejected] failed', error);
  process.exitCode = 1;
});
