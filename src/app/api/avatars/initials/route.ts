import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const palette = [
  { bg: '#FDE68A', text: '#92400E' },
  { bg: '#BFDBFE', text: '#1D4ED8' },
  { bg: '#BBF7D0', text: '#166534' },
  { bg: '#FED7AA', text: '#9A3412' },
  { bg: '#E9D5FF', text: '#6B21A8' },
  { bg: '#FBCFE8', text: '#9D174D' },
  { bg: '#BAE6FD', text: '#0C4A6E' },
  { bg: '#C7D2FE', text: '#3730A3' },
];

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const getInitials = (name: string): string => {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const clampSize = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export async function GET(req: NextRequest) {
  try {
    const nameParam = req.nextUrl.searchParams.get('name')?.trim();
    const sizeParam = req.nextUrl.searchParams.get('size');
    const requestedSize = sizeParam ? Number.parseInt(sizeParam, 10) : 64;
    const size = clampSize(Number.isFinite(requestedSize) ? requestedSize : 64, 16, 512);
    const name = nameParam && nameParam.length > 0 ? nameParam : 'User';
    const initials = getInitials(name);
    const paletteIndex = hashString(name) % palette.length;
    const colors = palette[paletteIndex];
    const fontSize = Math.round(size * 0.42);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${initials}">
  <rect width="${size}" height="${size}" rx="${size / 2}" ry="${size / 2}" fill="${colors.bg}" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${colors.text}">${initials}</text>
</svg>`;

    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    console.error('Initials avatar failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
