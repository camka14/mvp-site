import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/'],
        disallow: ['/api/', '/admin', '/discover', '/login', '/my-schedule', '/organizations', '/profile', '/teams', '/verify'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
