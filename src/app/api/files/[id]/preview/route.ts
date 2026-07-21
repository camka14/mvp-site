import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStorageProvider } from '@/lib/storageProvider';
import { summarizeErrorForLog } from '@/lib/serverErrorLog';
import { SVG_IMAGE_RESPONSE_HEADERS, isSvgContentType } from '@/lib/imageUploadPolicy';
import { assertFileReadAccess } from '@/server/fileAccess';
import { Readable } from 'stream';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store';
const MAX_PREVIEW_DIMENSION = 2048;
const MAX_PREVIEW_PIXELS = 4_000_000;
const MAX_PREVIEW_SOURCE_BYTES = 10 * 1024 * 1024;

class PreviewLimitError extends Error {}

const streamToBuffer = async (stream: Readable, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxBytes) {
        stream.destroy(new PreviewLimitError('Preview source is too large.'));
        reject(new PreviewLimitError('Preview source is too large.'));
        return;
      }
      chunks.push(buffer);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

type ParsedDimension = { value?: number; error?: string };

const parseDimension = (value: string | null): ParsedDimension => {
  if (!value) return {};
  if (!/^[1-9]\d*$/.test(value)) {
    return { error: 'Preview dimensions must be positive integers.' };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_PREVIEW_DIMENSION) {
    return { error: `Preview dimensions cannot exceed ${MAX_PREVIEW_DIMENSION}px.` };
  }
  return { value: parsed };
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await assertFileReadAccess(req, file.id);

    const widthResult = parseDimension(req.nextUrl.searchParams.get('w'));
    const heightResult = parseDimension(req.nextUrl.searchParams.get('h'));
    if (widthResult.error || heightResult.error) {
      return NextResponse.json({ error: widthResult.error ?? heightResult.error }, { status: 400 });
    }
    const width = widthResult.value;
    const height = heightResult.value;
    const requestedFit = req.nextUrl.searchParams.get('fit');
    const fit = requestedFit === 'inside' || requestedFit === 'contain'
      ? requestedFit
      : 'cover';
    if (width && height && width * height > MAX_PREVIEW_PIXELS) {
      return NextResponse.json(
        { error: `Preview output cannot exceed ${MAX_PREVIEW_PIXELS} pixels.` },
        { status: 400 },
      );
    }
    const trim = req.nextUrl.searchParams.get('trim') === 'true';

    if (Number(file.sizeBytes ?? 0) > MAX_PREVIEW_SOURCE_BYTES) {
      return NextResponse.json({ error: 'Preview source is too large.' }, { status: 413 });
    }

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

    if (Number(streamResult.sizeBytes ?? 0) > MAX_PREVIEW_SOURCE_BYTES) {
      return NextResponse.json({ error: 'Preview source is too large.' }, { status: 413 });
    }

    const data = await streamToBuffer(streamResult.stream, MAX_PREVIEW_SOURCE_BYTES);
    const contentType = file.mimeType || streamResult.contentType || 'application/octet-stream';
    const isSvg = isSvgContentType(contentType);

    if ((!width && !height) || isSvg) {
      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': data.byteLength.toString(),
          'Cache-Control': CACHE_CONTROL,
          'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName || file.path)}"`,
          ...(isSvg ? SVG_IMAGE_RESPONSE_HEADERS : {}),
        },
      });
    }

    const resizeOptions: sharp.ResizeOptions = width && height
      ? {
        width,
        height,
      }
      : {
        width: width ?? MAX_PREVIEW_DIMENSION,
        height: height ?? MAX_PREVIEW_DIMENSION,
        fit: 'inside',
      };

    if (width && height) {
      resizeOptions.fit = fit;
      resizeOptions.position = 'center';
    }

    let pipeline = sharp(data);
    if (trim) {
      pipeline = pipeline.trim();
    }

    const output = await pipeline.resize(resizeOptions).toBuffer();

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': output.byteLength.toString(),
        'Cache-Control': CACHE_CONTROL,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName || file.path)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof PreviewLimitError) {
      return NextResponse.json({ error: 'Preview source is too large.' }, { status: 413 });
    }
    console.error('File preview failed', summarizeErrorForLog(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
