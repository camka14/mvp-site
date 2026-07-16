import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import type { Readable } from 'stream';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { readAffiliateSourceIntakeArtifact } from '@/server/affiliateImports/sourceIntake';

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    await requireRazumlyAdmin(req);
    const { id, artifactId } = await params;
    if (!id?.trim() || !artifactId?.trim()) {
      return NextResponse.json({ error: 'Intake and artifact ids are required.' }, { status: 400 });
    }
    const stored = await readAffiliateSourceIntakeArtifact(id.trim(), artifactId.trim());
    const data = await streamToBuffer(stored.object.stream);
    const filename = String(stored.file.originalName ?? path.basename(String(stored.file.path ?? 'artifact')));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': String(stored.file.mimeType ?? stored.object.contentType ?? 'application/octet-stream'),
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Failed to load intake artifact.';
    return NextResponse.json({ error: message }, { status: message.includes('not found') ? 404 : 500 });
  }
}
