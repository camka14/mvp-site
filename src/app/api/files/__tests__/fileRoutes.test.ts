/** @jest-environment node */

import { NextRequest } from 'next/server';
import { Readable } from 'stream';
import sharp from 'sharp';

const prismaMock = {
  file: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  teams: {
    findMany: jest.fn(),
  },
  events: {
    findMany: jest.fn(),
  },
  organizations: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: jest.fn() }));
jest.mock('@/lib/storageProvider', () => ({ getStorageProvider: jest.fn() }));
jest.mock('@/server/fileAccess', () => ({ assertFileReadAccess: jest.fn() }));

import { POST } from '@/app/api/files/upload/route';
import { GET, DELETE } from '@/app/api/files/[id]/route';
import { GET as PREVIEW_GET } from '@/app/api/files/[id]/preview/route';

const requireSessionMock = jest.requireMock('@/lib/permissions').requireSession as jest.Mock;
const getStorageProviderMock = jest.requireMock('@/lib/storageProvider').getStorageProvider as jest.Mock;
const assertFileReadAccessMock = jest.requireMock('@/server/fileAccess').assertFileReadAccess as jest.Mock;

const buildFormRequest = (file: File): NextRequest => {
  const form = new FormData();
  form.append('file', file);
  return new NextRequest('http://localhost/api/files/upload', {
    method: 'POST',
    body: form,
  });
};

describe('file routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertFileReadAccessMock.mockResolvedValue(undefined);
  });

  describe('POST /api/files/upload', () => {
    it('rejects files larger than 10MB', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      const storageProvider = { putObject: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const bigFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', {
        type: 'image/png',
      });
      const res = await POST(buildFormRequest(bigFile));

      expect(res.status).toBe(413);
      expect(storageProvider.putObject).not.toHaveBeenCalled();
    });

    it('rejects non-image uploads', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      const storageProvider = { putObject: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const badFile = new File([new Uint8Array([1, 2, 3])], 'bad.pdf', { type: 'application/pdf' });
      const res = await POST(buildFormRequest(badFile));

      expect(res.status).toBe(415);
      expect(storageProvider.putObject).not.toHaveBeenCalled();
    });

    it('rejects GIF uploads', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      const storageProvider = { putObject: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const gifFile = new File([new Uint8Array([71, 73, 70, 56])], 'animated.gif', { type: 'image/gif' });
      const res = await POST(buildFormRequest(gifFile));

      expect(res.status).toBe(415);
      expect(storageProvider.putObject).not.toHaveBeenCalled();
    });

    it('stores image metadata and returns a file record', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      const storageProvider = {
        putObject: jest.fn().mockResolvedValue({ key: 'key.png', bucket: 'bucket', sizeBytes: 3 }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      prismaMock.file.create.mockResolvedValue({
        id: 'file_1',
        organizationId: null,
        uploaderId: 'user_1',
        originalName: 'file.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        path: 'key.png',
        bucket: 'bucket',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const file = new File([new Uint8Array([1, 2, 3])], 'file.png', { type: 'image/png' });
      const res = await POST(buildFormRequest(file));
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(storageProvider.putObject).toHaveBeenCalled();
      expect(prismaMock.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            path: 'key.png',
            bucket: 'bucket',
            mimeType: 'image/png',
          }),
        }),
      );
      expect(json.file.id).toBe('file_1');
    });

    it('accepts SVG uploads and stores them with the SVG content type', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      const storageProvider = {
        putObject: jest.fn().mockResolvedValue({ key: 'key.svg', bucket: 'bucket', sizeBytes: 109 }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      prismaMock.file.create.mockResolvedValue({
        id: 'file_svg',
        organizationId: null,
        uploaderId: 'user_1',
        originalName: 'event-logo.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 109,
        path: 'key.svg',
        bucket: 'bucket',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
      const file = new File([svg], 'event-logo.svg', { type: 'image/svg+xml' });
      const res = await POST(buildFormRequest(file));

      expect(res.status).toBe(201);
      expect(storageProvider.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/svg+xml',
          originalName: 'event-logo.svg',
        }),
      );
      expect(prismaMock.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mimeType: 'image/svg+xml',
          }),
        }),
      );
    });
  });

  describe('GET /api/files/:id', () => {
    it('serves the file without auth', async () => {
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_1',
        path: 'path/file.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'file.png',
      });

      const storageProvider = {
        getObjectStream: jest.fn().mockResolvedValue({
          stream: Readable.from([Buffer.from('data')]),
          contentType: 'image/png',
        }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_1');
      const res = await GET(request, { params: Promise.resolve({ id: 'file_1' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toContain('inline');
    });

    it('does not fetch protected payment proofs after access is denied', async () => {
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'payment_proof',
        path: 'path/proof.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'proof.png',
      });
      const storageProvider = { getObjectStream: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);
      assertFileReadAccessMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));

      const request = new NextRequest('http://localhost/api/files/payment_proof');
      const res = await GET(request, { params: Promise.resolve({ id: 'payment_proof' }) });

      expect(res.status).toBe(403);
      expect(storageProvider.getObjectStream).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/files/:id/preview', () => {
    it('rejects oversized or malformed resize dimensions before reading storage', async () => {
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_preview_limits',
        path: 'path/preview.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'preview.png',
        sizeBytes: 100,
      });
      const storageProvider = { getObjectStream: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);

      for (const query of ['w=2049', 'w=100&h=invalid', 'w=2000&h=2001']) {
        const request = new NextRequest(`http://localhost/api/files/file_preview_limits/preview?${query}`);
        const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'file_preview_limits' }) });
        expect(res.status).toBe(400);
      }

      expect(storageProvider.getObjectStream).not.toHaveBeenCalled();
    });

    it('rejects an oversized preview source before buffering it', async () => {
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_preview_source_limit',
        path: 'path/large.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'large.png',
        sizeBytes: 10 * 1024 * 1024 + 1,
      });
      const storageProvider = { getObjectStream: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_preview_source_limit/preview?w=64&h=64');
      const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'file_preview_source_limit' }) });

      expect(res.status).toBe(413);
      expect(storageProvider.getObjectStream).not.toHaveBeenCalled();
    });

    it('resizes images with cover crop', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 20,
          height: 10,
          channels: 3,
          background: '#ff0000',
        },
      })
        .png()
        .toBuffer();

      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_2',
        path: 'path/file.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'file.png',
      });

      const storageProvider = {
        getObjectStream: jest.fn().mockResolvedValue({
          stream: Readable.from([inputBuffer]),
          contentType: 'image/png',
        }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_2/preview?w=8&h=8');
      const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'file_2' }) });
      const outputBuffer = Buffer.from(await res.arrayBuffer());
      const metadata = await sharp(outputBuffer).metadata();

      expect(res.status).toBe(200);
      expect(metadata.width).toBe(8);
      expect(metadata.height).toBe(8);
    });

    it('does not generate a protected proof preview after access is denied', async () => {
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'payment_proof_preview',
        path: 'path/proof.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'proof.png',
      });
      const storageProvider = { getObjectStream: jest.fn() };
      getStorageProviderMock.mockReturnValue(storageProvider);
      assertFileReadAccessMock.mockRejectedValueOnce(new Response('Forbidden', { status: 403 }));

      const request = new NextRequest('http://localhost/api/files/payment_proof_preview/preview?w=8&h=8');
      const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'payment_proof_preview' }) });

      expect(res.status).toBe(403);
      expect(storageProvider.getObjectStream).not.toHaveBeenCalled();
    });

    it('trims transparent padding before resizing when requested', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 20,
          height: 20,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 20,
                height: 4,
                channels: 4,
                background: '#ff0000',
              },
            })
              .png()
              .toBuffer(),
            left: 0,
            top: 8,
          },
        ])
        .png()
        .toBuffer();

      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_trimmed',
        path: 'path/file.png',
        bucket: null,
        mimeType: 'image/png',
        originalName: 'file.png',
      });

      const storageProvider = {
        getObjectStream: jest.fn().mockResolvedValue({
          stream: Readable.from([inputBuffer]),
          contentType: 'image/png',
        }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_trimmed/preview?w=10&trim=true');
      const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'file_trimmed' }) });
      const outputBuffer = Buffer.from(await res.arrayBuffer());
      const metadata = await sharp(outputBuffer).metadata();

      expect(res.status).toBe(200);
      expect(metadata.width).toBe(10);
      expect(metadata.height).toBe(2);
    });

    it('serves SVG previews as the original vector even when dimensions are requested', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>';

      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_svg',
        path: 'path/file.svg',
        bucket: null,
        mimeType: 'image/svg+xml',
        originalName: 'file.svg',
      });

      const storageProvider = {
        getObjectStream: jest.fn().mockResolvedValue({
          stream: Readable.from([Buffer.from(svg)]),
          contentType: 'image/svg+xml',
        }),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_svg/preview?w=8&h=8');
      const res = await PREVIEW_GET(request, { params: Promise.resolve({ id: 'file_svg' }) });
      const output = Buffer.from(await res.arrayBuffer()).toString('utf8');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(output).toBe(svg);
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('blocks deletion when file is in use', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_3',
        path: 'path/file.png',
        bucket: null,
        uploaderId: 'user_1',
      });
      prismaMock.userData.findMany.mockResolvedValueOnce([{ id: 'user_1' }]);
      prismaMock.teams.findMany.mockResolvedValueOnce([]);
      prismaMock.events.findMany.mockResolvedValueOnce([{ id: 'event_1' }]);
      prismaMock.organizations.findMany.mockResolvedValueOnce([]);

      const storageProvider = {
        deleteObject: jest.fn(),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_3', { method: 'DELETE' });
      const res = await DELETE(request, { params: Promise.resolve({ id: 'file_3' }) });

      expect(res.status).toBe(409);
      expect(storageProvider.deleteObject).not.toHaveBeenCalled();
    });

    it('deletes file and cleans up uploadedImages', async () => {
      requireSessionMock.mockResolvedValue({ userId: 'user_1', isAdmin: false });
      prismaMock.file.findUnique.mockResolvedValue({
        id: 'file_4',
        path: 'path/file.png',
        bucket: null,
        uploaderId: 'user_1',
      });
      prismaMock.userData.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'user_1', uploadedImages: ['file_4', 'other'] },
        ]);
      prismaMock.teams.findMany.mockResolvedValueOnce([]);
      prismaMock.events.findMany.mockResolvedValueOnce([]);
      prismaMock.organizations.findMany.mockResolvedValueOnce([]);
      prismaMock.file.delete.mockResolvedValueOnce({ id: 'file_4' });
      prismaMock.userData.update.mockResolvedValueOnce({ id: 'user_1' });

      const storageProvider = {
        deleteObject: jest.fn().mockResolvedValue(undefined),
      };
      getStorageProviderMock.mockReturnValue(storageProvider);

      const request = new NextRequest('http://localhost/api/files/file_4', { method: 'DELETE' });
      const res = await DELETE(request, { params: Promise.resolve({ id: 'file_4' }) });

      expect(res.status).toBe(200);
      expect(storageProvider.deleteObject).toHaveBeenCalled();
      expect(prismaMock.file.delete).toHaveBeenCalled();
      expect(prismaMock.userData.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { uploadedImages: ['other'] },
      });
    });
  });
});
