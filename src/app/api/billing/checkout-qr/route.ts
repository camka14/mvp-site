import { NextRequest, NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import QRCodeStyling, { type Options as QRCodeStylingOptions } from 'qr-code-styling';
import sharp from 'sharp';
import { getRequestOrigin } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

const QR_CODE_SIZE = 1024;
const QR_CODE_MARGIN = 48;

const toBuffer = async (data: Buffer | Blob | null): Promise<Buffer> => {
  if (!data) {
    throw new Error('QR code renderer returned empty data');
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(await data.arrayBuffer());
};

const isAllowedCheckoutUrl = (req: NextRequest, targetUrl: URL): boolean => {
  if (targetUrl.origin === 'https://checkout.stripe.com') {
    return true;
  }
  return targetUrl.origin === getRequestOrigin(req);
};

const buildCheckoutQrPng = async (checkoutUrl: string): Promise<Buffer> => {
  const qrCode = new QRCodeStyling({
    width: QR_CODE_SIZE,
    height: QR_CODE_SIZE,
    type: 'svg',
    jsdom: JSDOM,
    data: checkoutUrl,
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
  } satisfies QRCodeStylingOptions);

  const qrSvg = await toBuffer(await qrCode.getRawData('svg'));
  return sharp(qrSvg)
    .png()
    .toBuffer();
};

export async function GET(req: NextRequest) {
  const rawCheckoutUrl = req.nextUrl.searchParams.get('url')?.trim() ?? '';
  if (!rawCheckoutUrl) {
    return NextResponse.json({ error: 'Missing checkout URL.' }, { status: 400 });
  }

  let checkoutUrl: URL;
  try {
    checkoutUrl = new URL(rawCheckoutUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid checkout URL.' }, { status: 400 });
  }

  if (!isAllowedCheckoutUrl(req, checkoutUrl)) {
    return NextResponse.json({ error: 'Unsupported checkout URL.' }, { status: 400 });
  }

  try {
    const qrPng = await buildCheckoutQrPng(checkoutUrl.toString());
    return new NextResponse(new Uint8Array(qrPng), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Failed to generate checkout QR code:', error);
    return NextResponse.json({ error: 'Failed to generate QR code.' }, { status: 500 });
  }
}
