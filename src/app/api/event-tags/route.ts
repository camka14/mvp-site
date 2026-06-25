import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('query') ?? '').trim();
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { slug: { contains: query.toLowerCase(), mode: 'insensitive' as const } },
        ],
      }
    : {};

  const tags = await prisma.eventTags.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 50,
  });

  return NextResponse.json({
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    })),
  });
}
