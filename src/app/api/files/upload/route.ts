import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getStorageProvider } from '@/lib/storageProvider';
import { summarizeErrorForLog } from '@/lib/serverErrorLog';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const form = await req.formData();
    const file = form.get('file');
    const organizationIdInput = form.get('organizationId');
    const organizationId = typeof organizationIdInput === 'string' ? organizationIdInput.trim() : null;
    const maxFileBytes = 10 * 1024 * 1024;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (file.size > maxFileBytes) {
      return NextResponse.json({ error: 'File size must be 10MB or less' }, { status: 413 });
    }

    const contentType = file.type || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 415 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storage = getStorageProvider();
    const stored = await storage.putObject({
      data: buffer,
      originalName: file.name,
      contentType,
      organizationId: organizationId ?? undefined,
    });

    const record = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: organizationId || null,
        uploaderId: session.userId,
        originalName: file.name,
        mimeType: contentType || null,
        sizeBytes: buffer.length,
        bucket: stored.bucket ?? null,
        path: stored.key,
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
          bucket: record.bucket,
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
    console.error('File upload failed', summarizeErrorForLog(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
