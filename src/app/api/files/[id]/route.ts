import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getStorageProvider } from '@/lib/storageProvider';
import { summarizeErrorForLog } from '@/lib/serverErrorLog';
import path from 'path';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
    const data = await streamToBuffer(streamResult.stream);
    const contentType = file.mimeType || streamResult.contentType || 'application/octet-stream';
    const downloadName = file.originalName || path.basename(file.path);
    const body = new Uint8Array(data);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': body.byteLength.toString(),
        'Content-Disposition': `inline; filename="${encodeURIComponent(downloadName)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('File download failed', summarizeErrorForLog(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(req);
    const { id } = await params;
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!session.isAdmin) {
      if (!file.uploaderId || file.uploaderId !== session.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const [users, teams, events, organizations] = await Promise.all([
      prisma.userData.findMany({ where: { profileImageId: file.id }, select: { id: true } }),
      prisma.teams.findMany({ where: { profileImageId: file.id }, select: { id: true } }),
      prisma.events.findMany({ where: { imageId: file.id }, select: { id: true } }),
      prisma.organizations.findMany({ where: { logoId: file.id }, select: { id: true } }),
    ]);

    const inUse = users.length || teams.length || events.length || organizations.length;
    if (inUse) {
      return NextResponse.json(
        {
          error: 'File is currently assigned and cannot be deleted.',
          references: {
            users: users.map((row) => row.id),
            teams: teams.map((row) => row.id),
            events: events.map((row) => row.id),
            organizations: organizations.map((row) => row.id),
          },
        },
        { status: 409 },
      );
    }

    const storage = getStorageProvider();
    await storage.deleteObject({ key: file.path, bucket: file.bucket });
    await prisma.file.delete({ where: { id: file.id } });

    const usersWithUploads = await prisma.userData.findMany({
      where: { uploadedImages: { has: file.id } },
      select: { id: true, uploadedImages: true },
    });

    await Promise.all(
      usersWithUploads.map((user) =>
        prisma.userData.update({
          where: { id: user.id },
          data: { uploadedImages: user.uploadedImages.filter((imgId) => imgId !== file.id) },
        }),
      ),
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('File delete failed', summarizeErrorForLog(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
