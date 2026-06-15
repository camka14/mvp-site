import type { MetadataRoute } from 'next';
import { getContentSitemapEntries } from '@/lib/blog';
import { SITE_URL } from '@/lib/siteUrl';
import { listPublicSitemapEntries } from '@/server/publicSearchSeo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date('2026-05-24'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guides`,
      lastModified: new Date('2026-05-24'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/find-events`,
      lastModified: new Date('2026-06-15'),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/mobile-app`,
      lastModified: new Date('2026-05-26'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy-policy`,
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date('2026-06-10'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/delete-data`,
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  const contentEntries: MetadataRoute.Sitemap = getContentSitemapEntries().map((entry) => ({
    url: entry.url,
    lastModified: new Date(entry.lastModified),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const publicEntries = await listPublicSitemapEntries();

  return [...staticEntries, ...contentEntries, ...publicEntries];
}
