import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields } from '@/server/legacyFormat';
import {
  buildBlockReportMetadata,
  createModerationReport,
  removeUserFromChatGroup,
  sendModerationAlert,
} from '@/server/moderation';
import { ModerationReportTargetTypeEnum } from '@/generated/prisma/client';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

const blockSchema = z.object({
  targetUserId: z.string().trim().min(1),
  leaveSharedChats: z.boolean().optional(),
});

const normalizeIds = (value: string[] | null | undefined): string[] => (
  Array.from(new Set((value ?? []).map((entry) => entry.trim()).filter(Boolean)))
);

const addUniqueId = (value: string[] | null | undefined, id: string): string[] => (
  Array.from(new Set([...normalizeIds(value), id.trim()].filter(Boolean)))
);

const removeId = (value: string[] | null | undefined, id: string): string[] => (
  normalizeIds(value).filter((entry) => entry !== id.trim())
);

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = blockSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const targetUserId = parsed.data.targetUserId.trim();
  if (targetUserId === session.userId) {
    return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [actor, target] = await Promise.all([
        tx.userData.findUnique({ where: { id: session.userId } }),
        tx.userData.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!actor || !target) {
        throw new Response('User not found.', { status: 404 });
      }

      const now = new Date();
      const updatedActor = await tx.userData.update({
        where: { id: actor.id },
        data: {
          blockedUserIds: addUniqueId(actor.blockedUserIds, target.id),
          friendIds: removeId(actor.friendIds, target.id),
          followingIds: removeId(actor.followingIds, target.id),
          friendRequestIds: removeId(actor.friendRequestIds, target.id),
          friendRequestSentIds: removeId(actor.friendRequestSentIds, target.id),
          updatedAt: now,
        },
      });

      await tx.userData.update({
        where: { id: target.id },
        data: {
          friendIds: removeId(target.friendIds, actor.id),
          followingIds: removeId(target.followingIds, actor.id),
          friendRequestIds: removeId(target.friendRequestIds, actor.id),
          friendRequestSentIds: removeId(target.friendRequestSentIds, actor.id),
          updatedAt: now,
        },
      });

      const removedChatIds: string[] = [];
      if (parsed.data.leaveSharedChats !== false) {
        const sharedChats = await tx.chatGroup.findMany({
          where: {
            archivedAt: null,
            AND: [
              { userIds: { has: actor.id } },
              { userIds: { has: target.id } },
            ],
          },
        });

        for (const chat of sharedChats) {
          await removeUserFromChatGroup(tx, chat, actor.id, {
            actorUserId: actor.id,
            reason: 'BLOCK_USER_SHARED_CHAT_EXIT',
          });
          removedChatIds.push(chat.id);
        }
      }

      const report = await createModerationReport({
        reporterUserId: actor.id,
        targetType: ModerationReportTargetTypeEnum.BLOCK_USER,
        targetId: target.id,
        category: 'block_user',
        notes: 'User blocked another user from the connections UI.',
        metadata: buildBlockReportMetadata({
          blockedUserId: target.id,
          leaveSharedChats: parsed.data.leaveSharedChats !== false,
          removedChatIds,
        }),
        client: tx,
      });

      return {
        user: updatedActor,
        removedChatIds,
        report,
      };
    });

    await sendModerationAlert(result.report).catch((error) => {
      console.warn('Failed to send block moderation alert', error);
    });

    return NextResponse.json(
      {
        user: withLegacyFields(applyNameCaseToUserFields(result.user)),
        removedChatIds: result.removedChatIds,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return toSocialErrorResponse(error);
  }
}
