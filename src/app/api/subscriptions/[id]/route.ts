import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.subscriptions.update({
    where: { id },
    data: { status: 'ACTIVE', updatedAt: new Date() },
  });

  return NextResponse.json({ restarted: true }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const subscription = await prisma.subscriptions.findUnique({ where: { id } });
  if (!subscription) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!session.isAdmin && subscription.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.subscriptions.update({
    where: { id },
    data: { status: 'CANCELLED', updatedAt: new Date() },
  });

  return NextResponse.json({ cancelled: true }, { status: 200 });
}
