import { SITE_URL } from './index';
import type { BlogPostEntry } from './types';

export function createArticleStructuredData(post: BlogPostEntry) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: `${SITE_URL}${post.canonicalPath}`,
    author: {
      '@type': 'Organization',
      name: 'BracketIQ by Razumly',
    },
    publisher: {
      '@type': 'Organization',
      name: 'BracketIQ by Razumly',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/BIQ_drawing.svg`,
      },
    },
    image: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/opengraph-image`,
      caption: post.ogImageAlt,
    },
    keywords: [post.primaryKeyword, ...post.longTailKeywords].join(', '),
  };
}

export function createFaqStructuredData(post: BlogPostEntry) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
