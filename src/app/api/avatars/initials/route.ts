import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getEntityColorPair } from '@/lib/entityColors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const extractWordInitial = (word: string): string => {
  const chars = Array.from(word.trim());
  const firstAlphaNumeric = chars.find((char) => /[\p{L}\p{N}]/u.test(char));
  return (firstAlphaNumeric ?? chars[0] ?? '').toUpperCase();
};

const getInitials = (name: string): string => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return 'U';

  if (parts.length === 1) {
    const chars = Array.from(parts[0]).filter((char) => /[\p{L}\p{N}]/u.test(char));
    const fallback = chars.length > 0 ? chars : Array.from(parts[0]);
    const oneWordInitials = fallback.slice(0, 3).join('');
    return (oneWordInitials || 'U').toUpperCase();
  }

  const multiWordInitials = parts
    .slice(0, 3)
    .map(extractWordInitial)
    .join('');

  return (multiWordInitials || 'U').toUpperCase();
};

const clampSize = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const resolveFontSize = (size: number, initialsLength: number): number => {
  if (initialsLength >= 3) return Math.round(size * 0.34);
  if (initialsLength === 2) return Math.round(size * 0.42);
  return Math.round(size * 0.5);
};

export async function GET(req: NextRequest) {
  try {
    const nameParam = req.nextUrl.searchParams.get('name')?.trim();
    const colorSeedParam = req.nextUrl.searchParams.get('colorSeed')?.trim();
    const sizeParam = req.nextUrl.searchParams.get('size');
    const formatParam = req.nextUrl.searchParams.get('format')?.trim().toLowerCase();
    const qualityParam = req.nextUrl.searchParams.get('quality');
    const requestedSize = sizeParam ? Number.parseInt(sizeParam, 10) : 64;
    const size = clampSize(Number.isFinite(requestedSize) ? requestedSize : 64, 16, 512);
    const requestedQuality = qualityParam ? Number.parseInt(qualityParam, 10) : 92;
    const quality = clampSize(Number.isFinite(requestedQuality) ? requestedQuality : 92, 1, 100);
    const format = (formatParam === 'png' || formatParam === 'jpg' || formatParam === 'jpeg' || formatParam === 'webp')
      ? formatParam
      : 'svg';
    const name = nameParam && nameParam.length > 0 ? nameParam : 'User';
    const colorSeed = colorSeedParam && colorSeedParam.length > 0 ? colorSeedParam : name;
    const initials = getInitials(name);
    const colors = getEntityColorPair(colorSeed);
    const fontSize = resolveFontSize(size, initials.length);
    const escapedInitials = escapeXml(initials);
    const escapedAriaLabel = escapeXml(`${initials} avatar`);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapedAriaLabel}">
  <rect width="${size}" height="${size}" rx="${size / 2}" ry="${size / 2}" fill="${colors.bg}" />
  <text x="50%" y="50%" dy="0.035em" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${colors.text}">${escapedInitials}</text>
</svg>`;

    if (format === 'svg') {
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      });
    }

    const rasterized = sharp(Buffer.from(svg))
      .resize(size, size, { fit: 'cover' });

    let body: Buffer;
    let contentType: string;
    switch (format) {
      case 'png':
        body = await rasterized.png().toBuffer();
        contentType = 'image/png';
        break;
      case 'jpg':
      case 'jpeg':
        body = await rasterized.jpeg({ quality }).toBuffer();
        contentType = 'image/jpeg';
        break;
      case 'webp':
        body = await rasterized.webp({ quality }).toBuffer();
        contentType = 'image/webp';
        break;
      default:
        body = Buffer.from(svg);
        contentType = 'image/svg+xml';
        break;
    }

    const responseBody = new Uint8Array(body);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });

  } catch (error) {
    console.error('Initials avatar failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
