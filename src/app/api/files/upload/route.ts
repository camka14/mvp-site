import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { writeLocalFile } from '@/lib/storage';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const form = await req.formData();
    const file = form.get('file');
    const organizationIdInput = form.get('organizationId');
    const organizationId = typeof organizationIdInput === 'string' ? organizationIdInput.trim() : null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const stored = await writeLocalFile(buffer, file.name, organizationId ?? undefined);

    const record = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: organizationId || null,
        uploaderId: session.userId,
        originalName: file.name,
        mimeType: file.type || null,
        sizeBytes: buffer.length,
        path: stored.relativePath,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        file: {
          id: record.id,
          organizationId: record.organizationId,
          uploaderId: record.uploaderId,
          originalName: record.originalName,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
          path: record.path,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('File upload failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
