import type { Metadata } from 'next';
import { cache } from 'react';
import { absoluteUrl } from '@/server/publicSearchSeo';
import {
  createPublicSearchSportEntries,
  getPublicSearchPage,
  parsePublicSearchSegments,
  type PublicSearchKind,
  type PublicSearchPage,
} from '@/server/publicSearchPages';
import { prisma } from '@/lib/prisma';
import { sportSlugToLabel } from '@/lib/discoverFilters';

const loadSportsForParsing = cache(async () => {
  const rows: Array<{ id: string; name: string }> = await (prisma as any).sports.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return createPublicSearchSportEntries(rows);
});

export const getSearchPageForSegments = cache(async (
  kind: PublicSearchKind,
  segments: string[],
): Promise<PublicSearchPage | null> => {
  const sports = await loadSportsForParsing();
  const parsed = parsePublicSearchSegments({ kind, segments, sports });
  return getPublicSearchPage({
    kind,
    sportSlug: parsed.sport?.slug,
    eventType: parsed.eventType,
    locationSlug: parsed.locationSlug,
  });
});

export const metadataForPublicSearchPage = (page: PublicSearchPage | null, fallbackTitle: string): Metadata => {
  if (!page) {
    return {
      title: fallbackTitle,
      robots: {
        index: false,
        follow: true,
      },
    };
  }
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: page.canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: absoluteUrl(page.canonicalPath),
      type: 'website',
    },
  };
};

export const fallbackSearchTitle = (kind: PublicSearchKind, segment?: string): string => {
  const subject = segment ? sportSlugToLabel(segment) : kind === 'events' ? 'Events' : kind === 'clubs' ? 'Clubs' : 'Facilities';
  return `${subject} | BracketIQ`;
};
