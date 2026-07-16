import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import { getStorageProvider, type StorageGetResult } from '@/lib/storageProvider';

export const INTAKE_TEXT_ARTIFACT_LIMIT_BYTES = 5 * 1024 * 1024;
export const INTAKE_IMAGE_ARTIFACT_LIMIT_BYTES = 3 * 1024 * 1024;
export const INTAKE_RUN_ARTIFACT_LIMIT_BYTES = 20 * 1024 * 1024;

export type AffiliateSourceIntakeArtifactKind =
  | 'ROBOTS'
  | 'PROVIDER_MAP_REQUEST_JSON'
  | 'PROVIDER_MAP_RESPONSE_JSON'
  | 'PROVIDER_SCRAPE_REQUEST_JSON'
  | 'PROVIDER_SCRAPE_RESPONSE_JSON'
  | 'DISCOVERED_URLS'
  | 'PAGE_MARKDOWN'
  | 'PAGE_HTML'
  | 'PAGE_LINKS'
  | 'PAGE_SCREENSHOT'
  | 'PAGE_BRANDING'
  | 'PAGE_IMAGES'
  | 'LOGO_CANDIDATE'
  | 'POLICY_NOTE';

export type PersistAffiliateSourceIntakeArtifactInput = {
  intakeId: string;
  pageId?: string | null;
  runId: string;
  kind: AffiliateSourceIntakeArtifactKind;
  data: Buffer;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  provider?: string | null;
  httpStatus?: number | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown> | null;
  originalName?: string | null;
  now?: Date;
};

type IntakeArtifactRow = {
  id: string;
  intakeId: string;
  pageId?: string | null;
  runId: string;
  kind: string;
  fileId: string;
  contentHash: string;
  sizeBytes?: number | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  metadata?: unknown;
};

const artifactPrisma = () => ({
  artifacts: (prisma as any).affiliateSourceIntakeArtifacts,
  files: (prisma as any).file,
});

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');

const safeFilenamePart = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'artifact';

const extensionFor = (kind: AffiliateSourceIntakeArtifactKind, mimeType?: string | null): string => {
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  if (mimeType?.includes('webp')) return 'webp';
  if (mimeType?.includes('svg')) return 'svg';
  if (mimeType?.includes('html')) return 'html';
  if (kind === 'PAGE_MARKDOWN') return 'md';
  if (kind.endsWith('_JSON') || kind === 'DISCOVERED_URLS' || kind === 'PAGE_LINKS' || kind === 'PAGE_BRANDING' || kind === 'PAGE_IMAGES') {
    return 'json';
  }
  return 'txt';
};

const defaultArtifactName = (
  kind: AffiliateSourceIntakeArtifactKind,
  contentHash: string,
  mimeType?: string | null,
): string => `${safeFilenamePart(kind)}-${contentHash.slice(0, 12)}.${extensionFor(kind, mimeType)}`;

const isImageArtifact = (kind: AffiliateSourceIntakeArtifactKind): boolean => (
  kind === 'PAGE_SCREENSHOT' || kind === 'LOGO_CANDIDATE'
);

export const assertAffiliateIntakeArtifactSize = (
  kind: AffiliateSourceIntakeArtifactKind,
  sizeBytes: number,
): void => {
  const limit = isImageArtifact(kind)
    ? INTAKE_IMAGE_ARTIFACT_LIMIT_BYTES
    : INTAKE_TEXT_ARTIFACT_LIMIT_BYTES;
  if (sizeBytes > limit) {
    throw new Error(`${kind} exceeds the ${limit} byte artifact limit.`);
  }
};

export const persistAffiliateSourceIntakeArtifact = async (
  input: PersistAffiliateSourceIntakeArtifactInput,
): Promise<IntakeArtifactRow> => {
  assertAffiliateIntakeArtifactSize(input.kind, input.data.length);
  const { artifacts, files } = artifactPrisma();
  const contentHash = sha256(input.data);
  const dedupeKey = sha256([
    input.runId,
    input.pageId ?? '',
    input.kind,
    input.sourceUrl ?? '',
    input.finalUrl ?? '',
  ].join('|'));
  const existingRunArtifact = await artifacts.findUnique({ where: { dedupeKey } });
  if (existingRunArtifact) return existingRunArtifact as IntakeArtifactRow;

  const reusableArtifact = await artifacts.findFirst({
    where: {
      intakeId: input.intakeId,
      kind: input.kind,
      contentHash,
      sourceUrl: input.sourceUrl ?? null,
    },
    orderBy: { createdAt: 'desc' },
  });

  let fileId = reusableArtifact?.fileId as string | undefined;
  if (fileId) {
    const file = await files.findUnique({ where: { id: fileId } });
    if (!file) fileId = undefined;
  }

  const now = input.now ?? new Date();
  if (!fileId) {
    const originalName = input.originalName?.trim()
      || defaultArtifactName(input.kind, contentHash, input.mimeType);
    const stored = await getStorageProvider().putObject({
      data: input.data,
      originalName,
      contentType: input.mimeType,
    });
    fileId = createId();
    await files.create({
      data: {
        id: fileId,
        uploaderId: null,
        organizationId: null,
        bucket: stored.bucket ?? null,
        originalName,
        mimeType: stored.contentType ?? input.mimeType ?? null,
        sizeBytes: stored.sizeBytes,
        path: stored.key,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return artifacts.create({
    data: {
      id: createId(),
      intakeId: input.intakeId,
      pageId: input.pageId ?? null,
      runId: input.runId,
      kind: input.kind,
      sourceUrl: input.sourceUrl ?? null,
      finalUrl: input.finalUrl ?? null,
      provider: input.provider ?? null,
      httpStatus: input.httpStatus ?? null,
      contentHash,
      dedupeKey,
      fileId,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.data.length,
      retainUntil: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      metadata: input.metadata ?? null,
    },
  }) as Promise<IntakeArtifactRow>;
};

export const readAffiliateSourceIntakeArtifact = async (
  intakeId: string,
  artifactId: string,
): Promise<{ artifact: IntakeArtifactRow; file: Record<string, unknown>; object: StorageGetResult }> => {
  const { artifacts, files } = artifactPrisma();
  const artifact = await artifacts.findFirst({ where: { id: artifactId, intakeId } }) as IntakeArtifactRow | null;
  if (!artifact) throw new Error('Affiliate source intake artifact not found.');
  const file = await files.findUnique({ where: { id: artifact.fileId } }) as Record<string, unknown> | null;
  if (!file) throw new Error('Affiliate source intake artifact file not found.');
  const object = await getStorageProvider().getObjectStream({
    key: String(file.path),
    bucket: typeof file.bucket === 'string' ? file.bucket : null,
  });
  return { artifact, file, object };
};
