import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { fileExists, readLocalFile } from '@/lib/storage';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!session.isAdmin && file.uploaderId && file.uploaderId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const exists = await fileExists(file.path);
    if (!exists) {
      return NextResponse.json({ error: 'File missing' }, { status: 404 });
    }

    const data = await readLocalFile(file.path);
    const contentType = file.mimeType || 'application/octet-stream';
    const downloadName = file.originalName || path.basename(file.path);
    const body = new Uint8Array(data);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.byteLength.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('File download failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
