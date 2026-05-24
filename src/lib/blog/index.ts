import { getPreferredMobileStoreUrl } from '@/lib/mobileAppLinks';
import { SITE_URL } from '@/lib/siteUrl';
import type { BlogAuthor, BlogPostEntry } from './types';

export const BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY = {
  name: 'Samuel Razumovskiy',
  image: '/blog/authors/samuel-razumovskiy.jpg',
} satisfies BlogAuthor;

const createTournamentInBracketiq: BlogPostEntry = {
  slug: 'create-tournament-in-bracketiq',
  title: 'How to Create a Tournament in BracketIQ',
  description:
    'Create a sports tournament, add divisions and fields, set schedule windows, publish the event, and verify the public tournament page in BracketIQ.',
  createdAt: '2026-05-24',
  publishedAt: '2026-05-24',
  updatedAt: '2026-05-24',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
  isPublished: true,
  primaryKeyword: 'create a sports tournament',
  longTailKeywords: [
    'how to create a sports tournament',
    'sports tournament setup guide',
    'create an indoor soccer tournament',
    'create a volleyball tournament',
    'tournament registration software',
    'sports tournament scheduling software',
  ],
  readingMinutes: 11,
  canonicalPath: '/blog/create-tournament-in-bracketiq',
  ctas: [
    {
      label: 'Create a tournament',
      href: '/login',
      variant: 'primary',
    },
    {
      label: 'Browse public events',
      href: '/discover',
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
      question: 'Can I create tournaments for sports other than soccer?',
      answer:
        'Yes. The same BracketIQ tournament setup applies to volleyball, outdoor soccer, basketball, tennis, hockey, baseball, football, and other recreational sports. Sport-specific articles can add extra logistics after the base tournament is created.',
    },
    {
      question: 'Do I need a division for a single-division tournament?',
      answer:
        'Yes. BracketIQ uses the division to store capacity, price, eligibility, registration rules, and scheduling assignments, even when everyone is playing in one open group.',
    },
    {
      question: 'Is creating a tournament the same as managing tournament day?',
      answer:
        'No. Creation covers the initial event, division, capacity, field or court, and publishing setup. Tournament management covers registrations, schedule updates, check-in, scores, and advancement after teams start joining.',
    },
  ],
  ogImageAlt: 'BracketIQ tournament creation guide preview',
  load: () => import('@/content/blog/create-tournament-in-bracketiq.mdx'),
};

const paidPickupEventPayments: BlogPostEntry = {
  slug: 'paid-pickup-event-payments',
  title: 'How to Create a Paid Pickup Sports Event With BracketIQ',
  description:
    'Create a paid pickup event, set the player price, publish it, and let players pay online with BracketIQ.',
  createdAt: '2026-05-22',
  publishedAt: '2026-05-22',
  updatedAt: '2026-05-22',
  author: BLOG_AUTHOR_SAMUEL_RAZUMOVSKIY,
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

const blogPosts = [createTournamentInBracketiq, paidPickupEventPayments] satisfies BlogPostEntry[];

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
    lastModified: post.updatedAt,
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
