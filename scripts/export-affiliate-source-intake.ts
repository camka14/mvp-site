import dotenv from 'dotenv';
import { createWriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

import {
  affiliateSiteIntakeKeyForUrl,
  buildAffiliateSourceEvidence,
  renderAffiliateSourceEvidenceMarkdown,
  selectAffiliateSourceIntakeExportRun,
} from '../src/server/affiliateImports/sourceIntakeExport';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const safeName = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'artifact';

const extensionFor = (artifact: any): string => {
  const mime = String(artifact.mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('html')) return '.html';
  if (mime.includes('markdown')) return '.md';
  if (mime.includes('json')) return '.json';
  return '.txt';
};

const resolveIntake = async (db: any, sourceKey?: string, sourceUrl?: string) => {
  if (sourceKey) {
    return db.affiliateSourceIntakes.findUnique({ where: { sourceKey } });
  }
  if (!sourceUrl) return null;

  const derivedKey = affiliateSiteIntakeKeyForUrl(sourceUrl);
  const byDerivedKey = await db.affiliateSourceIntakes.findUnique({ where: { sourceKey: derivedKey } });
  if (byDerivedKey) return byDerivedKey;

  const normalizedUrl = new URL(sourceUrl).toString().replace(/\/$/, '');
  const matchingPage = await db.affiliateSourceIntakePages.findFirst({
    where: {
      OR: [
        { url: normalizedUrl },
        { canonicalUrl: normalizedUrl },
        { url: sourceUrl },
        { canonicalUrl: sourceUrl },
      ],
    },
    select: { intakeId: true },
  });
  if (!matchingPage) return null;
  return db.affiliateSourceIntakes.findUnique({ where: { id: matchingPage.intakeId } });
};

const listIntakes = async (db: any, query?: string) => {
  const rows = await db.affiliateSourceIntakes.findMany({
    where: query
      ? {
          OR: [
            { sourceKey: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { baseUrl: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ name: 'asc' }, { sourceKey: 'asc' }],
  });
  const summaries = [];
  for (const intake of rows) {
    const [pages, latestRun] = await Promise.all([
      db.affiliateSourceIntakePages.findMany({
        where: { intakeId: intake.id, status: 'ACTIVE' },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { url: true, role: true, robotsStatus: true },
      }),
      db.affiliateSourceIntakeRuns.findFirst({
        where: { intakeId: intake.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, provider: true, finishedAt: true },
      }),
    ]);
    summaries.push({
      sourceKey: intake.sourceKey,
      name: intake.name,
      baseUrl: intake.baseUrl,
      complianceStatus: intake.complianceStatus,
      latestRun,
      pages,
    });
  }
  return summaries;
};

const main = async () => {
  const sourceKey = readOption('--source-key');
  const sourceUrl = readOption('--url');
  const requestedRunId = readOption('--run-id');
  const { prisma } = await import('../src/lib/prisma');
  const {
    getAffiliateSourceIntakeContext,
    readAffiliateSourceIntakeArtifact,
  } = await import('../src/server/affiliateImports/sourceIntake');

  const db = prisma as any;
  try {
    if (process.argv.includes('--list')) {
      console.log(JSON.stringify({
        environment: useLive ? 'live' : 'local',
        intakes: await listIntakes(db, readOption('--search')),
      }, null, 2));
      return;
    }
    if (!sourceKey && !sourceUrl) {
      throw new Error('Provide --source-key <key> or --url <public-url>. Use --list to inspect available intakes.');
    }

    const intake = await resolveIntake(db, sourceKey, sourceUrl);
    if (!intake) {
      throw new Error(`Affiliate source intake not found for ${sourceKey ?? sourceUrl}.`);
    }
    const initial = await getAffiliateSourceIntakeContext(intake.id, requestedRunId);
    const run = selectAffiliateSourceIntakeExportRun(initial.runs, requestedRunId);
    if (!run) throw new Error('No exportable intake run was found.');
    const context = initial.selectedRunId === run.id
      ? initial
      : await getAffiliateSourceIntakeContext(intake.id, run.id);
    const outputDir = path.resolve('output', 'affiliate-intakes', safeName(intake.sourceKey), safeName(run.id));
    await mkdir(outputDir, { recursive: true });

    const exportedArtifacts: Array<{
      id: string;
      kind: string;
      contentHash: string;
      sourceUrl?: string | null;
      finalUrl?: string | null;
      localPath: string;
      [key: string]: any;
    }> = [];
    for (const [index, artifact] of context.artifacts.entries()) {
      const filename = `${String(index + 1).padStart(3, '0')}-${safeName(artifact.kind)}-${safeName(artifact.id)}${extensionFor(artifact)}`;
      const localPath = path.join(outputDir, filename);
      const stored = await readAffiliateSourceIntakeArtifact(intake.id, artifact.id);
      await pipeline(stored.object.stream, createWriteStream(localPath));
      exportedArtifacts.push({
        ...artifact,
        localPath: filename,
        file: {
          originalName: stored.file.originalName,
          mimeType: stored.file.mimeType,
          sizeBytes: stored.file.sizeBytes,
        },
      });
    }

    const sourceEvidence = buildAffiliateSourceEvidence({
      environment: useLive ? 'live' : 'local',
      intake: context.intake,
      run,
      pages: context.pages,
      artifacts: exportedArtifacts,
    });
    const manifest = {
      exportedAt: new Date().toISOString(),
      sourceEvidence,
      intake: context.intake,
      pages: context.pages,
      run,
      artifacts: exportedArtifacts,
    };
    await Promise.all([
      writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
      writeFile(path.join(outputDir, 'source-evidence.json'), `${JSON.stringify(sourceEvidence, null, 2)}\n`, 'utf8'),
      writeFile(path.join(outputDir, 'SOURCE-EVIDENCE.md'), renderAffiliateSourceEvidenceMarkdown(sourceEvidence), 'utf8'),
    ]);
    console.log(JSON.stringify({
      environment: sourceEvidence.environment,
      sourceKey: intake.sourceKey,
      runId: run.id,
      outputDir,
      artifactCount: exportedArtifacts.length,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:intake:export] failed', error);
  process.exitCode = 1;
});
