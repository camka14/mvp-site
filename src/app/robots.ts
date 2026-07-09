import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/', '/find-events', '/find-clubs', '/find-facilities', '/organizations/', '/api/files/', '/api/avatars/'],
        disallow: ['/api/', '/admin', '/discover', '/login', '/my-schedule', '/organizations$', '/organizations?', '/profile', '/teams', '/verify'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
