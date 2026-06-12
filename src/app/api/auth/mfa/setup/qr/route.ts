import { NextRequest, NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import QRCodeStyling, { type Options as QRCodeStylingOptions } from 'qr-code-styling';
import sharp from 'sharp';
import { getTotpSetupQrPayload, isTotpMfaError } from '@/server/authTotpMfa';

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

const buildAuthenticatorQrPng = async (otpauthUri: string): Promise<Buffer> => {
  const qrCode = new QRCodeStyling({
    width: QR_CODE_SIZE,
    height: QR_CODE_SIZE,
    type: 'svg',
    jsdom: JSDOM,
    data: otpauthUri,
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
  const challengeId = req.nextUrl.searchParams.get('challengeId')?.trim() ?? '';
  if (!challengeId) {
    return NextResponse.json({ error: 'Missing authenticator challenge.' }, { status: 400 });
  }

  try {
    const { otpauthUri } = await getTotpSetupQrPayload({ challengeId });
    const qrPng = await buildAuthenticatorQrPng(otpauthUri);
    return new NextResponse(new Uint8Array(qrPng), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (isTotpMfaError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Failed to generate authenticator QR code:', error);
    return NextResponse.json({ error: 'Failed to generate authenticator QR code.' }, { status: 500 });
  }
}
