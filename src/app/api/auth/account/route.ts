import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { setAuthCookie } from '@/lib/authServer';
import { revokeAppleRefreshToken } from '@/lib/appleAuth';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const DELETE_CONFIRMATION_TEXT = 'delete my account';
const REDACTED_DATE_OF_BIRTH = new Date('1900-01-01T00:00:00.000Z');

const requestSchema = z.object({
  confirmationText: z.string(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeId(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

const removeIdFromList = (value: unknown, userId: string): string[] => (
  normalizeIdList(value).filter((entry) => entry !== userId)
);

const dedupeIds = (values: Array<string | null>): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
);

const selectReplacementOwner = (team: {
  captainId: string;
  managerId: string;
  headCoachId: string | null;
  playerIds: string[];
  coachIds: string[];
}, deletedUserId: string): string | null => {
  return dedupeIds([
    normalizeId(team.managerId),
    normalizeId(team.captainId),
    normalizeId(team.headCoachId),
    ...normalizeIdList(team.coachIds),
    ...normalizeIdList(team.playerIds),
  ]).find((candidate) => candidate !== deletedUserId) ?? null;
};

const isOutstandingUserBill = (bill: {
  status: string | null;
  totalAmountCents: number;
  paidAmountCents: number | null;
}): boolean => {
  const paidAmountCents = bill.paidAmountCents ?? 0;
  if (paidAmountCents >= bill.totalAmountCents) {
    return false;
  }

  return !['PAID', 'CANCELLED'].includes((bill.status ?? 'OPEN').toUpperCase());
};

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.confirmationText.trim().toLowerCase() !== DELETE_CONFIRMATION_TEXT) {
    return NextResponse.json(
      { error: `Type "${DELETE_CONFIRMATION_TEXT}" to confirm account deletion.` },
      { status: 400 },
    );
  }

  const session = await requireSession(req);
  const userId = session.userId.trim();
  const now = new Date();

  const [user, authUser, sensitiveUser, userBills, inboundRefunds, outboundRefunds] = await Promise.all([
    prisma.userData.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userName: true,
        dateOfBirth: true,
      },
    }),
    prisma.authUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        appleSubject: true,
      },
    }),
    prisma.sensitiveUserData.findFirst({
      where: { userId },
      select: {
        id: true,
        email: true,
        appleRefreshToken: true,
      },
    }),
    prisma.bills.findMany({
      where: {
        ownerType: 'USER',
        ownerId: userId,
      },
      select: {
        id: true,
        status: true,
        totalAmountCents: true,
        paidAmountCents: true,
      },
    }),
    prisma.refundRequests.findMany({
      where: {
        userId,
        status: 'WAITING',
      },
      select: { id: true },
    }),
    prisma.refundRequests.findMany({
      where: {
        hostId: userId,
        status: 'WAITING',
      },
      select: { id: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const blockingBills = userBills.filter(isOutstandingUserBill);
  if (blockingBills.length || inboundRefunds.length || outboundRefunds.length) {
    return NextResponse.json(
      {
        error: 'Resolve outstanding bills and refund requests before deleting this account.',
        blockers: {
          openBills: blockingBills.length,
          inboundRefunds: inboundRefunds.length,
          outboundRefunds: outboundRefunds.length,
        },
      },
      { status: 409 },
    );
  }

  const normalizedEmail = (
    sensitiveUser?.email
    ?? authUser?.email
    ?? ''
  ).trim().toLowerCase();
  const appleRefreshToken = sensitiveUser?.appleRefreshToken?.trim() || null;

  if (authUser?.appleSubject) {
    if (!appleRefreshToken) {
      return NextResponse.json(
        {
          error: 'Sign in with Apple accounts must re-authenticate before deletion can continue.',
        },
        { status: 409 },
      );
    }

    try {
      await revokeAppleRefreshToken(appleRefreshToken);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Unable to revoke the Apple sign-in session right now. Please try again.',
        },
        { status: 502 },
      );
    }
  }

  await prisma.$transaction(async (tx: any) => {
    const relatedUsers = await tx.userData.findMany({
      where: {
        OR: [
          { friendIds: { has: userId } },
          { followingIds: { has: userId } },
          { friendRequestIds: { has: userId } },
          { friendRequestSentIds: { has: userId } },
        ],
      },
      select: {
        id: true,
        friendIds: true,
        followingIds: true,
        friendRequestIds: true,
        friendRequestSentIds: true,
      },
    });

    for (const relatedUser of relatedUsers) {
      await tx.userData.update({
        where: { id: relatedUser.id },
        data: {
          friendIds: removeIdFromList(relatedUser.friendIds, userId),
          followingIds: removeIdFromList(relatedUser.followingIds, userId),
          friendRequestIds: removeIdFromList(relatedUser.friendRequestIds, userId),
          friendRequestSentIds: removeIdFromList(relatedUser.friendRequestSentIds, userId),
          updatedAt: now,
        },
      });
    }

    const teams = await tx.teams.findMany({
      where: {
        OR: [
          { playerIds: { has: userId } },
          { coachIds: { has: userId } },
          { pending: { has: userId } },
          { captainId: userId },
          { managerId: userId },
          { headCoachId: userId },
        ],
      },
      select: {
        id: true,
        playerIds: true,
        coachIds: true,
        pending: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
      },
    });

    for (const team of teams) {
      const replacementOwner = selectReplacementOwner(team, userId);
      await tx.teams.update({
        where: { id: team.id },
        data: {
          playerIds: removeIdFromList(team.playerIds, userId),
          coachIds: removeIdFromList(team.coachIds, userId),
          pending: removeIdFromList(team.pending, userId),
          captainId: normalizeId(team.captainId) === userId
            ? (replacementOwner ?? team.captainId)
            : team.captainId,
          managerId: normalizeId(team.managerId) === userId
            ? (replacementOwner ?? team.managerId)
            : team.managerId,
          headCoachId: normalizeId(team.headCoachId) === userId ? null : team.headCoachId,
          updatedAt: now,
        },
      });
    }

    const organizations = await tx.organizations.findMany({
      where: {
        OR: [
          { hostIds: { has: userId } },
          { officialIds: { has: userId } },
        ],
      },
      select: {
        id: true,
        hostIds: true,
        officialIds: true,
      },
    });

    for (const organization of organizations) {
      await tx.organizations.update({
        where: { id: organization.id },
        data: {
          hostIds: removeIdFromList(organization.hostIds, userId),
          officialIds: removeIdFromList(organization.officialIds, userId),
          updatedAt: now,
        },
      });
    }

    const activeEvents = await tx.events.findMany({
      where: {
        assistantHostIds: { has: userId },
      },
      select: {
        id: true,
        assistantHostIds: true,
      },
    });

    for (const event of activeEvents) {
      await tx.events.update({
        where: { id: event.id },
        data: {
          assistantHostIds: removeIdFromList(event.assistantHostIds, userId),
          updatedAt: now,
        },
      });
    }

    await tx.eventOfficials.updateMany({
      where: { userId },
      data: {
        isActive: false,
        updatedAt: now,
      },
    });

    await tx.eventRegistrations.updateMany({
      where: {
        registrantId: userId,
        rosterRole: { in: ['WAITLIST', 'FREE_AGENT'] },
        status: { not: 'CANCELLED' },
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });

    await Promise.all([
      tx.subscriptions.updateMany({
        where: {
          userId,
          status: { not: 'CANCELLED' },
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      }),
      tx.invites.updateMany({
        where: normalizedEmail
          ? {
              OR: [
                { userId },
                { email: normalizedEmail },
              ],
            }
          : { userId },
        data: {
          status: 'DECLINED',
          updatedAt: now,
        },
      }),
      tx.invites.deleteMany({
        where: { createdBy: userId },
      }),
      tx.parentChildLinks.updateMany({
        where: {
          OR: [
            { parentId: userId },
            { childId: userId },
          ],
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: {
          status: 'INACTIVE',
          endedAt: now,
          updatedAt: now,
        },
      }),
      tx.eventOfficials.deleteMany({
        where: { userId },
      }),
      tx.staffMembers.deleteMany({
        where: { userId },
      }),
      tx.pushDeviceTarget.deleteMany({
        where: { userId },
      }),
      tx.events.deleteMany({
        where: {
          hostId: userId,
          state: 'TEMPLATE',
        },
      }),
      tx.authUser.deleteMany({
        where: { id: userId },
      }),
      tx.sensitiveUserData.deleteMany({
        where: {
          OR: [
            { userId },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ],
        },
      }),
    ]);

    await tx.userData.update({
      where: { id: userId },
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        dateOfBirth: REDACTED_DATE_OF_BIRTH,
        dobVerified: false,
        dobVerifiedAt: null,
        ageVerificationProvider: null,
        teamIds: [],
        friendIds: [],
        followingIds: [],
        friendRequestIds: [],
        friendRequestSentIds: [],
        uploadedImages: [],
        profileImageId: null,
        homePageOrganizationId: null,
        hasStripeAccount: false,
        updatedAt: now,
      },
    });
  });

  const response = NextResponse.json({ ok: true }, { status: 200 });
  setAuthCookie(response, '');
  return response;
}
