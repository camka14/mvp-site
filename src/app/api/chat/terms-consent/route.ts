import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import {
  buildChatTermsPayload,
  CHAT_TERMS_VERSION,
} from '@/server/chatTerms';

export const dynamic = 'force-dynamic';

const consentSchema = z.object({
  accepted: z.literal(true),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const user = await prisma.userData.findUnique({
      where: { id: session.userId },
      select: {
        chatTermsAcceptedAt: true,
        chatTermsVersion: true,
      },
    });
    return NextResponse.json(buildChatTermsPayload(user), { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to load chat terms consent state', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = consentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const acceptedAt = new Date();
    const user = await prisma.userData.update({
      where: { id: session.userId },
      data: {
        chatTermsAcceptedAt: acceptedAt,
        chatTermsVersion: CHAT_TERMS_VERSION,
        updatedAt: acceptedAt,
      },
      select: {
        chatTermsAcceptedAt: true,
        chatTermsVersion: true,
      },
    });

    return NextResponse.json(buildChatTermsPayload(user), { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to save chat terms consent', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
