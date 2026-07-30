import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertAffiliateTrainingAcquisitionPlan,
  resolveApprovedAffiliateTrainingRecoverySelection,
} from '../src/server/affiliateImports/agentTrainingAcquisitionPlan';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const writeImmutableJson = async (
  filePath: string,
  value: unknown,
  label: string,
) => {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== serialized) {
      throw new Error(`${label} already exists with different content: ${filePath}`);
    }
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, serialized, { encoding: 'utf8', flag: 'wx' });
};

const main = async () => {
  const planPath = path.resolve(
    readOption('--plan')
      ?? 'output/affiliate-mapping-agent/training-acquisition-plans/'
        + 'affiliate-mapping-training-acquisition-67e825365e1c2e74/plan.json',
  );
  const approvedByUserId = readOption('--approved-by');
  if (!approvedByUserId) throw new Error('--approved-by is required.');
  if (approvedByUserId.includes('@')) {
    throw new Error('--approved-by must be a stable user id, not a direct email address.');
  }
  const plan = assertAffiliateTrainingAcquisitionPlan(
    JSON.parse(await fs.readFile(planPath, 'utf8')),
  );
  const approval = {
    schemaVersion: 1 as const,
    acquisitionPlanId: plan.acquisitionPlanId,
    planSha256: plan.planSha256,
    repositoryCommit: plan.repositoryCommit,
    approvedByUserId,
    approvedAt: new Date().toISOString(),
  };
  const approvalPath = path.resolve(
    readOption('--output') ?? path.join(path.dirname(planPath), 'approval.json'),
  );
  await writeImmutableJson(approvalPath, approval, 'Training acquisition approval');
  const selection = resolveApprovedAffiliateTrainingRecoverySelection(plan, approval);
  console.log(JSON.stringify({
    acquisitionPlanId: selection.selectionId,
    planSha256: selection.selectionSha256,
    approvedByUserId: selection.approvedByUserId,
    actionableRecoveryCount: selection.recoveryCandidates.length,
    heldRecoveryCount: plan.recoveryCandidates.length - selection.recoveryCandidates.length,
    sourceKeys: selection.recoveryCandidates.map((candidate) => candidate.sourceKey),
    approvalPath,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:training-acquisition-approve] failed', error);
  process.exitCode = 1;
});
