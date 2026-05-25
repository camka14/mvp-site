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

export type BlogAuthor = {
  name: string;
  image: `/${string}`;
};

export type BlogContentType = 'blog' | 'guide';

export type GuideTopicId = 'events' | 'tournaments' | 'leagues' | 'organizations';

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  contentType: BlogContentType;
  guideTopic?: GuideTopicId;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
  author: BlogAuthor;
  isPublished: boolean;
  primaryKeyword: string;
  longTailKeywords: string[];
  readingMinutes: number;
  canonicalPath: `/${'blog' | 'guides'}/${string}`;
  ctas: BlogCta[];
  faq: BlogFaqItem[];
  ogImageAlt: string;
};

export type BlogPostEntry = BlogPostMeta & {
  load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
};
