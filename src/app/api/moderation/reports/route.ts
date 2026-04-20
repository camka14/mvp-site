import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ModerationReportTargetTypeEnum, Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  createModerationReport,
  removeUserFromChatGroup,
  sendModerationAlert,
} from '@/server/moderation';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  targetType: z.enum([
    ModerationReportTargetTypeEnum.CHAT_GROUP,
    ModerationReportTargetTypeEnum.EVENT,
  ]),
  targetId: z.string().trim().min(1),
  category: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  metadata: z.unknown().optional(),
});

const normalizeIds = (value: string[] | null | undefined): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
);

const addUniqueId = (value: string[] | null | undefined, id: string): string[] => (
  Array.from(new Set([...normalizeIds(value), id.trim()].filter(Boolean)))
);

const asJsonValue = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === undefined) {
    return null;
  }
  return value as Prisma.InputJsonValue;
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = reportSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (parsed.data.targetType === ModerationReportTargetTypeEnum.EVENT) {
        const [event, actor] = await Promise.all([
          tx.events.findUnique({
            where: { id: parsed.data.targetId },
            select: { id: true },
          }),
          tx.userData.findUnique({
            where: { id: session.userId },
            select: { id: true, hiddenEventIds: true },
          }),
        ]);

        if (!event || !actor) {
          throw new Response('Not found', { status: 404 });
        }

        const now = new Date();
        const updatedActor = await tx.userData.update({
          where: { id: actor.id },
          data: {
            hiddenEventIds: addUniqueId(actor.hiddenEventIds, event.id),
            updatedAt: now,
          },
          select: { hiddenEventIds: true },
        });

        const report = await createModerationReport({
          reporterUserId: session.userId,
          targetType: ModerationReportTargetTypeEnum.EVENT,
          targetId: event.id,
          category: parsed.data.category ?? 'report_event',
          notes: parsed.data.notes,
          metadata: asJsonValue(parsed.data.metadata),
          client: tx,
        });

        return {
          report,
          hiddenEventIds: updatedActor.hiddenEventIds,
          removedChatIds: [] as string[],
        };
      }

      const chatGroup = await tx.chatGroup.findUnique({
        where: { id: parsed.data.targetId },
      });
      if (!chatGroup) {
        throw new Response('Not found', { status: 404 });
      }
      if (!session.isAdmin && !chatGroup.userIds.includes(session.userId)) {
        throw new Response('Forbidden', { status: 403 });
      }

      const leaveChat = Boolean(
        parsed.data.metadata
        && typeof parsed.data.metadata === 'object'
        && 'leaveChat' in (parsed.data.metadata as Record<string, unknown>)
        && (parsed.data.metadata as Record<string, unknown>).leaveChat === true,
      );

      const removedChatIds: string[] = [];
      if (leaveChat && chatGroup.userIds.includes(session.userId)) {
        await removeUserFromChatGroup(tx, chatGroup, session.userId, {
          actorUserId: session.userId,
          reason: 'CHAT_REPORT_EXIT',
        });
        removedChatIds.push(chatGroup.id);
      }

      const report = await createModerationReport({
        reporterUserId: session.userId,
        targetType: ModerationReportTargetTypeEnum.CHAT_GROUP,
        targetId: chatGroup.id,
        category: parsed.data.category ?? 'report_chat',
        notes: parsed.data.notes,
        metadata: asJsonValue(parsed.data.metadata),
        client: tx,
      });

      return {
        report,
        hiddenEventIds: [] as string[],
        removedChatIds,
      };
    });

    await sendModerationAlert(result.report).catch((error) => {
      console.warn('Failed to send moderation report alert', error);
    });

    return NextResponse.json(
      {
        report: withLegacyFields(result.report),
        hiddenEventIds: result.hiddenEventIds,
        removedChatIds: result.removedChatIds,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to submit moderation report', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
