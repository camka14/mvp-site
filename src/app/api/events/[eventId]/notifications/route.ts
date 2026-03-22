import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { sendPushToUsers } from '@/server/pushNotifications';
import { isEmailEnabled, sendEmail } from '@/server/email';
import { getRequestOrigin } from '@/lib/requestOrigin';

export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const audienceSchema = z.object({
  managers: z.boolean().optional().default(false),
  players: z.boolean().optional().default(false),
  parents: z.boolean().optional().default(false),
  officials: z.boolean().optional().default(false),
  hosts: z.boolean().optional().default(false),
});

const requestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(2000),
  audience: audienceSchema,
}).superRefine((value, ctx) => {
  const hasAudience = Object.values(value.audience).some(Boolean);
  if (!hasAudience) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select at least one audience group.',
      path: ['audience'],
    });
  }
});

const normalizeIds = (values: unknown): string[] => (
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ),
  )
);

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
};

const parseTimeoutMs = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PUSH_DISPATCH_TIMEOUT_MS = parseTimeoutMs(process.env.NOTIFICATION_PUSH_TIMEOUT_MS, 8_000);
const EMAIL_DELIVERY_TIMEOUT_MS = parseTimeoutMs(process.env.NOTIFICATION_EMAIL_TIMEOUT_MS, 10_000);

type SettledWithTimeout<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }
  | { status: 'timed_out' };

const settleWithTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<SettledWithTimeout<T>> => {
  if (timeoutMs <= 0) {
    return promise
      .then((value) => ({ status: 'fulfilled', value }) as const)
      .catch((reason) => ({ status: 'rejected', reason }) as const);
  }

  return new Promise<SettledWithTimeout<T>>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'timed_out' });
    }, timeoutMs);

    promise
      .then((value) => ({ status: 'fulfilled', value }) as const)
      .catch((reason) => ({ status: 'rejected', reason }) as const)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      });
  });
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventId } = await params;
    const { title, message, audience } = parsed.data;

    const resolved = await prisma.$transaction(async (tx) => {
      const eventAccess = await tx.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          hostId: true,
          assistantHostIds: true,
          organizationId: true,
          teamIds: true,
          userIds: true,
          officialIds: true,
        },
      });

      if (!eventAccess) {
        throw new Response('Not found', { status: 404 });
      }

      const canManage = await canManageEvent(session, eventAccess, tx);
      if (!canManage) {
        throw new Response('Forbidden', { status: 403 });
      }

      const teamIds = normalizeIds(eventAccess.teamIds);
      const directPlayerIds = normalizeIds(eventAccess.userIds);
      const officialIds = normalizeIds(eventAccess.officialIds);
      const hostIds = normalizeIds([eventAccess.hostId, ...normalizeIds(eventAccess.assistantHostIds)]);

      const teams = teamIds.length
        ? await tx.teams.findMany({
          where: { id: { in: teamIds } },
          select: {
            id: true,
            managerId: true,
            playerIds: true,
          },
        })
        : [];

      const managerIds = normalizeIds(teams.map((team) => team.managerId));
      const teamPlayerIds = normalizeIds(teams.flatMap((team) => normalizeIds(team.playerIds)));
      const allPlayerIds = normalizeIds([...directPlayerIds, ...teamPlayerIds]);

      const parentRows = allPlayerIds.length
        ? await tx.parentChildLinks.findMany({
          where: {
            childId: { in: allPlayerIds },
            status: 'ACTIVE',
          },
          select: { parentId: true },
        })
        : [];
      const parentIds = normalizeIds(parentRows.map((row) => row.parentId));

      const audienceRecipients = {
        managers: managerIds,
        players: allPlayerIds,
        parents: parentIds,
        officials: officialIds,
        hosts: hostIds,
      };

      const selectedUserIds = normalizeIds([
        ...(audience.managers ? audienceRecipients.managers : []),
        ...(audience.players ? audienceRecipients.players : []),
        ...(audience.parents ? audienceRecipients.parents : []),
        ...(audience.officials ? audienceRecipients.officials : []),
        ...(audience.hosts ? audienceRecipients.hosts : []),
      ]);

      if (!selectedUserIds.length) {
        return {
          eventName: eventAccess.name || 'Event',
          selectedUserIds: [] as string[],
          pushRecipientIds: [] as string[],
          emailRecipientRows: [] as Array<{ userId: string; email: string }>,
          noChannelUserIds: [] as string[],
        };
      }

      const pushRows = await tx.pushDeviceTarget.findMany({
        where: { userId: { in: selectedUserIds } },
        select: { userId: true },
      });
      const pushRecipientIds = normalizeIds(pushRows.map((row) => row.userId));
      const pushRecipientIdSet = new Set(pushRecipientIds);

      const fallbackEmailUserIds = selectedUserIds.filter((userId) => !pushRecipientIdSet.has(userId));
      const sensitiveRows = fallbackEmailUserIds.length
        ? await tx.sensitiveUserData.findMany({
          where: { userId: { in: fallbackEmailUserIds } },
          select: { userId: true, email: true },
        })
        : [];

      const emailByUserId = new Map<string, string>();
      sensitiveRows.forEach((row) => {
        const normalized = normalizeEmail(row.email);
        if (normalized && !emailByUserId.has(row.userId)) {
          emailByUserId.set(row.userId, normalized);
        }
      });

      const emailRecipientRows = fallbackEmailUserIds
        .map((userId) => ({
          userId,
          email: emailByUserId.get(userId) ?? '',
        }))
        .filter((row) => row.email.length > 0);

      const emailRecipientIdSet = new Set(emailRecipientRows.map((row) => row.userId));
      const noChannelUserIds = fallbackEmailUserIds.filter((userId) => !emailRecipientIdSet.has(userId));

      return {
        eventName: eventAccess.name || 'Event',
        selectedUserIds,
        pushRecipientIds,
        emailRecipientRows,
        noChannelUserIds,
      };
    });

    const eventUrl = `${getRequestOrigin(req)}/events/${encodeURIComponent(eventId)}`;
    const pushTitle = title.trim();
    const pushBody = message.trim();

    const pushPromise = (async () => {
      if (!resolved.pushRecipientIds.length) {
        return {
          attempted: false,
          reason: 'no_recipients',
          recipientCount: 0,
          tokenCount: 0,
          successCount: 0,
          failureCount: 0,
          prunedTokenCount: 0,
        };
      }

      const settledPushResult = await settleWithTimeout(
        sendPushToUsers({
          userIds: resolved.pushRecipientIds,
          title: pushTitle,
          body: pushBody,
          data: {
            type: 'event_announcement',
            eventId,
          },
        }),
        PUSH_DISPATCH_TIMEOUT_MS,
      );

      if (settledPushResult.status === 'fulfilled') {
        return settledPushResult.value;
      }
      if (settledPushResult.status === 'timed_out') {
        console.warn('Push dispatch timed out for event announcement', {
          eventId,
          timeoutMs: PUSH_DISPATCH_TIMEOUT_MS,
        });
        return {
          attempted: false,
          reason: 'dispatch_timeout',
          recipientCount: resolved.pushRecipientIds.length,
          tokenCount: 0,
          successCount: 0,
          failureCount: 0,
          prunedTokenCount: 0,
        };
      }

      console.warn('Push dispatch failed for event announcement', {
        eventId,
        error: settledPushResult.reason instanceof Error
          ? settledPushResult.reason.message
          : String(settledPushResult.reason),
      });
      return {
        attempted: false,
        reason: 'dispatch_error',
        recipientCount: resolved.pushRecipientIds.length,
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
        prunedTokenCount: 0,
      };
    })();

    const emailPromise = (async () => {
      const emailEnabled = isEmailEnabled();
      const emailDisabledRecipientCount = emailEnabled ? 0 : resolved.emailRecipientRows.length;

      if (!emailEnabled || resolved.emailRecipientRows.length === 0) {
        return {
          emailSentCount: 0,
          emailFailedCount: 0,
          emailTimedOutCount: 0,
          emailDisabledRecipientCount,
        };
      }

      const emailResults = await Promise.all(
        resolved.emailRecipientRows.map((row) => settleWithTimeout(
          sendEmail({
            to: row.email,
            subject: `${pushTitle} — ${resolved.eventName}`,
            text: [
              `${resolved.eventName}`,
              '',
              pushBody,
              '',
              `View event: ${eventUrl}`,
            ].join('\n'),
          }),
          EMAIL_DELIVERY_TIMEOUT_MS,
        )),
      );

      const emailSentCount = emailResults.filter((result) => result.status === 'fulfilled').length;
      const emailTimedOutCount = emailResults.filter((result) => result.status === 'timed_out').length;
      const emailFailedCount = emailResults.length - emailSentCount;
      if (emailFailedCount > 0) {
        console.warn('Failed to send one or more event announcement emails', {
          eventId,
          failedCount: emailFailedCount,
          timedOutCount: emailTimedOutCount,
          timeoutMs: EMAIL_DELIVERY_TIMEOUT_MS,
        });
      }

      return {
        emailSentCount,
        emailFailedCount,
        emailTimedOutCount,
        emailDisabledRecipientCount,
      };
    })();

    const [pushResult, emailDelivery] = await Promise.all([pushPromise, emailPromise]);

    return NextResponse.json({
      success: true,
      recipients: {
        selectedCount: resolved.selectedUserIds.length,
        pushRecipients: resolved.pushRecipientIds.length,
        emailFallbackRecipients: resolved.emailRecipientRows.length,
        noChannelRecipients: resolved.noChannelUserIds.length,
      },
      delivery: {
        push: pushResult,
        emailSentCount: emailDelivery.emailSentCount,
        emailFailedCount: emailDelivery.emailFailedCount,
        emailTimedOutCount: emailDelivery.emailTimedOutCount,
        emailDisabledRecipientCount: emailDelivery.emailDisabledRecipientCount,
      },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to send event notification', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
