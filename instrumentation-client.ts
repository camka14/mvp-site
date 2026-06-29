import posthog from 'posthog-js';

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();

if (typeof window !== 'undefined' && posthogProjectToken) {
  posthog.init(posthogProjectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
    defaults: '2026-05-30',
  });
}
