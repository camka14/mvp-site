import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

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
}, deletedUserId: string): string | null => (
  dedupeIds([
    normalizeId(team.managerId),
    normalizeId(team.captainId),
    normalizeId(team.headCoachId),
    ...normalizeIdList(team.coachIds),
    ...normalizeIdList(team.playerIds),
  ]).find((candidate) => candidate !== deletedUserId) ?? null
);

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRazumlyAdmin(req);
    const { id: rawUserId } = await params;
    const userId = normalizeId(rawUserId);
    if (!userId) {
      return NextResponse.json({ error: 'User id is required.' }, { status: 400 });
    }
    if (userId === admin.userId) {
      return NextResponse.json({ error: 'Admins cannot delete their own account from this dashboard.' }, { status: 409 });
    }

    const [
      user,
      authUser,
      sensitiveUser,
      hostedEventCount,
      ownedOrganizationCount,
      hostedChatGroupCount,
      userBills,
      inboundRefunds,
      outboundRefunds,
    ] = await Promise.all([
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
        },
      }),
      prisma.sensitiveUserData.findFirst({
        where: { userId },
        select: {
          id: true,
          email: true,
        },
      }),
      prisma.events.count({ where: { hostId: userId } }),
      prisma.organizations.count({ where: { ownerId: userId } }),
      prisma.chatGroup.count({ where: { hostId: userId } }),
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

    if (!user && !authUser && !sensitiveUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const blockingBills = userBills.filter(isOutstandingUserBill);
    const blockers = {
      hostedEvents: hostedEventCount,
      ownedOrganizations: ownedOrganizationCount,
      hostedChatGroups: hostedChatGroupCount,
      openBills: blockingBills.length,
      inboundRefunds: inboundRefunds.length,
      outboundRefunds: outboundRefunds.length,
    };
    if (Object.values(blockers).some((count) => count > 0)) {
      return NextResponse.json(
        {
          error: 'Resolve or transfer this user\'s owned records before deleting the account.',
          blockers,
        },
        { status: 409 },
      );
    }

    const normalizedEmail = (
      sensitiveUser?.email
      ?? authUser?.email
      ?? ''
    ).trim().toLowerCase();
    const now = new Date();

    await prisma.$transaction(async (tx: any) => {
      const relatedUsers = await tx.userData.findMany({
        where: {
          OR: [
            { friendIds: { has: userId } },
            { followingIds: { has: userId } },
            { friendRequestIds: { has: userId } },
            { friendRequestSentIds: { has: userId } },
            { blockedUserIds: { has: userId } },
            { hiddenEventIds: { has: userId } },
          ],
        },
        select: {
          id: true,
          friendIds: true,
          followingIds: true,
          friendRequestIds: true,
          friendRequestSentIds: true,
          blockedUserIds: true,
          hiddenEventIds: true,
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
            blockedUserIds: removeIdFromList(relatedUser.blockedUserIds, userId),
            hiddenEventIds: relatedUser.hiddenEventIds,
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
          taxResponsibilityAcceptedByUserId: userId,
        },
        select: {
          id: true,
          taxResponsibilityAcceptedByUserId: true,
        },
      });

      for (const organization of organizations) {
        await tx.organizations.update({
          where: { id: organization.id },
          data: {
            ...(organization.taxResponsibilityAcceptedByUserId === userId
              ? {
                  taxResponsibilityAcceptedAt: null,
                  taxResponsibilityAcceptedByUserId: null,
                  taxResponsibilityAgreementVersion: null,
                }
              : {}),
            updatedAt: now,
          },
        });
      }

      const events = await tx.events.findMany({
        where: {
          assistantHostIds: { has: userId },
        },
        select: {
          id: true,
          assistantHostIds: true,
        },
      });

      for (const event of events) {
        await tx.events.update({
          where: { id: event.id },
          data: {
            assistantHostIds: removeIdFromList(event.assistantHostIds, userId),
            updatedAt: now,
          },
        });
      }

      const chatGroups = await tx.chatGroup.findMany({
        where: {
          OR: [
            { userIds: { has: userId } },
            { mutedUserIds: { has: userId } },
          ],
        },
        select: {
          id: true,
          userIds: true,
          mutedUserIds: true,
        },
      });

      for (const chatGroup of chatGroups) {
        await tx.chatGroup.update({
          where: { id: chatGroup.id },
          data: {
            userIds: removeIdFromList(chatGroup.userIds, userId),
            mutedUserIds: removeIdFromList(chatGroup.mutedUserIds, userId),
            updatedAt: now,
          },
        });
      }

      await Promise.all([
        tx.canonicalTeams?.updateMany?.({
          where: { createdBy: userId },
          data: {
            createdBy: null,
            updatedAt: now,
          },
        }),
        tx.teamRegistrations?.updateMany?.({
          where: { userId },
          data: {
            status: 'REMOVED',
            updatedAt: now,
          },
        }),
        tx.teamStaffAssignments?.updateMany?.({
          where: { userId },
          data: {
            status: 'REMOVED',
            updatedAt: now,
          },
        }),
        tx.eventTeamStaffAssignments?.updateMany?.({
          where: { userId },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        }),
        tx.eventOfficials?.deleteMany?.({
          where: { userId },
        }),
        tx.staffMembers?.deleteMany?.({
          where: { userId },
        }),
        tx.eventRegistrations?.updateMany?.({
          where: {
            registrantId: userId,
            status: { not: 'CANCELLED' },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        }),
        tx.subscriptions?.updateMany?.({
          where: {
            userId,
            status: { not: 'CANCELLED' },
          },
          data: {
            status: 'CANCELLED',
            updatedAt: now,
          },
        }),
        tx.invites?.updateMany?.({
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
        tx.invites?.deleteMany?.({
          where: { createdBy: userId },
        }),
        tx.parentChildLinks?.updateMany?.({
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
        tx.pushDeviceTarget?.deleteMany?.({
          where: { userId },
        }),
        tx.messages?.updateMany?.({
          where: { userId },
          data: {
            removedAt: now,
            removedByUserId: admin.userId,
            removalReason: 'Removed during admin account deletion',
            updatedAt: now,
          },
        }),
        tx.moderationReport?.updateMany?.({
          where: { reporterUserId: userId },
          data: {
            status: 'DISMISSED',
            reviewedAt: now,
            reviewedByUserId: admin.userId,
            reviewNotes: 'Reporter account was deleted by an admin.',
            updatedAt: now,
          },
        }),
        tx.files?.updateMany?.({
          where: { uploaderId: userId },
          data: {
            uploaderId: null,
            updatedAt: now,
          },
        }),
        tx.stripeAccounts?.updateMany?.({
          where: { userId },
          data: {
            userId: null,
            updatedAt: now,
          },
        }),
        tx.bills?.updateMany?.({
          where: {
            ownerType: 'USER',
            ownerId: userId,
          },
          data: {
            ownerId: `deleted:${userId}`,
            updatedAt: now,
          },
        }),
      ]);

      await tx.authUser.deleteMany({
        where: { id: userId },
      });
      await tx.sensitiveUserData.deleteMany({
        where: {
          OR: [
            { userId },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ],
        },
      });

      if (user) {
        await tx.userData.delete({ where: { id: userId } });
      }
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to delete admin user', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
