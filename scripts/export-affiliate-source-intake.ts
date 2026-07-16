import dotenv from 'dotenv';
import { createWriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

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

const main = async () => {
  const sourceKey = readOption('--source-key');
  if (!sourceKey) throw new Error('--source-key is required.');
  const requestedRunId = readOption('--run-id');
  const { prisma } = await import('../src/lib/prisma');
  const {
    getAffiliateSourceIntakeContext,
    readAffiliateSourceIntakeArtifact,
  } = await import('../src/server/affiliateImports/sourceIntake');

  const intake = await (prisma as any).affiliateSourceIntakes.findUnique({ where: { sourceKey } });
  if (!intake) throw new Error(`Affiliate source intake not found: ${sourceKey}`);
  const initial = await getAffiliateSourceIntakeContext(intake.id, requestedRunId);
  const run = requestedRunId
    ? initial.runs.find((entry: any) => entry.id === requestedRunId)
    : initial.runs.find((entry: any) => ['SUCCEEDED', 'PARTIAL', 'BLOCKED'].includes(entry.status));
  if (!run) throw new Error('No exportable intake run was found.');
  const context = initial.selectedRunId === run.id
    ? initial
    : await getAffiliateSourceIntakeContext(intake.id, run.id);
  const outputDir = path.resolve('output', 'affiliate-intakes', safeName(sourceKey), safeName(run.id));
  await mkdir(outputDir, { recursive: true });

  const exportedArtifacts: Array<Record<string, unknown>> = [];
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

  const manifest = {
    exportedAt: new Date().toISOString(),
    intake: context.intake,
    pages: context.pages,
    run,
    artifacts: exportedArtifacts,
  };
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputDir, artifactCount: exportedArtifacts.length }, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:intake:export] failed', error);
  process.exitCode = 1;
});
