import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { canManageEvent } from '@/server/accessControl';

export const dynamic = 'force-dynamic';

const QR_CODE_SIZE = 1024;
const QR_CODE_MARGIN = 4;
const LOGO_SIZE = 188;
const LOGO_PLATE_SIZE = 248;
const RESTRICTED_EVENT_STATES = new Set(['TEMPLATE', 'UNPUBLISHED', 'PRIVATE', 'DRAFT']);

const buildEventUrl = (req: NextRequest, eventId: string): string => {
  const origin = getRequestOrigin(req);
  return new URL(`/events/${encodeURIComponent(eventId)}`, origin).toString();
};

const buildLogoPlateSvg = (): Buffer => Buffer.from(`
<svg width="${LOGO_PLATE_SIZE}" height="${LOGO_PLATE_SIZE}" viewBox="0 0 ${LOGO_PLATE_SIZE} ${LOGO_PLATE_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${LOGO_PLATE_SIZE}" height="${LOGO_PLATE_SIZE}" rx="48" fill="#ffffff"/>
  <rect x="8" y="8" width="${LOGO_PLATE_SIZE - 16}" height="${LOGO_PLATE_SIZE - 16}" rx="40" fill="#ffffff" stroke="#e5e7eb" stroke-width="4"/>
</svg>
`);

const buildBrandedQrPng = async (eventUrl: string): Promise<Buffer> => {
  const qrPng = await QRCode.toBuffer(eventUrl, {
    errorCorrectionLevel: 'H',
    margin: QR_CODE_MARGIN,
    type: 'png',
    width: QR_CODE_SIZE,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  });

  const logoPath = path.join(process.cwd(), 'public', 'bracketiq-shield.svg');
  const logoSvg = await readFile(logoPath);
  const logoPng = await sharp(logoSvg)
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain' })
    .png()
    .toBuffer();

  const plateOffset = Math.round((QR_CODE_SIZE - LOGO_PLATE_SIZE) / 2);
  const logoOffset = Math.round((QR_CODE_SIZE - LOGO_SIZE) / 2);

  return sharp(qrPng)
    .composite([
      {
        input: buildLogoPlateSvg(),
        left: plateOffset,
        top: plateOffset,
      },
      {
        input: logoPng,
        left: logoOffset,
        top: logoOffset,
      },
    ])
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
    const qrPng = await buildBrandedQrPng(eventUrl);
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
