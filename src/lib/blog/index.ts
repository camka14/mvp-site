import { getPreferredMobileStoreUrl } from '@/lib/mobileAppLinks';
import type { BlogPostEntry } from './types';

export const SITE_URL = 'https://mvp.razumly.com';

const tournamentScheduleMaker: BlogPostEntry = {
  slug: 'tournament-schedule-maker',
  title: 'Tournament Schedule Maker: How to Build Brackets That Don’t Break on Game Day',
  description:
    'Build tournament schedules and brackets for round robin, single elimination, and double elimination formats with fewer conflicts and faster updates.',
  publishedAt: '2026-03-18',
  updatedAt: '2026-03-18',
  isPublished: true,
  primaryKeyword: 'tournament schedule maker',
  longTailKeywords: [
    'tournament bracket generator',
    'double elimination bracket',
    'round robin tournament schedule',
    'how to schedule a sports tournament',
    'tournament scheduling software',
  ],
  readingMinutes: 14,
  canonicalPath: '/blog/tournament-schedule-maker',
  ctas: [
    {
      label: 'Create your first tournament schedule',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'See a demo schedule template',
      href: '#demo-schedule-template',
      variant: 'secondary',
    },
    {
      label: 'Download the app to manage updates on the go',
      href: getPreferredMobileStoreUrl(),
      variant: 'tertiary',
      external: true,
    },
  ],
  faq: [
    {
      question: 'How long should the break be between games?',
      answer:
        'Most tournaments need enough buffer for warmup, score entry, cleanup, and the next teams to arrive. A common starting point is 15 to 30 minutes between games, then adjust based on sport, age group, and whether courts or fields need turnover time.',
    },
    {
      question: 'How many fields or courts do I need?',
      answer:
        'Start with your team count, format, and available game windows. Estimate the total number of games, divide by how many slots one field can host, and add a buffer for weather delays, overtime, and late starts.',
    },
    {
      question: 'What should I do if a team drops after the bracket is published?',
      answer:
        'Freeze as much of the schedule as possible, identify the smallest part of the bracket affected, and communicate the revision quickly. For pool play, that may mean rebalancing one group. For elimination formats, it may mean a bye or a reseed depending on your published rules.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament scheduling guide preview',
  load: () => import('@/content/blog/tournament-schedule-maker.mdx'),
};

const blogPosts = [tournamentScheduleMaker] satisfies BlogPostEntry[];

export function getPublishedBlogPosts() {
  return blogPosts
    .filter((post) => post.isPublished)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getBlogPostBySlug(slug: string) {
  return getPublishedBlogPosts().find((post) => post.slug === slug) ?? null;
}

export function getBlogSitemapEntries() {
  return getPublishedBlogPosts().map((post) => ({
    url: `${SITE_URL}${post.canonicalPath}`,
    lastModified: post.updatedAt ?? post.publishedAt,
  }));
}

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}
