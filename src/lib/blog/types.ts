import type { ComponentType } from 'react';

export type BlogFaqItem = {
  question: string;
  answer: string;
};

export type BlogCta = {
  label: string;
  href: string;
  variant: 'primary' | 'secondary' | 'tertiary';
  external?: boolean;
};

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  isPublished: boolean;
  primaryKeyword: string;
  longTailKeywords: string[];
  readingMinutes: number;
  canonicalPath: `/blog/${string}`;
  ctas: BlogCta[];
  faq: BlogFaqItem[];
  ogImageAlt: string;
};

export type BlogPostEntry = BlogPostMeta & {
  load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
};
