import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveUserEmail = async (userId: string): Promise<string | null> => {
  const [sensitive, auth] = await Promise.all([
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: { email: true },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);
  return normalizeEmail(sensitive?.email) ?? normalizeEmail(auth?.email) ?? null;
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const documentId = params.get('documentId');
  const templateId = params.get('templateId');
  const eventId = params.get('eventId');
  const teamId = params.get('teamId');
  const userId = params.get('userId') ?? session.userId;

  if (!session.isAdmin && userId !== session.userId) {
    const parentLink = await prisma.parentChildLinks.findFirst({
      where: {
        parentId: session.userId,
        childId: userId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!parentLink) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const [parentEmail, childEmail] = await Promise.all([
      resolveUserEmail(session.userId),
      resolveUserEmail(userId),
    ]);
    if (!parentEmail || !childEmail || parentEmail !== childEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const where: any = { userId };
  if (documentId) where.signedDocumentId = documentId;
  if (templateId) where.templateId = templateId;
  if (eventId) where.eventId = eventId;
  if (teamId) where.teamId = teamId;

  const docs = await prisma.signedDocuments.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ signedDocuments: docs }, { status: 200 });
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  return NextResponse.json(
    { error: 'Direct signed-document creation is not supported. Use a scoped signing workflow.' },
    { status: 410 },
  );
}
