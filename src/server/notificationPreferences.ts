import { prisma } from '@/lib/prisma';
import {
  isNotificationChannelEnabled,
  type NotificationChannel,
  type NotificationType,
} from '@/lib/notificationSettings';

type UserNotificationPreferenceRow = {
  id: string;
  notificationSettings?: unknown | null;
};

type NotificationPreferenceClient = {
  userData: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; notificationSettings: true };
    }): Promise<UserNotificationPreferenceRow[]>;
    findUnique(args: {
      where: { id: string };
      select: { notificationSettings: true };
    }): Promise<Pick<UserNotificationPreferenceRow, 'notificationSettings'> | null>;
  };
};

const normalizeUserIds = (userIds: string[]): string[] => (
  Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)))
);

export const filterUserIdsForNotificationChannel = async (
  userIds: string[],
  notificationType: NotificationType,
  channel: NotificationChannel,
  client: NotificationPreferenceClient = prisma,
): Promise<string[]> => {
  const normalizedUserIds = normalizeUserIds(userIds);
  if (!normalizedUserIds.length) return [];

  const rows = await client.userData.findMany({
    where: { id: { in: normalizedUserIds } },
    select: { id: true, notificationSettings: true },
  });
  const enabledUserIds = new Set(
    rows
      .filter((row) => (
        isNotificationChannelEnabled(row.notificationSettings, notificationType, channel)
      ))
      .map((row) => row.id),
  );

  return normalizedUserIds.filter((userId) => enabledUserIds.has(userId));
};

export const isUserNotificationChannelEnabled = async (
  userId: string | null | undefined,
  notificationType: NotificationType,
  channel: NotificationChannel,
  client: NotificationPreferenceClient = prisma,
): Promise<boolean> => {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return false;

  const row = await client.userData.findUnique({
    where: { id: normalizedUserId },
    select: { notificationSettings: true },
  });
  return isNotificationChannelEnabled(row?.notificationSettings, notificationType, channel);
};
