import type { MetadataRoute } from 'next';
import { getBlogSitemapEntries } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: 'https://mvp.razumly.com/',
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://mvp.razumly.com/blog',
      lastModified: new Date('2026-03-18'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://mvp.razumly.com/privacy-policy',
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://mvp.razumly.com/delete-data',
      lastModified: new Date('2026-03-11'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  const blogEntries: MetadataRoute.Sitemap = getBlogSitemapEntries().map((entry) => ({
    url: entry.url,
    lastModified: new Date(entry.lastModified),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticEntries, ...blogEntries];
}
