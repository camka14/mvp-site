import { getPreferredMobileStoreUrl } from '@/lib/mobileAppLinks';
import { SITE_URL } from '@/lib/siteUrl';
import type { BlogPostEntry } from './types';

const paidPickupEventPayments: BlogPostEntry = {
  slug: 'paid-pickup-event-payments',
  title: 'How to Create a Paid Pickup Sports Event With BracketIQ',
  description:
    'Create a paid pickup event, set the player price, publish it, and let players pay online with BracketIQ.',
  publishedAt: '2026-05-22',
  updatedAt: '2026-05-22',
  isPublished: true,
  primaryKeyword: 'pickup sports event payments',
  longTailKeywords: [
    'create a paid pickup sports event',
    'sports pickup event signups',
    'collect payments for pickup games',
    'beach volleyball pickup event',
    'sports event payment software',
  ],
  readingMinutes: 10,
  canonicalPath: '/blog/paid-pickup-event-payments',
  ctas: [
    {
      label: 'Create a paid pickup event',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Jump to player payment',
      href: '#player-payment',
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
      question: 'Do I need an organization account to create a paid pickup event?',
      answer:
        'No. You can create this event from your own profile instead of an organization page. You still need payments turned on before you charge players.',
    },
    {
      question: 'Why does a single pickup event still need a division?',
      answer:
        'BracketIQ uses divisions to know who can join, how many spots are open, and what each player pays. Even if everyone joins the same casual group, add one simple division such as CoEd Open 18+.',
    },
    {
      question: 'What do players pay?',
      answer:
        'Players see the event price plus BracketIQ and Stripe fees. The final total can change after the player chooses how to pay because Stripe fees vary by payment type.',
    },
  ],
  ogImageAlt: 'BracketIQ paid pickup event guide preview',
  load: () => import('@/content/blog/paid-pickup-event-payments.mdx'),
};

const blogPosts = [paidPickupEventPayments] satisfies BlogPostEntry[];

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
    timeZone: 'UTC',
  }).format(new Date(date));
}
