import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertAffiliateEvidenceCapturePlan,
} from '../src/server/affiliateImports/agentEvidenceCapturePlan';
import {
  assertAffiliateMappingGoldReleaseIntegrity,
} from '../src/server/affiliateImports/agentGoldDataset';
import {
  stableAgentArtifactSha256,
} from '../src/server/affiliateImports/agentContracts';
import {
  buildAffiliateTrainingAcquisitionPlan,
} from '../src/server/affiliateImports/agentTrainingAcquisitionPlan';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readJsonLines = async (filePath: string): Promise<unknown[]> => (
  (await fs.readFile(filePath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON in ${filePath} on line ${index + 1}.`);
      }
    })
);

const releaseDirectoryFor = (inputPath: string): string => {
  const resolved = path.resolve(inputPath);
  return path.basename(resolved) === 'manifest.json' ? path.dirname(resolved) : resolved;
};

const main = async () => {
  const capturePlanPath = path.resolve(
    readOption('--capture-plan')
      ?? 'output/affiliate-mapping-agent/evidence-capture-plans/'
        + 'affiliate-mapping-training-capture-bf60727f200d956a/plan.json',
  );
  const captureAuditPath = path.resolve(
    readOption('--capture-audit')
      ?? path.join(path.dirname(capturePlanPath), 'capture-audit-live.json'),
  );
  const goldDirectory = releaseDirectoryFor(
    readOption('--gold-release')
      ?? 'output/affiliate-mapping-agent/gold-releases/'
        + 'affiliate-mapping-gold-train-validation-bf60727f200d956a-v1',
  );
  const capturePlanValue = JSON.parse(await fs.readFile(capturePlanPath, 'utf8'));
  assertAffiliateEvidenceCapturePlan(capturePlanValue);
  const examples = (
    await Promise.all((['train', 'validation', 'test'] as const).map(
      (split) => readJsonLines(path.join(goldDirectory, `${split}.jsonl`)),
    ))
  ).flat().sort((left, right) => (
    String((left as { exampleId?: unknown }).exampleId)
      .localeCompare(String((right as { exampleId?: unknown }).exampleId))
  ));
  const goldRelease = assertAffiliateMappingGoldReleaseIntegrity({
    manifest: JSON.parse(await fs.readFile(path.join(goldDirectory, 'manifest.json'), 'utf8')),
    examples,
  });
  const sourceGoldReleaseSha256 = stableAgentArtifactSha256(goldRelease);
  const recordedGoldReleaseSha256 = (
    await fs.readFile(path.join(goldDirectory, 'release.sha256'), 'utf8')
  ).trim();
  if (sourceGoldReleaseSha256 !== recordedGoldReleaseSha256) {
    throw new Error('Training acquisition source gold release hash does not match release.sha256.');
  }
  const repositoryCommit = (
    readOption('--repository-commit')
    ?? execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim()
  );
  const plan = buildAffiliateTrainingAcquisitionPlan({
    capturePlan: capturePlanValue,
    captureAudit: JSON.parse(await fs.readFile(captureAuditPath, 'utf8')),
    goldRelease,
    sourceGoldReleaseSha256,
    repositoryCommit,
  });
  const outputRoot = path.resolve(
    readOption('--output-dir')
      ?? path.join('output', 'affiliate-mapping-agent', 'training-acquisition-plans'),
  );
  const outputDirectory = path.join(outputRoot, plan.acquisitionPlanId);
  const shouldWrite = process.argv.includes('--write');
  let planPath: string | null = null;
  if (shouldWrite) {
    await fs.mkdir(outputRoot, { recursive: true });
    try {
      await fs.access(outputDirectory);
      throw new Error(`Training acquisition plan already exists: ${outputDirectory}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.mkdir(outputDirectory, { recursive: false });
    planPath = path.join(outputDirectory, 'plan.json');
    await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }

  console.log(JSON.stringify({
    acquisitionPlanId: plan.acquisitionPlanId,
    planSha256: plan.planSha256,
    repositoryCommit: plan.repositoryCommit,
    currentCoverage: plan.currentCoverage,
    requiredFinishedAdditions: plan.requiredFinishedAdditions,
    recoverySummary: plan.recoverySummary,
    newSourceRequirements: plan.newSourceRequirements,
    priorityRecoverySources: plan.recoveryCandidates
      .filter((candidate) => candidate.priority === 'P0')
      .map((candidate) => ({
        sourceKey: candidate.sourceKey,
        targetKind: candidate.targetKind,
        mappingMode: candidate.mappingMode,
        action: candidate.action,
        assignedSplit: candidate.assignedSplit,
        coverageGoals: candidate.coverageGoals,
      })),
    heldRecoverySources: plan.recoveryCandidates
      .filter((candidate) => candidate.action === 'REPLACE_OR_WAIT_FOR_POLICY_EVIDENCE')
      .map((candidate) => candidate.sourceKey),
    dryRun: !shouldWrite,
    planPath,
    databaseWrites: 0,
    publicRequests: 0,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:training-acquisition-plan] failed', error);
  process.exitCode = 1;
});
