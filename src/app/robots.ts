import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/llms.txt', '/blog', '/blog/', '/discover.md', '/find-events', '/find-clubs', '/find-facilities', '/organizations/*.md$', '/api/files/', '/api/avatars/'],
        disallow: ['/api/', '/llms/page', '/admin', '/discover', '/login', '/my-schedule', '/organizations$', '/organizations?', '/out/', '/profile', '/teams', '/verify'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
