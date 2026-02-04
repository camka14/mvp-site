import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storageProvider';
import { Readable } from 'stream';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const parseDimension = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const width = parseDimension(req.nextUrl.searchParams.get('w'));
    const height = parseDimension(req.nextUrl.searchParams.get('h'));

    const storage = getStorageProvider();
    let streamResult;
    try {
      streamResult = await storage.getObjectStream({ key: file.path, bucket: file.bucket });
    } catch (error: any) {
      if (error?.message === 'FILE_MISSING') {
        return NextResponse.json({ error: 'File missing' }, { status: 404 });
      }
      throw error;
    }

    const data = await streamToBuffer(streamResult.stream);
    const contentType = file.mimeType || streamResult.contentType || 'application/octet-stream';

    if (!width && !height) {
      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': data.byteLength.toString(),
          'Cache-Control': 'public, max-age=3600',
          'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName || file.path)}"`,
        },
      });
    }

    const resizeOptions: sharp.ResizeOptions = {
      width,
      height,
    };

    if (width && height) {
      resizeOptions.fit = 'cover';
      resizeOptions.position = 'center';
    }

    const output = await sharp(data).resize(resizeOptions).toBuffer();

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': output.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName || file.path)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('File preview failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
