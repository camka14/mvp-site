import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  planGoldCaptureBatches,
} from '../src/server/affiliateImports/agentGoldCaptureCohort';
import {
  resolveAffiliateEvidenceCaptureSelection,
} from '../src/server/affiliateImports/agentEvidenceCapturePlan';

const execFileAsync = promisify(execFile);
const tsxPath = path.resolve('node_modules', '.bin', 'tsx');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readLimit = (): number | undefined => {
  const raw = readOption('--limit');
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) throw new Error('--limit must be a positive integer.');
  return value;
};

const runJsonCommand = async (
  script: string,
  args: string[],
): Promise<Record<string, any>> => {
  const result = await execFileAsync(tsxPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 12 * 60 * 1000,
  });
  return JSON.parse(result.stdout.trim()) as Record<string, any>;
};

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const main = async () => {
  const shouldApply = process.argv.includes('--apply');
  const approveExisting = process.argv.includes('--approve-existing');
  const exportCurrentDatabase = process.argv.includes('--export-current-database');
  const evidenceEnvironment = readOption('--evidence-environment');
  if (
    evidenceEnvironment
    && evidenceEnvironment !== 'local'
    && evidenceEnvironment !== 'live'
  ) {
    throw new Error('--evidence-environment must be local or live.');
  }
  const storageProvider = readOption('--storage-provider');
  if (storageProvider && storageProvider !== 'local' && storageProvider !== 'spaces') {
    throw new Error('--storage-provider must be local or spaces.');
  }
  if (storageProvider) process.env.STORAGE_PROVIDER = storageProvider;
  if (approveExisting && !shouldApply) throw new Error('--approve-existing requires --apply.');
  const capturePlanOption = readOption('--capture-plan');
  const selectionPath = path.resolve(
    capturePlanOption
      ?? readOption('--proposal')
      ?? 'output/affiliate-mapping-agent/gold-cohorts/affiliate-mapping-test-d9de7ef53d2c82d1/proposal.json',
  );
  const approvalPath = path.resolve(
    capturePlanOption
      ? readOption('--capture-approval') ?? path.join(path.dirname(selectionPath), 'approval.json')
      : readOption('--lock') ?? path.join(path.dirname(selectionPath), 'lock.json'),
  );
  const selection = resolveAffiliateEvidenceCaptureSelection(
    JSON.parse(await fs.readFile(selectionPath, 'utf8')),
    JSON.parse(await fs.readFile(approvalPath, 'utf8')),
  );
  const proposal = {
    cohortId: selection.selectionId,
    proposalSha256: selection.selectionSha256,
    examples: selection.examples,
  };
  const onlySourceKey = readOption('--source-key');
  const sourceLimit = readLimit();
  const examples = proposal.examples
    .filter((example) => !onlySourceKey || example.sourceKey === onlySourceKey)
    .slice(0, sourceLimit);
  if (!examples.length) throw new Error('No locked cohort source matched the requested selection.');

  const reportPath = path.resolve(
    readOption('--report')
      ?? path.join(path.dirname(selectionPath), 'capture-progress.json'),
  );
  const report = {
    schemaVersion: 1,
    cohortId: proposal.cohortId,
    proposalSha256: proposal.proposalSha256,
    startedAt: new Date().toISOString(),
    completedAt: null as string | null,
    mode: shouldApply ? 'apply' : 'dry-run',
    sourceCount: examples.length,
    sources: [] as Array<Record<string, any>>,
  };

  for (const example of examples) {
    const sourceResult = {
      sourceKey: example.sourceKey,
      scenarioIntent: example.scenarioIntent,
      requiredPageCount: example.requiredCapturePages.length,
      status: 'IN_PROGRESS',
      batches: [] as Array<Record<string, any>>,
      errors: [] as string[],
    };
    report.sources.push(sourceResult);
    const batches = planGoldCaptureBatches(example.requiredCapturePages);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batchResult = {
        batch: batchIndex + 1,
        requiredPageCount: batches[batchIndex].length,
        prepareAttempts: [] as Array<Record<string, any>>,
        processResults: [] as Array<Record<string, any>>,
        exports: [] as Array<Record<string, any>>,
        status: 'IN_PROGRESS',
      };
      sourceResult.batches.push(batchResult);
      try {
        for (let attempt = 0; attempt < Math.max(5, batches[batchIndex].length + 1); attempt += 1) {
          const prepare = await runJsonCommand(
            'scripts/prepare-affiliate-mapping-gold-capture.ts',
            [
              ...(capturePlanOption
                ? [
                    `--capture-plan=${selectionPath}`,
                    `--capture-approval=${approvalPath}`,
                  ]
                : [
                    `--proposal=${selectionPath}`,
                    `--lock=${approvalPath}`,
                  ]),
              `--source-key=${example.sourceKey}`,
              `--batch=${batchIndex + 1}`,
              ...(shouldApply ? ['--apply', '--queue'] : []),
              ...(approveExisting ? ['--approve-existing'] : []),
            ],
          );
          batchResult.prepareAttempts.push(prepare);
          const queueStatus = String(prepare.queueStatus ?? '');
          if (!shouldApply) {
            batchResult.status = 'DRY_RUN_COMPLETE';
            break;
          }
          if ([
            'EVIDENCE_ALREADY_CAPTURED',
            'BLOCKED_SOURCE_RECORDED',
          ].includes(queueStatus)) {
            batchResult.status = queueStatus;
            break;
          }
          if (queueStatus === 'COMPLIANCE_REVIEW_REQUIRED') {
            batchResult.status = queueStatus;
            break;
          }
          if ([
            'CROSS_INTAKE_COMPLIANCE_REVIEW_REQUIRED',
            'REQUIRED_BATCH_PAGES_MISSING',
            'ROBOTS_REVIEW_REQUIRED',
          ].includes(queueStatus)) {
            batchResult.status = queueStatus;
            break;
          }
          if (!prepare.runId) {
            throw new Error(`Capture preparation returned ${queueStatus || 'no status'} without a run id.`);
          }
          const processed = await runJsonCommand(
            'scripts/process-affiliate-source-intakes.ts',
            [
              `--run-id=${prepare.runId}`,
              '--once',
              '--summary',
              '--provider=SCRAPINGDOG',
              '--fallback-provider=NONE',
            ],
          );
          batchResult.processResults.push(processed);
          const processedRun = Array.isArray(processed.results) ? processed.results[0] : null;
          if (processedRun?.runId) {
            const exported = await runJsonCommand(
              'scripts/export-affiliate-source-intake.ts',
              [
                ...(!exportCurrentDatabase ? ['--live'] : []),
                ...(evidenceEnvironment
                  ? [`--environment=${evidenceEnvironment}`]
                  : []),
                `--source-key=${prepare.queuedIntakeSourceKey ?? prepare.intakeSourceKey}`,
                `--run-id=${processedRun.runId}`,
              ],
            );
            batchResult.exports.push(exported);
          } else {
            await delay(2_000);
          }
        }
        if (batchResult.status === 'IN_PROGRESS') {
          throw new Error('Capture batch did not reach a terminal evidence state after five attempts.');
        }
      } catch (error) {
        batchResult.status = 'FAILED';
        const message = error instanceof Error ? error.message : String(error);
        sourceResult.errors.push(`Batch ${batchIndex + 1}: ${message}`);
      }
      if ([
        'COMPLIANCE_REVIEW_REQUIRED',
        'CROSS_INTAKE_COMPLIANCE_REVIEW_REQUIRED',
        'ROBOTS_REVIEW_REQUIRED',
      ].includes(batchResult.status)) break;
    }
    sourceResult.status = sourceResult.errors.length
      ? 'FAILED'
      : sourceResult.batches.every((batch) => [
        'EVIDENCE_ALREADY_CAPTURED',
        'BLOCKED_SOURCE_RECORDED',
        'DRY_RUN_COMPLETE',
      ].includes(batch.status))
        ? 'COMPLETE'
        : 'REVIEW_REQUIRED';
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  report.completedAt = new Date().toISOString();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    cohortId: report.cohortId,
    mode: report.mode,
    sourceCount: report.sourceCount,
    complete: report.sources.filter((source) => source.status === 'COMPLETE').length,
    reviewRequired: report.sources.filter((source) => source.status === 'REVIEW_REQUIRED').length,
    failed: report.sources.filter((source) => source.status === 'FAILED').length,
    reportPath,
  }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-capture-cohort] failed', error);
  process.exitCode = 1;
});
