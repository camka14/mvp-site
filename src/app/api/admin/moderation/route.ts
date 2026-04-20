import { NextRequest, NextResponse } from 'next/server';
import { ModerationReportStatusEnum, ModerationReportTargetTypeEnum } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { withLegacyFields, withLegacyList } from '@/server/legacyFormat';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

const parsePagination = (request: NextRequest): { limit: number; offset: number } => {
  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_PAGE_SIZE);
  const offsetRaw = Number(request.nextUrl.searchParams.get('offset') ?? 0);

  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.trunc(offsetRaw), 0)
    : 0;
  return { limit, offset };
};

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);
    const { limit, offset } = parsePagination(req);
    const query = (req.nextUrl.searchParams.get('query') ?? '').trim();
    const status = req.nextUrl.searchParams.get('status');
    const targetType = req.nextUrl.searchParams.get('targetType');

    const where: any = {};
    if (status && Object.values(ModerationReportStatusEnum).includes(status as ModerationReportStatusEnum)) {
      where.status = status;
    }
    if (targetType && Object.values(ModerationReportTargetTypeEnum).includes(targetType as ModerationReportTargetTypeEnum)) {
      where.targetType = targetType;
    }
    if (query.length > 0) {
      where.OR = [
        { id: { contains: query, mode: 'insensitive' as const } },
        { targetId: { contains: query, mode: 'insensitive' as const } },
        { category: { contains: query, mode: 'insensitive' as const } },
        { notes: { contains: query, mode: 'insensitive' as const } },
      ];
    }

    const [total, reports] = await Promise.all([
      prisma.moderationReport.count({ where }),
      prisma.moderationReport.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const reporterIds = Array.from(new Set(reports.map((report) => report.reporterUserId)));
    const reviewedByIds = Array.from(new Set(reports.map((report) => report.reviewedByUserId).filter(Boolean)));
    const reportedChatIds = reports
      .filter((report) => report.targetType === ModerationReportTargetTypeEnum.CHAT_GROUP)
      .map((report) => report.targetId);
    const reportedEventIds = reports
      .filter((report) => report.targetType === ModerationReportTargetTypeEnum.EVENT)
      .map((report) => report.targetId);
    const [reporters, reviewers, chatOwners, eventOwners] = await Promise.all([
      reporterIds.length > 0
        ? prisma.userData.findMany({
            where: { id: { in: reporterIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userName: true,
              profileImageId: true,
            },
          })
        : Promise.resolve([]),
      reviewedByIds.length > 0
        ? prisma.userData.findMany({
            where: { id: { in: reviewedByIds as string[] } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userName: true,
              profileImageId: true,
            },
          })
        : Promise.resolve([]),
      reportedChatIds.length > 0
        ? prisma.chatGroup.findMany({
            where: { id: { in: reportedChatIds } },
            select: {
              id: true,
              hostId: true,
            },
          })
        : Promise.resolve([]),
      reportedEventIds.length > 0
        ? prisma.events.findMany({
            where: { id: { in: reportedEventIds } },
            select: {
              id: true,
              hostId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const reportersById = new Map(
      reporters.map((reporter) => [reporter.id, withLegacyFields(applyNameCaseToUserFields(reporter))]),
    );
    const reviewersById = new Map(
      reviewers.map((reviewer) => [reviewer.id, withLegacyFields(applyNameCaseToUserFields(reviewer))]),
    );
    const chatOwnersById = new Map(chatOwners.map((chat) => [chat.id, chat.hostId]));
    const eventOwnersById = new Map(eventOwners.map((event) => [event.id, event.hostId]));
    const now = Date.now();

    return NextResponse.json(
      {
        reports: withLegacyList(reports).map((report) => ({
          ...report,
          reporter: reportersById.get(report.reporterUserId) ?? null,
          reviewer: report.reviewedByUserId ? reviewersById.get(report.reviewedByUserId) ?? null : null,
          targetOwnerUserId: report.targetType === ModerationReportTargetTypeEnum.CHAT_GROUP
            ? chatOwnersById.get(report.targetId) ?? null
            : report.targetType === ModerationReportTargetTypeEnum.EVENT
              ? eventOwnersById.get(report.targetId) ?? null
              : report.targetType === ModerationReportTargetTypeEnum.BLOCK_USER
                ? report.targetId
                : null,
          isOverdue: report.status !== ModerationReportStatusEnum.ACTIONED
            && report.status !== ModerationReportStatusEnum.DISMISSED
            && Boolean(report.dueAt && new Date(report.dueAt).getTime() < now),
        })),
        total,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load moderation reports', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
