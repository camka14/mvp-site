import { Prisma, ModerationReportStatusEnum, ModerationReportTargetTypeEnum } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { createId } from '@/lib/id';
import { isEmailEnabled, sendEmail } from '@/server/email';

type ModerationClient = Prisma.TransactionClient | typeof prisma;

type ModerationReportInput = {
  reporterUserId: string;
  targetType: ModerationReportTargetTypeEnum;
  targetId: string;
  category?: string | null;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  client?: ModerationClient;
};

type ChatGroupRecord = {
  id: string;
  userIds: string[];
  hostId: string;
  archivedAt?: Date | null;
};

type RemoveUserFromChatOptions = {
  actorUserId: string;
  reason: string;
  archiveWhenUnderMemberCount?: number;
};

export const MODERATION_RESPONSE_WINDOW_HOURS = 24;

export const getModerationAlertEmail = (): string => (
  process.env.MODERATION_ALERT_EMAIL?.trim()
  || process.env.SUPPORT_EMAIL?.trim()
  || 'support@bracket-iq.com'
);

export const computeModerationDueAt = (createdAt: Date): Date => (
  new Date(createdAt.getTime() + (MODERATION_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000))
);

const serializeMetadata = (metadata: Prisma.InputJsonValue | null | undefined): string => {
  if (metadata == null) return 'none';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return 'unserializable metadata';
  }
};

export const createModerationReport = async ({
  reporterUserId,
  targetType,
  targetId,
  category,
  notes,
  metadata,
  client = prisma,
}: ModerationReportInput) => {
  const now = new Date();
  const report = await client.moderationReport.create({
    data: {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      reporterUserId,
      targetType,
      targetId,
      category: category?.trim() || null,
      notes: notes?.trim() || null,
      status: ModerationReportStatusEnum.OPEN,
      dueAt: computeModerationDueAt(now),
      metadata: metadata ?? Prisma.JsonNull,
    },
  });

  if (client === prisma) {
    await sendModerationAlert(report).catch((error) => {
      console.warn('Failed to send moderation alert email', error);
    });
  }

  return report;
};

export const sendModerationAlert = async (report: {
  id: string;
  reporterUserId: string;
  targetType: ModerationReportTargetTypeEnum;
  targetId: string;
  category?: string | null;
  notes?: string | null;
  dueAt: Date;
  metadata?: Prisma.JsonValue | null;
}) => {
  if (!isEmailEnabled()) {
    return;
  }

  const subject = `[Moderation] ${report.targetType} report ${report.id}`;
  const text = [
    `Report ID: ${report.id}`,
    `Reporter: ${report.reporterUserId}`,
    `Target Type: ${report.targetType}`,
    `Target ID: ${report.targetId}`,
    `Category: ${report.category ?? 'unspecified'}`,
    `Due At: ${report.dueAt.toISOString()}`,
    `Notes: ${report.notes ?? 'none'}`,
    `Metadata:`,
    serializeMetadata((report.metadata ?? null) as Prisma.InputJsonValue | null),
  ].join('\n');

  await sendEmail({
    to: getModerationAlertEmail(),
    subject,
    text,
  });
};

export const archiveChatGroup = async (
  client: ModerationClient,
  chatGroupId: string,
  options: { actorUserId: string; reason: string; userIds?: string[]; hostId?: string | null },
) => {
  const now = new Date();
  return client.chatGroup.update({
    where: { id: chatGroupId },
    data: {
      archivedAt: now,
      archivedReason: options.reason,
      archivedByUserId: options.actorUserId,
      updatedAt: now,
      ...(options.userIds ? { userIds: options.userIds } : {}),
      ...(options.hostId ? { hostId: options.hostId } : {}),
    },
  });
};

export const removeUserFromChatGroup = async (
  client: ModerationClient,
  chatGroup: ChatGroupRecord,
  userId: string,
  options: RemoveUserFromChatOptions,
) => {
  const normalizedUserId = userId.trim();
  const nextUserIds = chatGroup.userIds.filter((entry) => entry !== normalizedUserId);
  const minimumMemberCount = options.archiveWhenUnderMemberCount ?? 2;

  if (nextUserIds.length < minimumMemberCount) {
    return archiveChatGroup(client, chatGroup.id, {
      actorUserId: options.actorUserId,
      reason: options.reason,
      userIds: nextUserIds,
      hostId: nextUserIds[0] ?? chatGroup.hostId,
    });
  }

  const nextHostId = chatGroup.hostId === normalizedUserId
    ? nextUserIds[0] ?? chatGroup.hostId
    : chatGroup.hostId;

  return client.chatGroup.update({
    where: { id: chatGroup.id },
    data: {
      userIds: nextUserIds,
      hostId: nextHostId,
      updatedAt: new Date(),
    },
  });
};

export const clearBlockReports = async (
  client: ModerationClient,
  reporterUserId: string,
  blockedUserId: string,
) => {
  return client.moderationReport.deleteMany({
    where: {
      reporterUserId,
      targetType: ModerationReportTargetTypeEnum.BLOCK_USER,
      targetId: blockedUserId,
    },
  });
};

export const buildBlockReportMetadata = (options: {
  blockedUserId: string;
  leaveSharedChats: boolean;
  removedChatIds: string[];
}) => ({
  blockedUserId: options.blockedUserId,
  leaveSharedChats: options.leaveSharedChats,
  removedChatIds: options.removedChatIds,
});
