import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mergeDefaultEventTags, sortEventTagsByUsage, withActiveEventCountsForTags } from '@/server/eventTags';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('query') ?? '').trim();
  const filterOnly = req.nextUrl.searchParams.get('filterOnly') === 'true';
  const where = query
    ? {
        ...(filterOnly ? { isSystem: true } : {}),
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { slug: { contains: query.toLowerCase(), mode: 'insensitive' as const } },
        ],
      }
    : filterOnly
      ? { isSystem: true }
      : {};

  const tags = await (prisma as any).eventTags.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  const tagOptions = tags.map((tag: any) => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    isSystem: tag.isSystem === true,
  }));

  return NextResponse.json({
    tags: (await withActiveEventCountsForTags(mergeDefaultEventTags(tagOptions, query)))
      .sort(sortEventTagsByUsage),
  });
}
