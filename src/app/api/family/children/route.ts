import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalName } from '@/lib/nameCase';
import { requireSession } from '@/lib/permissions';
import { calculateAgeOnDate } from '@/lib/age';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  dateOfBirth: z.string(),
  relationship: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const links = await prisma.parentChildLinks.findMany({
    where: { parentId: session.userId },
    orderBy: { createdAt: 'desc' },
  });

  const childIds = links.map((link) => link.childId);
  const children = childIds.length
    ? await prisma.userData.findMany({ where: { id: { in: childIds } } })
    : [];

  const childMap = new Map(children.map((child) => [child.id, child]));
  const sensitiveRows = childIds.length
    ? await prisma.sensitiveUserData.findMany({
        where: { userId: { in: childIds } },
        select: { userId: true, email: true },
      })
    : [];
  const emailByUserId = new Map(sensitiveRows.map((row) => [row.userId, row.email]));

  const payload = links.map((link) => {
    const child = childMap.get(link.childId);
    const email = emailByUserId.get(link.childId) ?? null;
    const now = new Date();
    const age = child?.dateOfBirth ? calculateAgeOnDate(child.dateOfBirth, now) : undefined;
    const firstName = normalizeOptionalName(child?.firstName) ?? '';
    const lastName = normalizeOptionalName(child?.lastName) ?? '';
    return {
      userId: link.childId,
      firstName,
      lastName,
      userName: child?.userName?.trim() || null,
      dateOfBirth: child?.dateOfBirth ? child.dateOfBirth.toISOString() : null,
      age,
      linkStatus: link.status.toLowerCase(),
      relationship: link.relationship ?? null,
      email,
      hasEmail: Boolean(email),
    };
  });

  return NextResponse.json({ children: payload }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const childId = crypto.randomUUID();
  const dob = new Date(parsed.data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return NextResponse.json({ error: 'Invalid dateOfBirth' }, { status: 400 });
  }
  const firstName = normalizeOptionalName(parsed.data.firstName);
  const lastName = normalizeOptionalName(parsed.data.lastName);
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
  }

  await prisma.userData.create({
    data: {
      id: childId,
      firstName,
      lastName,
      userName: `${firstName}.${lastName}.${childId.slice(0, 6)}`.toLowerCase(),
      dateOfBirth: dob,
      teamIds: [],
      friendIds: [],
      friendRequestIds: [],
      friendRequestSentIds: [],
      followingIds: [],
      uploadedImages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const link = await prisma.parentChildLinks.create({
    data: {
      id: crypto.randomUUID(),
      parentId: session.userId,
      childId,
      status: 'ACTIVE',
      relationship: parsed.data.relationship ?? null,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ childUserId: childId, linkId: link.id, status: 'active' }, { status: 201 });
}
