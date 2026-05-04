import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import QRCodeStyling, { type Options as QRCodeStylingOptions } from 'qr-code-styling';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { getStorageProvider } from '@/lib/storageProvider';
import { canManageEvent } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const QR_CODE_SIZE = 1024;
const QR_CODE_MARGIN = 48;
const LOGO_SOURCE_SIZE = 512;
const LOGO_CORNER_RADIUS = Math.round(LOGO_SOURCE_SIZE * 0.14);
const QR_LOGO_ASSET = 'BIQ_drawing.svg';
const RESTRICTED_EVENT_STATES = new Set(['TEMPLATE', 'UNPUBLISHED', 'PRIVATE', 'DRAFT']);

type EventQrLogoContext = {
  organizationId?: string | null;
};

type EmbeddedQrLogo = {
  dataUri: string;
  width: number;
  height: number;
};

const buildEventUrl = (req: NextRequest, eventId: string): string => {
  const origin = getRequestOrigin(req);
  return new URL(`/events/${encodeURIComponent(eventId)}`, origin).toString();
};

const toBuffer = async (data: Buffer | Blob | null): Promise<Buffer> => {
  if (!data) {
    throw new Error('QR code renderer returned empty data');
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(await data.arrayBuffer());
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const readStoredFileBuffer = async (fileId: string): Promise<Buffer | null> => {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return null;
  }

  const storage = getStorageProvider();
  const streamResult = await storage.getObjectStream({ key: file.path, bucket: file.bucket });
  return streamToBuffer(streamResult.stream);
};

const resolveQrLogoBuffer = async (context: EventQrLogoContext): Promise<Buffer> => {
  const organizationId = typeof context.organizationId === 'string' ? context.organizationId.trim() : '';
  if (organizationId) {
    const organization = await prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { logoId: true },
    });
    const logoId = typeof organization?.logoId === 'string' ? organization.logoId.trim() : '';
    if (logoId) {
      try {
        const logoBuffer = await readStoredFileBuffer(logoId);
        if (logoBuffer) {
          return logoBuffer;
        }
      } catch (error) {
        console.warn('Failed to load organization logo for event QR code:', error);
      }
    }
  }

  const logoPath = path.join(process.cwd(), 'public', QR_LOGO_ASSET);
  return readFile(logoPath);
};

const createLogoAwareJSDOM = ({ width, height }: EmbeddedQrLogo): typeof JSDOM => {
  class LogoAwareJSDOM extends JSDOM {
    constructor(...args: ConstructorParameters<typeof JSDOM>) {
      super(...args);
      const imageWidth = width;
      const imageHeight = height;
      this.window.Image = class {
        crossOrigin?: string;
        naturalWidth = imageWidth;
        naturalHeight = imageHeight;
        width = imageWidth;
        height = imageHeight;
        onload: (() => void) | null = null;
        private imageSource = '';

        set src(value: string) {
          this.imageSource = value;
          queueMicrotask(() => this.onload?.());
        }

        get src(): string {
          return this.imageSource;
        }
      } as unknown as typeof Image;
    }
  }

  return LogoAwareJSDOM;
};

const buildRoundedLogoMask = (): Buffer => Buffer.from(`
<svg width="${LOGO_SOURCE_SIZE}" height="${LOGO_SOURCE_SIZE}" viewBox="0 0 ${LOGO_SOURCE_SIZE} ${LOGO_SOURCE_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${LOGO_SOURCE_SIZE}" height="${LOGO_SOURCE_SIZE}" rx="${LOGO_CORNER_RADIUS}" ry="${LOGO_CORNER_RADIUS}" fill="#ffffff"/>
</svg>
`);

const buildEmbeddedQrLogo = async (logoBuffer: Buffer): Promise<EmbeddedQrLogo> => {
  const resizedLogoPng = await sharp(logoBuffer)
    .resize(LOGO_SOURCE_SIZE, LOGO_SOURCE_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const roundedLogoPng = await sharp(resizedLogoPng)
    .composite([{ input: buildRoundedLogoMask(), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return {
    dataUri: `data:image/png;base64,${roundedLogoPng.toString('base64')}`,
    width: LOGO_SOURCE_SIZE,
    height: LOGO_SOURCE_SIZE,
  };
};

const buildStyledQrSvg = async (eventUrl: string, logo: EmbeddedQrLogo): Promise<Buffer> => {
  const qrCode = new QRCodeStyling({
    width: QR_CODE_SIZE,
    height: QR_CODE_SIZE,
    type: 'svg',
    jsdom: createLogoAwareJSDOM(logo),
    data: eventUrl,
    image: logo.dataUri,
    margin: QR_CODE_MARGIN,
    qrOptions: {
      errorCorrectionLevel: 'H',
    },
    dotsOptions: {
      color: '#111827',
      type: 'rounded',
    },
    cornersSquareOptions: {
      color: '#111827',
      type: 'extra-rounded',
    },
    cornersDotOptions: {
      color: '#111827',
      type: 'dot',
    },
    backgroundOptions: {
      color: '#ffffff',
    },
    imageOptions: {
      saveAsBlob: false,
      hideBackgroundDots: true,
      imageSize: 0.24,
      margin: 8,
    },
  } satisfies QRCodeStylingOptions);

  return toBuffer(await qrCode.getRawData('svg'));
};

const buildBrandedQrPng = async (eventUrl: string, context: EventQrLogoContext): Promise<Buffer> => {
  const logoBuffer = await resolveQrLogoBuffer(context);
  const embeddedLogo = await buildEmbeddedQrLogo(logoBuffer);
  const qrSvg = await buildStyledQrSvg(eventUrl, embeddedLogo);

  return sharp(qrSvg)
    .png()
    .toBuffer();
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
  if (!normalizedEventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const event = await prisma.events.findUnique({ where: { id: normalizedEventId } });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isRestricted = RESTRICTED_EVENT_STATES.has(String(event.state ?? '').toUpperCase());
  if (isRestricted) {
    let session;
    try {
      session = await requireSession(req);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    }

    if (!(await canManageEvent(session, event))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const eventUrl = buildEventUrl(req, normalizedEventId);
    const qrPng = await buildBrandedQrPng(eventUrl, { organizationId: event.organizationId });
    return new NextResponse(new Uint8Array(qrPng), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': isRestricted
          ? 'private, no-store'
          : 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('Failed to generate event QR code:', error);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
