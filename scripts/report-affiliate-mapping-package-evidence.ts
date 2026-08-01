import dotenv from 'dotenv';
import { Client } from 'pg';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import { affiliateSourceMatchesIntakeEvidence } from '../src/server/affiliateImports/codexIngestionApproval';
import { codexAffiliateIngestionResultSchema } from '../src/server/affiliateImports/codexIngestionResult';
import {
  inspectAffiliateDisposableReviewScrapes,
  inspectAffiliateProducerPackage,
  resolveAffiliateProducerRepositoryRoot,
} from '../src/server/affiliateImports/producerPackageEvidence';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const disposableDatabaseUrl = process.env.DATABASE_URL?.trim();
const useLive = process.argv.includes('--live');
if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);

const main = async () => {
  const jobId = readOption('--job');
  if (!jobId) throw new Error('--job=<mapping-job-id> is required.');
  if (!disposableDatabaseUrl) {
    throw new Error('Disposable DATABASE_URL is required for review-scrape verification.');
  }
  const producerRoot = resolveAffiliateProducerRepositoryRoot();
  const { prisma } = await import('../src/lib/prisma');
  const disposable = new Client({ connectionString: disposableDatabaseUrl });
  try {
    const job = await (prisma as any).affiliateSourceMappingJobs.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new Error('Affiliate source mapping job not found.');
    const envelope = job.resultSummary && typeof job.resultSummary === 'object'
      ? job.resultSummary as Record<string, unknown>
      : {};
    const result = codexAffiliateIngestionResultSchema.parse(envelope.result);
    if (result.jobId !== job.id || result.intakeId !== job.intakeId) {
      throw new Error('Mapping result identity does not match its live queue row.');
    }
    const producer = inspectAffiliateProducerPackage({
      repositoryRoot: producerRoot,
      result,
    });
    await disposable.connect();
    const disposableReviews = await inspectAffiliateDisposableReviewScrapes({
      queryable: disposable,
      result,
    });
    const candidateSample = await disposable.query(
      `SELECT "listingKind", status, "dedupeKey", title, "organizerName",
              "sportName", city, "venueName", address, "startsAt", "endsAt",
              "dateDisplayMode", "dateDisplayText", "officialActionUrl", "sourceUrl",
              warnings
         FROM "AffiliateImportCandidates"
        WHERE "sourceId" = $1
        ORDER BY "dedupeKey" ASC
        LIMIT 5`,
      [disposableReviews.sourceId],
    );
    const allLiveSources = useLive
      ? await (prisma as any).affiliateScrapeSources.findMany({
        select: {
          id: true,
          organizationId: true,
          activeMappingId: true,
          autoScrapeEnabled: true,
          metadata: true,
        },
      })
      : [];
    const matchedLiveSources = allLiveSources.filter((source: any) => (
      affiliateSourceMatchesIntakeEvidence(source.metadata, {
        intakeId: result.intakeId,
        intakeSourceKey: result.sourceKey,
      })
    ));
    const liveSafetyRows = await Promise.all(matchedLiveSources.map(async (source: any) => {
      const [organization, mapping] = await Promise.all([
        source.organizationId
          ? (prisma as any).organizations.findUnique({
            where: { id: source.organizationId },
            select: { id: true, status: true, publicPageEnabled: true },
          })
          : null,
        source.activeMappingId
          ? (prisma as any).affiliateScrapeMappings.findUnique({
            where: { id: source.activeMappingId },
            select: { id: true, isActive: true, validatedAt: true },
          })
          : null,
      ]);
      return {
        sourceId: source.id,
        organizationId: source.organizationId,
        mappingId: source.activeMappingId,
        autoScrapeEnabled: source.autoScrapeEnabled,
        organization,
        mapping,
      };
    }));
    console.log(JSON.stringify({
      schemaVersion: 1,
      databaseRoles: {
        mappingQueue: useLive ? 'LIVE' : 'LOCAL',
        reviewScrapes: 'DISPOSABLE_VALIDATION',
      },
      mappingJob: {
        id: job.id,
        intakeId: job.intakeId,
        status: job.status,
        producerId: result.workerId,
        sourceKey: result.sourceKey,
        logoDisposition: result.logoDisposition,
        candidateCount: result.candidateCount,
      },
      producer,
      disposableReviews,
      candidateSample: candidateSample.rows,
      liveSafety: {
        state: liveSafetyRows.length === 0 ? 'NOT_APPLIED' : 'EXISTING_REVIEW_STATE',
        matchingSourceCount: liveSafetyRows.length,
        sources: liveSafetyRows,
        note: liveSafetyRows.length === 0
          ? 'Expected before approval; guarded application creates the disabled review state.'
          : 'Existing evidence-matched state must be unpublished, disabled, and unvalidated.',
      },
    }, null, 2));
  } finally {
    await disposable.end().catch(() => undefined);
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:approvals:package-evidence] failed', error);
  process.exitCode = 1;
});
