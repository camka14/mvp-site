import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import {
  assertLockedGoldCaptureCohort,
} from '../src/server/affiliateImports/agentGoldCaptureCohort';
import {
  assertAffiliateGoldCohortProposalIntegrity,
  type AffiliateGoldCohortProposal,
} from '../src/server/affiliateImports/agentGoldCohort';
import {
  buildAffiliateMappingJobContextFromExports,
} from '../src/server/affiliateImports/agentJobContext';
import {
  materializeAffiliateMappingGoldExample,
  type AffiliateGoldFixturePage,
} from '../src/server/affiliateImports/agentGoldMaterialization';
import {
  affiliateIntakeUrlKey,
  canonicalizeAffiliateIntakeUrl,
} from '../src/server/affiliateImports/sourceIntakeUrlSafety';
import {
  isAffiliateAgentTargetKind,
} from '../src/server/affiliateImports/agentContracts';
import {
  parseAffiliateScrapeMapping,
  type AffiliateScrapeMapping,
} from '../src/server/affiliateImports/types';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const execFileAsync = promisify(execFile);
const tsxPath = path.resolve('node_modules', '.bin', 'tsx');

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
}

type ExportArtifact = {
  id: string;
  intakeId: string;
  pageId: string | null;
  runId: string;
  kind: string;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  provider?: string | null;
  httpStatus?: number | null;
  contentHash: string;
  localPath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  file?: {
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
};

type ExportManifest = {
  exportedAt?: string;
  sourceEvidence?: Record<string, unknown>;
  intake: {
    id: string;
    sourceKey: string;
    complianceStatus?: string | null;
    targetKindHints?: string[];
    [key: string]: unknown;
  };
  pages?: Array<Record<string, unknown> & { id?: string }>;
  run: {
    id: string;
    status: string;
    provider?: string | null;
    finishedAt?: string | null;
    [key: string]: unknown;
  };
  artifacts: ExportArtifact[];
};

type LocalArtifact = {
  evidenceDirectory: string;
  manifest: ExportManifest;
  artifact: ExportArtifact;
  absolutePath: string;
};

type DbPage = {
  id: string;
  intakeId: string;
  url: string;
  canonicalUrl: string;
  urlKey: string;
  role: string;
  robotsStatus: string;
};

type DbArtifact = {
  id: string;
  createdAt: Date;
  intakeId: string;
  pageId: string | null;
  runId: string;
  kind: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  provider: string | null;
  httpStatus: number | null;
  contentHash: string;
  fileId: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

const listManifestPaths = async (root: string): Promise<string[]> => {
  const results: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && entry.name === 'manifest.json') {
        results.push(target);
      }
    }
  };
  try {
    await visit(path.resolve(root));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return results.sort();
};

const buildLocalArtifactIndex = async (
  exportRoot: string,
): Promise<Map<string, LocalArtifact>> => {
  const index = new Map<string, LocalArtifact>();
  for (const manifestPath of await listManifestPaths(exportRoot)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as ExportManifest;
    if (!Array.isArray(manifest.artifacts)) continue;
    const evidenceDirectory = path.dirname(manifestPath);
    manifest.artifacts.forEach((artifact) => {
      if (!artifact?.id || !artifact.localPath || index.has(artifact.id)) return;
      index.set(artifact.id, {
        evidenceDirectory,
        manifest,
        artifact,
        absolutePath: path.resolve(evidenceDirectory, artifact.localPath),
      });
    });
  }
  return index;
};

const safeFilename = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'artifact';

const extensionFor = (artifact: DbArtifact): string => {
  const mime = artifact.mimeType?.toLowerCase() ?? '';
  if (mime.includes('html')) return '.html';
  if (mime.includes('markdown')) return '.md';
  if (mime.includes('json')) return '.json';
  if (mime.includes('xml')) return '.xml';
  return '.txt';
};

const sha256File = async (filePath: string): Promise<string> => createHash('sha256')
  .update(await fs.readFile(filePath))
  .digest('hex');

const assertLocalArtifact = async (
  dbArtifact: DbArtifact,
  localArtifact: LocalArtifact | undefined,
): Promise<LocalArtifact> => {
  if (!localArtifact) {
    throw new Error(`Captured artifact ${dbArtifact.id} is not present under the local export root.`);
  }
  const actual = await sha256File(localArtifact.absolutePath);
  if (actual !== dbArtifact.contentHash || actual !== localArtifact.artifact.contentHash) {
    throw new Error(`Captured artifact ${dbArtifact.id} failed local SHA-256 verification.`);
  }
  return localArtifact;
};

const selectedArtifactForPage = (input: {
  page: DbPage;
  artifacts: DbArtifact[];
  successfulRunIds: Set<string>;
  filesWithStorage: Set<string>;
}): DbArtifact | null => {
  const candidates = input.artifacts
    .filter((artifact) => artifact.pageId === input.page.id)
    .filter((artifact) => (artifact.sizeBytes ?? 0) > 0)
    .filter((artifact) => input.filesWithStorage.has(artifact.fileId))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  if (input.page.robotsStatus === 'DISALLOWED') {
    return candidates.find((artifact) => artifact.kind === 'ROBOTS') ?? null;
  }
  if (input.page.role === 'REGISTRATION') {
    const access = candidates.find((artifact) => (
      artifact.kind === 'PAGE_ACCESS_STATUS'
      && artifact.provider === 'DIRECT'
      && input.successfulRunIds.has(artifact.runId)
    ));
    if (access) return access;
  }
  return candidates.find((artifact) => (
    artifact.kind === 'PAGE_HTML'
    && artifact.provider === 'SCRAPINGDOG'
    && input.successfulRunIds.has(artifact.runId)
  )) ?? candidates.find((artifact) => (
    artifact.kind === 'PAGE_MARKDOWN'
    && artifact.provider === 'SCRAPINGDOG'
    && input.successfulRunIds.has(artifact.runId)
  )) ?? null;
};

const copySelectedEvidence = async (input: {
  selectedArtifacts: DbArtifact[];
  localArtifacts: Map<string, LocalArtifact>;
  outputDirectory: string;
}): Promise<string[]> => {
  const grouped = new Map<string, Array<{ db: DbArtifact; local: LocalArtifact }>>();
  for (const dbArtifact of input.selectedArtifacts) {
    const local = await assertLocalArtifact(dbArtifact, input.localArtifacts.get(dbArtifact.id));
    const key = `${dbArtifact.intakeId}|${dbArtifact.runId}`;
    const rows = grouped.get(key) ?? [];
    rows.push({ db: dbArtifact, local });
    grouped.set(key, rows);
  }

  const evidenceDirectories: string[] = [];
  for (const rows of grouped.values()) {
    const uniqueRows = Array.from(new Map(
      rows.map((row) => [row.db.contentHash, row]),
    ).values());
    const first = uniqueRows[0];
    const evidenceDirectory = path.join(
      input.outputDirectory,
      'evidence',
      safeFilename(first.db.runId),
    );
    await fs.mkdir(evidenceDirectory, { recursive: true });
    const artifacts: ExportArtifact[] = [];
    for (const [index, row] of uniqueRows.entries()) {
      const localName = [
        String(index + 1).padStart(3, '0'),
        safeFilename(row.db.kind),
        safeFilename(row.db.id),
      ].join('-') + extensionFor(row.db);
      await fs.copyFile(row.local.absolutePath, path.join(evidenceDirectory, localName));
      artifacts.push({
        ...row.local.artifact,
        localPath: localName,
      });
    }
    const source = first.local.manifest;
    const selectedPageIds = new Set(uniqueRows.map((row) => row.db.pageId).filter(Boolean));
    const manifest: ExportManifest = {
      exportedAt: source.exportedAt,
      sourceEvidence: {
        ...(source.sourceEvidence ?? {}),
        intakeId: first.db.intakeId,
        intakeSourceKey: source.intake.sourceKey,
        runId: first.db.runId,
      },
      intake: source.intake,
      pages: (source.pages ?? []).filter((page) => (
        typeof page.id === 'string' && selectedPageIds.has(page.id)
      )),
      run: source.run,
      artifacts,
    };
    await fs.writeFile(
      path.join(evidenceDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    evidenceDirectories.push(evidenceDirectory);
  }
  return evidenceDirectories;
};

const createPolicyEvidence = async (input: {
  source: Record<string, unknown>;
  intake: Record<string, unknown> | null;
  outputDirectory: string;
  targetKind: string;
  lockedAt: string;
}): Promise<string> => {
  const intakeId = typeof input.intake?.id === 'string'
    ? input.intake.id
    : `policy-intake-${String(input.source.id)}`;
  const sourceKey = typeof input.intake?.sourceKey === 'string'
    ? input.intake.sourceKey
    : String(input.source.sourceKey);
  const runId = `policy-record-${String(input.source.id)}`;
  const policyRecord = {
    schemaVersion: 1,
    recordType: 'AFFILIATE_SOURCE_POLICY_NOTE',
    sourceId: input.source.id,
    sourceKey: input.source.sourceKey,
    sourceStatus: input.source.status,
    intakeId,
    intakeComplianceStatus: input.intake?.complianceStatus ?? 'BLOCKED',
    lockedAt: input.lockedAt,
    captureDisposition: 'NO_PUBLIC_CAPTURE_FOR_BLOCKED_SOURCE',
  };
  const content = `${JSON.stringify(policyRecord, null, 2)}\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  const evidenceDirectory = path.join(input.outputDirectory, 'evidence', safeFilename(runId));
  await fs.mkdir(evidenceDirectory, { recursive: true });
  const localPath = '001-policy_note.json';
  await fs.writeFile(path.join(evidenceDirectory, localPath), content, 'utf8');
  const pageUrl = String(input.source.listUrl ?? input.source.baseUrl);
  const manifest = {
    exportedAt: new Date().toISOString(),
    sourceEvidence: {
      schemaVersion: 1,
      evidenceSystem: 'AffiliateSourceIntakes',
      environment: 'live',
      intakeId,
      intakeSourceKey: sourceKey,
      complianceStatus: 'BLOCKED',
      runId,
      runStatus: 'BLOCKED',
      provider: 'POLICY_RECORD',
      capturedAt: input.lockedAt,
    },
    intake: {
      id: intakeId,
      sourceKey,
      complianceStatus: 'BLOCKED',
      targetKindHints: [input.targetKind],
    },
    pages: [],
    run: {
      id: runId,
      status: 'BLOCKED',
      provider: 'POLICY_RECORD',
      finishedAt: input.lockedAt,
    },
    artifacts: [{
      id: `policy-note-${String(input.source.id)}`,
      intakeId,
      pageId: null,
      runId,
      kind: 'POLICY_NOTE',
      sourceUrl: pageUrl,
      finalUrl: pageUrl,
      provider: 'POLICY_RECORD',
      httpStatus: null,
      contentHash: hash,
      localPath,
      mimeType: 'application/json',
      sizeBytes: Buffer.byteLength(content),
      file: {
        originalName: 'affiliate-source-policy-note.json',
        mimeType: 'application/json',
        sizeBytes: Buffer.byteLength(content),
      },
    }],
  };
  await fs.writeFile(
    path.join(evidenceDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return evidenceDirectory;
};

const urlKey = (value: string): string => (
  affiliateIntakeUrlKey(canonicalizeAffiliateIntakeUrl(value))
);

const fixtureUrlIdentity = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
};

const addFixtureAlias = (
  pages: AffiliateGoldFixturePage[],
  aliasUrl: string,
  sourcePage: AffiliateGoldFixturePage,
) => {
  if (pages.some((page) => page.url === aliasUrl)) return;
  pages.push({
    ...sourcePage,
    url: aliasUrl,
  });
};

const validUrlOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
};

const countBy = (values: string[]): Record<string, number> => Object.fromEntries(
  Array.from(new Set(values)).sort().map((value) => [
    value,
    values.filter((candidate) => candidate === value).length,
  ]),
);

const main = async () => {
  const proposalPath = path.resolve(
    readOption('--proposal')
      ?? 'output/affiliate-mapping-agent/gold-cohorts/affiliate-mapping-test-7e930a8a04b0dc2f/proposal.json',
  );
  const lockPath = path.resolve(
    readOption('--lock') ?? path.join(path.dirname(proposalPath), 'lock.json'),
  );
  const exportRoot = path.resolve(readOption('--export-root') ?? 'output/affiliate-intakes');
  const outputDirectory = path.resolve(
    readOption('--output-dir') ?? path.join(path.dirname(proposalPath), 'materialized'),
  );
  const shouldWrite = process.argv.includes('--write');
  const proposalValue = JSON.parse(await fs.readFile(proposalPath, 'utf8'));
  const lockValue = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  assertAffiliateGoldCohortProposalIntegrity(proposalValue);
  const { proposal, lock } = assertLockedGoldCaptureCohort(proposalValue, lockValue);
  const typedProposal = proposal as AffiliateGoldCohortProposal;

  if (!shouldWrite) {
    console.log(JSON.stringify({
      cohortId: typedProposal.cohortId,
      exampleCount: typedProposal.examples.length,
      outputDirectory,
      writeRequired: true,
      databaseWrites: 0,
      publicRequests: 0,
    }, null, 2));
    return;
  }
  try {
    await fs.access(outputDirectory);
    throw new Error(`Materialized dataset already exists: ${outputDirectory}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  let localArtifacts = await buildLocalArtifactIndex(exportRoot);
  const exportMissing = process.argv.includes('--export-missing');
  let evidenceRunsExported = 0;
  const stagingDirectory = `${outputDirectory}.staging-${process.pid}`;
  await fs.mkdir(stagingDirectory, { recursive: false });
  const { prisma } = await import('../src/lib/prisma');
  const db = prisma as any;
  const results = [];
  try {
    for (const cohortExample of typedProposal.examples) {
      if (!isAffiliateAgentTargetKind(cohortExample.targetKind)) {
        throw new Error(`Locked cohort contains unsupported target kind ${cohortExample.targetKind}.`);
      }
      const exampleDirectory = path.join(stagingDirectory, safeFilename(cohortExample.sourceKey));
      await fs.mkdir(exampleDirectory, { recursive: true });
      const source = await db.affiliateScrapeSources.findUnique({
        where: { sourceKey: cohortExample.sourceKey },
        select: {
          id: true,
          name: true,
          sourceKey: true,
          organizationId: true,
          baseUrl: true,
          listUrl: true,
          targetKind: true,
          status: true,
          activeMappingId: true,
          metadata: true,
        },
      });
      if (!source) throw new Error(`Affiliate source not found: ${cohortExample.sourceKey}`);
      const [mappingRow, organization, linkedIntake] = await Promise.all([
        cohortExample.mappingId
          ? db.affiliateScrapeMappings.findFirst({
              where: { id: cohortExample.mappingId, sourceId: source.id },
              select: { id: true, mapping: true, validatedAt: true },
            })
          : null,
        source.organizationId
          ? db.organizations.findUnique({
              where: { id: source.organizationId },
              select: {
                name: true,
                website: true,
                description: true,
                location: true,
                address: true,
              },
            })
          : null,
        db.affiliateSourceIntakes.findFirst({
          where: { affiliateSourceId: source.id },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      const mapping: AffiliateScrapeMapping | null = mappingRow
        ? parseAffiliateScrapeMapping(mappingRow.mapping)
        : null;

      let evidenceDirectories: string[];
      let fixturePages: AffiliateGoldFixturePage[] = [];
      if (cohortExample.scenarioIntent === 'BLOCKED_REFUSAL') {
        evidenceDirectories = [await createPolicyEvidence({
          source,
          intake: linkedIntake,
          outputDirectory: exampleDirectory,
          targetKind: cohortExample.targetKind,
          lockedAt: lock.lockedAt,
        })];
      } else {
        const requiredKeys = cohortExample.requiredCapturePages.map((page) => urlKey(page.url));
        const pages = await db.affiliateSourceIntakePages.findMany({
          where: { urlKey: { in: requiredKeys }, status: 'ACTIVE' },
          select: {
            id: true,
            intakeId: true,
            url: true,
            canonicalUrl: true,
            urlKey: true,
            role: true,
            robotsStatus: true,
          },
        }) as DbPage[];
        const pageByKey = new Map(pages.map((page) => [page.urlKey, page]));
        const missingPage = cohortExample.requiredCapturePages.find((page) => (
          !pageByKey.has(urlKey(page.url))
        ));
        if (missingPage) {
          throw new Error(
            `Required captured page is missing for ${cohortExample.sourceKey}: ${missingPage.url}`,
          );
        }
        const artifacts = await db.affiliateSourceIntakeArtifacts.findMany({
          where: {
            pageId: { in: pages.map((page) => page.id) },
            kind: {
              in: ['PAGE_HTML', 'PAGE_MARKDOWN', 'PAGE_ACCESS_STATUS', 'ROBOTS'],
            },
          },
          select: {
            id: true,
            createdAt: true,
            intakeId: true,
            pageId: true,
            runId: true,
            kind: true,
            sourceUrl: true,
            finalUrl: true,
            provider: true,
            httpStatus: true,
            contentHash: true,
            fileId: true,
            mimeType: true,
            sizeBytes: true,
          },
        }) as DbArtifact[];
        const [runs, files] = await Promise.all([
          db.affiliateSourceIntakeRuns.findMany({
            where: { id: { in: Array.from(new Set(artifacts.map((artifact) => artifact.runId))) } },
            select: { id: true, status: true, finishedAt: true },
          }),
          db.file.findMany({
            where: { id: { in: Array.from(new Set(artifacts.map((artifact) => artifact.fileId))) } },
            select: { id: true, bucket: true },
          }),
        ]);
        const successfulRunIds = new Set<string>(
          runs
            .filter((run: any) => ['SUCCEEDED', 'PARTIAL'].includes(run.status))
            .map((run: any) => run.id),
        );
        const finishedAtByRunId = new Map<string, string | undefined>(
          runs.map((run: any) => [run.id, run.finishedAt?.toISOString()]),
        );
        const filesWithStorage = new Set<string>(
          files.filter((file: any) => Boolean(file.bucket)).map((file: any) => file.id),
        );
        const selected: Array<{ requiredUrl: string; page: DbPage; artifact: DbArtifact }> = [];
        for (const requiredPage of cohortExample.requiredCapturePages) {
          const page = pageByKey.get(urlKey(requiredPage.url))!;
          const artifact = selectedArtifactForPage({
            page,
            artifacts,
            successfulRunIds,
            filesWithStorage,
        });
          if (!artifact) {
            throw new Error(
              `No current local captured artifact supports ${cohortExample.sourceKey} ${requiredPage.url}`,
            );
          }
          selected.push({ requiredUrl: requiredPage.url, page, artifact });
        }
        const selectedEvidenceArtifacts = Array.from(new Map(
          selected.flatMap((row) => {
            const markdownCompanion = row.artifact.kind === 'PAGE_HTML'
              ? artifacts
                  .filter((artifact) => (
                    artifact.pageId === row.page.id
                    && artifact.kind === 'PAGE_MARKDOWN'
                    && artifact.provider === 'SCRAPINGDOG'
                    && successfulRunIds.has(artifact.runId)
                    && filesWithStorage.has(artifact.fileId)
                  ))
                  .sort((left, right) => (
                    right.createdAt.getTime() - left.createdAt.getTime()
                  ))[0]
              : null;
            return [row.artifact, ...(markdownCompanion ? [markdownCompanion] : [])];
          }).map((artifact) => [artifact.id, artifact]),
        ).values());
        const missingLocalArtifacts = selectedEvidenceArtifacts
          .filter((artifact) => !localArtifacts.has(artifact.id));
        if (missingLocalArtifacts.length && !exportMissing) {
          throw new Error(
            `Selected evidence is not exported locally for ${cohortExample.sourceKey}: `
            + missingLocalArtifacts.map((artifact) => (
              `${artifact.id} (${artifact.runId})`
            )).join(', '),
          );
        }
        if (missingLocalArtifacts.length) {
          const missingRuns = Array.from(new Map(
            missingLocalArtifacts.map((artifact) => [
              `${artifact.intakeId}|${artifact.runId}`,
              artifact,
            ]),
          ).values());
          for (const artifact of missingRuns) {
            const intake = await db.affiliateSourceIntakes.findUnique({
              where: { id: artifact.intakeId },
              select: { sourceKey: true },
            });
            if (!intake) {
              throw new Error(`Evidence intake no longer exists: ${artifact.intakeId}`);
            }
            await execFileAsync(tsxPath, [
              'scripts/export-affiliate-source-intake.ts',
              '--environment=live',
              `--source-key=${intake.sourceKey}`,
              `--run-id=${artifact.runId}`,
            ], {
              cwd: process.cwd(),
              env: {
                ...process.env,
                STORAGE_PROVIDER: 'spaces',
              },
              maxBuffer: 20 * 1024 * 1024,
              timeout: 5 * 60 * 1000,
            });
            evidenceRunsExported += 1;
          }
          localArtifacts = await buildLocalArtifactIndex(exportRoot);
        }
        evidenceDirectories = await copySelectedEvidence({
          selectedArtifacts: selectedEvidenceArtifacts,
          localArtifacts,
          outputDirectory: exampleDirectory,
        });

        const fixturesDirectory = path.join(exampleDirectory, 'fixtures');
        await fs.mkdir(fixturesDirectory, { recursive: true });
        for (const row of selected) {
          if (row.artifact.kind !== 'PAGE_HTML') continue;
          const local = await assertLocalArtifact(
            row.artifact,
            localArtifacts.get(row.artifact.id),
          );
          const relativeFile = path.join(
            'fixtures',
            `${row.artifact.contentHash}.html`,
          );
          const absoluteFile = path.join(exampleDirectory, relativeFile);
          try {
            await fs.access(absoluteFile);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await fs.copyFile(local.absolutePath, absoluteFile);
          }
          const page: AffiliateGoldFixturePage = {
            url: row.requiredUrl,
            finalUrl: validUrlOrNull(row.artifact.finalUrl)
              ?? validUrlOrNull(row.page.canonicalUrl)
              ?? row.requiredUrl,
            statusCode: row.artifact.httpStatus ?? 200,
            file: relativeFile,
            byteLength: row.artifact.sizeBytes ?? (await fs.stat(absoluteFile)).size,
            sha256: row.artifact.contentHash,
            fetchedAt: finishedAtByRunId.get(row.artifact.runId),
          };
          if (!fixturePages.some((candidate) => candidate.url === page.url)) {
            fixturePages.push(page);
          }
        }
        if (mapping) {
          const listFixture = fixturePages.find((page) => (
            fixtureUrlIdentity(page.url) === fixtureUrlIdentity(mapping.listUrl)
            || fixtureUrlIdentity(page.finalUrl) === fixtureUrlIdentity(mapping.listUrl)
          ));
          if (listFixture) addFixtureAlias(fixturePages, mapping.listUrl, listFixture);
          mapping.manualCandidates?.forEach((candidate) => {
            const detailUrl = mapping.detailPage
              ? validUrlOrNull(candidate[mapping.detailPage.urlField])
              : null;
            if (!detailUrl) return;
            const detailFixture = fixturePages.find((page) => (
              fixtureUrlIdentity(page.url) === fixtureUrlIdentity(detailUrl)
              || fixtureUrlIdentity(page.finalUrl) === fixtureUrlIdentity(detailUrl)
            ));
            if (detailFixture) addFixtureAlias(fixturePages, detailUrl, detailFixture);
          });
        }
        fixturePages.sort((left, right) => left.url.localeCompare(right.url));
        await fs.writeFile(
          path.join(exampleDirectory, 'pages.json'),
          `${JSON.stringify({ schemaVersion: 1, pages: fixturePages }, null, 2)}\n`,
          'utf8',
        );
      }

      const { context } = await buildAffiliateMappingJobContextFromExports({
        jobId: `gold-${typedProposal.cohortId}-${cohortExample.sourceKey}`,
        evidenceDirectories,
        repositoryRoot: process.cwd(),
        instructionsRevision: 'affiliate-source-mapping-contract-v1',
      });
      if (cohortExample.scenarioIntent === 'BLOCKED_REFUSAL') {
        await fs.writeFile(
          path.join(exampleDirectory, 'pages.json'),
          `${JSON.stringify({ schemaVersion: 1, pages: [] }, null, 2)}\n`,
          'utf8',
        );
      }
      const result = await materializeAffiliateMappingGoldExample({
        cohortId: typedProposal.cohortId,
        proposalSourceKey: cohortExample.sourceKey,
        registrableDomain: cohortExample.registrableDomain,
        platformFamily: cohortExample.platformFamily,
        split: 'test',
        targetKind: cohortExample.targetKind,
        scenarioIntent: cohortExample.scenarioIntent,
        context,
        mapping,
        fixtureDirectory: exampleDirectory,
        fixturePages,
        organization: {
          name: organization?.name ?? source.name,
          website: validUrlOrNull(organization?.website)
            ?? validUrlOrNull(source.baseUrl)
            ?? validUrlOrNull(source.listUrl),
          description: organization?.description?.trim() || null,
          city: organization?.location?.trim() || null,
          address: organization?.address?.trim() || null,
        },
        approval: {
          approvedByUserId: lock.approvedByUserId,
          approvedAt: lock.lockedAt,
          proposalSha256: typedProposal.proposalSha256,
        },
      });
      results.push({
        sourceKey: cohortExample.sourceKey,
        intendedScenario: cohortExample.scenarioIntent,
        intendedTargetKind: cohortExample.targetKind,
        intendedMappingId: cohortExample.mappingId || null,
        activeMappingId: source.activeMappingId,
        lockedMappingMatchesActive: !cohortExample.mappingId
          || cohortExample.mappingId === source.activeMappingId,
        outcome: result.outcome,
        extractedCandidateCount: result.extractedCandidateCount,
        importableCandidateCount: result.importableCandidateCount,
        evidenceSupportedCandidateCount: result.evidenceSupportedCandidateCount,
        warnings: result.warnings,
        example: result.example,
      });
    }

    const examplesPath = path.join(stagingDirectory, 'examples.jsonl');
    await fs.writeFile(
      examplesPath,
      results.map((result) => JSON.stringify(result.example)).join('\n') + '\n',
      'utf8',
    );
    const report = {
      schemaVersion: 1,
      cohortId: typedProposal.cohortId,
      proposalSha256: typedProposal.proposalSha256,
      lockedAt: lock.lockedAt,
      materializedAt: new Date().toISOString(),
      exampleCount: results.length,
      intendedScenarios: countBy(results.map((result) => result.intendedScenario)),
      outcomes: countBy(results.map((result) => result.outcome)),
      executableCount: results.filter((result) => (
        result.outcome === 'GENERIC_MAPPING' || result.outcome === 'MANUAL_CANDIDATES'
      )).length,
      downgradedExecutableCount: results.filter((result) => (
        result.intendedScenario === 'EXECUTABLE_MAPPING'
        && result.outcome === 'INSUFFICIENT_EVIDENCE'
      )).length,
      lockedMappingDriftCount: results.filter((result) => (
        !result.lockedMappingMatchesActive
      )).length,
      databaseWrites: 0,
      publicRequests: 0,
      evidenceRunsExported,
      sources: results.map(({ example: _example, ...result }) => result),
    };
    await fs.writeFile(
      path.join(stagingDirectory, 'materialization-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(stagingDirectory, outputDirectory);
    console.log(JSON.stringify({
      outputDirectory,
      examplesPath: path.join(outputDirectory, 'examples.jsonl'),
      reportPath: path.join(outputDirectory, 'materialization-report.json'),
      ...report,
      sources: undefined,
    }, null, 2));
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:gold-materialize] failed', error);
  process.exitCode = 1;
});
