import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/'],
        disallow: ['/api/', '/admin', '/discover', '/login', '/my-schedule', '/organizations', '/profile', '/teams', '/verify'],
      },
    ],
    sitemap: 'https://mvp.razumly.com/sitemap.xml',
  };
}
