import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

const createSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.any()),
});

const searchSchema = z.object({
  query: z.string().min(1),
});

export async function GET(req: NextRequest) {
  await requireSession(req);
  const params = req.nextUrl.searchParams;
  const query = params.get('query') ?? '';
  const parsed = searchSchema.safeParse({ query });
  if (!parsed.success) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const term = parsed.data.query;
  const users = await prisma.userData.findMany({
    where: {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { userName: { contains: term, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { userName: 'asc' },
  });

  return NextResponse.json({ users }, { status: 200 });
}

export async function POST(req: NextRequest) {
  await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, data } = parsed.data;
  const normalizedData: Record<string, unknown> = { ...data };
  if (normalizedData.dateOfBirth) {
    const parsedDate = new Date(normalizedData.dateOfBirth as any);
    if (!Number.isNaN(parsedDate.getTime())) {
      normalizedData.dateOfBirth = parsedDate;
    }
  }
  const now = new Date();
  const existing = await prisma.userData.findUnique({ where: { id } });
  if (!existing) {
    const userName = typeof normalizedData.userName === 'string' ? normalizedData.userName : id;
    const dateOfBirth = normalizedData.dateOfBirth instanceof Date
      ? normalizedData.dateOfBirth
      : new Date(0);

    if (!userName || Number.isNaN(dateOfBirth.getTime())) {
      return NextResponse.json({ error: 'Missing required user fields' }, { status: 400 });
    }

    const record = await prisma.userData.create({
      data: { id, createdAt: now, updatedAt: now, ...normalizedData, userName, dateOfBirth },
    });
    return NextResponse.json({ user: record }, { status: 201 });
  }
  const record = existing
    ? await prisma.userData.update({ where: { id }, data: { ...normalizedData, updatedAt: now } })
    : null;

  return NextResponse.json({ user: record }, { status: 201 });
}
