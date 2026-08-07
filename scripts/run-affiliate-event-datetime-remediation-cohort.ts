import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
const apply = process.argv.includes('--apply');
const help = process.argv.includes('--help') || process.argv.includes('-h');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const hasOption = (name: string): boolean => (
  process.argv.includes(name) || process.argv.some((argument) => argument.startsWith(`${name}=`))
);

const parseCount = (value: string | undefined, name: string): number => {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be a nonnegative integer.`);
  return Number(value);
};

if (apply && !useLive) throw new Error('--apply requires --live.');

if (help) {
  console.log(`Affiliate event-datetime remediation cohort

Preview (default):
  npm run affiliate:mapping:datetime-remediation-cohort
  npm run affiliate:mapping:datetime-remediation-cohort -- --live

Apply (requires all guards):
  npm run affiliate:mapping:datetime-remediation-cohort -- --live --apply \\
    --cohort-key event-datetime-v1 \\
    --mapping-cutoff 2026-08-01T00:00:00.000Z \\
    --expected-job-ids job_1,job_2 \\
    --expected-eligible 0 --expected-excluded 0 \\
    --operator operator@example.com`);
  process.exit(0);
}

if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const main = async () => {
  const explicitCohortKey = readOption('--cohort-key');
  const cohortKey = explicitCohortKey ?? 'event-datetime-v1';
  const cutoffText = readOption('--mapping-cutoff');
  const mappingCutoff = cutoffText ? new Date(cutoffText) : new Date();
  if (Number.isNaN(mappingCutoff.getTime())) throw new Error('--mapping-cutoff must be an ISO datetime.');
  if (apply) {
    if (!hasOption('--cohort-key') || !hasOption('--mapping-cutoff')) {
      throw new Error('--apply requires explicit --cohort-key and --mapping-cutoff.');
    }
    if (!hasOption('--expected-eligible') || !hasOption('--expected-excluded')) {
      throw new Error('--apply requires --expected-eligible and --expected-excluded.');
    }
    if (!hasOption('--expected-job-ids')) {
      throw new Error('--apply requires --expected-job-ids from the sorted preview inventory.');
    }
    if (!hasOption('--operator')) throw new Error('--apply requires --operator.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const {
    applyAffiliateEventDateTimeRemediationCohort,
    previewAffiliateEventDateTimeRemediationCohort,
  } = await import('../src/server/affiliateImports/eventDateTimeRemediationCohort');
  const mode = apply ? 'apply' : 'preview';
  const capturedAt = new Date();
  try {
    const report = apply
      ? await applyAffiliateEventDateTimeRemediationCohort({
          cohortKey,
          mappingCutoff,
          expectedEligibleMappingJobIds: (readOption('--expected-job-ids') ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
          expectedEligibleCount: parseCount(readOption('--expected-eligible'), '--expected-eligible'),
          expectedExcludedCount: parseCount(readOption('--expected-excluded'), '--expected-excluded'),
          operatorIdentity: readOption('--operator') ?? '',
          now: capturedAt,
        })
      : await previewAffiliateEventDateTimeRemediationCohort({
          cohortKey,
          mappingCutoff,
          now: capturedAt,
        });
    const outputDirectory = path.resolve(
      readOption('--output-dir') ?? path.join('output', 'affiliate-event-datetime-remediation', 'cohort'),
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `${cohortKey}-${mode}.json`);
    const redactedReport = {
      schemaVersion: 1,
      capturedAt: capturedAt.toISOString(),
      environment: useLive ? 'live' : 'local',
      dryRun: !apply,
      publicRequests: 0,
      databaseWrites: apply ? 1 : 0,
      report,
    };
    await fs.writeFile(outputPath, `${JSON.stringify(redactedReport, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      capturedAt: redactedReport.capturedAt,
      environment: redactedReport.environment,
      dryRun: redactedReport.dryRun,
      databaseWrites: redactedReport.databaseWrites,
      cohortKey,
      state: report.state,
      eligibleCount: report.eligibleCount,
      excludedCount: report.excludedCount,
      outputPath,
    }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:datetime-remediation-cohort] failed', error);
  process.exitCode = 1;
});
