import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';

export const dynamic = 'force-dynamic';

const feedbackTypes = new Set(['BUG', 'IDEA', 'GENERAL']);
const feedbackStatuses = new Set(['NEW', 'IN_REVIEW', 'PLANNED', 'CLOSED']);

const parsePositiveInteger = (value: string | null, fallback: number, maximum?: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return maximum ? Math.min(parsed, maximum) : parsed;
};

const serializeFeedback = (row: Record<string, any>) => ({
  ...row,
  createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt,
});

const selectFeedback = {
  id: true,
  createdAt: true,
  updatedAt: true,
  type: true,
  status: true,
  message: true,
  additionalContext: true,
  submitterUserId: true,
  allowContact: true,
  contactEmail: true,
  sourcePath: true,
  userAgent: true,
  clientContext: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewNotes: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireRazumlyAdmin(req);

    const params = req.nextUrl.searchParams;
    const rawType = params.get('type')?.trim() || null;
    const rawStatus = params.get('status')?.trim() || null;
    const query = params.get('query')?.trim() || '';
    const id = params.get('id')?.trim() || null;

    if (rawType && !feedbackTypes.has(rawType)) {
      return NextResponse.json({ error: 'Invalid feedback type.' }, { status: 400 });
    }
    if (rawStatus && !feedbackStatuses.has(rawStatus)) {
      return NextResponse.json({ error: 'Invalid feedback status.' }, { status: 400 });
    }
    if (query.length > 200) {
      return NextResponse.json({ error: 'Search text is too long.' }, { status: 400 });
    }

    const page = parsePositiveInteger(params.get('page'), 1);
    const pageSize = parsePositiveInteger(params.get('pageSize'), 25, 50);
    const filters: any[] = [];

    if (id) filters.push({ id });
    if (rawType) filters.push({ type: rawType });
    if (rawStatus) filters.push({ status: rawStatus });
    if (query) {
      filters.push({
        OR: [
          { message: { contains: query, mode: 'insensitive' } },
          { additionalContext: { contains: query, mode: 'insensitive' } },
          { contactEmail: { contains: query, mode: 'insensitive' } },
          { submitterUserId: { contains: query, mode: 'insensitive' } },
        ],
      });
    }

    const where = filters.length ? { AND: filters } : {};
    const [total, rows] = await Promise.all([
      prisma.feedbackSubmissions.count({ where }),
      prisma.feedbackSubmissions.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: selectFeedback,
      }),
    ]);

    return NextResponse.json({
      items: rows.map((row) => serializeFeedback(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to load admin feedback', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unable to load feedback.' }, { status: 500 });
  }
}

export { selectFeedback, serializeFeedback };
