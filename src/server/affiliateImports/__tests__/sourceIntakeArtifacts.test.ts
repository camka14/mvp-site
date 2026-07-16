/** @jest-environment node */

const prismaMock = {
  affiliateSourceIntakeArtifacts: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  file: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};
const putObjectMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => {
  let id = 0;
  return { createId: () => `generated_${++id}` };
});
jest.mock('@/lib/storageProvider', () => ({
  getStorageProvider: () => ({
    putObject: (...args: unknown[]) => putObjectMock(...args),
  }),
}));

import {
  INTAKE_IMAGE_ARTIFACT_LIMIT_BYTES,
  assertAffiliateIntakeArtifactSize,
  persistAffiliateSourceIntakeArtifact,
} from '@/server/affiliateImports/sourceIntakeArtifacts';

describe('affiliate source intake artifacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.affiliateSourceIntakeArtifacts.findUnique.mockResolvedValue(null);
    prismaMock.affiliateSourceIntakeArtifacts.findFirst.mockResolvedValue(null);
    prismaMock.file.findUnique.mockResolvedValue(null);
    prismaMock.file.create.mockResolvedValue({});
    prismaMock.affiliateSourceIntakeArtifacts.create.mockImplementation(async ({ data }) => data);
    putObjectMock.mockResolvedValue({
      key: 'affiliate-intakes/test.png',
      sizeBytes: 4,
      contentType: 'image/png',
    });
  });

  it('rejects oversized image artifacts', () => {
    expect(() => assertAffiliateIntakeArtifactSize(
      'LOGO_CANDIDATE',
      INTAKE_IMAGE_ARTIFACT_LIMIT_BYTES + 1,
    )).toThrow('LOGO_CANDIDATE exceeds');
  });

  it('uploads and records new artifact bytes', async () => {
    const artifact = await persistAffiliateSourceIntakeArtifact({
      intakeId: 'intake_1',
      pageId: 'page_1',
      runId: 'run_1',
      kind: 'LOGO_CANDIDATE',
      data: Buffer.from('logo'),
      sourceUrl: 'https://example.com/logo.png',
      mimeType: 'image/png',
      now: new Date('2026-07-15T12:00:00.000Z'),
    });

    expect(putObjectMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.file.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateSourceIntakeArtifacts.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        intakeId: 'intake_1',
        runId: 'run_1',
        fileId: 'generated_1',
        kind: 'LOGO_CANDIDATE',
        sizeBytes: 4,
      }),
    });
    expect(artifact).toEqual(expect.objectContaining({ kind: 'LOGO_CANDIDATE' }));
  });

  it('reuses a prior file for identical bytes while creating a run artifact', async () => {
    prismaMock.affiliateSourceIntakeArtifacts.findFirst.mockResolvedValue({ fileId: 'file_existing' });
    prismaMock.file.findUnique.mockResolvedValue({ id: 'file_existing' });

    await persistAffiliateSourceIntakeArtifact({
      intakeId: 'intake_1',
      pageId: 'page_1',
      runId: 'run_2',
      kind: 'PAGE_MARKDOWN',
      data: Buffer.from('same content'),
      sourceUrl: 'https://example.com/events',
      mimeType: 'text/markdown',
    });

    expect(putObjectMock).not.toHaveBeenCalled();
    expect(prismaMock.file.create).not.toHaveBeenCalled();
    expect(prismaMock.affiliateSourceIntakeArtifacts.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fileId: 'file_existing', runId: 'run_2' }),
    });
  });
});
