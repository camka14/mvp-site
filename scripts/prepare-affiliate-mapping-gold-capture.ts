import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  assertLockedGoldCaptureCohort,
  planGoldCaptureBatches,
} from '../src/server/affiliateImports/agentGoldCaptureCohort';
import {
  affiliateIntakeUrlKey,
  canonicalizeAffiliateIntakeUrl,
} from '../src/server/affiliateImports/sourceIntakeUrlSafety';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const shouldApply = process.argv.includes('--apply');
const shouldQueue = process.argv.includes('--queue');
if (shouldQueue && !shouldApply) throw new Error('--queue requires --apply.');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const readBatch = (): number => {
  const raw = readOption('--batch') ?? '1';
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--batch must be a positive integer.');
  }
  return value;
};

const hostFor = (value: string): string => new URL(value).hostname
  .toLowerCase()
  .replace(/^www\./, '');

const siteSourceKey = (host: string): string => `site-${host}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100);

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const isExplicitlyBlocked = (source: { status: string; metadata: unknown }): boolean => {
  const metadata = toRecord(source.metadata);
  return source.status === 'POLICY_BLOCKED'
    || metadata.robotsAllowed === false
    || metadata.policyBlocked === true
    || metadata.scrapingAllowed === false
    || String(metadata.complianceStatus ?? '').toUpperCase() === 'BLOCKED';
};

const main = async () => {
  const proposalPath = path.resolve(
    readOption('--proposal')
      ?? 'output/affiliate-mapping-agent/gold-cohorts/affiliate-mapping-test-d9de7ef53d2c82d1/proposal.json',
  );
  const lockPath = path.resolve(
    readOption('--lock') ?? path.join(path.dirname(proposalPath), 'lock.json'),
  );
  const sourceKey = readOption('--source-key');
  if (!sourceKey) throw new Error('--source-key is required.');
  const batchNumber = readBatch();
  const { proposal, lock } = assertLockedGoldCaptureCohort(
    JSON.parse(await fs.readFile(proposalPath, 'utf8')),
    JSON.parse(await fs.readFile(lockPath, 'utf8')),
  );
  const example = proposal.examples.find((candidate) => candidate.sourceKey === sourceKey);
  if (!example) throw new Error(`Source is not in locked cohort ${proposal.cohortId}: ${sourceKey}`);
  const batches = planGoldCaptureBatches(example.requiredCapturePages);
  const requestedBatch = batches[batchNumber - 1];
  if (!requestedBatch) {
    throw new Error(`Source ${sourceKey} has ${batches.length} capture batch(es), not batch ${batchNumber}.`);
  }

  const [{ prisma }, intakeService] = await Promise.all([
    import('../src/lib/prisma'),
    import('../src/server/affiliateImports/sourceIntake'),
  ]);
  const db = prisma as any;
  try {
    const source = await db.affiliateScrapeSources.findUnique({
      where: { sourceKey },
      select: {
        id: true,
        name: true,
        sourceKey: true,
        organizationId: true,
        baseUrl: true,
        listUrl: true,
        targetKind: true,
        status: true,
        metadata: true,
      },
    });
    if (!source) throw new Error(`Live affiliate source was not found: ${sourceKey}`);
    const primaryUrl = source.baseUrl?.trim() || source.listUrl;
    const primaryHost = hostFor(primaryUrl);
    const expectedIntakeKey = siteSourceKey(primaryHost);
    const requiredUrlKeys = example.requiredCapturePages.map((page) => (
      affiliateIntakeUrlKey(canonicalizeAffiliateIntakeUrl(page.url))
    ));
    const matchingPages = await db.affiliateSourceIntakePages.findMany({
      where: { urlKey: { in: requiredUrlKeys } },
      select: { intakeId: true, canonicalUrl: true },
    });
    const sameHostMatchedIntakeIds = matchingPages
      .filter((page: any) => hostFor(page.canonicalUrl) === primaryHost)
      .map((page: any) => page.intakeId);
    const intakeCandidates = await db.affiliateSourceIntakes.findMany({
      where: {
        OR: [
          { affiliateSourceId: source.id },
          { sourceKey: expectedIntakeKey },
          ...(sameHostMatchedIntakeIds.length
            ? [{ id: { in: sameHostMatchedIntakeIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    let intake = intakeCandidates.find((candidate: any) => candidate.affiliateSourceId === source.id)
      ?? intakeCandidates.find((candidate: any) => candidate.sourceKey === expectedIntakeKey)
      ?? intakeCandidates[0]
      ?? null;

    if (!intake && shouldApply) {
      intake = await intakeService.createAffiliateSourceIntake({
        name: `${source.name} gold evidence`,
        sourceKey: expectedIntakeKey,
        baseUrl: new URL(primaryUrl).origin,
        targetKindHints: [String(source.targetKind).toUpperCase()],
        notes: `Required evidence for locked cohort ${proposal.cohortId} (${proposal.proposalSha256}).`,
        pages: [example.requiredCapturePages[0]],
      }, lock.approvedByUserId);
    }

    const summary = {
      cohortId: proposal.cohortId,
      proposalSha256: proposal.proposalSha256,
      sourceKey,
      scenarioIntent: example.scenarioIntent,
      mode: shouldApply ? 'apply' : 'dry-run',
      batch: batchNumber,
      batchCount: batches.length,
      requiredPageCount: example.requiredCapturePages.length,
      requestedPageCount: requestedBatch.length,
      intakeId: intake?.id ?? null,
      intakeSourceKey: intake?.sourceKey ?? expectedIntakeKey,
      complianceStatus: intake?.complianceStatus ?? 'UNREVIEWED',
      pagesAdded: 0,
      pagesReusedFromOtherIntakes: [] as Array<{ url: string; intakeId: string }>,
      queueStatus: 'NOT_REQUESTED',
      runId: null as string | null,
      publicCaptureRequestsQueued: 0,
    };
    if (!shouldApply) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    if (!intake) throw new Error('Failed to create or locate an intake.');

    if (!intake.affiliateSourceId) {
      intake = await db.affiliateSourceIntakes.update({
        where: { id: intake.id },
        data: {
          affiliateSourceId: source.id,
          organizationId: source.organizationId,
          notes: `Required evidence for locked cohort ${proposal.cohortId} (${proposal.proposalSha256}).`,
        },
      });
    }
    for (const page of example.requiredCapturePages) {
      const urlKey = affiliateIntakeUrlKey(canonicalizeAffiliateIntakeUrl(page.url));
      const existingPage = await db.affiliateSourceIntakePages.findUnique({
        where: { urlKey },
        select: { intakeId: true },
      });
      if (existingPage && existingPage.intakeId !== intake.id) {
        summary.pagesReusedFromOtherIntakes.push({
          url: page.url,
          intakeId: existingPage.intakeId,
        });
        continue;
      }
      if (!existingPage) summary.pagesAdded += 1;
      await intakeService.addAffiliateSourceIntakePage(intake.id, {
        ...page,
        targetKindHints: [String(source.targetKind).toUpperCase()],
        discoverySource: 'GOLD_COHORT',
      });
    }

    if (isExplicitlyBlocked(source)) {
      if (intake.complianceStatus !== 'BLOCKED') {
        await intakeService.reviewAffiliateSourceIntakePolicy(intake.id, {
          complianceStatus: 'BLOCKED',
          notes: `Inherited explicit policy block while preparing locked cohort ${proposal.cohortId}. No capture queued.`,
        }, lock.approvedByUserId);
      }
      summary.complianceStatus = 'BLOCKED';
      summary.queueStatus = 'BLOCKED_SOURCE_RECORDED';
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const refreshedIntake = await db.affiliateSourceIntakes.findUnique({
      where: { id: intake.id },
      select: { complianceStatus: true },
    });
    summary.complianceStatus = refreshedIntake?.complianceStatus ?? 'UNREVIEWED';
    if (!shouldQueue) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    if (summary.complianceStatus !== 'ALLOWED') {
      summary.queueStatus = 'COMPLIANCE_REVIEW_REQUIRED';
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const batchUrlKeys = requestedBatch.map((page) => (
      affiliateIntakeUrlKey(canonicalizeAffiliateIntakeUrl(page.url))
    ));
    const batchPages = await db.affiliateSourceIntakePages.findMany({
      where: { intakeId: intake.id, urlKey: { in: batchUrlKeys }, status: 'ACTIVE' },
      select: { id: true, urlKey: true, robotsStatus: true },
    });
    const pageByUrlKey = new Map(batchPages.map((page: any) => [page.urlKey, page]));
    const ownedPages = batchUrlKeys
      .map((urlKey) => pageByUrlKey.get(urlKey))
      .filter(Boolean);
    if (!ownedPages.length) {
      summary.queueStatus = 'NO_BATCH_PAGES_OWNED';
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const contentArtifacts = await db.affiliateSourceIntakeArtifacts.findMany({
      where: {
        intakeId: intake.id,
        pageId: { in: ownedPages.map((page: any) => page.id) },
        kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN', 'ROBOTS'] },
      },
      select: { pageId: true, kind: true },
    });
    const artifactKindsByPage = new Map<string, Set<string>>();
    for (const artifact of contentArtifacts) {
      const kinds = artifactKindsByPage.get(artifact.pageId) ?? new Set<string>();
      kinds.add(artifact.kind);
      artifactKindsByPage.set(artifact.pageId, kinds);
    }
    const missingPages = ownedPages.filter((page: any) => {
      const kinds = artifactKindsByPage.get(page.id) ?? new Set<string>();
      return page.robotsStatus === 'DISALLOWED'
        ? !kinds.has('ROBOTS')
        : !kinds.has('PAGE_HTML') && !kinds.has('PAGE_MARKDOWN');
    });
    if (!missingPages.length) {
      summary.queueStatus = 'EVIDENCE_ALREADY_CAPTURED';
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const activeRun = await db.affiliateSourceIntakeRuns.findFirst({
      where: { intakeId: intake.id, status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { queuedAt: 'asc' },
      select: { id: true, status: true },
    });
    if (activeRun) {
      summary.queueStatus = `ACTIVE_RUN_${activeRun.status}`;
      summary.runId = activeRun.id;
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const run = await intakeService.queueAffiliateSourceIntakeRun(
      intake.id,
      missingPages.map((page: any) => page.id),
      lock.approvedByUserId,
    );
    summary.queueStatus = 'QUEUED';
    summary.runId = run.id;
    summary.publicCaptureRequestsQueued = missingPages.length;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-capture] failed', error);
  process.exitCode = 1;
});
